import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  getDashboardKpis,
  getUpcomingRegistrations,
  getUpcomingInsurances,
  getVehicleDistributions,
  getRecentActivity,
} from "../services/dashboard.js";
import { getReminderWindows } from "../services/reminders.js";

const router = Router();

router.get("/", requireAuth(), async (req, res) => {
  // The recent-activity feed exposes audit data (actions + usernames). The
  // Audit page requires AUDIT_VIEW; the dashboard must not leak the same rows
  // to users without it. Instead of erroring, we simply omit the feed.
  const canSeeActivity = req.session!.permissions.includes(PERMISSIONS.AUDIT_VIEW);

  const [kpis, registrations, insurances, distributions, activity, windows] =
    await Promise.all([
      getDashboardKpis(),
      getUpcomingRegistrations(),
      getUpcomingInsurances(),
      getVehicleDistributions(),
      canSeeActivity ? getRecentActivity(8, true) : Promise.resolve([]),
      // Surface the configured windows so the client tiles never drift from
      // the admin settings (a hardcoded client list showed empty buckets
      // whenever the admin changed a window).
      getReminderWindows(),
    ]);
  res.json({ kpis, registrations, insurances, distributions, activity, windows, asOf: new Date().toISOString() });
});

export default router;
