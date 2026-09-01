import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrationSchema, RegistrationInput } from "../validation/registration.js";
import { REGISTRATION_STATUS } from "../lib/constants.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { DuplicateRegistrationError, ValidationError } from "./errors.js";
import { defaultPageSize } from "./setting.js";
import { daysUntil, getReminderWindows } from "./reminders.js";

export { DuplicateRegistrationError };

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

type Tx = Prisma.TransactionClient;

const RENEWABLE_STATUSES: string[] = [
  REGISTRATION_STATUS.ACTIVE,
  REGISTRATION_STATUS.PENDING_RENEWAL,
  REGISTRATION_STATUS.EXPIRED,
];

function toDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// A registration must expire after it is registered, and an ACTIVE registration
// cannot already be expired.
function assertValidRegistrationDates(
  regDate: Date,
  expiryDate: Date,
  status: string,
) {
  if (expiryDate <= regDate) {
    throw new ValidationError("Expiry date must be after the registration date", "expiryDate");
  }
  if (status === REGISTRATION_STATUS.ACTIVE && expiryDate < new Date()) {
    throw new ValidationError("An active registration cannot have an expiry date in the past", "expiryDate");
  }
}

async function checkDuplicateRegNumber(input: RegistrationInput, excludeId?: string) {
  const existing = await prisma.vehicleRegistration.findFirst({
    where: excludeId
      ? { regNumber: input.regNumber, NOT: { id: excludeId } }
      : { regNumber: input.regNumber },
  });
  if (existing) {
    throw new DuplicateRegistrationError("regNumber", input.regNumber);
  }
}

async function logHistory(db: Tx | typeof prisma, regId: string, vehicleId: string, action: string, data: {
  prevStatus?: string | null;
  newStatus?: string | null;
  prevExpiry?: Date | null;
  newExpiry?: Date | null;
  note?: string | null;
  performedById?: string | null;
}) {
  await db.vehicleRegistrationHistory.create({
    data: {
      registrationId: regId,
      vehicleId,
      action,
      prevStatus: data.prevStatus ?? null,
      newStatus: data.newStatus ?? null,
      prevExpiry: data.prevExpiry ?? null,
      newExpiry: data.newExpiry ?? null,
      note: data.note ?? null,
      performedById: data.performedById ?? null,
    },
  });
}

export async function createRegistration(input: RegistrationInput, ctx: Context = {}) {
  const data = registrationSchema.parse(input);

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: data.vehicleId },
    select: { id: true },
  });
  if (!vehicle) {
    throw new ValidationError("Vehicle not found", "vehicleId");
  }
  await checkDuplicateRegNumber(data);

  // A new registration always starts ACTIVE; other statuses (EXPIRED,
  // PENDING_RENEWAL, SUSPENDED, ARCHIVED) are derived by the system or set via
  // their dedicated workflow actions, never at creation time.
  const status = REGISTRATION_STATUS.ACTIVE;
  const regDate = toDate(data.regDate)!;
  const expiryDate = toDate(data.expiryDate)!;
  assertValidRegistrationDates(regDate, expiryDate, status);

  const { reg, archived } = await prisma.$transaction(async (tx) => {
    // One current registration per vehicle: registering again supersedes any
    // existing non-archived registration(s) for the vehicle.
    const prior = await tx.vehicleRegistration.findMany({
      where: {
        vehicleId: data.vehicleId,
        NOT: { status: REGISTRATION_STATUS.ARCHIVED },
      },
      orderBy: { expiryDate: "desc" },
    });

    const archivedList = [];
    for (const p of prior) {
      const updated = { ...p, status: REGISTRATION_STATUS.ARCHIVED };
      await tx.vehicleRegistration.update({
        where: { id: p.id },
        data: { status: REGISTRATION_STATUS.ARCHIVED },
      });
      await logHistory(tx, p.id, p.vehicleId, "ARCHIVE", {
        prevStatus: p.status,
        newStatus: REGISTRATION_STATUS.ARCHIVED,
        prevExpiry: p.expiryDate,
        newExpiry: p.expiryDate,
        note: `Superseded by new registration ${data.regNumber}`,
        performedById: ctx.userId ?? null,
      });
      archivedList.push({ old: p, updated });
    }

    const reg = await tx.vehicleRegistration.create({
      data: {
        vehicleId: data.vehicleId,
        regNumber: data.regNumber,
        regDate,
        expiryDate,
        office: data.office ?? null,
        status,
        createdById: ctx.userId ?? null,
      },
    });

    await logHistory(tx, reg.id, reg.vehicleId, "CREATE", {
      newStatus: reg.status,
      newExpiry: reg.expiryDate,
      performedById: ctx.userId ?? null,
    });

    return { reg, archived: archivedList };
  });

  await writeAudit({
    action: "CREATE",
    entity: "VehicleRegistration",
    entityId: reg.id,
    vehicleId: reg.vehicleId,
    userId: ctx.userId,
    newValue: reg,
    req: ctx.req,
  });
  for (const a of archived) {
    await writeAudit({
      action: "ARCHIVE",
      entity: "VehicleRegistration",
      entityId: a.old.id,
      vehicleId: a.old.vehicleId,
      userId: ctx.userId,
      oldValue: a.old,
      newValue: a.updated,
      req: ctx.req,
    });
  }

  return reg;
}

