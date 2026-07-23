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
  const defaults = [
    { key: "company_name", value: "Dashen Bank", label: "Company Name", group: "General" },
    { key: "system_name", value: "VTIRS", label: "System Name", group: "General" },
    { key: "reminder_days_90", value: "90", label: "Reminder: 90 days before expiry", group: "Reminders" },
    { key: "reminder_days_60", value: "60", label: "Reminder: 60 days before expiry", group: "Reminders" },
    { key: "reminder_days_30", value: "30", label: "Reminder: 30 days before expiry", group: "Reminders" },
    { key: "reminder_days_7", value: "7", label: "Reminder: 7 days before expiry", group: "Reminders" },
    { key: "items_per_page", value: "20", label: "Default items per page", group: "Display" },
    { key: "session_timeout_minutes", value: "480", label: "Session timeout (minutes, 0 = never)", group: "Security" },
    { key: "default_owner_name", value: "Dashen Bank", label: "Default vehicle owner", group: "General" },
    { key: "password_min_length", value: "8", label: "Minimum password length", group: "Security" },
    { key: "max_login_attempts", value: "5", label: "Max failed logins before account lockout", group: "Security" },
    { key: "notify_registration", value: "true", label: "Generate registration expiry reminders", group: "Reminders" },
    { key: "notify_insurance", value: "true", label: "Generate insurance expiry reminders", group: "Reminders" },
  ];

  for (const d of defaults) {
    await prisma.setting.upsert({
      where: { key: d.key },
      update: { value: d.value, label: d.label, group: d.group },
      create: d,
    });
  }
  invalidateCache();
}
