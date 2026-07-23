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
    where.OR = [
      { action: { contains: search } },
      { entity: { contains: search } },
      { user: { fullName: { contains: search } } },
      { user: { username: { contains: search } } },
      { vehicle: { plateNumber: { contains: search } } },
      { vehicle: { vehicleCode: { contains: search } } },
    ];
  }
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ps,
      take: ps,
      include: {
        user: { select: { fullName: true, username: true } },
        vehicle: { select: { plateNumber: true, vehicleCode: true } },
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
