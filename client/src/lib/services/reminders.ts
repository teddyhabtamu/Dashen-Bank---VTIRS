import { REGISTRATION_STATUS } from "@/lib/constants";

export type ExpiryState = "EXPIRED" | "CRITICAL" | "WARNING" | "OK";

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
  if (status === REGISTRATION_STATUS.SUSPENDED || status === REGISTRATION_STATUS.PENDING_RENEWAL) {
    return status;
  }
  const days = daysUntil(expiryDate);
  if (days !== null && days < 0) return REGISTRATION_STATUS.EXPIRED;
  return status;
}
