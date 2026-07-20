import { prisma } from "../lib/prisma.js";
import { label } from "../lib/constants.js";
import { daysUntil, effectiveRegistrationStatus, expiryState } from "./reminders.js";

export interface ReportFilters {
  branchId?: string;
  departmentId?: string;
  status?: string;
  from?: string; // YYYY-MM-DD (acquisition date lower bound)
  to?: string; // YYYY-MM-DD (acquisition date upper bound)
}

function baseWhere(f: ReportFilters) {
  const where: any = {};
  if (f.branchId) where.branchId = f.branchId;
  if (f.departmentId) where.departmentId = f.departmentId;
  if (f.status) where.status = f.status;
  if (f.from || f.to) {
    where.acquisitionDate = {};
    if (f.from) where.acquisitionDate.gte = new Date(f.from);
    if (f.to) where.acquisitionDate.lte = new Date(f.to + "T23:59:59.999Z");
  }
  return where;
}

// 1. Vehicle Inventory — flat list of all vehicles with key fields
export async function vehicleInventory(f: ReportFilters) {
  const rows = await prisma.vehicle.findMany({
    where: baseWhere(f),
    include: {
      branch: { select: { name: true } },
      department: { select: { name: true } },
      currentDriver: { select: { fullName: true } },
      _count: { select: { registrations: true, insurances: true, documents: true } },
    },
    orderBy: { vehicleCode: "asc" },
  });
  return rows.map((v) => ({
    vehicleCode: v.vehicleCode,
    plateNumber: v.plateNumber,
    make: v.make,
    model: v.model,
    year: v.year,
    category: label(v.category),
    type: label(v.type),
    status: label(v.status),
    branch: v.branch?.name ?? "-",
    department: v.department?.name ?? "-",
    driver: v.currentDriver?.fullName ?? "-",
    registrations: v._count.registrations,
    documents: v._count.documents,
  }));
}

// 2. Registration Status — counts by effective status
export async function registrationStatus(f: ReportFilters) {
  const rows = await prisma.vehicleRegistration.findMany({
    where: { vehicle: baseWhere(f) },
    select: { status: true, expiryDate: true },
  });
  const buckets: Record<string, number> = {};
  for (const r of rows) {
    const s = effectiveRegistrationStatus(r.status, r.expiryDate);
    buckets[s] = (buckets[s] ?? 0) + 1;
  }
  return Object.entries(buckets)
    .map(([k, v]) => ({ status: label(k), count: v }))
    .sort((a, b) => b.count - a.count);
}

// 3. Registration Expiry — list of regs ordered by soonest expiry
export async function registrationExpiry(f: ReportFilters) {
  const rows = await prisma.vehicleRegistration.findMany({
    where: { vehicle: baseWhere(f) },
    include: { vehicle: { select: { plateNumber: true, vehicleCode: true, branch: { select: { name: true } } } } },
    orderBy: { expiryDate: "asc" },
  });
  return rows.map((r) => {
    const eff = effectiveRegistrationStatus(r.status, r.expiryDate);
    return {
      regNumber: r.regNumber,
      plateNumber: r.vehicle.plateNumber,
      vehicleCode: r.vehicle.vehicleCode,
      branch: r.vehicle.branch?.name ?? "-",
      regDate: r.regDate,
      expiryDate: r.expiryDate,
      daysLeft: daysUntil(r.expiryDate),
      status: label(eff),
    };
  });
}

// 4. Insurance Expiry — list of insurances ordered by soonest end
export async function insuranceExpiry(f: ReportFilters) {
  const rows = await prisma.vehicleInsurance.findMany({
    where: { vehicle: baseWhere(f) },
    include: { vehicle: { select: { plateNumber: true, vehicleCode: true, branch: { select: { name: true } } } } },
    orderBy: { endDate: "asc" },
  });
  return rows.map((i) => ({
    policyNo: i.policyNo,
    company: i.company,
    plateNumber: i.vehicle.plateNumber,
    vehicleCode: i.vehicle.vehicleCode,
    branch: i.vehicle.branch?.name ?? "-",
    startDate: i.startDate,
    endDate: i.endDate,
    daysLeft: daysUntil(i.endDate),
    status: label(expiryState(i.endDate)),
  }));
}

