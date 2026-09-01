import { Router, type Response } from "express";
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
  archiveRegistration,
  restoreRegistration,
  resumeRegistration,
  DuplicateRegistrationError,
} from "../services/registration.js";
import { ValidationError } from "../services/errors.js";
import { registrationSchema } from "../validation/registration.js";

const router = Router();

// Reading registrations is needed beyond just managing them: users who can
// renew or suspend must see the registration and its history too. There is no
// dedicated registration:view permission, so any of the three is sufficient.
const REGISTRATION_READ = [
  PERMISSIONS.REGISTRATION_MANAGE,
  PERMISSIONS.REGISTRATION_RENEW,
  PERMISSIONS.REGISTRATION_SUSPEND,
];

// Business-rule failures from the workflow actions surface as 422s.
function actionError(e: unknown, res: Response) {
  if (e instanceof ValidationError) {
    return res.status(422).json({ error: e.message, field: e.field });
  }
  throw e;
}

router.get(
  "/",
  requireAuth(REGISTRATION_READ),
  async (req, res) => {
    const q = req.query;
    const result = await listRegistrations({
      search: (q.search as string) ?? undefined,
      status: (q.status as string) ?? undefined,
      page: Number(q.page ?? "1"),
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
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
      if (e instanceof ValidationError) {
        return res.status(422).json({ error: e.message, field: e.field });
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
      if (e instanceof ValidationError) {
        return res.status(422).json({ error: e.message, field: e.field });
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
    try {
      const reg = await renewRegistration(
        req.params.id,
        { expiryDate: b.expiryDate, regNumber: b.regNumber, note: b.note },
        { userId: req.session!.userId, req }
      );
      if (!reg) return res.status(404).json({ error: "Not found" });
      res.json({ registration: reg });
    } catch (e) {
      return actionError(e, res);
    }
  }
);

router.post(
  "/:id/suspend",
  requireAuth(PERMISSIONS.REGISTRATION_SUSPEND),
  async (req, res) => {
    const note = (req.body ?? {}).note as string | undefined;
    try {
      const reg = await suspendRegistration(req.params.id, note, {
        userId: req.session!.userId,
        req,
      });
      if (!reg) return res.status(404).json({ error: "Not found" });
      res.json({ registration: reg });
    } catch (e) {
      return actionError(e, res);
    }
  }
);

router.post(
  "/:id/archive",
  requireAuth(PERMISSIONS.REGISTRATION_MANAGE),
  async (req, res) => {
    const note = (req.body ?? {}).note as string | undefined;
    try {
      const reg = await archiveRegistration(req.params.id, note, {
        userId: req.session!.userId,
        req,
      });
      if (!reg) return res.status(404).json({ error: "Not found" });
      res.json({ registration: reg });
    } catch (e) {
      return actionError(e, res);
    }
  }
);

router.post(
  "/:id/resume",
  requireAuth(PERMISSIONS.REGISTRATION_SUSPEND),
  async (req, res) => {
    const note = (req.body ?? {}).note as string | undefined;
    try {
      const reg = await resumeRegistration(req.params.id, note, {
        userId: req.session!.userId,
        req,
      });
      if (!reg) return res.status(404).json({ error: "Not found" });
      res.json({ registration: reg });
    } catch (e) {
      return actionError(e, res);
    }
  }
);

router.post(
  "/:id/restore",
  requireAuth(PERMISSIONS.REGISTRATION_MANAGE),
  async (req, res) => {
    try {
      const reg = await restoreRegistration(req.params.id, {
        userId: req.session!.userId,
        req,
      });
      if (!reg) return res.status(404).json({ error: "Not found" });
      res.json({ registration: reg });
    } catch (e) {
      return actionError(e, res);
    }
  }
);

export default router;
