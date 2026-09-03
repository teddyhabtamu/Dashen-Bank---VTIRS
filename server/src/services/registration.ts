import { Prisma, type VehicleRegistration } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { registrationSchema, RegistrationInput } from "../validation/registration.js";
import { REGISTRATION_STATUS } from "../lib/constants.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { DuplicateRegistrationError, ValidationError } from "./errors.js";
import { defaultPageSize } from "./setting.js";
import { daysUntil, getReminderWindows } from "./reminders.js";
import { resolveRemindersForVehicle } from "./notification.js";

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

// "Live" = currently counted as the vehicle's current registration.
const LIVE_STATUSES: string[] = [
  REGISTRATION_STATUS.ACTIVE,
  REGISTRATION_STATUS.PENDING_RENEWAL,
];

// Re-derive what status a record should hold from its expiry date — used when
// a record re-enters the live set (restore / resume).
async function deriveLiveStatus(expiryDate: Date): Promise<string> {
  const days = daysUntil(expiryDate);
  const [, , w30] = await getReminderWindows();
  if (days !== null && days < 0) return REGISTRATION_STATUS.EXPIRED;
  if (days !== null && days <= w30) return REGISTRATION_STATUS.PENDING_RENEWAL;
  return REGISTRATION_STATUS.ACTIVE;
}

// A vehicle may have at most one live registration (DB-enforced via partial
// unique index); make that a clean 4xx before Prisma throws a P2002.
async function assertNoOtherLive(vehicleId: string, excludeId: string) {
  const other = await prisma.vehicleRegistration.findFirst({
    where: {
      vehicleId,
      NOT: { id: excludeId },
      status: { in: LIVE_STATUSES },
    },
    select: { regNumber: true },
  });
  if (other) {
    throw new ValidationError(
      `Vehicle already has a live registration (${other.regNumber}). Archive it before restoring or resuming this one.`,
      "status"
    );
  }
}

