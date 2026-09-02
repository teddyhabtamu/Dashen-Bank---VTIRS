import { prisma } from "../lib/prisma.js";
import { generateVehicleCode } from "../lib/ids.js";
import { REGISTRATION_STATUS } from "../lib/constants.js";
import { vehicleSchema, VehicleInput } from "../validation/vehicle.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { defaultPageSize } from "./setting.js";
import { reconcileVehicleAssignStatus } from "./vehicleStatus.js";
import { autoFormalizeCurrentDriver } from "./assignment.js";
import { deleteFiles } from "../lib/storage.js";

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

  const vehicle = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicle.create({
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
        currentDriverId: data.currentDriverId ?? null,
        acquisitionDate: toDate(data.acquisitionDate),
        purchaseCost: data.purchaseCost,
        supplier: data.supplier,
        status: data.status,
        createdById: ctx.userId ?? null,
      },
      include: { branch: true, department: true },
    });

    // A driver picked at creation becomes a formal, audited assignment right
    // away instead of just a "currentDriverId" pointer (no more "not yet
    // registered" state for new vehicles).
    await autoFormalizeCurrentDriver(tx, created.id, {
      driverId: data.currentDriverId,
      branchId: data.branchId,
    });

    await reconcileVehicleAssignStatus(tx, created.id);

    return created;
  });

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

  // currentDriverId is nullish (explicitly cleared) or a driver id, or absent
  // (undefined = caller didn't touch the driver, so keep it). This also makes
  // the "Remove Driver" flow actually clear the pointer.
  const newDriverId =
    merged.currentDriverId === undefined
      ? existing.currentDriverId
      : merged.currentDriverId;

  const vehicle = await prisma.$transaction(async (tx) => {
    const updated = await tx.vehicle.update({
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
        currentDriverId: newDriverId,
        acquisitionDate: toDate(merged.acquisitionDate),
        purchaseCost: merged.purchaseCost,
        supplier: merged.supplier,
        status: merged.status,
      },
      include: { branch: true, department: true },
    });

    // Keep the formal assignment trail in sync with the (possibly changed)
    // current driver, then reconcile the derived ACTIVE/ASSIGNED status.
    await autoFormalizeCurrentDriver(tx, id, {
      driverId: newDriverId,
      branchId: updated.branchId,
    });
    await reconcileVehicleAssignStatus(tx, id);

    return updated;
  });

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

  const [docPaths, imgPaths] = await Promise.all([
    prisma.vehicleDocument.findMany({ where: { vehicleId: id }, select: { path: true } }),
    prisma.vehicleImage.findMany({ where: { vehicleId: id }, select: { path: true } }),
  ]);

  await prisma.vehicle.delete({ where: { id } });

  // Clean up object-storage blobs (the DB cascade deletes rows; blobs are removed here
  // so deleting a vehicle does not leave orphaned files in the bucket).
  await deleteFiles(docPaths.map((d) => d.path).concat(imgPaths.map((i) => i.path)));

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
// Whitelisted sort columns for the registry table. Anything else falls back
// to the default ordering (newest first).
const SORTABLE_COLUMNS: Record<string, boolean> = {
  vehicleCode: true,
  plateNumber: true,
  make: true,
  year: true,
  status: true,
  createdAt: true,
  updatedAt: true,
};

export async function listVehicles(opts: {
  search?: string;
  status?: string;
  branchId?: string;
  type?: string;
  year?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}) {
  const { search, status, branchId, type, year, sortBy, sortDir, page = 1, pageSize } = opts;
  const ps = pageSize ?? await defaultPageSize();
  const where: any = {};
  if (status) where.status = status;
  if (branchId) where.branchId = branchId;
  if (type) where.type = type;
  if (year && Number.isFinite(year)) where.year = year;
  if (search) {
    // Case-insensitive: Postgres `contains` without mode is a case-sensitive
    // LIKE — "toyota" missed "Toyota" here while every other list page
    // already searched insensitively.
    const q = { contains: search, mode: "insensitive" as const };
    where.OR = [
      { plateNumber: q },
      { vehicleCode: q },
      { engineNo: q },
      { chassisNo: q },
      { make: q },
      { model: q },
      { ownerName: q },
    ];
  }

  const orderBy =
    sortBy && SORTABLE_COLUMNS[sortBy]
      ? { [sortBy]: sortDir === "asc" ? "asc" : "desc" }
      : { createdAt: "desc" as const };

  const [items, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      // Slim driver include: the list only renders the name (the peek modal
      // re-fetches full details by id) — pulling entire driver rows with
      // department relations for every vehicle row was pure over-fetch.
      include: {
        branch: { select: { name: true } },
        department: { select: { name: true } },
        currentDriver: { select: { id: true, fullName: true, employeeId: true, isActive: true } },
      },
      orderBy,
      skip: (page - 1) * ps,
      take: ps,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return { items, total, page, pageSize: ps, totalPages: Math.ceil(total / ps) };
}
