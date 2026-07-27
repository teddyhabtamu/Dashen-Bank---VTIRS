import { randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const CSRF_HEADER_ALT = "x-xsrf-token";
const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function csrfTokenFromReq(req: Request): string | undefined {
  return (
    (req.headers[CSRF_HEADER] as string | undefined) ??
    (req.headers[CSRF_HEADER_ALT] as string | undefined)
  );
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if ((req.path === "/api/auth/login" || req.path === "/api/auth/logout") && req.method === "POST") {
    return next();
  }

  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[CSRF_COOKIE];
  const headerToken = csrfTokenFromReq(req);

  const token = cookieToken ?? generateCsrfToken();
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });

  if (!STATE_CHANGING_METHODS.has(req.method)) {
    return next();
  }

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: "CSRF token missing or invalid" });
  }

  return next();
}