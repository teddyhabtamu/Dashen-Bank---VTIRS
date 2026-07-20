import type { Request, Response, NextFunction, RequestHandler } from "express";
import { verifySession, SESSION_COOKIE, type SessionPayload } from "./auth.js";
import type { PermissionCode } from "./rbac.js";

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

// Attaches req.session if a valid cookie exists; never rejects.
export const attachSession: RequestHandler = async (req, _res, next) => {
  req.session = (await readSession(req)) ?? undefined;
  next();
};

// Require an authenticated session and (optionally) a permission.
export function requireAuth(permission?: PermissionCode): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = req.session ?? (await readSession(req)) ?? undefined;
    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (permission && !session.permissions.includes(permission)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    req.session = session;
    next();
  };
}