export async function updateRegistration(id: string, input: Partial<RegistrationInput>, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;

  const merged = registrationSchema.partial().parse(input);
  if (merged.regNumber && merged.regNumber !== existing.regNumber) {
    await checkDuplicateRegNumber({ ...existing, ...merged } as RegistrationInput, id);
  }

  const prevExpiry = existing.expiryDate;
  const prevStatus = existing.status;

  const nextRegDate = merged.regDate ? toDate(merged.regDate) : existing.regDate;
  const nextExpiry = merged.expiryDate ? toDate(merged.expiryDate) : existing.expiryDate;
  // Status is workflow-managed; plain edits preserve it.
  const nextStatus = existing.status;
  if (nextRegDate && nextExpiry) {
    assertValidRegistrationDates(nextRegDate, nextExpiry, nextStatus);
  } else if (
    nextStatus === REGISTRATION_STATUS.ACTIVE &&
    nextExpiry &&
    nextExpiry < new Date()
  ) {
    throw new ValidationError("An active registration cannot have an expiry date in the past", "expiryDate");
  }

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: {
      regNumber: merged.regNumber ?? undefined,
      regDate: merged.regDate ? toDate(merged.regDate) : undefined,
      expiryDate: merged.expiryDate ? toDate(merged.expiryDate) : undefined,
      office: merged.office === undefined ? undefined : merged.office ?? null,
    },
  });

  if (prevStatus !== reg.status || prevExpiry.getTime() !== reg.expiryDate.getTime()) {
    await logHistory(prisma, reg.id, reg.vehicleId, "UPDATE", {
      prevStatus,
      newStatus: reg.status,
      prevExpiry,
      newExpiry: reg.expiryDate,
      performedById: ctx.userId ?? null,
    });
  }

  await writeAudit({
    action: "UPDATE",
    entity: "VehicleRegistration",
    entityId: reg.id,
    vehicleId: reg.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    newValue: reg,
    req: ctx.req,
  });

  return reg;
}

export async function deleteRegistration(id: string, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;

  await prisma.vehicleRegistration.delete({ where: { id } });

  await writeAudit({
    action: "DELETE",
    entity: "VehicleRegistration",
    entityId: id,
    vehicleId: existing.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    req: ctx.req,
  });

  return existing;
}

export async function archiveRegistration(id: string, note: string | undefined, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.status === REGISTRATION_STATUS.ARCHIVED) {
    throw new ValidationError("Registration is already archived", "status");
  }

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: { status: REGISTRATION_STATUS.ARCHIVED },
  });

  await logHistory(prisma, reg.id, reg.vehicleId, "ARCHIVE", {
    prevStatus: existing.status,
    newStatus: reg.status,
    prevExpiry: existing.expiryDate,
    newExpiry: existing.expiryDate,
    note: note ?? null,
    performedById: ctx.userId ?? null,
  });

  await writeAudit({
    action: "ARCHIVE",
    entity: "VehicleRegistration",
    entityId: reg.id,
    vehicleId: reg.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    newValue: reg,
    req: ctx.req,
  });

  return reg;
}

export async function restoreRegistration(id: string, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.status !== REGISTRATION_STATUS.ARCHIVED) {
    throw new ValidationError("Only archived registrations can be restored", "status");
  }

  // Restoring re-derives the status from the expiry date: a restored record
  // must not be ACTIVE past its expiry (it becomes EXPIRED or PENDING_RENEWAL).
  const days = daysUntil(existing.expiryDate);
  const [, , w30] = await getReminderWindows();
  let newStatus: string = REGISTRATION_STATUS.ACTIVE;
  if (days !== null && days < 0) {
    newStatus = REGISTRATION_STATUS.EXPIRED;
  } else if (days !== null && days <= w30) {
    newStatus = REGISTRATION_STATUS.PENDING_RENEWAL;
  }

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: { status: newStatus },
  });

  await logHistory(prisma, reg.id, reg.vehicleId, "RESTORE", {
    prevStatus: existing.status,
    newStatus: reg.status,
    prevExpiry: existing.expiryDate,
    newExpiry: existing.expiryDate,
    performedById: ctx.userId ?? null,
  });

  await writeAudit({
    action: "RESTORE",
    entity: "VehicleRegistration",
    entityId: reg.id,
    vehicleId: reg.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    newValue: reg,
    req: ctx.req,
  });

  return reg;
}