// 5. Vehicles by Branch
export async function vehiclesByBranch(f: ReportFilters) {
  const rows = await prisma.vehicle.groupBy({
    by: ["branchId"],
    where: baseWhere(f),
    _count: { _all: true },
  });
  const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
  const map = new Map(branches.map((b) => [b.id, b.name]));
  return rows
    .map((r) => ({ branch: r.branchId ? map.get(r.branchId) ?? "Unknown" : "Unassigned", count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

// 6. Vehicles by Department
export async function vehiclesByDepartment(f: ReportFilters) {
  const rows = await prisma.vehicle.groupBy({
    by: ["departmentId"],
    where: baseWhere(f),
    _count: { _all: true },
  });
  const depts = await prisma.department.findMany({ select: { id: true, name: true } });
  const map = new Map(depts.map((d) => [d.id, d.name]));
  return rows
    .map((r) => ({ department: r.departmentId ? map.get(r.departmentId) ?? "Unknown" : "Unassigned", count: r._count._all }))
    .sort((a, b) => b.count - a.count);
}

// 7. Vehicle Age — bucket by age in years (current year - manufacture year)
export async function vehicleAge(f: ReportFilters) {
  const rows = await prisma.vehicle.findMany({ where: baseWhere(f), select: { year: true } });
  const now = new Date().getFullYear();
  const buckets: Record<string, number> = {
    "0-2 yrs": 0,
    "3-5 yrs": 0,
    "6-10 yrs": 0,
    "11+ yrs": 0,
  };
  for (const v of rows) {
    const age = now - v.year;
    if (age <= 2) buckets["0-2 yrs"]++;
    else if (age <= 5) buckets["3-5 yrs"]++;
    else if (age <= 10) buckets["6-10 yrs"]++;
    else buckets["11+ yrs"]++;
  }
  return Object.entries(buckets).map(([k, v]) => ({ range: k, count: v }));
}

// 8a. Vehicle Cost summary + top vehicles
export async function vehicleCost(f: ReportFilters) {
  const rows = await prisma.vehicle.findMany({
    where: { ...baseWhere(f), purchaseCost: { not: null } },
    select: { vehicleCode: true, plateNumber: true, make: true, model: true, purchaseCost: true, branch: { select: { name: true } } },
    orderBy: { purchaseCost: "desc" },
  });
  const costs = rows.map((v) => v.purchaseCost ?? 0);
  const total = costs.reduce((a, b) => a + b, 0);
  const avg = costs.length ? total / costs.length : 0;
  return {
    summary: { total, average: avg, count: rows.length },
    top: rows.slice(0, 20).map((v) => ({
      vehicleCode: v.vehicleCode,
      plateNumber: v.plateNumber,
      make: v.make,
      model: v.model,
      branch: v.branch?.name ?? "-",
      purchaseCost: v.purchaseCost ?? 0,
    })),
  };
}

// 8b. Cost by Branch — for the cost breakdown chart
export async function costByBranch(f: ReportFilters) {
  const rows = await prisma.vehicle.findMany({
    where: { ...baseWhere(f), purchaseCost: { not: null } },
    select: { purchaseCost: true, branch: { select: { name: true } } },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const name = r.branch?.name ?? "Unassigned";
    map.set(name, (map.get(name) ?? 0) + (r.purchaseCost ?? 0));
  }
  return Array.from(map.entries())
    .map(([branch, total]) => ({ branch, total }))
    .sort((a, b) => b.total - a.total);
}

// 9. Expiry Timeline — registrations & insurances expiring per month for next 12 months
export async function expiryTimeline(f: ReportFilters) {
  const start = new Date();
  const end = new Date();
  end.setMonth(end.getMonth() + 12);
  const [regs, ins] = await Promise.all([
    prisma.vehicleRegistration.findMany({
      where: { vehicle: baseWhere(f), expiryDate: { gte: start, lte: end } },
      select: { expiryDate: true },
    }),
    prisma.vehicleInsurance.findMany({
      where: { vehicle: baseWhere(f), endDate: { gte: start, lte: end } },
      select: { endDate: true },
    }),
  ]);
  const months: string[] = [];
  const regCounts: number[] = [];
  const insCounts: number[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
    months.push(key);
    regCounts.push(0);
    insCounts.push(0);
  }
  const idx = (d: Date) => (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth());
  for (const r of regs) {
    const i = idx(new Date(r.expiryDate));
    if (i >= 0 && i < 12) regCounts[i]++;
  }
  for (const r of ins) {
    const i = idx(new Date(r.endDate));
    if (i >= 0 && i < 12) insCounts[i]++;
  }
  return { months, regCounts, insCounts };
}

export const REPORT_BUILDERS: Record<string, (f: ReportFilters) => Promise<any>> = {
  inventory: vehicleInventory,
  registrationStatus: registrationStatus,
  registrationExpiry: registrationExpiry,
  insuranceExpiry: insuranceExpiry,
  byBranch: vehiclesByBranch,
  byDepartment: vehiclesByDepartment,
  age: vehicleAge,
  cost: vehicleCost,
  costByBranch: costByBranch,
  expiryTimeline: expiryTimeline,
};

export const REPORT_META = [
  { key: "inventory", title: "Vehicle Inventory", type: "table", icon: "Car" },
  { key: "registrationStatus", title: "Registration Status", type: "chart", icon: "ClipboardList" },
  { key: "registrationExpiry", title: "Registration Expiry", type: "table", icon: "CalendarClock" },
  { key: "insuranceExpiry", title: "Insurance Expiry", type: "table", icon: "ShieldCheck" },
  { key: "byBranch", title: "Vehicles by Branch", type: "chart", icon: "Building2" },
  { key: "byDepartment", title: "Vehicles by Department", type: "chart", icon: "Users" },
  { key: "age", title: "Vehicle Age", type: "chart", icon: "Clock" },
  { key: "cost", title: "Vehicle Cost", type: "mixed", icon: "DollarSign" },
];
