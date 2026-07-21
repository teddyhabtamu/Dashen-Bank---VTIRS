import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "../lib/password.js";
import { setSessionCookie, clearSessionCookie } from "../lib/auth.js";
import { ROLE_PERMISSIONS } from "../lib/rbac.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth } from "../lib/guard.js";
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

  const explicit = user.role.permissions.map((p) => p.code);
  const roleDefault = ROLE_PERMISSIONS[user.role.slug] ?? [];
  const permissions = Array.from(new Set([...explicit, ...roleDefault]));

  await setSessionCookie(res, {
    userId: user.id,
    username: user.username,
    roleSlug: user.role.slug,
    roleName: user.role.name,
    fullName: user.fullName,
    permissions,
  });

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
      permissions,
    },
  });
});

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth(), (req, res) => {
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

export default router;
