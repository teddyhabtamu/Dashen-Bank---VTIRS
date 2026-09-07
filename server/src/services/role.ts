import { prisma } from "../lib/prisma.js";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../lib/rbac.js";
import { writeAudit, type AuditReq } from "../lib/audit.js";

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

interface Context {
  userId?: string | null;
  req?: AuditReq;
}

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      permissions: { select: { id: true, code: true, name: true, category: true } },
      _count: { select: { users: true } },
    },
  });

  return roles.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    userCount: r._count.users,
    permissions: r.permissions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
    })),
    defaults: ROLE_PERMISSIONS[r.slug] ?? [],
    createdAt: r.createdAt,
  }));
}

export async function getRole(id: string) {
  const role = await prisma.role.findUnique({
    where: { id },
    include: {
      permissions: { select: { id: true, code: true, name: true, category: true } },
      _count: { select: { users: true } },
    },
  });
  if (!role) return null;

  return {
    id: role.id,
    slug: role.slug,
    name: role.name,
    description: role.description,
    userCount: role._count.users,
    permissions: role.permissions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      category: p.category,
    })),
    defaults: ROLE_PERMISSIONS[role.slug] ?? [],
    createdAt: role.createdAt,
  };
}

export async function createRole(data: {
  slug: string;
  name: string;
  description?: string;
  permissionIds?: string[];
}, ctx: Context = {}) {
  const role = await prisma.role.create({
    data: {
      slug: data.slug.trim().toLowerCase().replace(/\s+/g, "_"),
      name: data.name.trim(),
      description: data.description?.trim() ?? null,
      permissions: data.permissionIds?.length
        ? { connect: data.permissionIds.map((id) => ({ id })) }
        : undefined,
    },
  });
  await writeAudit({
    action: "CREATE",
    entity: "Role",
    entityId: role.id,
    userId: ctx.userId,
    newValue: { slug: role.slug, name: role.name },
    req: ctx.req,
  });
  return role;
}

export async function updateRole(
  id: string,
  data: {
    name?: string;
    description?: string;
    permissionIds?: string[];
  },
  ctx: Context = {},
) {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.description !== undefined) patch.description = data.description?.trim() ?? null;

  let permDiff: { added: string[]; removed: string[] } | null = null;
  if (data.permissionIds !== undefined) {
    // Resolve old vs new as permission *codes* (stable, human-readable in audit).
    const [existing, incoming] = await Promise.all([
      prisma.role.findUnique({
        where: { id },
        select: { slug: true, permissions: { select: { code: true } } },
      }),
      prisma.permission.findMany({
        where: { id: { in: data.permissionIds } },
        select: { id: true, code: true },
      }),
    ]);
    if (!existing) throw new Error("Role not found");
    const oldCodes = new Set(existing.permissions.map((p) => p.code));
    const newCodes = new Set(incoming.map((p) => p.code));
    permDiff = {
      added: [...newCodes].filter((c) => !oldCodes.has(c)).sort(),
      removed: [...oldCodes].filter((c) => !newCodes.has(c)).sort(),
    };

    // Self-lockout guard: ROLE_MANAGE is the only path back into this page.
    // Refuse any save that would leave zero active users holding it.
    if (permDiff.removed.length > 0) {
      const [allRoles, activeUsers] = await Promise.all([
        prisma.role.findMany({
          select: { id: true, slug: true, permissions: { select: { code: true } } },
        }),
        prisma.user.findMany({ where: { status: "ACTIVE" }, select: { roleId: true } }),
      ]);
      const codesFor = (roleId: string, slug: string): Set<string> => {
        if (roleId === id) return newCodes;
        const role = allRoles.find((r) => r.id === roleId);
        const explicit = new Set((role?.permissions ?? []).map((p) => p.code));
        for (const c of ROLE_PERMISSIONS[slug] ?? []) explicit.add(c);
        return explicit;
      };
      const keeper = activeUsers.some((u) => {
        const role = allRoles.find((r) => r.id === u.roleId);
        if (!role) return false;
        return codesFor(u.roleId, role.slug).has(PERMISSIONS.ROLE_MANAGE);
      });
      if (!keeper) {
        throw new Error(
          "Cannot save: this would leave no active user with Roles & Permissions access. Grant role:manage to another role first."
        );
      }
    }

    patch.permissions = { set: data.permissionIds.map((id) => ({ id })) };
  }

  const role = await prisma.role.update({
    where: { id },
    data: patch as any,
  });
  await writeAudit({
    action: "UPDATE",
    entity: "Role",
    entityId: id,
    userId: ctx.userId,
    oldValue: permDiff ? { permissions: permDiff } : { id },
    newValue: permDiff ? { permissions: { added: permDiff.added, removed: permDiff.removed } } : { ...data },
    req: ctx.req,
  });
  return role;
}

export async function deleteRole(id: string, ctx: Context = {}) {
  const userCount = await prisma.user.count({ where: { roleId: id } });
  if (userCount > 0) {
    throw new Error(`Cannot delete role with ${userCount} assigned user(s). Reassign users first.`);
  }
  const existing = await prisma.role.findUnique({
    where: { id },
    select: { slug: true, name: true, permissions: { select: { code: true } } },
  });
  await prisma.role.delete({ where: { id } });
  await writeAudit({
    action: "DELETE",
    entity: "Role",
    entityId: id,
    userId: ctx.userId,
    oldValue: existing
      ? { slug: existing.slug, name: existing.name, permissions: existing.permissions.map((p) => p.code).sort() }
      : { id },
    req: ctx.req,
  });
}

export async function listPermissions() {
  const perms = await prisma.permission.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // Group by category
  const grouped: Record<string, Array<{ id: string; code: string; name: string; description: string | null }>> = {};
  for (const p of perms) {
    const cat = p.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ id: p.id, code: p.code, name: p.name, description: p.description });
  }

  return grouped;
}
