import { prisma } from "../lib/prisma.js";
import { ROLE_PERMISSIONS } from "../lib/rbac.js";

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
}) {
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
  return role;
}

export async function updateRole(
  id: string,
  data: {
    name?: string;
    description?: string;
    permissionIds?: string[];
  },
) {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name.trim();
  if (data.description !== undefined) patch.description = data.description?.trim() ?? null;

  if (data.permissionIds !== undefined) {
    patch.permissions = { set: data.permissionIds.map((id) => ({ id })) };
  }

  const role = await prisma.role.update({
    where: { id },
    data: patch as any,
  });
  return role;
}

export async function deleteRole(id: string) {
  const userCount = await prisma.user.count({ where: { roleId: id } });
  if (userCount > 0) {
    throw new Error(`Cannot delete role with ${userCount} assigned user(s). Reassign users first.`);
  }
  await prisma.role.delete({ where: { id } });
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
