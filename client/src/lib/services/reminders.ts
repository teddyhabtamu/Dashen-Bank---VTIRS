import { REGISTRATION_STATUS } from "@/lib/constants";

export type ExpiryState = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";
export type ReminderWindows = [number, number, number, number];

export const DEFAULT_REMINDER_WINDOWS: ReminderWindows = [90, 60, 30, 7];

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
// actually expired. Mirrors server/src/services/reminders.ts.
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

// Derive an insurance policy's effective status. Mirrors the server's
// classifier (services/reminders.ts) so the list shows what's actually in
// force today instead of the stored status lagging behind the cron:
//   - CANCELLED always passes through (manual, terminal);
//   - past end date = EXPIRED even if stored ACTIVE (cron may lag);
//   - start date in the future = PENDING (not yet in force);
//   - otherwise ACTIVE (in force).
export function effectiveInsuranceStatus(
  status: string,
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
  now: Date = new Date()
): string {
  if (status === "CANCELLED") return status;
  const end = toSafeDate(endDate);
  const start = toSafeDate(startDate);
  if (end && end.getTime() < now.getTime()) return "EXPIRED";
  if (start && start.getTime() > now.getTime()) return "PENDING";
  return "ACTIVE";
}

function toSafeDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
