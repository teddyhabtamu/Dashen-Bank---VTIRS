import { label } from "../lib/constants.js";
import { effectiveInsuranceStatus, effectiveRegistrationStatus } from "./reminders.js";
import { listVehicles } from "./vehicle.js";
import { listDrivers } from "./driver.js";
import { listRegistrations } from "./registration.js";
import { listInsurances } from "./insurance.js";
import { listFiles } from "./document-list.js";
import { listUsers } from "./user.js";
import { listAuditLogs } from "./audit.js";

export type ExportEntity =
  | "vehicles"
  | "drivers"
  | "registrations"
  | "insurances"
  | "documents"
  | "users"
  | "audit";

export const EXPORT_ENTITIES: ExportEntity[] = [
  "vehicles",
  "drivers",
  "registrations",
  "insurances",
  "documents",
  "users",
  "audit",
];

// Hard ceiling per download: bounds server work and keeps the file usable.
// Callers asking for more get a 422 telling them to narrow filters.
export const MAX_EXPORT_ROWS = 20000;
const EXPORT_PAGE_SIZE = 1000;

// Mirrors client/src/lib/format.ts so server CSVs show the same dates/sizes
// users see on screen.
function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Same formula-injection guard as the client exporter.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\n");
}

type Row = Record<string, unknown>;

async function collect(
  fetchPage: (page: number) => Promise<{ items: any[]; total: number }>
): Promise<{ rows: any[]; total: number; overCap: boolean }> {
  const rows: any[] = [];
  let total = 0;
  for (let p = 1; p <= Math.ceil(MAX_EXPORT_ROWS / EXPORT_PAGE_SIZE); p++) {
    const data = await fetchPage(p);
    total = data.total ?? 0;
    // Bail before doing real work when the result set exceeds the cap.
    if (p === 1 && total > MAX_EXPORT_ROWS) return { rows: [], total, overCap: true };
    const items = data.items ?? [];
    rows.push(...items);
    if (rows.length >= total || items.length === 0) break;
  }
  return { rows, total, overCap: false };
}

const num = (v: unknown): number | undefined =>
  v === undefined || v === "" || v === null ? undefined : Number(v);

// Column maps mirror each page's client-side exportColumns so server CSVs
// and in-app exports stay byte-compatible in shape.
const EXPORTERS: Record<
  ExportEntity,
  { label: string; fetch: (q: any, branchId?: string) => Promise<{ rows: Row[]; total: number; overCap: boolean }> }
