import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import { VEHICLE_STATUS } from "../lib/constants.js";
import { reconcileVehicleAssignStatus } from "./vehicleStatus.js";

type Db = Prisma.TransactionClient | typeof prisma;

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

// Transfer a driver to a different vehicle in a single action. Any active
// assignment the driver has on another vehicle, and any active assignment
// already on the target vehicle, are returned (marked) as history; the driver
// is then assigned to the target vehicle and statuses are reconciled.
export async function transferDriver(
  vehicleId: string,
  driverId: string,
  ctx: Context = {}
) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) return null;

  if (vehicle.status === VEHICLE_STATUS.DISPOSED) {
    throw new Error("Cannot assign a driver to a disposed vehicle");
  }

  const driver = await prisma.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw new Error("Driver not found");

  if (vehicle.currentDriverId === driverId) {
    throw new Error("Driver is already assigned to this vehicle");
  }

  const result = await prisma.$transaction(async (tx) => {
    const returned: any[] = [];

    // Return the vehicle's current active assignment, if any.
    const vehicleActive = await tx.vehicleAssignment.findFirst({
      where: { vehicleId, returnedAt: null },
    });
    if (vehicleActive && vehicleActive.driverId !== driverId) {
      await tx.vehicleAssignment.update({
        where: { id: vehicleActive.id },
        data: { returnedAt: new Date() },
      });
      returned.push(vehicleActive);
    }

    // Return the driver's active assignment on any other vehicle, if any.
    const driverActiveElsewhere = await tx.vehicleAssignment.findFirst({
      where: { driverId, returnedAt: null, NOT: { vehicleId } },
    });
    if (driverActiveElsewhere) {
      await tx.vehicleAssignment.update({
        where: { id: driverActiveElsewhere.id },
        data: { returnedAt: new Date() },
      });
      const otherVehicle = await tx.vehicle.findUnique({
        where: { id: driverActiveElsewhere.vehicleId },
        select: { currentDriverId: true },
      });
      if (otherVehicle?.currentDriverId === driverId) {
        await tx.vehicle.update({
          where: { id: driverActiveElsewhere.vehicleId },
          data: { currentDriverId: null },
        });
      }
      returned.push(driverActiveElsewhere);
    }

    const assignment = await tx.vehicleAssignment.create({
      data: { vehicleId, driverId, branchId: vehicle.branchId ?? null },
      include: { driver: true, vehicle: true },
    });

    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { currentDriverId: driverId },
    });

    await reconcileVehicleAssignStatus(tx, vehicleId);
    for (const r of returned) {
      if (r.vehicleId !== vehicleId) await reconcileVehicleAssignStatus(tx, r.vehicleId);
    }

    return { assignment, returned };
  });

  await writeAudit({
    action: "TRANSFER",
    entity: "VehicleAssignment",
    entityId: result.assignment.id,
    vehicleId,
    userId: ctx.userId,
    newValue: result.assignment,
    req: ctx.req,
  });

  return result;
}

// Keep the formal assignment trail consistent with the vehicle's current-driver
// pointer. Called whenever a driver is set/cleared directly on the vehicle
// (create/edit form), so picking a driver in the form yields the same green
// "Currently Assigned" state as the panel's Assign action instead of leaving a
// "not yet registered" driver behind. Runs inside a caller transaction.
export async function autoFormalizeCurrentDriver(
  db: Db,
  vehicleId: string,
  input: { driverId?: string | null; branchId?: string | null }
): Promise<void> {
  const driverId = input.driverId ?? null;

  if (!driverId) {
    const active = await db.vehicleAssignment.findFirst({
      where: { vehicleId, returnedAt: null },
    });
    if (active) {
      await db.vehicleAssignment.update({
        where: { id: active.id },
        data: { returnedAt: new Date() },
      });
    }
    return;
  }

  const driver = await db.driver.findUnique({ where: { id: driverId } });
  if (!driver) throw new Error("Driver not found");

  const vehicleActive = await db.vehicleAssignment.findFirst({
    where: { vehicleId, returnedAt: null },
  });
  if (vehicleActive && vehicleActive.driverId === driverId) {
    return;
  }
  if (vehicleActive) {
    await db.vehicleAssignment.update({
      where: { id: vehicleActive.id },
      data: { returnedAt: new Date() },
    });
  }

  // A driver cannot be actively assigned to two different vehicles at once.
  const driverActiveElsewhere = await db.vehicleAssignment.findFirst({
    where: { driverId, returnedAt: null, NOT: { vehicleId } },
  });
  if (driverActiveElsewhere) {
    throw new Error("Driver is already assigned to another vehicle");
  }

  await db.vehicleAssignment.create({
    data: {
      vehicleId,
      driverId,
      branchId: input.branchId ?? null,
    },
  });
}
