import { prisma } from "../lib/prisma.js";
import { generateVehicleCode } from "../lib/ids.js";
import { REGISTRATION_STATUS } from "../lib/constants.js";
import { vehicleSchema, VehicleInput } from "../validation/vehicle.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { defaultPageSize } from "./setting.js";
import { reconcileVehicleAssignStatus } from "./vehicleStatus.js";

export class DuplicateVehicleError extends Error {
  field: string;
  constructor(field: string, value: string) {
    super(`A vehicle with ${field} "${value}" already exists`);
    this.field = field;
  }
}

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

// Convert a date-string (YYYY-MM-DD) from the form to a Date | undefined.
function toDate(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function checkDuplicates(
  input: VehicleInput,
  excludeId?: string
): Promise<void> {
  const or: any[] = [];
  or.push({ plateNumber: input.plateNumber });
  or.push({ engineNo: input.engineNo });
  or.push({ chassisNo: input.chassisNo });
  if (excludeId) {
    const existing = await prisma.vehicle.findFirst({
      where: { OR: or, NOT: { id: excludeId } },
    });
    if (existing) throw duplicateFor(existing, input);
  } else {
    const existing = await prisma.vehicle.findFirst({ where: { OR: or } });
    if (existing) throw duplicateFor(existing, input);
  }
}

function duplicateFor(existing: any, input: VehicleInput): DuplicateVehicleError {
  if (existing.plateNumber === input.plateNumber)
    return new DuplicateVehicleError("plateNumber", input.plateNumber);
  if (existing.engineNo === input.engineNo)
    return new DuplicateVehicleError("engineNo", input.engineNo);
  return new DuplicateVehicleError("chassisNo", input.chassisNo);
}

async function nextSequence(year: number): Promise<number> {
  const count = await prisma.vehicle.count({
    where: { vehicleCode: { startsWith: `VB-${year}-` } },
  });
  return count + 1;
}

export async function createVehicle(input: VehicleInput, ctx: Context = {}) {
  const data = vehicleSchema.parse(input);
  await checkDuplicates(data);

  const year = data.year;
  const code = generateVehicleCode(year, await nextSequence(year));

  const vehicle = await prisma.vehicle.create({
    data: {
      vehicleCode: code,
      plateNumber: data.plateNumber,
      prevPlateNo: data.prevPlateNo,
      category: data.category,
      type: data.type,
      make: data.make,
      model: data.model,
      trim: data.trim,
      year: data.year,
      color: data.color,
      engineNo: data.engineNo,
      chassisNo: data.chassisNo,
      engineCC: data.engineCC,
      fuelType: data.fuelType,
      transmission: data.transmission,
      driveType: data.driveType,
      odometer: data.odometer,
      ownerName: data.ownerName,
      departmentId: data.departmentId,
      branchId: data.branchId,
      currentDriverId: data.currentDriverId,
      acquisitionDate: toDate(data.acquisitionDate),
      purchaseCost: data.purchaseCost,
      supplier: data.supplier,
      status: data.status,
      createdById: ctx.userId ?? null,
    },
    include: { branch: true, department: true },
  });

  // If a driver was selected at creation, immediately derive ASSIGNED status
  // rather than requiring the nightly cron to catch up.
  await reconcileVehicleAssignStatus(prisma, vehicle.id);

  await writeAudit({
    action: "CREATE",
    entity: "Vehicle",
    entityId: vehicle.id,
    vehicleId: vehicle.id,
    userId: ctx.userId,
    newValue: vehicle,
    req: ctx.req,
  });

  return vehicle;
}

export async function updateVehicle(
  id: string,
  input: Partial<VehicleInput>,
  ctx: Context = {}
) {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) return null;

  const merged = vehicleSchema.partial().parse(input);
  await checkDuplicates(merged as VehicleInput, id);

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: {
      plateNumber: merged.plateNumber,
      prevPlateNo: merged.prevPlateNo,
      category: merged.category,
      type: merged.type,
      make: merged.make,
      model: merged.model,
      trim: merged.trim,
      year: merged.year,
      color: merged.color,
      engineNo: merged.engineNo,
      chassisNo: merged.chassisNo,
      engineCC: merged.engineCC,
      fuelType: merged.fuelType,
      transmission: merged.transmission,
      driveType: merged.driveType,
      odometer: merged.odometer,
      ownerName: merged.ownerName,
      departmentId: merged.departmentId,
      branchId: merged.branchId,
      currentDriverId: merged.currentDriverId,
      acquisitionDate: toDate(merged.acquisitionDate),
      purchaseCost: merged.purchaseCost,
      supplier: merged.supplier,
      status: merged.status,
    },
    include: { branch: true, department: true },
  });

  // Keep the derived ACTIVE/ASSIGNED status consistent with the driver set on
  // the vehicle (e.g. Remove Driver clears currentDriverId -> ACTIVE).
  await reconcileVehicleAssignStatus(prisma, id);

  await writeAudit({
    action: "UPDATE",
    entity: "Vehicle",
    entityId: vehicle.id,
    vehicleId: vehicle.id,
    userId: ctx.userId,
    oldValue: existing,
    newValue: vehicle,
    req: ctx.req,
  });

  return vehicle;
}

