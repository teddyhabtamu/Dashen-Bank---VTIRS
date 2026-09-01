import { prisma } from "../lib/prisma.js";
import { insuranceSchema, InsuranceInput, insuranceUpdateSchema, InsuranceUpdateInput } from "../validation/insurance.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { DuplicateInsuranceError, ValidationError } from "./errors.js";
import { INSURANCE_STATUS } from "../lib/constants.js";
import { defaultPageSize } from "./setting.js";

export { DuplicateInsuranceError, ValidationError };

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

export type InsuranceCreateInput = InsuranceInput & { confirmSupersede?: boolean };

function toDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function isUniqueViolation(e: unknown): e is { meta?: { target?: unknown } } {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function checkDuplicatePolicy(input: InsuranceInput, excludeId?: string) {
  const existing = await prisma.vehicleInsurance.findFirst({
    where: excludeId
      ? { policyNo: input.policyNo, NOT: { id: excludeId } }
      : { policyNo: input.policyNo },
  });
  if (existing) {
    throw new DuplicateInsuranceError("policyNo", input.policyNo);
  }
}

// A vehicle may have at most one ACTIVE policy (DB-enforced via partial unique
// index); surface that as a clean 422 before Prisma throws a P2002.
async function findActivePolicy(vehicleId: string, excludeId?: string) {
  return prisma.vehicleInsurance.findFirst({
    where: {
      vehicleId,
      status: INSURANCE_STATUS.ACTIVE,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true, policyNo: true },
  });
}

export async function createInsurance(input: InsuranceCreateInput, ctx: Context = {}) {
  const data = insuranceSchema.parse(input);
  await checkDuplicatePolicy(data);

  const startDate = toDate(data.startDate)!;
  const endDate = toDate(data.endDate)!;

  const current = await findActivePolicy(data.vehicleId);
  if (current && input.confirmSupersede !== true) {
    throw new ValidationError(
      `Vehicle already has an active policy (${current.policyNo}). Creating a new one will cancel it — confirm to continue.`,
      "confirmSupersede"
    );
  }

  let ins;
  try {
    ins = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.vehicleInsurance.update({
          where: { id: current.id },
          data: { status: INSURANCE_STATUS.CANCELLED },
        });
      }
      return tx.vehicleInsurance.create({
        data: {
          vehicleId: data.vehicleId,
          company: data.company,
          policyNo: data.policyNo,
          coverage: data.coverage,
          startDate,
          endDate,
          status: INSURANCE_STATUS.ACTIVE,
          createdById: ctx.userId ?? null,
        },
      });
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      const target = String(e.meta?.target ?? "");
      if (target.includes("active_per_vehicle")) {
        throw new ValidationError(
          "Vehicle already has an active policy; cancel or renew it first.",
          "confirmSupersede"
        );
      }
      throw new DuplicateInsuranceError("policyNo", data.policyNo);
    }
    throw e;
  }

  await writeAudit({
    action: "CREATE",
    entity: "VehicleInsurance",
    entityId: ins.id,
    vehicleId: ins.vehicleId,
    userId: ctx.userId,
    newValue: ins,
    req: ctx.req,
  });
  if (current) {
    await writeAudit({
      action: "CANCELLED",
      entity: "VehicleInsurance",
      entityId: current.id,
      vehicleId: ins.vehicleId,
      userId: ctx.userId,
      oldValue: current,
      newValue: { ...current, status: INSURANCE_STATUS.CANCELLED },
      req: ctx.req,
    });
  }

  return ins;
}

export async function updateInsurance(id: string, input: InsuranceUpdateInput, ctx: Context = {}) {
  const existing = await prisma.vehicleInsurance.findUnique({ where: { id } });
  if (!existing) return null;

  const merged = insuranceUpdateSchema.parse(input);
  if (merged.policyNo && merged.policyNo !== existing.policyNo) {
    await checkDuplicatePolicy({ ...existing, ...merged } as InsuranceInput, id);
  }

  // Re-derive status from the changed dates: editing an ACTIVE policy's end
  // date into the past expires it (releases the one-active slot); editing an
  // EXPIRED policy's dates back into the future reactivates it (which is
  // blocked if the vehicle already has another ACTIVE policy). CANCELLED is a
  // terminal, historical state and is left untouched.
  const now = new Date();
  const nextStart = merged.startDate ? toDate(merged.startDate) : undefined;
  const nextEnd = merged.endDate ? toDate(merged.endDate) : undefined;
  const end = nextEnd ?? existing.endDate;

  let status = existing.status;
  if (existing.status !== INSURANCE_STATUS.CANCELLED) {
    if (end.getTime() < now.getTime()) {
      status = INSURANCE_STATUS.EXPIRED;
    } else {
      // Returning to (or staying) live.
      if (existing.status !== INSURANCE_STATUS.ACTIVE) {
        const other = await findActivePolicy(existing.vehicleId, existing.id);
        if (other) {
          throw new ValidationError(
            `Vehicle already has an active policy (${other.policyNo}).`,
            "status"
          );
        }
      }
      status = INSURANCE_STATUS.ACTIVE;
    }
  }

  const ins = await prisma.vehicleInsurance.update({
    where: { id },
    data: {
      company: merged.company ?? undefined,
      policyNo: merged.policyNo ?? undefined,
      coverage: merged.coverage ?? undefined,
      startDate: nextStart,
      endDate: nextEnd,
      status,
    },
  });

  await writeAudit({
    action: "UPDATE",
    entity: "VehicleInsurance",
    entityId: ins.id,
    vehicleId: ins.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    newValue: ins,
    req: ctx.req,
  });

  return ins;
}

