import { getSetting } from "./setting.js";
import { REGISTRATION_STATUS } from "../lib/constants.js";
import { prisma } from "../lib/prisma.js";

export type ExpiryState = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";

export async function getReminderWindows(): Promise<[number, number, number, number]> {
  const w90 = Number(await getSetting("reminder_days_90", "90")) || 90;
  const w60 = Number(await getSetting("reminder_days_60", "60")) || 60;
  const w30 = Number(await getSetting("reminder_days_30", "30")) || 30;
  const w7 = Number(await getSetting("reminder_days_7", "7")) || 7;
  return [w90, w60, w30, w7];
}

// Shortcut for the max horizon window (used by notification generation).
export async function getReminderHorizonDays(): Promise<number> {
  const [w90] = await getReminderWindows();
  return w90;
}

// Days from today until `date` (negative = already past).
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// Classify an expiry date into a state for badges/highlighting.
export function expiryState(date: Date | string | null | undefined): ExpiryState {
  const days = daysUntil(date);
  if (days === null) return "OK";
  if (days < 0) return "EXPIRED";
  if (days <= 7) return "CRITICAL";
  if (days <= 30) return "WARNING";
  return "OK";
}

// Derive a registration's effective status from its expiry date if still active.
export function effectiveRegistrationStatus(
  status: string,
  expiryDate: Date | string | null | undefined
): string {
  if (status === REGISTRATION_STATUS.SUSPENDED || status === REGISTRATION_STATUS.PENDING_RENEWAL || status === REGISTRATION_STATUS.ARCHIVED) {
    return status;
  }
  const days = daysUntil(expiryDate);
  if (days !== null && days < 0) return REGISTRATION_STATUS.EXPIRED;
  return status;
}

// Bulk auto-transition registrations based on expiry dates.
// Called periodically from the server startup interval.
export async function autoTransitionRegistrations(): Promise<{ transitioned: number }> {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [expiredResult, pendingResult] = await Promise.all([
    prisma.vehicleRegistration.updateMany({
      where: {
        status: REGISTRATION_STATUS.ACTIVE,
        expiryDate: { lt: now },
      },
      data: { status: REGISTRATION_STATUS.EXPIRED },
    }),
    prisma.vehicleRegistration.updateMany({
      where: {
        status: REGISTRATION_STATUS.ACTIVE,
        expiryDate: { gte: sevenDaysFromNow, lt: thirtyDaysFromNow },
      },
      data: { status: REGISTRATION_STATUS.PENDING_RENEWAL },
    }),
  ]);

  const total = expiredResult.count + pendingResult.count;
  return { transitioned: total };
}

export async function autoTransitionVehicleStatus(): Promise<{ transitioned: number }> {
  const assignedResult = await prisma.vehicle.updateMany({
    where: {
      status: "ACTIVE",
      assignments: { some: { returnedAt: null } },
    },
    data: { status: "ASSIGNED" },
  });

  const activeResult = await prisma.vehicle.updateMany({
    where: {
      status: "ASSIGNED",
      assignments: { none: { returnedAt: null } },
    },
    data: { status: "ACTIVE" },
  });

  const total = assignedResult.count + activeResult.count;
  return { transitioned: total };
}
