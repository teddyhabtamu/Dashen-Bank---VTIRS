import { prisma } from "../lib/prisma.js";
import { registrationSchema, RegistrationInput } from "../validation/registration.js";
import { REGISTRATION_STATUS } from "../lib/constants.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { DuplicateRegistrationError } from "./errors.js";

export { DuplicateRegistrationError };

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

function toDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
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

async function logHistory(regId: string, vehicleId: string, action: string, data: {
  prevStatus?: string | null;
  newStatus?: string | null;
  prevExpiry?: Date | null;
  newExpiry?: Date | null;
  note?: string | null;
  performedById?: string | null;
}) {
  await prisma.vehicleRegistrationHistory.create({
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
  await checkDuplicateRegNumber(data);

  const reg = await prisma.vehicleRegistration.create({
    data: {
      vehicleId: data.vehicleId,
      regNumber: data.regNumber,
      regDate: toDate(data.regDate)!,
      expiryDate: toDate(data.expiryDate)!,
      office: data.office ?? null,
      status: data.status,
      createdById: ctx.userId ?? null,
    },
  });

  await logHistory(reg.id, reg.vehicleId, "CREATE", {
    newStatus: reg.status,
    newExpiry: reg.expiryDate,
    performedById: ctx.userId ?? null,
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

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: {
      regNumber: merged.regNumber ?? undefined,
      regDate: merged.regDate ? toDate(merged.regDate) : undefined,
      expiryDate: merged.expiryDate ? toDate(merged.expiryDate) : undefined,
      office: merged.office === undefined ? undefined : merged.office ?? null,
      status: merged.status ?? undefined,
    },
  });

  if (prevStatus !== reg.status || prevExpiry.getTime() !== reg.expiryDate.getTime()) {
    await logHistory(reg.id, reg.vehicleId, "UPDATE", {
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

// Renew: push expiry forward, set to ACTIVE, record history.
export async function renewRegistration(
  id: string,
  payload: { expiryDate: string; regNumber?: string; note?: string },
  ctx: Context = {}
) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;

  const newExpiry = toDate(payload.expiryDate);
  if (!newExpiry) throw new Error("Valid expiry date required");

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: {
      expiryDate: newExpiry,
      regNumber: payload.regNumber ?? existing.regNumber,
      status: REGISTRATION_STATUS.ACTIVE,
    },
  });

  await logHistory(reg.id, reg.vehicleId, "RENEW", {
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

// Suspend: move ACTIVE -> SUSPENDED, record history.
export async function suspendRegistration(id: string, note: string | undefined, ctx: Context = {}) {
  const existing = await prisma.vehicleRegistration.findUnique({ where: { id } });
  if (!existing) return null;

  const reg = await prisma.vehicleRegistration.update({
    where: { id },
    data: { status: REGISTRATION_STATUS.SUSPENDED },
  });

  await logHistory(reg.id, reg.vehicleId, "SUSPEND", {
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

export async function listRegistrations(opts: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const { search, status, page = 1, pageSize = 15 } = opts;
  const where: any = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { regNumber: { contains: search } },
      { office: { contains: search } },
      { vehicle: { plateNumber: { contains: search } } },
      { vehicle: { vehicleCode: { contains: search } } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.vehicleRegistration.findMany({
      where,
      include: { vehicle: { include: { branch: true } } },
      orderBy: { expiryDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vehicleRegistration.count({ where }),
  ]);

  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getRegistration(id: string) {
  return prisma.vehicleRegistration.findUnique({
    where: { id },
    include: {
      vehicle: true,
      history: { orderBy: { createdAt: "desc" } },
    },
  });
}
