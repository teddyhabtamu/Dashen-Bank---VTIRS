import { prisma } from "../lib/prisma.js";
import { insuranceSchema, InsuranceInput } from "../validation/registration.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { DuplicateInsuranceError } from "./errors.js";
import { defaultPageSize } from "./setting.js";

export { DuplicateInsuranceError };

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

function toDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
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

export async function createInsurance(input: InsuranceInput, ctx: Context = {}) {
  const data = insuranceSchema.parse(input);
  await checkDuplicatePolicy(data);

  const ins = await prisma.vehicleInsurance.create({
    data: {
      vehicleId: data.vehicleId,
      company: data.company,
      policyNo: data.policyNo,
      coverage: data.coverage,
      startDate: toDate(data.startDate)!,
      endDate: toDate(data.endDate)!,
      createdById: ctx.userId ?? null,
    },
  });

  await writeAudit({
    action: "CREATE",
    entity: "VehicleInsurance",
    entityId: ins.id,
    vehicleId: ins.vehicleId,
    userId: ctx.userId,
    newValue: ins,
    req: ctx.req,
  });

  return ins;
}

export async function updateInsurance(id: string, input: Partial<InsuranceInput>, ctx: Context = {}) {
  const existing = await prisma.vehicleInsurance.findUnique({ where: { id } });
  if (!existing) return null;

  const merged = insuranceSchema.partial().parse(input);
  if (merged.policyNo && merged.policyNo !== existing.policyNo) {
    await checkDuplicatePolicy({ ...existing, ...merged } as InsuranceInput, id);
  }

  const ins = await prisma.vehicleInsurance.update({
    where: { id },
    data: {
      company: merged.company ?? undefined,
      policyNo: merged.policyNo ?? undefined,
      coverage: merged.coverage ?? undefined,
      startDate: merged.startDate ? toDate(merged.startDate) : undefined,
      endDate: merged.endDate ? toDate(merged.endDate) : undefined,
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

export async function deleteInsurance(id: string, ctx: Context = {}) {
  const existing = await prisma.vehicleInsurance.findUnique({ where: { id } });
  if (!existing) return null;

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

export async function listInsurances(opts: {
  search?: string;
  coverage?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  const { search, coverage, from, to, page = 1, pageSize } = opts;
  const ps = pageSize ?? await defaultPageSize();
  const where: any = {};
  if (search) {
    where.OR = [
      { policyNo: { contains: search } },
      { company: { contains: search } },
      { coverage: { contains: search } },
      { vehicle: { plateNumber: { contains: search } } },
      { vehicle: { vehicleCode: { contains: search } } },
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
