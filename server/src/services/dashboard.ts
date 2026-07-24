import { prisma } from "../lib/prisma.js";
import { REGISTRATION_STATUS } from "../lib/constants.js";
import { label } from "../lib/constants.js";
import { daysUntil, getReminderWindows } from "./reminders.js";

export interface DashboardKpis {
  totalVehicles: number;
  registeredVehicles: number;
  activeVehicles: number;
  assignedVehicles: number;
  vehiclesUnderMaintenance: number;
  disposedVehicles: number;
  expiredRegistrations: number;
  pendingRenewal: number;
  suspendedRegistrations: number;
  expiredInsurance: number;
  averageAge: number;
  newestVehicle: { code: string; year: number } | null;
  oldestVehicle: { code: string; year: number } | null;
  expiringInWindow: {
    registration: Record<number, number>;
    insurance: Record<number, number>;
  };
}

export async function getUpcomingRegistrations(_withinDays?: number, limit = 8) {
  const [w90] = await getReminderWindows();
  const withinDays = _withinDays ?? w90;
  const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.vehicleRegistration.findMany({
    where: { expiryDate: { lte: horizon } },
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

export async function getUpcomingInsurances(_withinDays?: number, limit = 8) {
  const [w90] = await getReminderWindows();
  const withinDays = _withinDays ?? w90;
  const horizon = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.vehicleInsurance.findMany({
    where: { endDate: { lte: horizon } },
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

export async function getVehicleDistributions() {
  const [byType, byStatus, byBranch, byMake, byModel, byYear, byFuel] = await Promise.all([
    prisma.vehicle.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["branchId"], _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["make"], _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["make", "model"], _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["year"], _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["fuelType"], _count: { _all: true } }),
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
    byModel: byModel.map((r) => ({ name: `${r.make} ${r.model}`, value: r._count._all })).sort((a, b) => b.value - a.value).slice(0, 8),
    byYear: byYear.map((r) => ({ name: String(r.year), value: r._count._all })).sort((a, b) => a.name.localeCompare(b.name)),
    byFuel: byFuel.map((r) => ({ name: label(r.fuelType), value: r._count._all })).sort((a, b) => b.value - a.value),
  };
}

export async function getRecentActivity(limit = 8) {
  const rows = await prisma.auditLog.findMany({
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
  }));
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const now = new Date().getFullYear();
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
    ages,
    newest,
    oldest,
  ] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicleRegistration.count({ where: { status: REGISTRATION_STATUS.ACTIVE } }),
    prisma.vehicle.count({ where: { status: "ACTIVE" } }),
    prisma.vehicle.count({ where: { status: "ASSIGNED" } }),
    prisma.vehicle.count({ where: { status: "UNDER_MAINTENANCE" } }),
    prisma.vehicle.count({ where: { status: "DISPOSED" } }),
    prisma.vehicleRegistration.count({ where: { expiryDate: { lt: new Date() } } }),
    prisma.vehicleRegistration.count({ where: { status: REGISTRATION_STATUS.PENDING_RENEWAL } }),
    prisma.vehicleRegistration.count({ where: { status: REGISTRATION_STATUS.SUSPENDED } }),
    prisma.vehicleInsurance.count({ where: { endDate: { lt: new Date() } } }),
    prisma.vehicle.findMany({ where: { year: { gt: 1900 } } as any, select: { year: true } }),
    prisma.vehicle.findFirst({ orderBy: { year: "desc" }, select: { vehicleCode: true, year: true } }),
    prisma.vehicle.findFirst({ orderBy: { year: "asc" }, select: { vehicleCode: true, year: true } }),
  ]);

  const avgAge = ages.length ? Math.round(ages.reduce((s, v) => s + (now - (v.year ?? now)), 0) / ages.length) : 0;

  const windows = await getReminderWindows();
  const regWindowCounts: Record<number, number> = {};
  const insWindowCounts: Record<number, number> = {};
  for (const w of windows) {
    const from = new Date();
    const to = new Date(Date.now() + w * 24 * 60 * 60 * 1000);
    regWindowCounts[w] = await prisma.vehicleRegistration.count({
      where: { expiryDate: { gte: from, lte: to } },
    });
    insWindowCounts[w] = await prisma.vehicleInsurance.count({
      where: { endDate: { gte: from, lte: to } },
    });
  }

  return {
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
    averageAge: avgAge,
    newestVehicle: newest ? { code: newest.vehicleCode, year: newest.year } : null,
    oldestVehicle: oldest ? { code: oldest.vehicleCode, year: oldest.year } : null,
    expiringInWindow: {
      registration: regWindowCounts,
      insurance: insWindowCounts,
    },
  };
}