// Renew pushes a policy's end date forward and returns it to ACTIVE. Only the
// end date may be extended (a renewal is never a way to shorten or re-date a
// policy — that would rewrite history). Runs as the same-row lifecycle so the
// vehicle's coverage is continuous and only one ACTIVE policy ever exists.
export async function renewInsurance(
  id: string,
  payload: { endDate: string },
  ctx: Context = {}
) {
  const existing = await prisma.vehicleInsurance.findUnique({ where: { id } });
  if (!existing) return null;

  if (existing.status === INSURANCE_STATUS.CANCELLED) {
    throw new ValidationError("A cancelled policy cannot be renewed", "status");
  }

  const newEnd = toDate(payload.endDate);
  if (!newEnd) {
    throw new ValidationError("Valid end date required", "endDate");
  }
  if (newEnd.getTime() <= existing.endDate.getTime()) {
    throw new ValidationError("New end date must be after the current end date", "endDate");
  }
  if (newEnd.getTime() < new Date().getTime()) {
    throw new ValidationError("New end date must be in the future", "endDate");
  }

  if (existing.status !== INSURANCE_STATUS.ACTIVE) {
    const other = await findActivePolicy(existing.vehicleId, existing.id);
    if (other) {
      throw new ValidationError(
        `Vehicle already has an active policy (${other.policyNo}).`,
        "status"
      );
    }
  }

  const ins = await prisma.vehicleInsurance.update({
    where: { id },
    data: { endDate: newEnd, status: INSURANCE_STATUS.ACTIVE },
  });

  await writeAudit({
    action: "RENEW",
    entity: "VehicleInsurance",
    entityId: ins.id,
    vehicleId: ins.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    newValue: ins,
    req: ctx.req,
  });

  return ins;
}

export async function deleteInsurance(id: string, ctx: Context = {}) {
  const existing = await prisma.vehicleInsurance.findUnique({ where: { id } });
  if (!existing) return null;

  // Deleting the vehicle's only in-force policy would silently leave it
  // uninsured — require it to be expired/cancelled (or renewed) first.
  // Error entries can be cleaned up normally.
  if (existing.status === INSURANCE_STATUS.ACTIVE) {
    throw new ValidationError(
      "Cannot delete an active insurance policy. Renew, edit, or cancel it first.",
      "status"
    );
  }

  await prisma.vehicleInsurance.delete({ where: { id } });

  await writeAudit({
    action: "DELETE",
    entity: "VehicleInsurance",
    entityId: id,
    vehicleId: existing.vehicleId,
    userId: ctx.userId,
    oldValue: existing,
    req: ctx.req,
  });

  return existing;
}

// "CURRENT" = the vehicle's coverage in force right now: an ACTIVE policy whose
// window includes today. PENDING = a future-dated ACTIVE policy not yet in
// force. EXPIRED = past its end date (stored EXPIRED, or ACTIVE the cron has
// not caught up with). CANCELLED = manually superseded.
function insuranceStatusCondition(status: string, now: Date): object | null {
  switch (status) {
    case "CURRENT":
      return {
        status: INSURANCE_STATUS.ACTIVE,
        startDate: { lte: now },
        endDate: { gte: now },
      };
    case "ACTIVE":
      return { status: INSURANCE_STATUS.ACTIVE, endDate: { gte: now } };
    case "PENDING":
      return { status: INSURANCE_STATUS.ACTIVE, startDate: { gt: now } };
    case INSURANCE_STATUS.EXPIRED:
      return {
        OR: [
          { status: INSURANCE_STATUS.EXPIRED },
          { status: INSURANCE_STATUS.ACTIVE, endDate: { lt: now } },
        ],
      };
    case INSURANCE_STATUS.CANCELLED:
      return { status: INSURANCE_STATUS.CANCELLED };
    default:
      return null;
  }
}

export async function listInsurances(opts: {
  search?: string;
  coverage?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const { search, coverage, status, from, to, page = 1, pageSize } = opts;
  const ps = pageSize ?? await defaultPageSize();
  const where: any = {};
  const statusCondition = status ? insuranceStatusCondition(status, new Date()) : null;
  if (statusCondition) where.AND = statusCondition;
  if (search) {
    where.OR = [
      { policyNo: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
      { coverage: { contains: search, mode: "insensitive" } },
      { vehicle: { plateNumber: { contains: search, mode: "insensitive" } } },
      { vehicle: { vehicleCode: { contains: search, mode: "insensitive" } } },
    ];
  }
  if (coverage) where.coverage = coverage;
  if (from || to) {
    where.endDate = {};
    if (from) where.endDate.gte = new Date(from);
    if (to) where.endDate.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.vehicleInsurance.findMany({
      where,
      include: { vehicle: { include: { branch: true } } },
      orderBy: { endDate: "asc" },
      skip: (page - 1) * ps,
      take: ps,
    }),
    prisma.vehicleInsurance.count({ where }),
  ]);

  return { items, total, page, pageSize: ps, totalPages: Math.ceil(total / ps) };
}

export async function getInsurance(id: string) {
  return prisma.vehicleInsurance.findUnique({
    where: { id },
    include: { vehicle: true },
  });
}