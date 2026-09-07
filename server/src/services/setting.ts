import { prisma } from "../lib/prisma.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";

// In-memory cache with TTL to avoid hitting DB on every request.
let cache: Record<string, { value: string; expires: number }> = {};
const CACHE_TTL = 60_000; // 1 minute

export async function getSetting(key: string, defaultValue = ""): Promise<string> {
  const cached = cache[key];
  if (cached && cached.expires > Date.now()) {
    return cached.value;
  }
  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    const value = row?.value ?? defaultValue;
    cache[key] = { value, expires: Date.now() + CACHE_TTL };
    return value;
  } catch {
    return defaultValue;
  }
}

export function invalidateCache() {
  cache = {};
}

export async function defaultPageSize(): Promise<number> {
  const v = await getSetting("items_per_page", "20");
  return Math.max(1, Number(v) || 20);
}

export async function requiredDocumentCategories(): Promise<string[]> {
  const raw = await getSetting(
    "required_document_categories",
    '["REGISTRATION_CERT","INSURANCE_CERT","INSPECTION_CERT"]'
  );
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === "string") : [];
  } catch {
    return [];
  }
}

export async function listSettings() {
  const settings = await prisma.setting.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  const grouped: Record<string, Array<{ id: string; key: string; value: string; label: string | null; group: string | null }>> = {};
  for (const s of settings) {
    const g = s.group ?? "General";
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push({ id: s.id, key: s.key, value: s.value, label: s.label, group: s.group });
  }

  return grouped;
}

export async function updateSettings(
  updates: Array<{ id: string; value: string }>,
  ctx?: { userId: string; req: AuditReq }
) {
  for (const u of updates) {
    const old = await prisma.setting.findUnique({ where: { id: u.id } });
    await prisma.setting.update({
      where: { id: u.id },
      data: { value: u.value },
    });
    if (ctx && old && old.value !== u.value) {
      await writeAudit({
        action: "UPDATE",
        entity: "Setting",
        entityId: u.id,
        userId: ctx.userId,
        oldValue: { key: old.key, value: old.value },
        newValue: { key: old.key, value: u.value },
        req: ctx.req,
      });
    }
  }
  invalidateCache();
}

export async function seedDefaultSettings() {
  for (const d of DEFAULT_SETTINGS) {
    // Create-only: re-running must never overwrite values an admin changed
    // through the Settings UI (reminder windows, company name, ...).
    await prisma.setting.upsert({
      where: { key: d.key },
      update: {},
      create: d,
    });
  }
  invalidateCache();
}

export interface SettingDefault {
  key: string;
  value: string;
  label: string;
  group: string;
}

export const DEFAULT_SETTINGS: SettingDefault[] = [
  { key: "company_name", value: "Dashen Bank", label: "Company Name", group: "General" },
  { key: "system_name", value: "VTIRS", label: "System Name", group: "General" },
  { key: "reminder_days_90", value: "90", label: "Primary reminder window", group: "Reminders" },
  { key: "reminder_days_60", value: "60", label: "Secondary reminder window", group: "Reminders" },
  { key: "reminder_days_30", value: "30", label: "Warning reminder window", group: "Reminders" },
  { key: "reminder_days_7", value: "7", label: "Critical reminder window", group: "Reminders" },
  { key: "items_per_page", value: "20", label: "Default items per page", group: "Display" },
  { key: "session_timeout_minutes", value: "480", label: "Session timeout (minutes, 0 = never)", group: "Security" },
  { key: "default_owner_name", value: "Dashen Bank", label: "Default vehicle owner", group: "General" },
  { key: "password_min_length", value: "8", label: "Minimum password length", group: "Security" },
  { key: "max_login_attempts", value: "5", label: "Max failed logins before account lockout", group: "Security" },
  { key: "notify_registration", value: "true", label: "Generate registration expiry reminders", group: "Reminders" },
  { key: "notify_insurance", value: "true", label: "Generate insurance expiry reminders", group: "Reminders" },
  { key: "notify_driver_license", value: "true", label: "Generate driver license expiry reminders", group: "Reminders" },
  { key: "reminder_windows_by_type", value: "{}", label: "Per-type reminder windows (override defaults by vehicle type)", group: "Reminders" },
  { key: "required_document_categories", value: "[\"REGISTRATION_CERT\",\"INSURANCE_CERT\",\"INSPECTION_CERT\"]", label: "Required document categories", group: "Documents" },
];

export const WINDOW_KEYS = ["reminder_days_90", "reminder_days_60", "reminder_days_30", "reminder_days_7"] as const;

function intIn(value: string, min: number, max: number): boolean {
  if (!value || !value.trim()) return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
}

// Single-field validation shared by the PUT route. Returns an error message
// or null when the value is acceptable. Mirrors the client-side rules so a
// crafted request cannot store values the UI refuses to save.
export function validateSettingValue(key: string, value: string): string | null {
  const v = value ?? "";
  switch (key) {
    case "company_name":
    case "system_name":
      return v.trim() ? null : "This field is required.";
    case "items_per_page":
      return intIn(v, 1, 200) ? null : "Enter a whole number between 1 and 200.";
    case "session_timeout_minutes":
      return intIn(v, 0, 525600) ? null : "Enter 0 (never expires) or a positive whole number.";
    case "password_min_length":
      return intIn(v, 4, 64) ? null : "Enter a whole number between 4 and 64.";
    case "max_login_attempts":
      return intIn(v, 1, 20) ? null : "Enter a whole number between 1 and 20.";
    case "reminder_days_90":
    case "reminder_days_60":
    case "reminder_days_30":
    case "reminder_days_7":
      // 0 is falsy in the consumers (`Number(v) || default`), so it would
      // silently fall back — require an explicit positive window instead.
      return intIn(v, 1, 3650) ? null : "Enter a whole number of 1 or more.";
    case "notify_registration":
    case "notify_insurance":
    case "notify_driver_license":
      return v === "true" || v === "false" ? null : "Must be true or false.";
    case "reminder_windows_by_type":
      return validatePerTypeMap(v);
    case "required_document_categories": {
      try {
        const parsed = JSON.parse(v);
        if (!Array.isArray(parsed) || parsed.some((c) => typeof c !== "string")) {
          return "Invalid document categories.";
        }
        return null;
      } catch {
        return "Invalid document categories.";
      }
    }
    default:
      return null;
  }
}

export function validatePerTypeMap(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return "Invalid per-type windows.";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return "Invalid per-type windows.";
  }
  for (const [type, w] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(w) || w.length !== 4 || w.some((n) => !Number.isInteger(Number(n)) || Number(n) < 1)) {
      return `Invalid windows for "${type}" — enter four whole numbers of 1 or more.`;
    }
    const [a, b, c, d] = (w as unknown[]).map(Number);
    if (!(a > b && b > c && c > d)) {
      return `Windows for "${type}" must descend (Primary > Secondary > Warning > Critical).`;
    }
  }
  return null;
}
