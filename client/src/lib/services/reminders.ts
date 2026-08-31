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
