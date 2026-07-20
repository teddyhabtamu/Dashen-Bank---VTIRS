import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  createRegistration,
  listRegistrations,
  getRegistration,
  updateRegistration,
  deleteRegistration,
  renewRegistration,
  suspendRegistration,
  DuplicateRegistrationError,
} from "../services/registration.js";
import { registrationSchema } from "../validation/registration.js";

const router = Router();

router.get(
  "/",
  requireAuth(PERMISSIONS.REGISTRATION_MANAGE),
  async (req, res) => {
    const q = req.query;
    const result = await listRegistrations({
      search: (q.search as string) ?? undefined,
      status: (q.status as string) ?? undefined,
      page: Number(q.page ?? "1"),
      pageSize: Number(q.pageSize ?? "15"),
    });
    res.json(result);
  }
);

router.post(
  "/",
  requireAuth(PERMISSIONS.REGISTRATION_MANAGE),
  async (req, res) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const reg = await createRegistration(parsed.data, {
        userId: req.session!.userId,
        req,
      });
      res.status(201).json({ registration: reg });
    } catch (e) {
      if (e instanceof DuplicateRegistrationError) {
        return res.status(409).json({ error: e.message, field: e.field });
      }
      throw e;
    }
  }
);

router.get(
  "/:id",
  requireAuth(PERMISSIONS.REGISTRATION_MANAGE),
  async (req, res) => {
    const reg = await getRegistration(req.params.id);
    if (!reg) return res.status(404).json({ error: "Not found" });
    res.json({ registration: reg });
  }
);

router.patch(
  "/:id",
  requireAuth(PERMISSIONS.REGISTRATION_MANAGE),
  async (req, res) => {
    const parsed = registrationSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      });
    }
    try {
      const reg = await updateRegistration(req.params.id, parsed.data, {
        userId: req.session!.userId,
        req,
      });
      if (!reg) return res.status(404).json({ error: "Not found" });
      res.json({ registration: reg });
    } catch (e) {
      if (e instanceof DuplicateRegistrationError) {
        return res.status(409).json({ error: e.message, field: e.field });
      }
      throw e;
    }
  }
);

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.REGISTRATION_MANAGE),
  async (req, res) => {
    const deleted = await deleteRegistration(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  }
);

router.post(
  "/:id/renew",
  requireAuth(PERMISSIONS.REGISTRATION_RENEW),
  async (req, res) => {
    const b = (req.body ?? {}) as {
      expiryDate?: string;
      regNumber?: string;
      note?: string;
    };
    if (!b.expiryDate) {
      return res.status(422).json({ error: "expiryDate is required" });
    }
    const reg = await renewRegistration(
      req.params.id,
      { expiryDate: b.expiryDate, regNumber: b.regNumber, note: b.note },
      { userId: req.session!.userId, req }
    );
    if (!reg) return res.status(404).json({ error: "Not found" });
    res.json({ registration: reg });
  }
);

router.post(
  "/:id/suspend",
  requireAuth(PERMISSIONS.REGISTRATION_SUSPEND),
  async (req, res) => {
    const note = (req.body ?? {}).note as string | undefined;
    const reg = await suspendRegistration(req.params.id, note, {
      userId: req.session!.userId,
      req,
    });
    if (!reg) return res.status(404).json({ error: "Not found" });
    res.json({ registration: reg });
  }
);

export default router;
