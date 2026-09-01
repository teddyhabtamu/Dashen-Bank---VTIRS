import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { VEHICLE_STATUS } from "../lib/constants.js";

type Db = Prisma.TransactionClient | typeof prisma;

// Status values the user can pick manually in the UI. ASSIGNED is excluded: it
// is a derived state reflecting whether a driver is currently assigned to the
// vehicle, so it is managed by the system rather than chosen by hand.
export const MANUAL_VEHICLE_STATUSES: readonly string[] = [
  VEHICLE_STATUS.ACTIVE,
  VEHICLE_STATUS.UNDER_MAINTENANCE,
  VEHICLE_STATUS.RESERVED,
  VEHICLE_STATUS.DISPOSED,
];

// Only the ACTIVE <-> ASSIGNED pair is auto-derived. The manual states
// (UNDER_MAINTENANCE, RESERVED, DISPOSED) take precedence and are left alone.
export function isDerivedAssignState(status: string): boolean {
  return (
    status === VEHICLE_STATUS.ACTIVE || status === VEHICLE_STATUS.ASSIGNED
  );
}

export function desiredAssignStatus(hasDriver: boolean): string {
  return hasDriver ? VEHICLE_STATUS.ASSIGNED : VEHICLE_STATUS.ACTIVE;
}

// Reconcile a vehicle's status against whether a driver is currently assigned,
// keeping it consistent immediately (rather than waiting for the nightly cron).
// A driver counts if there is an active (returnedAt IS NULL) formal assignment
// OR a currentDriverId is set (the "not yet registered" case). Manual states
// (UNDER_MAINTENANCE, RESERVED, DISPOSED) are never overwritten.
export async function reconcileVehicleAssignStatus(
  db: Db,
  vehicleId: string,
): Promise<void> {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: { status: true, currentDriverId: true },
  });
  if (!vehicle || !isDerivedAssignState(vehicle.status)) return;

  const activeAssignments = await db.vehicleAssignment.count({
    where: { vehicleId, returnedAt: null },
  });
  const hasDriver =
    activeAssignments > 0 || vehicle.currentDriverId != null;

  const desired = desiredAssignStatus(hasDriver);
  if (desired !== vehicle.status) {
    await db.vehicle.update({
      where: { id: vehicleId },
      data: { status: desired },
    });
  }
}