// Map a Prisma unique violation (P2002) onto a domain error so the API returns
// a clean 409/422 instead of a 500. Target identifies which unique constraint.
function isUniqueViolation(e: unknown): e is { meta?: { target?: unknown } } {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

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

  // One current registration per vehicle: registering again supersedes any
  // existing non-archived registration(s) for the vehicle. Require explicit
  // confirmation before silently archiving a live registration.
  const prior = await prisma.vehicleRegistration.findMany({
    where: {
      vehicleId: data.vehicleId,
      NOT: { status: REGISTRATION_STATUS.ARCHIVED },
    },
    orderBy: { expiryDate: "desc" },
  });
  if (prior.length > 0 && data.confirmSupersede !== true) {
    throw new ValidationError(
      "This vehicle already has a live registration. Creating a new one will archive it — confirm to continue.",
      "confirmSupersede"
    );
  }

  let result: { reg: VehicleRegistration; archived: { old: VehicleRegistration; updated: VehicleRegistration }[] };
  try {
    result = await prisma.$transaction(async (tx) => {
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
  } catch (e) {
    if (isUniqueViolation(e)) {
      const target = String(e.meta?.target ?? "");
      if (target.includes("live_per_vehicle")) {
        throw new ValidationError(
          "This vehicle already has a live registration; it must be archived before creating another.",
          "confirmSupersede"
        );
      }
      throw new DuplicateRegistrationError("regNumber", data.regNumber);
    }
    throw e;
  }
  const { reg, archived } = result;

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

  // A fresh registration (possibly superseding an expiring one) invalidates
  // any reminder tied to the old expiry. Best-effort cleanup; the hourly sweep
  // re-creates a reminder if the new registration is itself close to expiry.
  await resolveRemindersForVehicle(reg.vehicleId, "REGISTRATION_REMINDER").catch(() => undefined);

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

  // Hard-deleting a vehicle's live registration would silently leave it
  // unregistered (the vehicle delete flow blocks on live records for the
  // same reason). Deleting is cleanup for stale ARCHIVED entries only —
  // live ones must be archived (reversible) instead.
  if (existing.status !== REGISTRATION_STATUS.ARCHIVED) {
    throw new ValidationError(
      "Only archived registrations can be permanently deleted. Archive it first — that keeps the history and is reversible.",
      "status"
    );
  }

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

  // With the record gone there is nothing left to be reminded about.
  // Best-effort cleanup.
  await resolveRemindersForVehicle(existing.vehicleId, "REGISTRATION_REMINDER").catch(() => undefined);

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

  // Archived registrations are excluded from reminder generation, so any live
  // reminders for this vehicle are stale. Best-effort cleanup.
  await resolveRemindersForVehicle(reg.vehicleId, "REGISTRATION_REMINDER").catch(() => undefined);

  return reg;
}

export async function restoreRegistration(id: string, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.status !== REGISTRATION_STATUS.ARCHIVED) {
    throw new ValidationError("Only archived registrations can be restored", "status");
  }
  // The vehicle must not already have a live registration, or restoring this
  // one would create two currents (also enforced by the DB partial unique index).
  await assertNoOtherLive(existing.vehicleId, existing.id);

  // Restoring re-derives the status from the expiry date: a restored record
  // must not be ACTIVE past its expiry (it becomes EXPIRED or PENDING_RENEWAL).
  const newStatus = await deriveLiveStatus(existing.expiryDate);

  let reg: VehicleRegistration;
  try {
    reg = await prisma.vehicleRegistration.update({
      where: { id },
      data: { status: newStatus },
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ValidationError(
        "Vehicle already has a live registration; archive it before restoring this one.",
        "status"
      );
    }
    throw e;
  }

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

  // Renewing an EXPIRED record brings a new live registration into existence;
  // the vehicle must not already have one.
  if (existing.status === REGISTRATION_STATUS.EXPIRED) {
    await assertNoOtherLive(existing.vehicleId, existing.id);
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

  // The renewal fixed the expiry — stale "expiring/expired" reminders are no
  // longer actionable for anyone. Best-effort: never fail the renewal because
  // the reminder cleanup errored.
  await resolveRemindersForVehicle(reg.vehicleId, "REGISTRATION_REMINDER").catch(() => undefined);

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

// Resume: bring a suspended registration back into service. The status is
// re-derived from the expiry date — a record may have lapsed while suspended
// (in which case it resumes as EXPIRED and can then be renewed).
export async function resumeRegistration(id: string, note: string | undefined, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;
  if (existing.status !== REGISTRATION_STATUS.SUSPENDED) {
    throw new ValidationError("Only suspended registrations can be resumed", "status");
  }
  // The vehicle must not have gained another live registration while this one
  // was suspended.
  await assertNoOtherLive(existing.vehicleId, existing.id);

  const newStatus = await deriveLiveStatus(existing.expiryDate);
  let reg: VehicleRegistration;
  try {
    reg = await prisma.vehicleRegistration.update({
      where: { id },
      data: { status: newStatus },
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ValidationError(
        "Vehicle already has a live registration; archive it before resuming this one.",
        "status"
      );
    }
    throw e;
  }

  await logHistory(prisma, reg.id, reg.vehicleId, "RESUME", {
    prevStatus: existing.status,
    newStatus: reg.status,
    prevExpiry: existing.expiryDate,
    newExpiry: existing.expiryDate,
    note: note ?? null,
    performedById: ctx.userId ?? null,
  });

  await writeAudit({
    action: "RESUME",
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
  // "Current" = a still-valid registration: ACTIVE or PENDING_RENEWAL with a
  // future expiry. Both are live/operational — PENDING_RENEWAL merely signals
  // the renewal window has opened. This is the default view.
  if (status === "CURRENT") {
    return {
      status: { in: [REGISTRATION_STATUS.ACTIVE, REGISTRATION_STATUS.PENDING_RENEWAL] },
      expiryDate: { gte: now },
    };
  }
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
  expiringWithin?: number;
  branchId?: string;
  vehicleId?: string;
  page?: number;
  pageSize?: number;
}) {
  const { search, status, expiringWithin, branchId, vehicleId, page = 1, pageSize } = opts;
  const ps = pageSize ?? await defaultPageSize();

  const conditions: any[] = [];
  if (status) {
    conditions.push(regStatusCondition(status, new Date()));
  }
  if (branchId) {
    conditions.push({ vehicle: { branchId } });
  }
  if (vehicleId) {
    conditions.push({ vehicleId });
  }
  if (expiringWithin !== undefined && Number.isFinite(expiringWithin)) {
    const now = new Date();
    const to = new Date(now.getTime() + expiringWithin * 24 * 60 * 60 * 1000);
    // Negative window = "already expired" (dashboard deep-link for expired
    // counts); positive = "expires within N days" including anything already
    // past its date so nothing urgent hides between the buckets.
    conditions.push(
      expiringWithin < 0
        ? { expiryDate: { lt: now } }
        : { expiryDate: { lte: to } }
    );
  }
  if (search) {
    conditions.push({
      OR: [
        { regNumber: { contains: search, mode: "insensitive" } },
        { office: { contains: search, mode: "insensitive" } },
        { vehicle: { plateNumber: { contains: search, mode: "insensitive" } } },
        { vehicle: { vehicleCode: { contains: search, mode: "insensitive" } } },
        { vehicle: { make: { contains: search, mode: "insensitive" } } },
        { vehicle: { model: { contains: search, mode: "insensitive" } } },
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