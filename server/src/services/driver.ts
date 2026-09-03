import { prisma } from "../lib/prisma.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { defaultPageSize } from "./setting.js";
import { resolveRemindersForDriver } from "./notification.js";

export class DuplicateDriverError extends Error {
  field: string;
  constructor(field: string, value: string) {
    super(`A driver with ${field} "${value}" already exists`);
    this.field = field;
  }
}

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

export interface DriverInput {
  employeeId?: string | null;
  fullName?: string;
  licenseExpiry?: string | null;
  licenseNo?: string | null;
  phone?: string | null;
  departmentId?: string | null;
  isActive?: boolean;
}

async function checkEmployeeIdDuplicate(employeeId: string | null | undefined, excludeId?: string) {
  if (!employeeId) return;
  const existing = await prisma.driver.findFirst({
    where: {
      employeeId,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
  });
  if (existing) throw new DuplicateDriverError("employeeId", employeeId);
}

export async function listDrivers(opts: {
  search?: string;
  departmentId?: string;
  status?: string;
  branchId?: string;
  unassigned?: boolean;
  licenseExpiringWithin?: number;
  page?: number;
  pageSize?: number;
}) {
  const { search, departmentId, status, branchId, unassigned, licenseExpiringWithin, page = 1, pageSize } = opts;
  const ps = pageSize ?? (await defaultPageSize());
  const where: any = {};
  if (departmentId) where.departmentId = departmentId;
  if (status === "ACTIVE") where.isActive = true;
  else if (status === "INACTIVE") where.isActive = false;
  // Drivers whose current vehicle sits at the given branch (drivers belong to
  // departments but drive branch vehicles — this filters by where they drive).
  if (branchId) where.vehicles = { some: { branchId } };
  // Quick staffing filter: no current vehicle at all.
  if (unassigned) where.vehicles = { none: {} };
  if (licenseExpiringWithin !== undefined && Number.isFinite(licenseExpiringWithin)) {
    const now = new Date();
    where.licenseExpiry =
      licenseExpiringWithin < 0
        ? { lt: now }
        : { lte: new Date(now.getTime() + licenseExpiringWithin * 24 * 60 * 60 * 1000) };
  }
  if (search) {
    const q = { contains: search, mode: "insensitive" as const };
    where.OR = [
      { fullName: q },
      { employeeId: q },
      { licenseNo: q },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.driver.findMany({
      where,
      orderBy: { fullName: "asc" },
      include: {
        department: { select: { id: true, name: true } },
        vehicles: {
          select: {
            id: true,
            plateNumber: true,
            vehicleCode: true,
            make: true,
            model: true,
          },
        },
      },
      skip: (page - 1) * ps,
      take: ps,
    }),
    prisma.driver.count({ where }),
  ]);

  return { rows, total, page, pageSize: ps, totalPages: Math.ceil(total / ps) };
}

export async function getDriver(id: string) {
  const driver = await prisma.driver.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      vehicles: {
        orderBy: { createdAt: "desc" },
        include: { branch: true, department: true },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: {
          vehicle: {
            select: {
              id: true,
              plateNumber: true,
              vehicleCode: true,
              make: true,
              model: true,
            },
          },
          branch: { select: { id: true, name: true } },
        },
      },
    },
  });
  return driver;
}

export async function createDriver(input: DriverInput, ctx: Context = {}) {
  await checkEmployeeIdDuplicate(input.employeeId);
  const driver = await prisma.driver.create({
    data: {
      employeeId: input.employeeId || undefined,
      fullName: input.fullName!,
      licenseNo: input.licenseNo || undefined,
      licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : undefined,
      phone: input.phone || undefined,
      departmentId: input.departmentId || undefined,
      isActive: input.isActive ?? true,
    },
    include: { department: true },
  });
  await writeAudit({
    action: "CREATE",
    entity: "Driver",
    entityId: driver.id,
    userId: ctx.userId,
    newValue: driver,
    req: ctx.req,
  });
  return driver;
}

export async function updateDriver(id: string, input: Partial<DriverInput>, ctx: Context = {}) {
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) return null;
  if (input.employeeId !== undefined) {
    await checkEmployeeIdDuplicate(input.employeeId, id);
  }
  const driver = await prisma.driver.update({
    where: { id },
    data: {
      ...(input.employeeId !== undefined && { employeeId: input.employeeId || null }),
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.licenseNo !== undefined && { licenseNo: input.licenseNo || null }),
      ...(input.licenseExpiry !== undefined && {
        licenseExpiry: input.licenseExpiry ? new Date(input.licenseExpiry) : null,
      }),
      ...(input.phone !== undefined && { phone: input.phone || null }),
      ...(input.departmentId !== undefined && { departmentId: input.departmentId || null }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
    include: { department: true },
  });
  await writeAudit({
    action: "UPDATE",
    entity: "Driver",
    entityId: id,
    userId: ctx.userId,
    oldValue: existing,
    newValue: driver,
    req: ctx.req,
  });

  // A changed license date invalidates any pending license reminder for this
  // driver. Best-effort: never fail the update because cleanup errored.
  if (input.licenseExpiry !== undefined) {
    await resolveRemindersForDriver(id).catch(() => undefined);
  }
  return driver;
}

export async function deleteDriver(id: string, ctx: Context = {}) {
  const existing = await prisma.driver.findUnique({ where: { id } });
  if (!existing) return null;
  const activeAssignments = await prisma.vehicleAssignment.count({
    where: { driverId: id, returnedAt: null },
  });
  if (activeAssignments > 0) {
    throw new Error("Cannot delete driver with active vehicle assignments");
  }
  await prisma.driver.delete({ where: { id } });
  await writeAudit({
    action: "DELETE",
    entity: "Driver",
    entityId: id,
    userId: ctx.userId,
    oldValue: existing,
    req: ctx.req,
  });

  // With the driver gone there is nothing left to be reminded about.
  await resolveRemindersForDriver(id).catch(() => undefined);

  return existing;
}
