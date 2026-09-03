import { prisma } from "../lib/prisma.js";

export interface SearchFilters {
  q?: string;
  status?: string;
  year?: number;
  branchId?: string;
  vehicleType?: string;
  registrationStatus?: string;
}

export interface SearchResult {
  vehicles: Array<{
    id: string;
    kind: "vehicle";
    vehicleCode: string;
    plateNumber: string;
    make: string;
    model: string;
    year: number;
    status: string;
    branchName: string | null;
    departmentName: string | null;
    driverName: string | null;
    driverId: string | null;
    ownerName: string;
    registrationStatus: string | null;
    insuranceEnd: string | null;
  }>;
  registrations: Array<{
    id: string;
    kind: "registration";
    regNumber: string;
    vehicleId: string;
    plateNumber: string;
    expiryDate: string;
    status: string;
    office: string | null;
  }>;
  insurances: Array<{
    id: string;
    kind: "insurance";
    policyNo: string;
    company: string;
    coverage: string;
    vehicleId: string;
    plateNumber: string;
    endDate: string;
  }>;
  documents: Array<{
    id: string;
    kind: "document";
    title: string;
    vehicleId: string;
    plateNumber: string;
    category: string;
  }>;
  total: number;
  // True per kind when that table hit its take-limit — the client uses this
  // to say "showing first N" instead of reporting a confident wrong total.
  truncated: {
    vehicles: boolean;
    registrations: boolean;
    insurances: boolean;
    documents: boolean;
  };
}

const VEHICLE_TAKE = 50;
const ROW_TAKE = 25;

const ci = (v: string) => ({ contains: v, mode: "insensitive" as const });

