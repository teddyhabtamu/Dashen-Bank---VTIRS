import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  createInsurance,
  listInsurances,
  getInsurance,
  updateInsurance,
  renewInsurance,
  deleteInsurance,
  DuplicateInsuranceError,
  ValidationError,
} from "../services/insurance.js";
import { insuranceSchema, insuranceUpdateSchema } from "../validation/insurance.js";

const router = Router();

const READ_PERMS = [PERMISSIONS.INSURANCE_MANAGE, PERMISSIONS.INSURANCE_VIEW];
const RENEW_PERMS = [PERMISSIONS.INSURANCE_MANAGE, PERMISSIONS.INSURANCE_RENEW];

// Map domain errors (ValidationError -> 422, Duplicate -> 409) onto clean
// responses instead of the generic 500.
function actionError(e: unknown, res: any) {
  if (e instanceof ValidationError) {
    return res.status(422).json({ error: e.message, field: e.field });
  }
  if (e instanceof DuplicateInsuranceError) {
    return res.status(409).json({ error: e.message, field: e.field });
  }
  throw e;
}

router.get("/", requireAuth(READ_PERMS), async (req, res) => {
  const q = req.query;
  const result = await listInsurances({
    search: (q.search as string) ?? undefined,
    coverage: (q.coverage as string) ?? undefined,
    status: (q.status as string) ?? undefined,
    from: (q.from as string) ?? undefined,
    to: (q.to as string) ?? undefined,
    expiringWithin: q.expiringWithin !== undefined && q.expiringWithin !== "" ? Number(q.expiringWithin) : undefined,
    branchId: (q.branchId as string) ?? undefined,
    vehicleId: (q.vehicleId as string) ?? undefined,
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
    const ins = await createInsurance(
      { ...parsed.data, confirmSupersede: req.body?.confirmSupersede === true },
      { userId: req.session!.userId, req }
    );
    res.status(201).json({ insurance: ins });
  } catch (e) {
    return actionError(e, res);
  }
});

router.get(
  "/:id",
  requireAuth(READ_PERMS),
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
    const parsed = insuranceUpdateSchema.safeParse(req.body);
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
      return actionError(e, res);
    }
  }
);

router.post(
  "/:id/renew",
  requireAuth(RENEW_PERMS),
  async (req, res) => {
    try {
      const ins = await renewInsurance(
        req.params.id,
        { endDate: (req.body ?? {}).endDate as string },
        { userId: req.session!.userId, req }
      );
      if (!ins) return res.status(404).json({ error: "Not found" });
      res.json({ insurance: ins });
    } catch (e) {
      return actionError(e, res);
    }
  }
);

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.INSURANCE_MANAGE),
  async (req, res) => {
    try {
      const deleted = await deleteInsurance(req.params.id, {
        userId: req.session!.userId,
        req,
      });
      if (!deleted) return res.status(404).json({ error: "Not found" });
      res.json({ ok: true });
    } catch (e) {
      return actionError(e, res);
    }
  }
);

export default router;