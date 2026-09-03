import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { setSessionCookie, clearSessionCookie } from "../lib/auth.js";
import { writeAudit } from "../lib/audit.js";
import { ROLE_PERMISSIONS } from "../lib/rbac.js";
import { requireAuth, resolveSession } from "../lib/guard.js";
import { getSetting } from "../services/setting.js";

const dummyPasswordHash = hashPassword(`vtirs-invalid-login-${Math.random().toString(36).slice(2)}`);

// Best-effort per-network throttle for the login endpoint. Persistent account
// locks below are the primary defense and survive restarts/scale-out; this
// in-memory window only slows broad username/password spraying from one
// egress IP. Failed sign-ins increment it; successful sign-ins reset it.
const ipFailures = new Map<string, { count: number; resetAt: number }>();
const IP_FAILURE_LIMIT = 30;
const IP_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60;
const FAILURE_DECAY_MS = 24 * 60 * 60 * 1000;

function clientIp(req: { headers?: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const forwarded = req.headers?.["x-forwarded-for"];
  const first = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : undefined;
  return first || req.ip || req.socket?.remoteAddress || "unknown";
}

function ipFailureState(ip: string): { count: number; resetAt: number } {
  const now = Date.now();
  const current = ipFailures.get(ip);
  if (!current || now >= current.resetAt) {
    const next = { count: 0, resetAt: now + IP_FAILURE_WINDOW_MS };
    ipFailures.set(ip, next);
    // Avoid unbounded growth from internet-wide scanning.
    if (ipFailures.size > 5000) {
      for (const [key, value] of ipFailures) {
        if (value.resetAt <= now) ipFailures.delete(key);
      }
    }
    return next;
  }
  return current;
}

function recordIpFailure(ip: string): number {
  const state = ipFailureState(ip);
  state.count += 1;
  return state.count > IP_FAILURE_LIMIT
    ? Math.max(1, Math.ceil((state.resetAt - Date.now()) / 1000))
    : 0;
}

const router = Router();

router.post("/login", async (req, res) => {
  const body = (req.body ?? {}) as { username?: string; password?: string };
  // Usernames are stored lowercase on creation; normalize here so "Abebe"
  // and "abebe" resolve to the same account.
  const username = body.username?.trim().toLowerCase();
  const password = body.password;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const ip = clientIp(req);
  const ipState = ipFailureState(ip);
  if (ipState.count >= IP_FAILURE_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((ipState.resetAt - Date.now()) / 1000));
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ error: `Too many sign-in attempts. Try again in ${retryAfter} second(s).` });
  }

  const maxAttempts = Number(await getSetting("max_login_attempts", "5")) || 5;
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: { include: { permissions: true } } },
  });
  const now = Date.now();
  if (user?.lockedUntil && user.lockedUntil.getTime() > now) {
    recordIpFailure(ip);
    const retryAfter = Math.max(1, Math.ceil((user.lockedUntil.getTime() - now) / 1000));
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
      error: `Account temporarily locked. Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} minute(s).`,
    });
  }

  // For unknown usernames, still do password-hash work before rejecting so a
  // timing probe cannot reliably distinguish valid from invalid usernames.
  const passwordOk = user
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, await dummyPasswordHash);

  if (!user || !passwordOk) {
    recordIpFailure(ip);
    if (user) {
      // Stale typo counters decay instead of accumulating forever.
      const lastFailedAt = user.lastFailedLoginAt?.getTime() ?? 0;
      const attempts = (now - lastFailedAt > FAILURE_DECAY_MS ? 0 : user.failedLoginAttempts ?? 0) + 1;
      let lockedUntil: Date | null = null;
      if (attempts >= maxAttempts) {
        const minutes = Math.min(BASE_LOCK_MINUTES * 2 ** (attempts - maxAttempts), MAX_LOCK_MINUTES);
        lockedUntil = new Date(now + minutes * 60 * 1000);
        await writeAudit({
          action: "ACCOUNT_LOCKED",
          entity: "User",
          entityId: user.id,
          userId: user.id,
          newValue: { failedLoginAttempts: attempts, lockedUntil },
          req,
        });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lastFailedLoginAt: new Date(), lockedUntil },
      });
      if (lockedUntil) {
        const retryAfter = Math.max(1, Math.ceil((lockedUntil.getTime() - now) / 1000));
        res.set("Retry-After", String(retryAfter));
        return res.status(429).json({
          error: `Account temporarily locked. Try again in ${Math.max(1, Math.ceil(retryAfter / 60))} minute(s).`,
        });
      }
    }
    // Neutral message for both unknown users and wrong passwords.
    return res.status(401).json({ error: "Invalid username or password." });
  }

  ipFailures.delete(ip);

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
    data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lastFailedLoginAt: null, lockedUntil: null },
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
