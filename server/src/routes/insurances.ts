import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  createInsurance,
  listInsurances,
  getInsurance,
  updateInsurance,
  deleteInsurance,
  DuplicateInsuranceError,
} from "../services/insurance.js";
import { insuranceSchema } from "../validation/registration.js";

const router = Router();

router.get("/", requireAuth(PERMISSIONS.INSURANCE_MANAGE), async (req, res) => {
  const q = req.query;
  const result = await listInsurances({
    search: (q.search as string) ?? undefined,
    page: Number(q.page ?? "1"),
    pageSize: q.pageSize ? Number(q.pageSize) : undefined,
  });
  res.json(result);
});

router.post("/", requireAuth(PERMISSIONS.INSURANCE_MANAGE), async (req, res) => {
  const parsed = insuranceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: "Validation failed",
      issues: parsed.error.flatten().fieldErrors,
    });
  }
  try {
    const ins = await createInsurance(parsed.data, {
      userId: req.session!.userId,
      req,
    });
    res.status(201).json({ insurance: ins });
  } catch (e) {
    if (e instanceof DuplicateInsuranceError) {
      return res.status(409).json({ error: e.message, field: e.field });
    }
    throw e;
  }
});

router.get(
  "/:id",
  requireAuth(PERMISSIONS.INSURANCE_MANAGE),
  async (req, res) => {
    const ins = await getInsurance(req.params.id);
    if (!ins) return res.status(404).json({ error: "Not found" });
    res.json({ insurance: ins });
  }
);

router.patch(
  "/:id",
  requireAuth(PERMISSIONS.INSURANCE_MANAGE),
  async (req, res) => {
    const parsed = insuranceSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const ins = await updateInsurance(req.params.id, parsed.data, {
        userId: req.session!.userId,
        req,
      });
      if (!ins) return res.status(404).json({ error: "Not found" });
      res.json({ insurance: ins });
    } catch (e) {
      if (e instanceof DuplicateInsuranceError) {
        return res.status(409).json({ error: e.message, field: e.field });
      }
      throw e;
    }
  }
);

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.INSURANCE_MANAGE),
  async (req, res) => {
    const deleted = await deleteInsurance(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }
);

export default router;
