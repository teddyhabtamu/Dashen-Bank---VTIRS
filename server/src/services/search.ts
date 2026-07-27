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
    vehicleCode: string;
    plateNumber: string;
    make: string;
    model: string;
    year: number;
    status: string;
    branchName: string | null;
    registrationStatus: string | null;
    insuranceEnd: string | null;
  }>;
  registrations: Array<{
    id: string;
    regNumber: string;
    vehicleId: string;
    plateNumber: string;
    expiryDate: string;
    status: string;
  }>;
  insurances: Array<{
    id: string;
    policyNo: string;
    company: string;
    coverage: string;
    vehicleId: string;
    plateNumber: string;
    endDate: string;
  }>;
  documents: Array<{
    id: string;
    title: string;
    vehicleId: string;
    plateNumber: string;
    category: string;
  }>;
  total: number;
}

export async function globalSearch(filters: SearchFilters): Promise<SearchResult> {
  const q = (filters.q ?? "").trim();
  const qWhere = q
    ? {
        OR: [
          { plateNumber: { contains: q } },
          { engineNo: { contains: q } },
          { chassisNo: { contains: q } },
          { vehicleCode: { contains: q } },
        ],
      }
    : {};

  const vehicleWhere: any = { ...qWhere };
  if (filters.status) vehicleWhere.status = filters.status;
  if (filters.year) vehicleWhere.year = filters.year;
  if (filters.branchId) vehicleWhere.branchId = filters.branchId;
  if (filters.vehicleType) vehicleWhere.type = filters.vehicleType;

  const [vehicles, registrations, insurances, documents] = await Promise.all([
    prisma.vehicle.findMany({
      where: vehicleWhere,
      include: {
        branch: { select: { name: true } },
        registrations: { orderBy: { createdAt: "desc" }, take: 1 },
        insurances: { orderBy: { endDate: "desc" }, take: 1 },
      },
      take: 50,
    }),
    prisma.vehicleRegistration.findMany({
      where: q
        ? {
            OR: [
              { regNumber: { contains: q } },
              { vehicle: { plateNumber: { contains: q } } },
              { vehicle: { vehicleCode: { contains: q } } },
            ],
            ...(filters.registrationStatus ? { status: filters.registrationStatus } : {}),
          }
        : filters.registrationStatus
          ? { status: filters.registrationStatus }
          : { id: "none" },
      include: { vehicle: { select: { id: true, plateNumber: true } } },
      take: 25,
    }),
    prisma.vehicleInsurance.findMany({
      where: q
        ? {
            OR: [
              { policyNo: { contains: q } },
              { company: { contains: q } },
              { vehicle: { plateNumber: { contains: q } } },
              { vehicle: { vehicleCode: { contains: q } } },
            ],
          }
        : { id: "none" },
      include: { vehicle: { select: { id: true, plateNumber: true } } },
      take: 25,
    }),
    prisma.vehicleDocument.findMany({
      where: q
        ? {
            OR: [
              { title: { contains: q } },
              { originalName: { contains: q } },
              { vehicle: { plateNumber: { contains: q } } },
              { vehicle: { vehicleCode: { contains: q } } },
            ],
          }
        : { id: "none" },
      include: { vehicle: { select: { id: true, plateNumber: true } } },
      take: 25,
    }),
  ]);

  const mappedVehicles = vehicles.map((v) => ({
    id: v.id,
    vehicleCode: v.vehicleCode,
    plateNumber: v.plateNumber,
    make: v.make,
    model: v.model,
    year: v.year,
    status: v.status,
    branchName: v.branch?.name ?? null,
    registrationStatus: v.registrations[0]?.status ?? null,
    insuranceEnd: v.insurances[0]?.endDate
      ? v.insurances[0].endDate.toISOString()
      : null,
  }));

  const mappedRegs = registrations.map((r) => ({
    id: r.id,
    regNumber: r.regNumber,
    vehicleId: r.vehicleId,
    plateNumber: r.vehicle.plateNumber,
    expiryDate: r.expiryDate.toISOString(),
    status: r.status,
  }));

  const mappedIns = insurances.map((i) => ({
    id: i.id,
    policyNo: i.policyNo,
    company: i.company,
    coverage: i.coverage,
    vehicleId: i.vehicleId,
    plateNumber: i.vehicle.plateNumber,
    endDate: i.endDate.toISOString(),
  }));

  const mappedDocs = documents.map((d) => ({
    id: d.id,
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
  };
}
