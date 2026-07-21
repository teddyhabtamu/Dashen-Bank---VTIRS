import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import {
  listRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  listPermissions,
} from "../services/role.js";

const router = Router();

router.get(
  "/",
  requireAuth(PERMISSIONS.ROLE_MANAGE),
  async (_req, res) => {
    const roles = await listRoles();
    res.json(roles);
  }
);

router.get(
  "/permissions",
  requireAuth(PERMISSIONS.ROLE_MANAGE),
  async (_req, res) => {
    const permissions = await listPermissions();
    res.json(permissions);
  }
);

router.get(
  "/:id",
  requireAuth(PERMISSIONS.ROLE_MANAGE),
  async (req, res) => {
    const role = await getRole(req.params.id);
    if (!role) return res.status(404).json({ error: "Role not found" });
    res.json({ role });
  }
);

router.post(
  "/",
  requireAuth(PERMISSIONS.ROLE_MANAGE),
  async (req, res) => {
    const body = req.body ?? {};
    if (!body.name || !body.slug) {
      return res.status(422).json({ error: "Name and slug are required" });
    }
    try {
      const role = await createRole(body);
      res.status(201).json({ role });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return res.status(409).json({ error: "A role with this slug or name already exists" });
      }
      throw e;
    }
  }
);

router.patch(
  "/:id",
  requireAuth(PERMISSIONS.ROLE_MANAGE),
  async (req, res) => {
    const body = req.body ?? {};
    try {
      const role = await updateRole(req.params.id, body);
      res.json({ role });
    } catch (e: any) {
      if (e?.code === "P2002") {
        return res.status(409).json({ error: "A role with this name already exists" });
      }
      throw e;
    }
  }
);

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.ROLE_MANAGE),
  async (req, res) => {
    try {
      await deleteRole(req.params.id);
      res.json({ ok: true });
    } catch (e: any) {
      if (e.message?.includes("Cannot delete")) {
        return res.status(409).json({ error: e.message });
      }
      throw e;
    }
  }
);

export default router;