export async function globalSearch(filters: SearchFilters): Promise<SearchResult> {
  const q = (filters.q ?? "").trim();

  // Vehicle search: plate, engine, chassis, vehicle code, driver name,
  // owner name, branch name, department name.
  const vehicleQ = q
    ? {
        OR: [
          { plateNumber: ci(q) },
          { engineNo: ci(q) },
          { chassisNo: ci(q) },
          { vehicleCode: ci(q) },
          { ownerName: ci(q) },
          { currentDriver: { fullName: ci(q) } },
          { branch: { name: ci(q) } },
          { department: { name: ci(q) } },
        ],
      }
    : {};

  const vehicleWhere: any = { ...vehicleQ };
  if (filters.status) vehicleWhere.status = filters.status;
  if (filters.year) vehicleWhere.year = filters.year;
  if (filters.branchId) vehicleWhere.branchId = filters.branchId;
  if (filters.vehicleType) vehicleWhere.type = filters.vehicleType;

  // Registration search: reg number, plate, vehicle code, office.
  const regQ = q
    ? {
        OR: [
          { regNumber: ci(q) },
          { office: ci(q) },
          { vehicle: { plateNumber: ci(q) } },
          { vehicle: { vehicleCode: ci(q) } },
        ],
        ...(filters.registrationStatus ? { status: filters.registrationStatus } : {}),
        ...(filters.branchId ? { vehicle: { branchId: filters.branchId } } : {}),
      }
    : filters.registrationStatus || filters.branchId
      ? {
          ...(filters.registrationStatus ? { status: filters.registrationStatus } : {}),
          ...(filters.branchId ? { vehicle: { branchId: filters.branchId } } : {}),
        }
      : { id: "none" };

  // Insurance search: policy number, company, plate, vehicle code.
  const insQ = q
    ? {
        OR: [
          { policyNo: ci(q) },
          { company: ci(q) },
          { vehicle: { plateNumber: ci(q) } },
          { vehicle: { vehicleCode: ci(q) } },
        ],
        ...(filters.branchId ? { vehicle: { branchId: filters.branchId } } : {}),
      }
    : filters.branchId
      ? { vehicle: { branchId: filters.branchId } }
      : { id: "none" };

  // Document search: title, original name, plate, vehicle code.
  const docQ = q
    ? {
        OR: [
          { title: ci(q) },
          { originalName: ci(q) },
          { vehicle: { plateNumber: ci(q) } },
          { vehicle: { vehicleCode: ci(q) } },
        ],
        ...(filters.branchId ? { vehicle: { branchId: filters.branchId } } : {}),
      }
    : filters.branchId
      ? { vehicle: { branchId: filters.branchId } }
      : { id: "none" };

  const [vehicles, registrations, insurances, documents] = await Promise.all([
    prisma.vehicle.findMany({
      where: vehicleWhere,
      include: {
        branch: { select: { name: true } },
        department: { select: { name: true } },
        currentDriver: { select: { id: true, fullName: true } },
        // The live (non-archived) registration best represents current
        // compliance — a superseded record created later must not win.
        registrations: {
          where: { status: { not: "ARCHIVED" } },
          orderBy: { expiryDate: "desc" },
          take: 1,
        },
        insurances: { orderBy: { endDate: "desc" }, take: 1 },
      },
      orderBy: { plateNumber: "asc" },
      take: VEHICLE_TAKE,
    }),
    prisma.vehicleRegistration.findMany({
      where: regQ,
      include: { vehicle: { select: { id: true, plateNumber: true } } },
      orderBy: { expiryDate: "asc" },
      take: ROW_TAKE,
    }),
    prisma.vehicleInsurance.findMany({
      where: insQ,
      include: { vehicle: { select: { id: true, plateNumber: true } } },
      orderBy: { endDate: "asc" },
      take: ROW_TAKE,
    }),
    prisma.vehicleDocument.findMany({
      where: { deletedAt: null, ...docQ },
      include: { vehicle: { select: { id: true, plateNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: ROW_TAKE,
    }),
  ]);

const mappedVehicles = vehicles.map((v) => ({
    id: v.id,
    kind: "vehicle" as const,
    vehicleCode: v.vehicleCode,
    plateNumber: v.plateNumber,
    make: v.make,
    model: v.model,
    year: v.year,
    status: v.status,
    branchName: v.branch?.name ?? null,
    departmentName: v.department?.name ?? null,
    driverName: v.currentDriver?.fullName ?? null,
    ownerName: v.ownerName,
    driverId: v.currentDriver?.id ?? null,
    registrationStatus: v.registrations[0]?.status ?? null,
    insuranceEnd: v.insurances[0]?.endDate
      ? v.insurances[0].endDate.toISOString()
      : null,
  }));

  const mappedRegs = registrations.map((r) => ({
    id: r.id,
    kind: "registration" as const,
    regNumber: r.regNumber,
    vehicleId: r.vehicleId,
    plateNumber: r.vehicle.plateNumber,
    expiryDate: r.expiryDate.toISOString(),
    status: r.status,
    office: r.office ?? null,
  }));

  const mappedIns = insurances.map((i) => ({
    id: i.id,
    kind: "insurance" as const,
    policyNo: i.policyNo,
    company: i.company,
    coverage: i.coverage,
    vehicleId: i.vehicleId,
    plateNumber: i.vehicle.plateNumber,
    endDate: i.endDate.toISOString(),
  }));

  const mappedDocs = documents.map((d) => ({
    id: d.id,
    kind: "document" as const,
    title: d.title,
    vehicleId: d.vehicleId,
    plateNumber: d.vehicle.plateNumber,
    category: d.category,
  }));

  return {
    vehicles: mappedVehicles,
    registrations: mappedRegs,
    insurances: mappedIns,
    documents: mappedDocs,
    total:
      mappedVehicles.length + mappedRegs.length + mappedIns.length + mappedDocs.length,
    truncated: {
      vehicles: mappedVehicles.length >= VEHICLE_TAKE,
      registrations: mappedRegs.length >= ROW_TAKE,
      insurances: mappedIns.length >= ROW_TAKE,
      documents: mappedDocs.length >= ROW_TAKE,
    },
  };
}