// Renew: push expiry forward, set to ACTIVE, record history.
export async function renewRegistration(
  id: string,
  payload: { expiryDate: string; regNumber?: string; note?: string },
  ctx: Context = {}
) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;

  if (!RENEWABLE_STATUSES.includes(existing.status)) {
    throw new ValidationError("Only active, pending renewal, or expired registrations can be renewed", "status");
  }

  const newExpiry = toDate(payload.expiryDate);
  if (!newExpiry) {
    throw new ValidationError("Valid expiry date required", "expiryDate");
  }
  if (newExpiry <= existing.expiryDate) {
    throw new ValidationError("New expiry must be after the current expiry date", "expiryDate");
  }
  if (newExpiry < new Date()) {
    throw new ValidationError("New expiry must be in the future", "expiryDate");
  }

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: {
      expiryDate: newExpiry,
      regNumber: payload.regNumber ?? existing.regNumber,
      status: REGISTRATION_STATUS.ACTIVE,
    },
  });

  await logHistory(prisma, reg.id, reg.vehicleId, "RENEW", {
    prevStatus: existing.status,
    newStatus: reg.status,
    prevExpiry: existing.expiryDate,
    newExpiry: reg.expiryDate,
    note: payload.note ?? null,
    performedById: ctx.userId ?? null,
  });

  await writeAudit({
    action: "RENEW",
    entity: "VehicleRegistration",
    entityId: reg.id,
    vehicleId: reg.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    newValue: reg,
    req: ctx.req,
  });

  return reg;
}

// Suspend: move ACTIVE/PENDING/EXPIRED -> SUSPENDED, record history.
export async function suspendRegistration(id: string, note: string | undefined, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;
  if (!RENEWABLE_STATUSES.includes(existing.status)) {
    throw new ValidationError("Only active, pending renewal, or expired registrations can be suspended", "status");
  }

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: { status: REGISTRATION_STATUS.SUSPENDED },
  });

  await logHistory(prisma, reg.id, reg.vehicleId, "SUSPEND", {
    prevStatus: existing.status,
    newStatus: reg.status,
    prevExpiry: existing.expiryDate,
    newExpiry: existing.expiryDate,
    note: note ?? null,
    performedById: ctx.userId ?? null,
  });

  await writeAudit({
    action: "SUSPEND",
    entity: "VehicleRegistration",
    entityId: reg.id,
    vehicleId: reg.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    newValue: reg,
    req: ctx.req,
  });

  return reg;
}

// Build a Prisma `where` that matches the *effective* (derived) status rather
// than the stored one, so list filtering agrees with what the badges show.
function regStatusCondition(status: string, now: Date) {
  switch (status) {
    case REGISTRATION_STATUS.ACTIVE:
      return { status: REGISTRATION_STATUS.ACTIVE, expiryDate: { gte: now } };
    case REGISTRATION_STATUS.PENDING_RENEWAL:
      return { status: REGISTRATION_STATUS.PENDING_RENEWAL, expiryDate: { gte: now } };
    case REGISTRATION_STATUS.EXPIRED:
      return {
        OR: [
          { status: REGISTRATION_STATUS.EXPIRED },
          {
            status: { in: [REGISTRATION_STATUS.ACTIVE, REGISTRATION_STATUS.PENDING_RENEWAL] },
            expiryDate: { lt: now },
          },
        ],
      };
    default:
      return { status };
  }
}

export async function listRegistrations(opts: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { search, status, page = 1, pageSize } = opts;
  const ps = pageSize ?? await defaultPageSize();

  const conditions: any[] = [];
  if (status) {
    conditions.push(regStatusCondition(status, new Date()));
  }
  if (search) {
    conditions.push({
      OR: [
        { regNumber: { contains: search } },
        { office: { contains: search } },
        { vehicle: { plateNumber: { contains: search } } },
        { vehicle: { vehicleCode: { contains: search } } },
        { vehicle: { make: { contains: search } } },
        { vehicle: { model: { contains: search } } },
      ],
    });
  }
  const where = conditions.length ? { AND: conditions } : {};

  const [items, total] = await Promise.all([
    prisma.vehicleRegistration.findMany({
      where,
      include: { vehicle: { include: { branch: true } } },
      orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * ps,
      take: ps,
    }),
    prisma.vehicleRegistration.count({ where }),
  ]);

  return { items, total, page, pageSize: ps, totalPages: Math.ceil(total / ps) };
}

export async function getRegistration(id: string) {
  const reg = await prisma.vehicleRegistration.findUnique({
    where: { id },
    include: {
      vehicle: true,
      history: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!reg) return null;

  const userIds = Array.from(
    new Set(reg.history.map((h) => h.performedById).filter((x): x is string => Boolean(x)))
  );
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));

  return {
    ...reg,
    history: reg.history.map((h) => ({
      ...h,
      performedBy: h.performedById && byId.has(h.performedById)
        ? byId.get(h.performedById)!
        : null,
    })),
  };
}