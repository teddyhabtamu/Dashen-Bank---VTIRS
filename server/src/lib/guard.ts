import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "./auth.js";
import type { PermissionCode } from "./rbac.js";
import { ROLE_PERMISSIONS } from "./rbac.js";
import { prisma } from "./prisma.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

async function readSession(req: Request): Promise<SessionPayload | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  return verifySession(token);
}

// Resolve a live session payload from the database. This is the single source
// of truth for authorization: permissions and role come from the current DB
// state (not the JWT), and a user who is no longer ACTIVE is rejected. This
// makes permission/role/status changes take effect immediately without waiting
// for a token to expire.
async function resolveSession(userId: string): Promise<SessionPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: true } },
    },
  });
  if (!user) return null;
  if (user.status !== "ACTIVE") return null;

  const explicit = user.role.permissions.map((p) => p.code);
  const roleDefault = ROLE_PERMISSIONS[user.role.slug] ?? [];
  const permissions = Array.from(new Set([...explicit, ...roleDefault]));

  return {
    userId: user.id,
    username: user.username,
    roleSlug: user.role.slug,
    roleName: user.role.name,
    fullName: user.fullName,
    permissions,
  };
}

// Attaches req.session if a valid cookie exists; never rejects.
// This is intentionally cheap (JWT verify only) and is used to restore a
// session across requests that don't need permission gating.
export const attachSession: RequestHandler = async (req, _res, next) => {
  req.session = (await readSession(req)) ?? undefined;
  next();
};

// Require an authenticated session and (optionally) a permission. If an array
// is provided, any of the listed permissions is sufficient (OR semantics).
// Authorization is resolved from the database on every request.
export function requireAuth(permission?: PermissionCode | PermissionCode[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tokenSession = req.session ?? (await readSession(req)) ?? undefined;
    if (!tokenSession) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const session = await resolveSession(tokenSession.userId);
    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (permission) {
      const required = Array.isArray(permission) ? permission : [permission];
      const allowed = required.some((p) => session.permissions.includes(p));
      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }
    }

    req.session = session;
    next();
  };
}

export { resolveSession };
