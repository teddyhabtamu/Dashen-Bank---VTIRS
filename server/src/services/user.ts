import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";
import type { Prisma } from "@prisma/client";
import { defaultPageSize, getSetting } from "./setting.js";

export async function listUsers({
  page = 1,
  pageSize,
  search,
  roleSlug,
  status,
  branchId,
}: {
  page?: number;
  pageSize?: number;
  search?: string;
  roleSlug?: string;
  status?: string;
  branchId?: string;
}) {
  const ps = pageSize ?? await defaultPageSize();
  const where: Prisma.UserWhereInput = {};

  if (search) {
    where.OR = [
      { username: { contains: search, mode: "insensitive" } },
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (roleSlug) where.role = { slug: roleSlug };
  if (status) where.status = status;
  if (branchId) where.branchId = branchId;

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ps,
      take: ps,
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        status: true,
        lastLoginAt: true,
        lockedUntil: true,
        createdAt: true,
        role: { select: { slug: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map((u) => ({
      ...u,
      branchName: u.branch?.name ?? null,
      branchId: u.branch?.id ?? null,
      roleSlug: u.role.slug,
      roleName: u.role.name,
      role: undefined,
      branch: undefined,
    })),
    total,
    page,
    pageSize: ps,
    totalPages: Math.ceil(total / ps),
  };
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      fullName: true,
      status: true,
      lastLoginAt: true,
      lockedUntil: true,
      createdAt: true,
      role: { select: { slug: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
  });
  if (!user) return null;
  return {
    ...user,
    branchName: user.branch?.name ?? null,
    branchId: user.branch?.id ?? null,
    roleSlug: user.role.slug,
    roleName: user.role.name,
    role: undefined,
    branch: undefined,
  };
}

export class ValidationError extends Error {
  constructor(message: string) { super(message); this.name = "ValidationError"; }
}

async function validatePassword(password: string) {
  const minLen = Number(await getSetting("password_min_length", "8")) || 8;
  if (password.length < minLen) {
    throw new ValidationError(`Password must be at least ${minLen} characters long`);
  }
}

export async function createUser(
  data: {
    username: string;
    email: string;
    password: string;
    fullName: string;
    roleId: string;
    branchId?: string | null;
    status?: string;
  },
  ctx: { userId?: string | null; req?: AuditReq }
) {
  await validatePassword(data.password);
  const hash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      username: data.username.trim().toLowerCase(),
      email: data.email.trim().toLowerCase(),
      passwordHash: hash,
      fullName: data.fullName.trim(),
      roleId: data.roleId,
      branchId: data.branchId ?? null,
      status: data.status ?? "ACTIVE",
    },
  });

  await writeAudit({
    action: "CREATE",
    entity: "User",
    entityId: user.id,
    userId: ctx.userId,
    req: ctx.req,
  });

  return user;
}

export async function updateUser(
  id: string,
  data: {
    fullName?: string;
    email?: string;
    roleId?: string;
    branchId?: string | null;
    status?: string;
    password?: string;
    resetLock?: boolean;
  },
  ctx: { userId?: string | null; req?: AuditReq }
) {
  const patch: Prisma.UserUpdateInput = {};
  if (data.fullName !== undefined) patch.fullName = data.fullName.trim();
  if (data.email !== undefined) patch.email = data.email.trim().toLowerCase();
  if (data.roleId !== undefined) patch.role = { connect: { id: data.roleId } };
  if (data.branchId !== undefined) patch.branch = data.branchId ? { connect: { id: data.branchId } } : { disconnect: true };
  if (data.status !== undefined) patch.status = data.status;
  if (data.resetLock) {
    patch.failedLoginAttempts = 0;
    patch.lastFailedLoginAt = null;
    patch.lockedUntil = null;
  }
  if (data.password) {
    await validatePassword(data.password);
    patch.passwordHash = await hashPassword(data.password);
  }

  const user = await prisma.user.update({ where: { id }, data: patch });

  await writeAudit({
    action: "UPDATE",
    entity: "User",
    entityId: id,
    userId: ctx.userId,
    oldValue: { id },
    newValue: { ...data, password: data.password ? "[redacted]" : undefined },
    req: ctx.req,
  });

  return user;
}

export async function deleteUser(
  id: string,
  ctx: { userId?: string | null; req?: AuditReq }
) {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true, username: true } });
  if (!user) return null;

  await prisma.user.delete({ where: { id } });

  await writeAudit({
    action: "DELETE",
    entity: "User",
    entityId: id,
    userId: ctx.userId,
    req: ctx.req,
  });

  return user;
}

export async function getRoles() {
  return prisma.role.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, description: true },
  });
}
