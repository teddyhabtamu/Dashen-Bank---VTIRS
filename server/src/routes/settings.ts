import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { listSettings, updateSettings } from "../services/setting.js";

const router = Router();

router.get(
  "/",
  requireAuth(PERMISSIONS.SETTING_MANAGE),
  async (_req, res) => {
    const settings = await listSettings();
    res.json(settings);
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
    await updateSettings(updates);
    const settings = await listSettings();
    res.json(settings);
  }
);

export default router;
