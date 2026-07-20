import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { globalSearch } from "../services/search.js";

const router = Router();

router.get("/", requireAuth(PERMISSIONS.VEHICLE_VIEW), async (req, res) => {
  const q = req.query;
  const result = await globalSearch({
    q: (q.q as string) ?? undefined,
    status: (q.status as string) ?? undefined,
    year: q.year ? Number(q.year) : undefined,
    branchId: (q.branchId as string) ?? undefined,
    vehicleType: (q.vehicleType as string) ?? undefined,
    registrationStatus: (q.registrationStatus as string) ?? undefined,
  });
  res.json(result);
});

export default router;
