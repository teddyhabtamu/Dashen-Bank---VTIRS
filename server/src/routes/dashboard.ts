import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import {
  getDashboardKpis,
  getUpcomingRegistrations,
  getUpcomingInsurances,
  getVehicleDistributions,
  getRecentActivity,
} from "../services/dashboard.js";

const router = Router();

router.get("/", requireAuth(), async (_req, res) => {
  const [kpis, registrations, insurances, distributions, activity] =
    await Promise.all([
      getDashboardKpis(),
      getUpcomingRegistrations(90),
      getUpcomingInsurances(90),
      getVehicleDistributions(),
      getRecentActivity(8),
    ]);
  res.json({ kpis, registrations, insurances, distributions, activity });
});

export default router;