export async function deleteVehicle(id: string, ctx: Context = {}) {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) return null;

  const activeRegistrations = await prisma.vehicleRegistration.count({
    where: { vehicleId: id, status: { not: REGISTRATION_STATUS.ARCHIVED } },
  });
  if (activeRegistrations > 0) {
    throw new Error(
      `Cannot delete vehicle: ${activeRegistrations} active registration(s) exist. Archive or resolve them first.`
    );
  }

  const activeInsurances = await prisma.vehicleInsurance.count({
    where: { vehicleId: id, endDate: { gte: new Date() } },
  });
  if (activeInsurances > 0) {
    throw new Error(
      `Cannot delete vehicle: ${activeInsurances} active insurance policy(ies) exist. Expire or cancel them first.`
    );
  }

  const activeAssignments = await prisma.vehicleAssignment.count({
    where: { vehicleId: id, returnedAt: null },
  });
  if (activeAssignments > 0) {
    throw new Error(
      `Cannot delete vehicle: ${activeAssignments} active driver assignment(s) exist. Return the vehicle(s) first.`
    );
  }

  await prisma.vehicle.delete({ where: { id } });

  await writeAudit({
    action: "DELETE",
    entity: "Vehicle",
    entityId: id,
    vehicleId: id,
    userId: ctx.userId,
    oldValue: existing,
    req: ctx.req,
  });

  return existing;
}

export async function bulkDeleteVehicles(
  ids: string[],
  ctx: Context = {}
) {
  const results = { deleted: 0 as number, failed: 0 as number, errors: [] as string[] };

  for (const id of ids) {
    try {
      const deleted = await deleteVehicle(id, ctx);
      if (deleted) {
        results.deleted++;
      } else {
        results.failed++;
        results.errors.push(`Vehicle ${id}: not found`);
      }
    } catch (e: any) {
      results.failed++;
      results.errors.push(`Vehicle ${id}: ${e.message}`);
    }
  }

  return results;
}

export async function bulkUpdateVehicleStatus(
  ids: string[],
  status: string,
  ctx: Context = {}
) {
  const results = { updated: 0 as number, failed: 0 as number, errors: [] as string[] };

  for (const id of ids) {
    try {
      const updated = await updateVehicle(id, { status }, ctx);
      if (updated) {
        results.updated++;
      } else {
        results.failed++;
        results.errors.push(`Vehicle ${id}: not found`);
      }
    } catch (e: any) {
      results.failed++;
      results.errors.push(`Vehicle ${id}: ${e.message}`);
    }
  }

  return results;
}

// List with pagination + filtering for the registry table.
export async function listVehicles(opts: {
  search?: string;
  status?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}) {
  const { search, status, branchId, page = 1, pageSize } = opts;
  const ps = pageSize ?? await defaultPageSize();
  const where: any = {};
  if (status) where.status = status;
  if (branchId) where.branchId = branchId;
  if (search) {
    where.OR = [
      { plateNumber: { contains: search } },
      { vehicleCode: { contains: search } },
      { engineNo: { contains: search } },
      { chassisNo: { contains: search } },
      { make: { contains: search } },
      { model: { contains: search } },
      { ownerName: { contains: search } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      include: { branch: true, department: true, currentDriver: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ps,
      take: ps,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return { items, total, page, pageSize: ps, totalPages: Math.ceil(total / ps) };
}
