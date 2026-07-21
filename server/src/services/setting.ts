import { prisma } from "../lib/prisma.js";

export async function listSettings() {
  const settings = await prisma.setting.findMany({
    orderBy: [{ group: "asc" }, { key: "asc" }],
  });

  // Group by group field.
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
) {
  for (const u of updates) {
    await prisma.setting.update({
      where: { id: u.id },
      data: { value: u.value },
    });
  }
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
  ];

  for (const d of defaults) {
    await prisma.setting.upsert({
      where: { key: d.key },
      update: { value: d.value, label: d.label, group: d.group },
      create: d,
    });
  }
}
