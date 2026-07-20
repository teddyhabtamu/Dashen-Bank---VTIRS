import { SignJWT, jwtVerify } from "jose";
import type { Response } from "express";

export const SESSION_COOKIE = "vtirs_session";
const MAX_AGE = 60 * 60 * 8; // 8 hours

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
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(getSecret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      username: payload.username as string,
      roleSlug: payload.roleSlug as string,
      roleName: payload.roleName as string,
      fullName: payload.fullName as string,
      permissions: (payload.permissions as string[]) ?? [],
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(
  res: Response,
  payload: SessionPayload
): Promise<void> {
  const token = await signSession(payload);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE * 1000,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}
