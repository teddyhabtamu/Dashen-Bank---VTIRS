import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import { getSetting } from "../services/setting.js";

export const SESSION_COOKIE = "vtirs_session";
const MAX_JWT_AGE = 60 * 60 * 24 * 30; // 30 days (absolute safety bound)
const DEFAULT_SESSION_TIMEOUT_MINUTES = 60 * 8; // matches the 480-minute setting default

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  username: string;
  roleSlug: string;
  roleName: string;
  fullName: string;
  permissions: string[];
}

export async function signSession(payload: SessionPayload, lifetimeSeconds: number = MAX_JWT_AGE): Promise<string> {
  const lifetime = Math.max(60, Math.min(Math.floor(lifetimeSeconds), MAX_JWT_AGE));
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${lifetime}s`)
    .sign(getSecret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.userId as string;
    const username = payload.username as string;
    const roleSlug = payload.roleSlug as string;
    const roleName = payload.roleName as string;
    const fullName = payload.fullName as string;
    const permissions = (payload.permissions as string[]) ?? [];
    const iat = payload.iat as number | undefined;

    // Dynamic session timeout: check elapsed time against the DB setting.
    const timeoutMinutes = await getSetting("session_timeout_minutes", "480");
    const timeoutMs = Number(timeoutMinutes) * 60 * 1000;
    if (timeoutMinutes !== "0" && iat && Date.now() - iat * 1000 > timeoutMs) {
      return null; // session expired per current setting
    }

    return { userId, username, roleSlug, roleName, fullName, permissions };
  } catch {
    return null;
  }
}

export async function sessionLifetimeSeconds(): Promise<number> {
  // Align the JWT and cookie with the administrator-configured session
  // timeout. "0" means never expire; cap that at the absolute JWT safety bound.
  const raw = await getSetting("session_timeout_minutes", String(DEFAULT_SESSION_TIMEOUT_MINUTES));
  if (raw === "0") return MAX_JWT_AGE;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0) return DEFAULT_SESSION_TIMEOUT_MINUTES * 60;
  return Math.min(minutes * 60, MAX_JWT_AGE);
}

export async function setSessionCookie(
  res: Response,
  payload: SessionPayload,
): Promise<void> {
  const lifetimeSeconds = await sessionLifetimeSeconds();
  const token = await signSession(payload, lifetimeSeconds);
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: lifetimeSeconds * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  // Match the attributes used when the cookie was created so production
  // browsers reliably delete the secure session cookie.
  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie(SESSION_COOKIE, { path: "/", secure: isProduction, sameSite: "lax" });
}
