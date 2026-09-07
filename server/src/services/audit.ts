import { prisma } from "../lib/prisma.js";
import type { Prisma } from "@prisma/client";
import { defaultPageSize } from "./setting.js";

export async function listAuditLogs({
  page = 1,
  pageSize,
  action,
  entity,
  search,
  from,
  to,
}: {
  page?: number;
  pageSize?: number;
  action?: string;
  entity?: string;
  search?: string;
  from?: string;
  to?: string;
}) {
  const ps = pageSize ?? await defaultPageSize();
  const where: Prisma.AuditLogWhereInput = {};
  if (action) where.action = action;
  if (entity) where.entity = entity;
  if (search) {
    // Case-insensitive like every other list endpoint — "abebe" must match "Abebe".
    const q = { contains: search, mode: "insensitive" as const };
    where.OR = [
      { action: q },
      { entity: q },
      { user: { fullName: q } },
      { user: { username: q } },
      { vehicle: { plateNumber: q } },
      { vehicle: { vehicleCode: q } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    // `to` is a calendar date: include the whole day, not just its midnight.
    if (to) where.createdAt.lte = new Date(to + "T23:59:59.999Z");
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ps,
      take: ps,
      include: {
        user: { select: { fullName: true, username: true } },
        vehicle: { select: { id: true, plateNumber: true, vehicleCode: true } },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: items.map((a) => ({
      id: a.id,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      vehicleId: a.vehicle?.id ?? null,
      vehicleCode: a.vehicle?.vehicleCode ?? null,
      plateNumber: a.vehicle?.plateNumber ?? null,
      user: a.user?.fullName ?? a.user?.username ?? "System",
      oldValue: a.oldValue ? safeParse(a.oldValue) : null,
      newValue: a.newValue ? safeParse(a.newValue) : null,
      ipAddress: a.ipAddress,
      userAgent: a.userAgent,
      createdAt: a.createdAt,
    })),
    total,
    page,
    pageSize: ps,
    totalPages: Math.ceil(total / ps),
  };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
}

export async function getAuditActions(): Promise<string[]> {
  const rows = await prisma.auditLog.groupBy({ by: ["action"], _count: { _all: true } });
  return rows.map((r) => r.action).sort();
}

export async function getAuditEntities(): Promise<string[]> {
  const rows = await prisma.auditLog.groupBy({ by: ["entity"], _count: { _all: true } });
  return rows.map((r) => r.entity).sort();
}
