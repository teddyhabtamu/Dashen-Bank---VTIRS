import { prisma } from "../lib/prisma.js";
import { REGISTRATION_STATUS, INSURANCE_STATUS, label } from "../lib/constants.js";
import { daysUntil, getReminderWindows } from "./reminders.js";

export interface DashboardKpis {
  totalVehicles: number;
  registeredVehicles: number;
  activeVehicles: number;
  assignedVehicles: number;
  vehiclesUnderMaintenance: number;
  disposedVehicles: number;
  expiredRegistrations: number;
  expiredInsurance: number; // effective expired: stored EXPIRED or ACTIVE past-end
  expiredLicenses: number; // active drivers whose licenseExpiry is past
  expiringLicenses: number; // active drivers whose license expires within the max window
  pendingRenewal: number;
  suspendedRegistrations: number;
  uninsuredVehicles: number; // vehicles with no in-force ACTIVE policy
  averageAge: number;
  newestVehicle: { code: string; year: number } | null;
  oldestVehicle: { code: string; year: number } | null;
  expiringInWindow: {
    registration: Record<number, number>;
    insurance: Record<number, number>;
  };
}

// ---------------------------------------------------------------------------
// Lightweight in-memory cache. Dashboard numbers only move via cron sweeps /
// user edits, so a 60-second TTL cuts ~25 queries per page view per user down
// to a single originator. Keys are per-permission-shape (activity is gated by
// AUDIT_VIEW, so the two variants are cached separately).
// ---------------------------------------------------------------------------
const CACHE_TTL_MS = 60_000;
const kpiCache = new Map<string, { at: number; value: DashboardKpis }>();
const windowListsCache = new Map<string, { at: number; value: unknown }>();

function cacheGet<T>(cache: Map<string, { at: number; value: T }>, key: string, ttl: number): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet<T>(cache: Map<string, { at: number; value: T }>, key: string, value: T): void {
  cache.set(key, { at: Date.now(), value });
  // Keep the map bounded at one entry per key shape.
  if (cache.size > 16) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

// Invalidate after mutations that materially change KPIs (fire-and-forget).
export function invalidateDashboardCache(): void {
  kpiCache.clear();
  windowListsCache.clear();
}

export async function getUpcomingRegistrations(_withinDays?: number, limit = 8, branchId?: string) {
  const [w90] = await getReminderWindows();
  const withinDays = _withinDays ?? w90;
  const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.vehicleRegistration.findMany({
    where: {
      expiryDate: { lte: horizon },
      // Suspended/archived registrations are not renewal candidates — showing
      // them as "upcoming" invites pointless renewal work.
      status: { notIn: [REGISTRATION_STATUS.SUSPENDED, REGISTRATION_STATUS.ARCHIVED] },
      ...(branchId ? { vehicle: { branchId } } : {}),
    },
    include: { vehicle: { select: { id: true, plateNumber: true, vehicleCode: true, branch: { select: { name: true } } } } },
    orderBy: { expiryDate: "asc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    regNumber: r.regNumber,
    status: r.status,
    expiryDate: r.expiryDate,
    daysLeft: daysUntil(r.expiryDate),
    vehicle: r.vehicle,
  }));
}

export async function getUpcomingInsurances(_withinDays?: number, limit = 8, branchId?: string) {
  const [w90] = await getReminderWindows();
  const withinDays = _withinDays ?? w90;
  const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.vehicleInsurance.findMany({
    where: {
      status: INSURANCE_STATUS.ACTIVE,
      endDate: { lte: horizon },
      ...(branchId ? { vehicle: { branchId } } : {}),
    },
    include: { vehicle: { select: { id: true, plateNumber: true, vehicleCode: true, branch: { select: { name: true } } } } },
    orderBy: { endDate: "asc" },
    take: limit,
  });
  return rows.map((i) => ({
    id: i.id,
    company: i.company,
    policyNo: i.policyNo,
    endDate: i.endDate,
    daysLeft: daysUntil(i.endDate),
    vehicle: i.vehicle,
  }));
}

export async function getVehicleDistributions(branchId?: string) {
  const scoped = branchId ? { branchId } : {};
  const [byType, byStatus, byBranch, byMake, byYear, byFuel] = await Promise.all([
    prisma.vehicle.groupBy({ by: ["type"], where: scoped, _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["status"], where: scoped, _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["branchId"], where: scoped, _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["make"], where: scoped, _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["year"], where: scoped, _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["fuelType"], where: scoped, _count: { _all: true } }),
  ]);
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));

  return {
    byType: byType.map((r) => ({ name: label(r.type), value: r._count._all })).sort((a, b) => b.value - a.value),
    byStatus: byStatus.map((r) => ({ name: label(r.status), value: r._count._all })).sort((a, b) => b.value - a.value),
    byBranch: byBranch
      .map((r) => ({ name: r.branchId ? branchMap.get(r.branchId) ?? "Unknown" : "Unassigned", value: r._count._all }))
      .sort((a, b) => b.value - a.value),
    byMake: byMake.map((r) => ({ name: r.make, value: r._count._all })).sort((a, b) => b.value - a.value).slice(0, 8),
    byYear: byYear.map((r) => ({ name: String(r.year), value: r._count._all })).sort((a, b) => a.name.localeCompare(b.name)),
    byFuel: byFuel.map((r) => ({ name: label(r.fuelType), value: r._count._all })).sort((a, b) => b.value - a.value),
  };
}

