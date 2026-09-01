import { prisma } from "../lib/prisma.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { VEHICLE_STATUS } from "../lib/constants.js";
import { reconcileVehicleAssignStatus } from "./vehicleStatus.js";

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

export interface AssignmentInput {
  driverId: string;
  branchId?: string | null;
  note?: string | null;
}

export async function listAssignments(vehicleId: string) {
  return prisma.vehicleAssignment.findMany({
    where: { vehicleId },
    include: { driver: true, branch: true },
    orderBy: { assignedAt: "desc" },
  });
}

export async function assignDriver(vehicleId: string, input: AssignmentInput, ctx: Context = {}) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return null;

  if (vehicle.status === VEHICLE_STATUS.DISPOSED) {
    throw new Error("Cannot assign a driver to a disposed vehicle");
  }

  const driver = await prisma.driver.findUnique({ where: { id: input.driverId } });
  if (!driver) throw new Error("Driver not found");

  const result = await prisma.$transaction(async (tx) => {
    const active = await tx.vehicleAssignment.findFirst({
      where: { vehicleId, returnedAt: null },
    });

    if (active) {
      await tx.vehicleAssignment.update({
        where: { id: active.id },
        data: { returnedAt: new Date() },
      });
    }

    // A driver cannot be actively assigned to two different vehicles at once.
    const driverActiveElsewhere = await tx.vehicleAssignment.findFirst({
      where: { driverId: input.driverId, returnedAt: null, NOT: { vehicleId } },
    });
    if (driverActiveElsewhere) {
      throw new Error("Driver is already assigned to another vehicle");
    }

    const assignment = await tx.vehicleAssignment.create({
      data: {
        vehicleId,
        driverId: input.driverId,
        branchId: input.branchId ?? null,
        note: input.note ?? null,
      },
      include: { driver: true, branch: true },
    });

    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { currentDriverId: input.driverId },
    });

    await reconcileVehicleAssignStatus(tx, vehicleId);

    return assignment;
  });

  await writeAudit({
    action: "ASSIGN",
    entity: "VehicleAssignment",
    entityId: result.id,
    vehicleId,
    userId: ctx.userId,
    newValue: result,
    req: ctx.req,
  });

  return result;
}

export async function returnDriver(vehicleId: string, assignmentId: string, ctx: Context = {}) {
  const assignment = await prisma.vehicleAssignment.findFirst({
    where: { id: assignmentId, vehicleId },
    include: { driver: true, branch: true },
  });

  if (!assignment) return null;

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.vehicleAssignment.update({
      where: { id: assignmentId },
      data: { returnedAt: new Date() },
      include: { driver: true, branch: true },
    });

    const vehicle = await tx.vehicle.findUnique({
      where: { id: vehicleId },
      select: { currentDriverId: true },
    });

    if (vehicle?.currentDriverId === assignment.driverId) {
      await tx.vehicle.update({
        where: { id: vehicleId },
        data: { currentDriverId: null },
      });
    }

    await reconcileVehicleAssignStatus(tx, vehicleId);

    return updated;
  });

  await writeAudit({
    action: "RETURN",
    entity: "VehicleAssignment",
    entityId: assignmentId,
    vehicleId,
    userId: ctx.userId,
    oldValue: assignment,
    newValue: updated,
    req: ctx.req,
  });

  return updated;
}
