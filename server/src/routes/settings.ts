import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { listSettings, updateSettings, getSetting } from "../services/setting.js";
import { getReminderWindows, listVehicleTypes } from "../services/reminders.js";

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
    await updateSettings(updates, { userId: req.session!.userId, req });
    const settings = await listSettings();
    res.json(settings);
  }
);

export default router;
