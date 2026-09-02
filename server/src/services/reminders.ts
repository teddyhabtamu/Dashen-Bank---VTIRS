import { getSetting } from "./setting.js";
import { REGISTRATION_STATUS, VEHICLE_STATUS, INSURANCE_STATUS } from "../lib/constants.js";
import { prisma } from "../lib/prisma.js";
import { deleteFiles, listObjects, storageEnabled } from "../lib/storage.js";

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

// Parse a stored per-type windows map ({ [type]: [w90,w60,w30,w7] }). Invalid
// entries are dropped so bad data never yields NaN windows.
export async function getReminderWindowsByType(): Promise<Record<string, ReminderWindows>> {
  const raw = await getSetting("reminder_windows_by_type", "{}");
  try {
    const parsed = JSON.parse(raw);
    const out: Record<string, ReminderWindows> = {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const [type, w] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(w) || w.length < 4) continue;
        const [a, b, c, d] = w as unknown[];
        const nums = [Number(a), Number(b), Number(c), Number(d)];
        if (nums.some((n) => !Number.isFinite(n) || n <= 0)) continue;
        out[type] = [nums[0], nums[1], nums[2], nums[3]];
      }
    }
    return out;
  } catch {
    return {};
  }
}

// Reminder windows effective for a given vehicle type: the type-specific
// override if configured, otherwise the global windows.
export async function getReminderWindowsForType(type: string | null | undefined): Promise<ReminderWindows> {
  const global = await getReminderWindows();
  if (!type) return global;
  const byType = await getReminderWindowsByType();
  return byType[type] ?? global;
}

// Distinct vehicle types currently in the fleet, for the per-type settings UI.
export async function listVehicleTypes(): Promise<string[]> {
  const rows = await prisma.vehicle.groupBy({ by: ["type"], _count: { _all: true } });
  return rows
    .map((r) => r.type)
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .sort((a, b) => a.localeCompare(b));
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

// Removes object-storage blobs that no longer have a matching database record
// (documents or images). The document route already deletes blobs on delete, but
// vehicle deletion cascades DB rows without touching storage — this sweep is the
// safety net for anything the app misses. It never touches keys that still exist
// in the DB. Returns the number of stale objects removed.
export async function sweepOrphanStorage(): Promise<{ removed: number; examined: number }> {
  if (!storageEnabled()) return { removed: 0, examined: 0 };

  const [stored, docPaths, imgPaths] = await Promise.all([
    listObjects(),
    prisma.vehicleDocument.findMany({ select: { path: true } }),
    prisma.vehicleImage.findMany({ select: { path: true } }),
  ]);

  const known = new Set(docPaths.map((d) => d.path).concat(imgPaths.map((i) => i.path)));
  const orphans = stored.objects.filter((key) => !known.has(key));
  if (orphans.length > 0) await deleteFiles(orphans);
  return { removed: orphans.length, examined: stored.objects.length };
}
