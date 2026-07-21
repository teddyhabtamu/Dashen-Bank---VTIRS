import { Router } from "express";
import { requireAuth } from "../lib/guard.js";
import { PERMISSIONS } from "../lib/rbac.js";
import { prisma } from "../lib/prisma.js";
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getRoles,
} from "../services/user.js";

const router = Router();

router.get(
  "/",
  requireAuth(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const q = req.query;
    const result = await listUsers({
      page: Number(q.page ?? "1"),
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      search: (q.search as string) ?? undefined,
      roleSlug: (q.role as string) ?? undefined,
      status: (q.status as string) ?? undefined,
      branchId: (q.branchId as string) ?? undefined,
    });
    res.json(result);
  }
);

router.get(
  "/roles",
  requireAuth(PERMISSIONS.USER_MANAGE),
  async (_req, res) => {
    const roles = await getRoles();
    res.json(roles);
  }
);

router.get(
  "/:id",
  requireAuth(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  }
);

router.post(
  "/",
  requireAuth(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const body = req.body ?? {};
    if (!body.username || !body.password || !body.email || !body.fullName || !body.roleId) {
      return res.status(422).json({
        error: "Validation failed",
        issues: {
          username: body.username ? undefined : "Required",
          password: body.password ? undefined : "Required",
          email: body.email ? undefined : "Required",
          fullName: body.fullName ? undefined : "Required",
          roleId: body.roleId ? undefined : "Required",
        },
      });
    }

    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: body.username.trim().toLowerCase() },
          { email: body.email.trim().toLowerCase() },
        ],
      },
    });
    if (existing) {
      const field = existing.username === body.username.trim().toLowerCase() ? "username" : "email";
      return res.status(409).json({ error: `A user with this ${field} already exists`, field });
    }

    const user = await createUser(body, {
      userId: req.session!.userId,
      req,
    });
    res.status(201).json({ user });
  }
);

router.patch(
  "/:id",
  requireAuth(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const body = req.body ?? {};
    const user = await updateUser(req.params.id, body, {
      userId: req.session!.userId,
      req,
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  }
);

router.delete(
  "/:id",
  requireAuth(PERMISSIONS.USER_MANAGE),
  async (req, res) => {
    const deleted = await deleteUser(req.params.id, {
      userId: req.session!.userId,
      req,
    });
    if (!deleted) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true });
  }
);

export default router;