> = {
  vehicles: {
    label: "Vehicles",
    fetch: async (q, branchId) => {
      const filters: any = {
        search: q.search, status: q.status,
        branchId: branchId ?? q.branchId,
        type: q.type, year: num(q.year),
        sortBy: q.sortBy, sortDir: q.sortDir,
      };
      const { rows, total, overCap } = await collect((page) =>
        listVehicles({ ...filters, page, pageSize: EXPORT_PAGE_SIZE }).then((d) => ({ items: d.items, total: d.total }))
      );
      if (overCap) return { rows: [], total, overCap };
      return {
        rows: rows.map((v: any) => ({
          Code: v.vehicleCode, Plate: v.plateNumber, Make: v.make, Model: v.model,
          Year: v.year, Branch: v.branch?.name ?? "", Driver: v.currentDriver?.fullName ?? "",
          Owner: v.ownerName, Cost: v.purchaseCost ?? "", Status: label(v.status),
        })),
        total,
        overCap: false,
      };
    },
  },
  drivers: {
    label: "Drivers",
    fetch: async (q, branchId) => {
      // Drivers belong to departments, not branches — scope by where they drive.
      const filters: any = {
        search: q.search, departmentId: q.departmentId, status: q.status,
        branchId: branchId ?? q.branchId,
        unassigned: q.unassigned === "true",
        licenseExpiringWithin: q.licenseExpiringWithin !== undefined && q.licenseExpiringWithin !== "" ? Number(q.licenseExpiringWithin) : undefined,
      };
      const { rows, total, overCap } = await collect((page) =>
        listDrivers({ ...filters, page, pageSize: EXPORT_PAGE_SIZE }).then((d) => ({ items: d.rows, total: d.total }))
      );
      if (overCap) return { rows: [], total, overCap };
      return {
        rows: rows.map((d: any) => ({
          Name: d.fullName, "Employee ID": d.employeeId ?? "", "License No": d.licenseNo ?? "",
          "License Expiry": fmtDate(d.licenseExpiry), Phone: d.phone ?? "",
          Department: d.department?.name ?? "",
          "Current Vehicle": d.vehicles[0] ? `${d.vehicles[0].plateNumber} (${d.vehicles[0].vehicleCode})` : "",
          Status: d.isActive ? "Active" : "Inactive",
        })),
        total,
        overCap: false,
      };
    },
  },
  registrations: {
    label: "Registrations",
    fetch: async (q, branchId) => {
      const filters: any = {
        search: q.search, status: q.status,
        expiringWithin: q.expiringWithin !== undefined && q.expiringWithin !== "" ? Number(q.expiringWithin) : undefined,
        branchId: branchId ?? q.branchId, vehicleId: q.vehicleId,
      };
      const { rows, total, overCap } = await collect((page) =>
        listRegistrations({ ...filters, page, pageSize: EXPORT_PAGE_SIZE }).then((d) => ({ items: d.items, total: d.total }))
      );
      if (overCap) return { rows: [], total, overCap };
      return {
        rows: rows.map((r: any) => ({
          "Reg Number": r.regNumber,
          Vehicle: `${r.vehicle.plateNumber} (${r.vehicle.vehicleCode})`,
          Branch: r.vehicle.branch?.name ?? "", Office: r.office ?? "",
          "Reg Date": fmtDate(r.regDate), "Expiry Date": fmtDate(r.expiryDate),
          Status: label(effectiveRegistrationStatus(r.status, r.expiryDate)),
        })),
        total,
        overCap: false,
      };
    },
  },
  insurances: {
    label: "Insurances",
    fetch: async (q, branchId) => {
      const filters: any = {
        search: q.search, coverage: q.coverage, status: q.status,
        from: q.from, to: q.to,
        expiringWithin: q.expiringWithin !== undefined && q.expiringWithin !== "" ? Number(q.expiringWithin) : undefined,
        branchId: branchId ?? q.branchId, vehicleId: q.vehicleId,
      };
      const { rows, total, overCap } = await collect((page) =>
        listInsurances({ ...filters, page, pageSize: EXPORT_PAGE_SIZE }).then((d) => ({ items: d.items, total: d.total }))
      );
      if (overCap) return { rows: [], total, overCap };
      return {
        rows: rows.map((r: any) => ({
          Company: r.company, "Policy No": r.policyNo, Coverage: r.coverage,
          Status: label(effectiveInsuranceStatus(r.status, r.startDate, r.endDate)),
          Vehicle: `${r.vehicle.plateNumber} (${r.vehicle.vehicleCode})`,
          Branch: r.vehicle.branch?.name ?? "",
          "Start Date": fmtDate(r.startDate), "End Date": fmtDate(r.endDate),
        })),
        total,
        overCap: false,
      };
    },
  },
  documents: {
    label: "Documents",
    fetch: async (q, branchId) => {
      const filters: any = {
        scope: q.view === "trash" ? ("trash" as const) : ("active" as const),
        search: q.search, category: q.category, kind: q.kind, expiryState: q.expiry,
        branchId: branchId ?? q.branchId, vehicleId: q.vehicleId,
      };
      const { rows, total, overCap } = await collect((page) =>
        listFiles({ ...filters, page, pageSize: EXPORT_PAGE_SIZE }).then((d) => ({ items: d.documents, total: d.total }))
      );
      if (overCap) return { rows: [], total, overCap };
      return {
        rows: rows.map((d: any) => ({
          Title: d.title, Category: label(d.category),
          Type: d.kind === "image" ? "Image" : "Document",
          "File Name": d.originalName, Size: fmtSize(d.sizeBytes), Version: d.version,
          "Expires At": fmtDate(d.expiresAt),
          Vehicle: `${d.vehicle.plateNumber} (${d.vehicle.vehicleCode})`,
          Branch: d.vehicle.branch?.name ?? "",
          "Uploaded By": d.uploadedBy?.fullName ?? "",
          "Created At": fmtDate(d.createdAt),
        })),
        total,
        overCap: false,
      };
    },
  },
  users: {
    label: "Users",
    fetch: async (q, branchId) => {
      const filters: any = {
        search: q.search, role: q.role, status: q.status,
        branchId: branchId ?? q.branchId,
      };
      const { rows, total, overCap } = await collect((page) =>
        listUsers({ ...filters, page, pageSize: EXPORT_PAGE_SIZE }).then((d) => ({ items: d.items, total: d.total }))
      );
      if (overCap) return { rows: [], total, overCap };
      return {
        rows: rows.map((u: any) => ({
          Username: u.username, "Full Name": u.fullName, Email: u.email,
          Role: u.roleName, Branch: u.branchName ?? "", Status: u.status,
          "Last Login": u.lastLoginAt ? fmtDate(u.lastLoginAt) : "",
          "Created At": fmtDate(u.createdAt),
        })),
        total,
        overCap: false,
      };
    },
  },
  audit: {
    label: "Audit Logs",
    fetch: async (q) => {
      const filters: any = {
        action: q.action, entity: q.entity, search: q.search, from: q.from, to: q.to,
      };
      const { rows, total, overCap } = await collect((page) =>
        listAuditLogs({ ...filters, page, pageSize: EXPORT_PAGE_SIZE }).then((d) => ({ items: d.items, total: d.total }))
      );
      if (overCap) return { rows: [], total, overCap };
      return {
        rows: rows.map((r: any) => ({
          Action: r.action, Entity: r.entity, "Entity ID": r.entityId ?? "",
          "Vehicle Code": r.vehicleCode ?? "", "Plate Number": r.plateNumber ?? "",
          User: r.user, "IP Address": r.ipAddress ?? "", "User Agent": r.userAgent ?? "",
          "Created At": fmtDate(r.createdAt),
        })),
        total,
        overCap: false,
      };
    },
  },
};

export function getExporter(entity: string) {
  return (EXPORTERS as Record<string, (typeof EXPORTERS)[ExportEntity] | undefined>)[entity];
}
