import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { setSessionCookie, clearSessionCookie } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { ROLE_PERMISSIONS } from "../lib/rbac.js";
import { requireAuth, resolveSession } from "../lib/guard.js";
import { getSetting } from "../services/setting.js";

const failedAttempts = new Map<string, { count: number; last: number }>();
const router = Router();

router.post("/login", async (req, res) => {
  const body = (req.body ?? {}) as { username?: string; password?: string };
  const username = body.username?.trim();
  const password = body.password;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const maxAttempts = Number(await getSetting("max_login_attempts", "5")) || 5;
  const record = failedAttempts.get(username);
  if (record && record.count >= maxAttempts && Date.now() - record.last < 15 * 60 * 1000) {
    const minutes = Math.ceil(15 - (Date.now() - record.last) / 60000);
    return res.status(429).json({ error: `Account temporarily locked. Try again in ${minutes} minute(s).` });
  }

  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: { include: { permissions: true } } },
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    const prev = failedAttempts.get(username) ?? { count: 0, last: 0 };
    failedAttempts.set(username, { count: prev.count + 1, last: Date.now() });
    const remaining = maxAttempts - (prev.count + 1);
    const msg = remaining > 0
      ? `Invalid username or password. ${remaining} attempt(s) remaining.`
      : "Account locked due to too many failed attempts. Try again later.";
    return res.status(401).json({ error: msg });
  }

  failedAttempts.delete(username);

  if (user.status !== "ACTIVE") {
    return res.status(403).json({
      error: "Account is inactive or locked. Contact your administrator.",
    });
  }

  const session = await resolveSession(user.id);
  if (!session) {
    return res.status(403).json({ error: "Account is inactive or locked. Contact your administrator." });
  }

  await setSessionCookie(res, session);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAudit({
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    userId: user.id,
    req,
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role.slug,
      roleName: user.role.name,
      permissions: session.permissions,
    },
  });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth(), async (req, res) => {
  const session = req.session!;
  res.json({
    user: {
      id: session.userId,
      username: session.username,
      fullName: session.fullName,
      role: session.roleSlug,
      roleName: session.roleName,
      permissions: session.permissions,
    },
    roleDefaults: ROLE_PERMISSIONS[session.roleSlug] ?? [],
  });
});

router.get("/profile", requireAuth(), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.session!.userId },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      role: { select: { slug: true, name: true } },
      branch: { select: { name: true } },
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    profile: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      roleSlug: user.role.slug,
      roleName: user.role.name,
      branchName: user.branch?.name ?? null,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    },
  });
});

router.patch("/profile", requireAuth(), async (req, res) => {
  const body = (req.body ?? {}) as {
    fullName?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const user = await prisma.user.findUnique({
    where: { id: req.session!.userId },
    select: { id: true, email: true, passwordHash: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (
    (body.fullName !== undefined || body.email !== undefined) &&
    body.currentPassword &&
    !(await verifyPassword(body.currentPassword, user.passwordHash))
  ) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  const patch: Record<string, string> = {};

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(email)) {
      return res.status(422).json({ error: "Please enter a valid email address" });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.id !== user.id) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    patch.email = email;
  }

  if (body.fullName !== undefined) {
    const name = body.fullName.trim();
    if (!name) return res.status(422).json({ error: "Full name is required" });
    patch.fullName = name;
  }

  if (body.newPassword) {
    if (!body.currentPassword) {
      return res.status(400).json({ error: "Enter your current password to change it" });
    }
    const minLen = Number(await getSetting("password_min_length", "8")) || 8;
    if (body.newPassword.length < minLen) {
      return res.status(422).json({ error: `Password must be at least ${minLen} characters long` });
    }
    patch.passwordHash = await hashPassword(body.newPassword);
  }

  if (Object.keys(patch).length > 0) {
    await prisma.user.update({ where: { id: user.id }, data: patch });
  }

  await writeAudit({
    action: "UPDATE",
    entity: "User",
    entityId: user.id,
    userId: user.id,
    oldValue: { id: user.id },
    newValue: {
      ...patch,
      passwordHash: patch.passwordHash ? "[redacted]" : undefined,
    },
    req,
  });

  const updated = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      role: { select: { slug: true, name: true } },
    },
  });

  res.json({
    user: {
      id: updated!.id,
      username: updated!.username,
      fullName: updated!.fullName,
      role: updated!.role.slug,
      roleName: updated!.role.name,
      permissions: req.session!.permissions,
    },
  });
});

export default router;
