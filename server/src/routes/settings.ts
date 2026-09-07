import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  listSettings,
  updateSettings,
  getSetting,
  validateSettingValue,
  validatePerTypeMap,
  DEFAULT_SETTINGS,
  WINDOW_KEYS,
} from "../services/setting.js";
import { getReminderWindows, listVehicleTypes } from "../services/reminders.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

// Public endpoint — no auth required. Returns branding info used by the UI.
router.get("/public", async (_req, res) => {
  const [companyName, systemName, defaultOwnerName, reminderWindows] = await Promise.all([
    getSetting("company_name", "Dashen Bank"),
    getSetting("system_name", "VTIRS"),
    getSetting("default_owner_name", "Dashen Bank"),
    getReminderWindows(),
  ]);
  res.json({
    companyName,
    systemName,
    defaultOwnerName,
    reminderWindows: {
      registration: reminderWindows,
    },
  });
});

router.get(
  "/",
  requireAuth(PERMISSIONS.SETTING_MANAGE),
  async (_req, res) => {
    const [settings, vehicleTypes] = await Promise.all([listSettings(), listVehicleTypes()]);
    res.json({ ...settings, _vehicleTypes: vehicleTypes });
  }
);

router.put(
  "/",
  requireAuth(PERMISSIONS.SETTING_MANAGE),
  async (req, res) => {
    const body = req.body ?? {};
    const updates = body.updates as Array<{ id: string; value: string }>;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(422).json({ error: "updates array is required" });
    }

    // Resolve ids to keys up front so unknown ids 404 instead of throwing P2025.
    const rows = await prisma.setting.findMany({ select: { id: true, key: true, value: true } });
    const keyById = new Map(rows.map((r) => [r.id, r.key]));
    const unknown = updates.filter((u) => !keyById.has(u.id));
    if (unknown.length > 0) {
      return res.status(404).json({ error: `Unknown setting: ${unknown[0].id}` });
    }

    // Single-field validation.
    const invalid: Array<{ id: string; key: string; message: string }> = [];
    for (const u of updates) {
      const key = keyById.get(u.id)!;
      const message = validateSettingValue(key, String(u.value ?? ""));
      if (message) invalid.push({ id: u.id, key, message });
    }

    // Cross-field validation: global windows must descend, evaluated against
    // the post-update values (updates overlaid on current rows) so partial
    // payloads are checked fairly.
    const effective = new Map(rows.map((r) => [r.key, r.value]));
    for (const u of updates) effective.set(keyById.get(u.id)!, String(u.value ?? ""));
    const wins = WINDOW_KEYS.map((k) => Number(effective.get(k)));
    if (
      wins.every((n) => Number.isInteger(n)) &&
      !(wins[0] > wins[1] && wins[1] > wins[2] && wins[2] > wins[3])
    ) {
      const idByKey = new Map(rows.map((r) => [r.key, r.id]));
      for (const k of WINDOW_KEYS) {
        const id = idByKey.get(k);
        if (id && !invalid.some((e) => e.id === id)) {
          invalid.push({ id, key: k, message: "Windows must descend: Primary > Secondary > Warning > Critical." });
        }
      }
    }
    // Re-validate the effective per-type map (an update to one key can't
    // break it, but a stale stored value could already be invalid).
    const ptId = rows.find((r) => r.key === "reminder_windows_by_type")?.id;
    const ptMessage = validatePerTypeMap(effective.get("reminder_windows_by_type") ?? "{}");
    if (ptMessage && ptId && !invalid.some((e) => e.id === ptId)) {
      invalid.push({ id: ptId, key: "reminder_windows_by_type", message: ptMessage });
    }

    if (invalid.length > 0) {
      return res.status(422).json({ error: "Validation failed", invalid });
    }

    await updateSettings(updates, { userId: req.session!.userId, req });
    const settings = await listSettings();
    res.json(settings);
  }
);

// Factory defaults — the same source `seedDefaultSettings` uses. Lets the UI
// offer "reset to defaults" without hardcoding values client-side.
router.get(
  "/defaults",
  requireAuth(PERMISSIONS.SETTING_MANAGE),
  async (_req, res) => {
    res.json(DEFAULT_SETTINGS);
  }
);

export default router;