export async function getRecentActivity(limit = 8, includeVehicle = false, branchId?: string) {
  const rows = await prisma.auditLog.findMany({
    // Scoped feeds show only rows tied to the branch's vehicles — global
    // events (logins, user admin) stay HQ-visible.
    where: branchId ? { vehicle: { branchId } } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { fullName: true, username: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    action: a.action,
    entity: a.entity,
    createdAt: a.createdAt,
    user: a.user?.fullName ?? a.user?.username ?? "System",
    vehicleId: includeVehicle ? a.vehicleId : undefined,
  }));
}

export async function getDashboardKpis(branchId?: string): Promise<DashboardKpis> {
  // Cache key includes the scope — a branch view must never serve (or be
  // served) the org-wide numbers.
  const cached = cacheGet(kpiCache, branchId ? `kpis:${branchId}` : "kpis", CACHE_TTL_MS);
  if (cached) return cached;

  const now = new Date();
  const nowYear = now.getFullYear();
  const vBranch = branchId ? { branchId } : {};
  const vehicleBranch = branchId ? { vehicle: { branchId } } : {};
  const CURRENT = {
    status: { in: [REGISTRATION_STATUS.ACTIVE, REGISTRATION_STATUS.PENDING_RENEWAL] },
    expiryDate: { gte: now },
    ...vehicleBranch,
  };
  const EXPIRED = {
    ...vehicleBranch,
    OR: [
      { status: REGISTRATION_STATUS.EXPIRED },
      {
        status: { in: [REGISTRATION_STATUS.ACTIVE, REGISTRATION_STATUS.PENDING_RENEWAL] },
        expiryDate: { lt: now },
      },
    ],
  };
  const EFFECTIVE_EXPIRED_INS = {
    ...vehicleBranch,
    OR: [
      { status: INSURANCE_STATUS.EXPIRED },
      { status: INSURANCE_STATUS.ACTIVE, endDate: { lt: now } },
    ],
  };
  const ACTIVE_INS = { status: INSURANCE_STATUS.ACTIVE };

  // All four window counts run in parallel with everything else (they used to
  // be a sequential for-loop after the main batch — the slowest part of the
  // endpoint).
  const windows = await getReminderWindows();

  const windowCount = (days: number, kind: "reg" | "ins") => {
    const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return kind === "reg"
      ? prisma.vehicleRegistration.count({
          where: { expiryDate: { gte: now, lte: to }, ...vehicleBranch },
        })
      : prisma.vehicleInsurance.count({
          where: { ...ACTIVE_INS, endDate: { gte: now, lte: to }, ...vehicleBranch },
        });
  };

  const [
    totalVehicles,
    registeredVehicles,
    activeVehicles,
    assignedVehicles,
    vehiclesUnderMaintenance,
    disposedVehicles,
    expiredRegistrations,
    pendingRenewal,
    suspendedRegistrations,
    expiredInsurance,
    expiredLicenses,
    expiringLicenses,
    ageAgg,
    newest,
    oldest,
    ...windowResults
  ] = await Promise.all([
    prisma.vehicle.count({ where: vBranch }),
    prisma.vehicleRegistration.count({ where: CURRENT }),
    prisma.vehicle.count({ where: { status: "ACTIVE", ...vBranch } }),
    prisma.vehicle.count({ where: { status: "ASSIGNED", ...vBranch } }),
    prisma.vehicle.count({ where: { status: "UNDER_MAINTENANCE", ...vBranch } }),
    prisma.vehicle.count({ where: { status: "DISPOSED", ...vBranch } }),
    prisma.vehicleRegistration.count({ where: EXPIRED }),
    prisma.vehicleRegistration.count({ where: { status: REGISTRATION_STATUS.PENDING_RENEWAL, expiryDate: { gte: now }, ...vehicleBranch } }),
    prisma.vehicleRegistration.count({ where: { status: REGISTRATION_STATUS.SUSPENDED, ...vehicleBranch } }),
    prisma.vehicleInsurance.count({ where: EFFECTIVE_EXPIRED_INS }),
    prisma.driver.count({
      where: {
        isActive: true,
        licenseExpiry: { not: null, lt: now },
        ...(branchId ? { vehicles: { some: { branchId } } } : {}),
      },
    }),
    prisma.driver.count({
      where: {
        isActive: true,
        licenseExpiry: {
          not: null,
          gte: now,
          lte: new Date(Date.now() + Math.max(...windows) * 24 * 60 * 60 * 1000),
        },
        ...(branchId ? { vehicles: { some: { branchId } } } : {}),
      },
    }),
    // Aggregate average age in the database instead of pulling every vehicle
    // row into JS.
    prisma.vehicle.aggregate({ _avg: { year: true }, where: { year: { gt: 1900 }, ...vBranch } }),
    prisma.vehicle.findFirst({ where: vBranch, orderBy: { year: "desc" }, select: { vehicleCode: true, year: true } }),
    prisma.vehicle.findFirst({ where: vBranch, orderBy: { year: "asc" }, select: { vehicleCode: true, year: true } }),
    ...windows.map((w) => windowCount(w, "reg")),
    ...windows.map((w) => windowCount(w, "ins")),
  ]);

  const regWindowCounts: Record<number, number> = {};
  const insWindowCounts: Record<number, number> = {};
  windows.forEach((w, i) => {
    regWindowCounts[w] = windowResults[i];
    insWindowCounts[w] = windowResults[windows.length + i];
  });

  const uninsuredVehicles = await prisma.vehicle.count({
    where: {
      ...vBranch,
      NOT: {
        OR: [
          {
            insurances: {
              some: {
                status: INSURANCE_STATUS.ACTIVE,
                startDate: { lte: now },
                endDate: { gte: now },
              },
            },
          },
        ],
      },
    },
  });

  const avgAge = ageAgg._avg.year
    ? Math.round(nowYear - ageAgg._avg.year)
    : 0;

  const value: DashboardKpis = {
    totalVehicles,
    registeredVehicles,
    activeVehicles,
    assignedVehicles,
    vehiclesUnderMaintenance,
    disposedVehicles,
    expiredRegistrations,
    pendingRenewal,
    suspendedRegistrations,
    expiredInsurance,
    expiredLicenses,
    expiringLicenses,
    uninsuredVehicles,
    averageAge: avgAge,
    newestVehicle: newest ? { code: newest.vehicleCode, year: newest.year } : null,
    oldestVehicle: oldest ? { code: oldest.vehicleCode, year: oldest.year } : null,
    expiringInWindow: {
      registration: regWindowCounts,
      insurance: insWindowCounts,
    },
  };

  cacheSet(kpiCache, branchId ? `kpis:${branchId}` : "kpis", value);
  return value;
}