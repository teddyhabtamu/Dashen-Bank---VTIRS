import { getSetting } from "./setting.js";
import { REGISTRATION_STATUS, VEHICLE_STATUS, INSURANCE_STATUS } from "../lib/constants.js";
import { prisma } from "../lib/prisma.js";

export type ExpiryState = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";
export type ReminderWindows = [number, number, number, number];

export const DEFAULT_REMINDER_WINDOWS: ReminderWindows = [90, 60, 30, 7];

// Windows ordered as [w90, w60, w30, w7]. If any configured value is missing /
// invalid we fall back to the corresponding default so bad settings never
// produce NaN buckets.
export async function getReminderWindows(): Promise<ReminderWindows> {
  const w90 = Number(await getSetting("reminder_days_90", "90")) || 90;
  const w60 = Number(await getSetting("reminder_days_60", "60")) || 60;
  const w30 = Number(await getSetting("reminder_days_30", "30")) || 30;
  const w7 = Number(await getSetting("reminder_days_7", "7")) || 7;
  return [w90, w60, w30, w7];
}

// Shortcut for the max horizon window (used by notification generation).
export async function getReminderHorizonDays(): Promise<number> {
  const windows = await getReminderWindows();
  return Math.max(...windows);
}

// Days from today until `date` (negative = already past).
export function daysUntil(date: Date | string | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// Pure expiry classifier. Driven by the (possibly configured) reminder windows
// so badge/severity thresholds stay aligned with the admin's settings instead
// of being hardcoded.
export function classifyExpiryState(
  days: number | null,
  windows: ReminderWindows = DEFAULT_REMINDER_WINDOWS
): ExpiryState {
  if (days === null) return "OK";
  if (days < 0) return "EXPIRED";
  const [, , w30, w7] = windows;
  if (days <= w7) return "CRITICAL";
  if (days <= w30) return "WARNING";
  return "OK";
}

// Classify an expiry date into a state for badges/highlighting.
export function expiryState(
  date: Date | string | null | undefined,
  windows: ReminderWindows = DEFAULT_REMINDER_WINDOWS
): ExpiryState {
  return classifyExpiryState(daysUntil(date), windows);
}

// Derive a registration's effective status from its expiry date. Only the
// manual states (SUSPENDED, ARCHIVED) pass through untouched; anything else
// falls back to EXPIRED once its expiry date has passed — this prevents a
// PENDING_RENEWAL registration from displaying as "pending" after it has
// actually expired.
export function effectiveRegistrationStatus(
  status: string,
  expiryDate: Date | string | null | undefined
): string {
  if (status === REGISTRATION_STATUS.SUSPENDED || status === REGISTRATION_STATUS.ARCHIVED) {
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
  const [, , w30, w7] = await getReminderWindows();
  const thirtyDaysFromNow = new Date(now.getTime() + w30 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(now.getTime() + w7 * 24 * 60 * 60 * 1000);

  const [expiredActive, expiredPending, pendingResult] = await Promise.all([
    prisma.vehicleRegistration.updateMany({
      where: {
        status: REGISTRATION_STATUS.ACTIVE,
        expiryDate: { lt: now },
      },
      data: { status: REGISTRATION_STATUS.EXPIRED },
    }),
    prisma.vehicleRegistration.updateMany({
      where: {
        status: REGISTRATION_STATUS.PENDING_RENEWAL,
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

  const total = expiredActive.count + expiredPending.count + pendingResult.count;
  return { transitioned: total };
}

// Derive an insurance policy's effective status.
//   - CANCELLED always passes through — it is a manual, terminal state;
//   - anything past its end date is EXPIRED (even if the stored status still
//     says ACTIVE — the nightly transition may not have caught up yet);
//   - a future-dated policy (start date not yet reached) is PENDING;
//   - anything else is ACTIVE (in force).
export function effectiveInsuranceStatus(
  status: string,
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  now: Date = new Date()
): string {
  if (status === INSURANCE_STATUS.CANCELLED) return status;
  const end = toSafeDate(endDate);
  const start = toSafeDate(startDate);
  if (end && end.getTime() < now.getTime()) return INSURANCE_STATUS.EXPIRED;
  if (start && start.getTime() > now.getTime()) return "PENDING";
  return INSURANCE_STATUS.ACTIVE;
}

function toSafeDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Bulk auto-transition insurance policies whose end date has passed.
// Called on startup and via the daily cron alongside the registration sweep.
export async function autoTransitionInsurances(): Promise<{ transitioned: number }> {
  const res = await prisma.vehicleInsurance.updateMany({
    where: {
      status: INSURANCE_STATUS.ACTIVE,
      endDate: { lt: new Date() },
    },
    data: { status: INSURANCE_STATUS.EXPIRED },
  });
  return { transitioned: res.count };
}

export async function autoTransitionVehicleStatus(): Promise<{ transitioned: number }> {
  // Only the derived ACTIVE/ASSIGNED pair is reconciled here; manual states
  // (UNDER_MAINTENANCE, RESERVED, DISPOSED) are left alone. A vehicle counts as
  // assigned if it has an active formal assignment OR a currentDriverId.
  const assignedResult = await prisma.vehicle.updateMany({
    where: {
      status: { in: [VEHICLE_STATUS.ACTIVE, VEHICLE_STATUS.ASSIGNED] },
      OR: [
        { assignments: { some: { returnedAt: null } } },
        { currentDriverId: { not: null } },
      ],
    },
    data: { status: VEHICLE_STATUS.ASSIGNED },
  });

  const activeResult = await prisma.vehicle.updateMany({
    where: {
      status: { in: [VEHICLE_STATUS.ACTIVE, VEHICLE_STATUS.ASSIGNED] },
      assignments: { none: { returnedAt: null } },
      currentDriverId: null,
    },
    data: { status: VEHICLE_STATUS.ACTIVE },
  });

  const total = assignedResult.count + activeResult.count;
  return { transitioned: total };
}
