import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";
import { getSetting } from "../services/setting.js";

export const SESSION_COOKIE = "vtirs_session";
const MAX_JWT_AGE = 60 * 60 * 24 * 30; // 30 days (safety bound — actual timeout is dynamic)

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

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_JWT_AGE}s`)
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

export async function setSessionCookie(
  res: Response,
  payload: SessionPayload,
): Promise<void> {
  const token = await signSession(payload);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_JWT_AGE * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
