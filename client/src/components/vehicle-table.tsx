import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Search, Car, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, MoreVertical, Download, X, ArrowRight } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { label, VEHICLE_STATUS_OPTIONS, MANUAL_VEHICLE_STATUS_OPTIONS } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/components/auth-context";
import { PERMISSIONS } from "@/lib/rbac";
import { useToast } from "@/lib/toast-context";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable } from "@/lib/export";
import { useBrand } from "@/lib/brand-context";

interface DriverRef {
  id: string;
  fullName: string;
  employeeId?: string | null;
  isActive?: boolean;
}
interface VehicleRow {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  make: string;
  model: string;
  year: number;
  status: string;
  type?: string;
  branch?: { name: string } | null;
  currentDriver?: DriverRef | null;
  ownerName: string;
  purchaseCost?: number | null;
}

interface BulkResult {
  deleted?: number;
  updated?: number;
  failed: number;
  errors: string[];
}

type SortKey = "vehicleCode" | "plateNumber" | "make" | "year" | "status" | "createdAt";
const PAGE_SIZES = [15, 30, 50, 100];

export function VehicleTable() {
  const { can } = useAuth();
  const { toast } = useToast();
  const { companyName } = useBrand();
  const navigate = useNavigate();

  // Hydrate from URL params (?status= etc.) so dashboard stat cards can
  // deep-link a pre-filtered registry.
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [branchId, setBranchId] = useState(searchParams.get("branch") ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [year, setYear] = useState(searchParams.get("year") ?? "");
  const [sortBy, setSortBy] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [pageSize, setPageSize] = useState(() => {
    const stored = Number(localStorage.getItem("vtirs:vehicles:pageSize"));
    return PAGE_SIZES.includes(stored) ? stored : 15;
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driverDetail, setDriverDetail] = useState<DriverRef | (DriverRef & { licenseNo?: string | null; phone?: string | null; department?: { name: string } | null }) | null>(null);
  const [driverLoading, setDriverLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkBusy, setBulkBusy] = useState<"delete" | "status" | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);

  // Filter dropdown data from the shared lookups endpoint.
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [years, setYears] = useState<number[]>([]);

  useEffect(() => {
    fetch("/api/reference/lookups")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.branches) setBranches(d.branches);
        if (d?.vehicleTypes) setTypes(d.vehicleTypes);
      })
      .catch(() => {});
    // Distinct years for the filter — computed cheaply from the first page is
    // wrong, so ask the server once via a dedicated lightweight query.
    fetch("/api/vehicles/years")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.years)) setYears(d.years); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    if (branchId) qs.set("branchId", branchId);
    if (type) qs.set("type", type);
    if (year) qs.set("year", year);
    if (sortBy) { qs.set("sortBy", sortBy); qs.set("sortDir", sortDir); }
    try {
      const res = await fetch(`/api/vehicles?${qs.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vehicles");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, status, branchId, type, year, sortBy, sortDir]);

  useEffect(() => { load(); }, [load]);

  // Selection hygiene: filters, sorting and pagination all change which rows
  // the ids refer to — drop the selection so bulk actions can never target
  // rows the user cannot currently see.
  useEffect(() => { setSelectedIds(new Set()); }, [search, status, branchId, type, year, sortBy, sortDir, page, pageSize]);

  useEffect(() => { localStorage.setItem("vtirs:vehicles:pageSize", String(pageSize)); }, [pageSize]);

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/vehicles/${deleteId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error || "Failed to delete");
        return;
      }
      setDeleteId(null);
      toast("success", "Vehicle deleted");
      load();
    } finally {
      setDeleting(false);
    }
  }

  function handleDelete(id: string) {
    setDeleteId(id);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openDriverDetail(driver: DriverRef) {
    if (!driver) return;
    setDriverDetail(driver);
    setDriverLoading(true);
    fetch(`/api/drivers/${driver.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.driver) setDriverDetail(d.driver); })
      .catch(() => {})
      .finally(() => setDriverLoading(false));
  }

  const allOnPageSelected = rows.length > 0 && rows.every((v) => selectedIds.has(v.id));

  function toggleSelectAll() {
    setSelectedIds(allOnPageSelected ? new Set() : new Set(rows.map((v) => v.id)));
  }

  async function confirmBulkDelete() {
    if (selectedIds.size === 0) return;
    setBulkBusy("delete");
    try {
      const res = await fetch("/api/vehicles/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data: BulkResult = await res.json().catch(() => ({ failed: selectedIds.size, errors: [] }));
      if (!res.ok) {
        toast("error", data.errors?.[0] || "Bulk delete failed");
        return;
      }
      if (data.failed > 0) {
        setBulkResult(data); // partial failures: show per-vehicle reasons
      } else {
        toast("success", `${data.deleted} vehicle(s) deleted`);
      }
      setSelectedIds(new Set());
      load();
    } finally {
      setBulkBusy(null);
    }
  }

  async function confirmBulkStatus() {
    if (selectedIds.size === 0 || !bulkStatus) return;
    setBulkBusy("status");
    try {
      const res = await fetch("/api/vehicles/bulk-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: bulkStatus }),
      });
      const data: BulkResult = await res.json().catch(() => ({ failed: selectedIds.size, errors: [] }));
      if (!res.ok) {
        toast("error", data.errors?.[0] || "Bulk update failed");
        return;
      }
      if (data.failed > 0) {
        setBulkResult(data);
      } else {
        toast("success", `${data.updated} vehicle(s) updated`);
      }
      setSelectedIds(new Set());
      setBulkStatus("");
      load();
    } finally {
      setBulkBusy(null);
    }
  }

  const exportColumns = (v: VehicleRow) => ({
    Code: v.vehicleCode,
    Plate: v.plateNumber,
    Make: v.make,
    Model: v.model,
    Year: v.year,
    Branch: v.branch?.name ?? "",
    Driver: v.currentDriver?.fullName ?? "",
    Owner: v.ownerName,
    Cost: v.purchaseCost ?? "",
    Status: label(v.status),
  });

  function exportPage(format: "csv" | "excel" | "pdf") {
    const data = rows.map(exportColumns);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") exportCsv(`vehicles_page${page}_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`vehicles_page${page}_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable(`Vehicles (page ${page})`, data), `Vehicles (page ${page})`, companyName);
  }

  // Exports the entire filtered registry (all pages), not just the visible
  // slice. The filename carries the active filters so a filtered export is
  // distinguishable from the full one.
  async function exportAll(format: "csv" | "excel" | "pdf") {
    const allRows: VehicleRow[] = [];
    const qs = new URLSearchParams();
    qs.set("pageSize", "1000");
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    if (branchId) qs.set("branchId", branchId);
    if (type) qs.set("type", type);
    if (year) qs.set("year", year);
    if (sortBy) { qs.set("sortBy", sortBy); qs.set("sortDir", sortDir); }
    try {
      // Page through until the server stops returning rows.
      for (let p = 1; p <= 50; p++) {
        qs.set("page", String(p));
        const res = await fetch(`/api/vehicles?${qs.toString()}`);
        if (!res.ok) throw new Error("Export fetch failed");
        const data = await res.json();
        const items = data.items ?? [];
        allRows.push(...items);
        if (allRows.length >= (data.total ?? 0) || items.length === 0) break;
      }
    } catch {
      toast("error", "Could not collect rows for export");
      return;
    }
    if (allRows.length === 0) {
      toast("error", "Nothing to export");
      return;
    }
    const scope = hasFilters ? "filtered" : "all";
    const stamp = new Date().toISOString().slice(0, 10);
    const data = allRows.map(exportColumns);
    if (format === "csv") exportCsv(`vehicles_${scope}_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`vehicles_${scope}_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable(`Vehicles (${scope})`, data), `Vehicles (${scope})`, companyName);
    toast("success", `Exported ${allRows.length} vehicle(s)`);
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  function SortHeader({ label: text, sortKey, className }: { label: string; sortKey: SortKey; className?: string }) {
    const active = sortBy === sortKey;
    return (
      <th className={`px-4 py-3 ${className ?? ""}`}>
        <button
          onClick={() => toggleSort(sortKey)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-slate-700 ${active ? "text-slate-700" : ""}`}
          title={active ? `Sorted ${sortDir === "asc" ? "ascending" : "descending"} — click to reverse` : "Click to sort"}
        >
          {text}
          {active
            ? (sortDir === "asc" ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)
            : <ChevronUp className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40" />}
        </button>
      </th>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasFilters = Boolean(search || status || branchId || type || year);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `"${search}"`, clear: () => setSearch("") });
  if (status) chips.push({ key: "status", label: `Status: ${label(status)}`, clear: () => setStatus("") });
  if (branchId) chips.push({ key: "branch", label: `Branch: ${branches.find((b) => b.value === branchId)?.label ?? "…"}`, clear: () => setBranchId("") });
  if (type) chips.push({ key: "type", label: `Type: ${type}`, clear: () => setType("") });
  if (year) chips.push({ key: "year", label: `Year: ${year}`, clear: () => setYear("") });

  const yearOptions = useMemo(
    () => years.map((y) => ({ value: String(y), label: String(y) })).sort((a, b) => Number(b.value) - Number(a.value)),
    [years]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input w-full pl-9 md:w-64"
              placeholder="Search plate, code, engine, VIN, make, model, owner…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <Select
            className="w-full md:w-40"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="All statuses"
            options={[{ value: "", label: "All statuses" }, ...VEHICLE_STATUS_OPTIONS.map((s) => ({ value: s, label: label(s) }))]}
          />
          <Select
            className="w-full md:w-44"
            value={branchId}
            onChange={(v) => { setBranchId(v); setPage(1); }}
            placeholder="All branches"
            options={[{ value: "", label: "All branches" }, ...branches]}
          />
          <Select
            className="w-full md:w-40"
            value={type}
            onChange={(v) => { setType(v); setPage(1); }}
            placeholder="All types"
            options={[{ value: "", label: "All types" }, ...types]}
          />
          <Select
            className="w-full md:w-28"
            value={year}
            onChange={(v) => { setYear(v); setPage(1); }}
            placeholder="All years"
            options={[{ value: "", label: "All years" }, ...yearOptions]}
          />
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && !loading && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline justify-center text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
              items={[
                { label: "Current view — all pages", header: true },
                { label: "CSV", onClick: () => exportAll("csv") },
                { label: "Excel", onClick: () => exportAll("excel") },
                { label: "PDF", onClick: () => exportAll("pdf") },
                { label: `This page only (${rows.length} rows)`, header: true },
                { label: "CSV", onClick: () => exportPage("csv") },
                { label: "Excel", onClick: () => exportPage("excel") },
                { label: "PDF", onClick: () => exportPage("pdf") },
              ]}
            />
          )}
          {can(PERMISSIONS.VEHICLE_CREATE) && (
            <Link to="/vehicles/new" className="btn-primary justify-center">
              <Plus className="h-4 w-4" /> Register Vehicle
            </Link>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Active:</span>
          {chips.map((c) => (
            <button key={c.key} onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={() => { setSearch(""); setStatus(""); setBranchId(""); setType(""); setYear(""); }} className="text-xs text-slate-400 underline hover:text-slate-600">
            Clear all
          </button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
          <span className="font-medium text-primary">{selectedIds.size} selected</span>
          <button className="btn-outline text-xs" onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
          {can(PERMISSIONS.VEHICLE_DELETE) && (
            <button className="btn-danger text-xs" onClick={confirmBulkDelete} disabled={bulkBusy !== null}>
              {bulkBusy === "delete" ? "Deleting…" : "Delete Selected"}
            </button>
          )}
          {can(PERMISSIONS.VEHICLE_EDIT) && (
            <label className="flex items-center gap-2 text-slate-600">
              Status
              <Select
                value={bulkStatus}
                onChange={(v) => setBulkStatus(v)}
                placeholder="Change to…"
                // ASSIGNED is auto-derived from driver assignments and would be
                // reconciled right back — only manual statuses are offered.
                options={MANUAL_VEHICLE_STATUS_OPTIONS.map((s) => ({ value: s, label: label(s) }))}
              />
            </label>
          )}
          {can(PERMISSIONS.VEHICLE_EDIT) && bulkStatus && (
            <button className="btn-primary text-xs" onClick={confirmBulkStatus} disabled={bulkBusy !== null}>
              {bulkBusy === "status" ? "Updating…" : "Apply"}
            </button>
          )}
        </div>
      )}

      {error ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
          <Car className="h-10 w-10 text-red-300" />
          <h3 className="text-base font-semibold text-slate-700">Couldn't load the registry</h3>
          <p className="text-sm text-slate-400">{error}</p>
          <button className="btn-outline mt-1" onClick={() => load()}>Try again</button>
        </div>
      ) : loading ? (
        <BrandLoader className="py-20" />
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Car className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">No vehicles found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {hasFilters
              ? "No vehicles match the current filters."
              : "Register a vehicle to start building the fleet registry."}
          </p>
          {hasFilters && (
            <button className="btn-outline mt-3" onClick={() => { setSearch(""); setStatus(""); setBranchId(""); setType(""); setYear(""); }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="space-y-3 sm:hidden">
            {rows.map((v) => (
              <div key={v.id} className="card p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      checked={selectedIds.has(v.id)}
                      onChange={() => toggleSelect(v.id)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Link to={`/vehicles/${v.id}`} className="truncate text-sm font-semibold text-slate-800 hover:text-primary">{v.plateNumber}</Link>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="truncate text-xs text-slate-400">{v.make} {v.model} · {v.year}</div>
                    </div>
                  </div>
                  <Dropdown
                    align="right"
                    trigger={({ toggle }) => (
                      <Tooltip content="Actions">
                        <button onClick={toggle} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                    items={[
                      { label: "View", icon: <Eye className="h-4 w-4" />, href: `/vehicles/${v.id}` },
                      ...(can(PERMISSIONS.VEHICLE_EDIT) ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, href: `/vehicles/${v.id}/edit` }] : []),
                      ...(can(PERMISSIONS.VEHICLE_DELETE) ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => handleDelete(v.id) }] : []),
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                  <div><span className="font-mono text-slate-600">{v.vehicleCode}</span></div>
                  <div>{v.ownerName}</div>
                  <div className="truncate">{v.branch?.name ?? "-"}</div>
                  <div className="truncate">
                    {v.currentDriver ? (
                      <button onClick={() => openDriverDetail(v.currentDriver!)} className="text-primary hover:underline cursor-pointer">
                        {v.currentDriver.fullName}
                      </button>
                    ) : "No driver"}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr className="group">
                      <th className="w-10 px-4 py-3">
                        <Tooltip content={allOnPageSelected ? "Deselect this page" : "Select this page"}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                            checked={allOnPageSelected}
                            onChange={toggleSelectAll}
                          />
                        </Tooltip>
                      </th>
                      <SortHeader label="Code" sortKey="vehicleCode" />
                      <SortHeader label="Plate" sortKey="plateNumber" />
                      <SortHeader label="Make / Model" sortKey="make" />
                      <SortHeader label="Year" sortKey="year" />
                      <th className="px-4 py-3">Branch</th>
                      <th className="px-4 py-3">Driver</th>
                      <th className="px-4 py-3">Owner</th>
                      <th className="px-4 py-3">Cost</th>
                      <SortHeader label="Status" sortKey="status" />
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((v) => (
                      <tr
                        key={v.id}
                        className={`cursor-pointer hover:bg-slate-50 ${selectedIds.has(v.id) ? "bg-primary/[0.03]" : ""}`}
                        onClick={() => navigate(`/vehicles/${v.id}`)}
                        title="Open vehicle details"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                            checked={selectedIds.has(v.id)}
                            onChange={() => toggleSelect(v.id)}
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">
                          <Link to={`/vehicles/${v.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">{v.vehicleCode}</Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          <Link to={`/vehicles/${v.id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">{v.plateNumber}</Link>
                        </td>
                        <td className="px-4 py-3">{v.make} {v.model}</td>
                        <td className="px-4 py-3">{v.year}</td>
                        <td className="px-4 py-3 text-slate-600">{v.branch?.name ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600" onClick={(e) => e.stopPropagation()}>
                          {v.currentDriver ? (
                            <button onClick={() => openDriverDetail(v.currentDriver!)} className="text-primary hover:underline cursor-pointer">
                              {v.currentDriver.fullName}
                            </button>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{v.ownerName}</td>
                        <td className="px-4 py-3">{v.purchaseCost != null ? formatCurrency(v.purchaseCost) : "-"}</td>
                        <td className="px-4 py-3"><StatusBadge status={v.status} /></td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <Dropdown
                              align="right"
                              trigger={({ toggle }) => (
                                <button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions">
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              )}
                              items={[
                                { label: "View", icon: <Eye className="h-4 w-4" />, href: `/vehicles/${v.id}` },
                                ...(can(PERMISSIONS.VEHICLE_EDIT) ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, href: `/vehicles/${v.id}/edit` }] : []),
                                ...(can(PERMISSIONS.VEHICLE_DELETE) ? [{ label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => handleDelete(v.id) }] : []),
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <div className="flex items-center gap-3">
              <span>{total} vehicle(s){hasFilters ? ` · filtered from registry` : ""}</span>
              <span className="hidden items-center gap-1.5 sm:flex">
                Rows per page
                <Select
                  className="w-20"
                  value={String(pageSize)}
                  onChange={(v) => { setPageSize(Number(v)); setPage(1); }}
                  options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))}
                  searchable={false}
                />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Tooltip content="Previous page">
                <button className="btn-outline px-2 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </Tooltip>
              <span>Page {page} / {totalPages}</span>
              <Tooltip content="Next page">
                <button className="btn-outline px-2 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete Vehicle"
        message="The vehicle will be removed permanently. Vehicles with active registrations, insurance policies, or driver assignments cannot be deleted — resolve those first."
        confirmLabel="Delete"
      />

      {/* Partial-failure report for bulk actions: the server blocks deletes
          that would orphan live records and reports per-vehicle reasons;
          show them instead of one generic toast. */}
      <Modal
        open={bulkResult !== null}
        onClose={() => setBulkResult(null)}
        title={`${bulkResult?.failed ?? 0} of ${(bulkResult?.failed ?? 0) + (bulkResult?.deleted ?? 0) + (bulkResult?.updated ?? 0)} action(s) failed`}
        description="Per-vehicle results"
        size="md"
        footer={<button className="btn-primary" onClick={() => setBulkResult(null)}>Close</button>}
      >
        <p className="mb-3 text-sm text-slate-500">
          {(bulkResult?.deleted ?? 0) > 0 && `${bulkResult!.deleted} deleted. `}
          {(bulkResult?.updated ?? 0) > 0 && `${bulkResult!.updated} updated. `}
          The following vehicle(s) were skipped:
        </p>
        <ul className="max-h-60 space-y-1.5 overflow-y-auto text-xs text-slate-600">
          {bulkResult?.errors.map((err, i) => (
            <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">{err}</li>
          ))}
        </ul>
      </Modal>

      <Modal
        open={!!driverDetail}
        onClose={() => setDriverDetail(null)}
        title={driverDetail?.fullName ?? ""}
        description="Driver details"
        size="sm"
        footer={
          driverDetail ? (
            <div className="flex justify-end gap-2">
              <button className="btn-outline" onClick={() => setDriverDetail(null)}>Close</button>
              {/* Driver profiles are readable by any authenticated user — the
                  old branch:manage gate hid this button from almost everyone. */}
              <Link to={`/drivers/${driverDetail.id}`} className="btn-primary no-underline">
                View Full Profile <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </div>
          ) : undefined
        }
      >
        {driverLoading ? (
          <BrandLoader className="py-6" />
        ) : (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Employee ID</dt>
              <dd className="font-medium text-slate-800">{(driverDetail as any)?.employeeId ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">License No</dt>
              <dd className="font-medium text-slate-800">{(driverDetail as any)?.licenseNo ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Phone</dt>
              <dd className="font-medium text-slate-800">{(driverDetail as any)?.phone ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Department</dt>
              <dd className="font-medium text-slate-800">{(driverDetail as any)?.department?.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Status</dt>
              <dd className="font-medium">{driverDetail?.isActive ? <span className="text-emerald-600">Active</span> : <span className="text-red-500">Inactive</span>}</dd>
            </div>
          </dl>
        )}
      </Modal>
    </div>
  );
}
