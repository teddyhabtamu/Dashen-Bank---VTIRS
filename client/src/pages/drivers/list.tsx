import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, Search, Plus, MoreVertical, Pencil, Trash2, Download, UserRound, X, AlertOctagon } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Select } from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/lib/toast-context";
import { useBrand } from "@/lib/brand-context";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable, reportFilename, type ExportMeta } from "@/lib/export";
import { PERMISSIONS } from "@/lib/rbac";

interface DriverRow {
  id: string;
  fullName: string;
  employeeId: string | null;
  licenseNo: string | null;
  phone: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  isActive: boolean;
  vehicles: { id: string; plateNumber: string; vehicleCode: string; make?: string | null; model?: string | null }[];
}

const PAGE_SIZES = [15, 25, 50, 100];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

export default function DriversPage() {
  const { can, user } = useAuth();
  const { toast } = useToast();
  const { companyName } = useBrand();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    fullName: "",
    employeeId: "",
    licenseNo: "",
    phone: "",
    departmentId: "",
    isActive: true,
  });

  useEffect(() => {
    fetch("/api/reference/lookups")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setDepartments((d.departments ?? []).map((dep: { value: string; label: string }) => ({ id: dep.value, name: dep.label })));
        setBranches((d.branches ?? []).map((b: { value: string; label: string }) => ({ id: b.value, name: b.label })));
      })
      .catch(() => setDepartments([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    qs.set("pageSize", String(pageSize));
    if (search) qs.set("search", search);
    if (deptFilter) qs.set("departmentId", deptFilter);
    if (statusFilter) qs.set("status", statusFilter);
    if (branchFilter) qs.set("branchId", branchFilter);
    if (unassignedOnly) qs.set("unassigned", "true");
    try {
      const res = await fetch(`/api/drivers?${qs.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      if (data.pageSize) setPageSize(data.pageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load drivers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, deptFilter, statusFilter, branchFilter, unassignedOnly]);

  useEffect(() => { load(); }, [load]);

  const exportColumns = (d: DriverRow) => ({
    Name: d.fullName,
    "Employee ID": d.employeeId ?? "",
    "License No": d.licenseNo ?? "",
    Phone: d.phone ?? "",
    Department: d.department?.name ?? "",
    "Current Vehicle": d.vehicles[0] ? `${d.vehicles[0].plateNumber} (${d.vehicles[0].vehicleCode})` : "",
    Status: d.isActive ? "Active" : "Inactive",
  });

  function exportMeta(scope: string): ExportMeta {
    const parts: string[] = [];
    if (search) parts.push(`Search: "${search}"`);
    if (deptFilter) parts.push(`Department: ${departments.find((d) => d.id === deptFilter)?.name ?? deptFilter}`);
    if (statusFilter) parts.push(`Status: ${statusFilter === "ACTIVE" ? "Active" : "Inactive"}`);
    if (branchFilter) parts.push(`Branch: ${branches.find((b) => b.id === branchFilter)?.name ?? branchFilter}`);
    if (unassignedOnly) parts.push("Unassigned only");
    return {
      title: "Driver Registry",
      subtitle: parts.length ? `${scope} · ${parts.join(" · ")}` : scope,
      generatedBy: user?.fullName,
    };
  }

  function toPdfMeta(meta: ExportMeta, rowCount: number) {
    return { subtitle: meta.subtitle, generatedBy: meta.generatedBy, rowCount, summary: [{ label: "Drivers", value: String(rowCount) }] };
  }

  function exportPage(format: "csv" | "excel" | "pdf") {
    const data = rows.map(exportColumns);
    const meta = exportMeta(`page ${page} of ${totalPages}`);
    const name = reportFilename("Driver Registry", `page-${page}-of-${totalPages}`);
    if (format === "csv") exportCsv(`${name}.csv`, data);
    else if (format === "excel") exportXlsx(`${name}.xlsx`, data, meta);
    else exportPdf(rowsToHtmlTable(`Drivers (page ${page} of ${totalPages})`, data), `Drivers (page ${page} of ${totalPages})`, companyName, toPdfMeta(meta, data.length));
  }

  async function exportAll(format: "csv" | "excel" | "pdf") {
    const allRows: DriverRow[] = [];
    const qs = new URLSearchParams();
    qs.set("pageSize", "1000");
    if (search) qs.set("search", search);
    if (deptFilter) qs.set("departmentId", deptFilter);
    if (statusFilter) qs.set("status", statusFilter);
    if (branchFilter) qs.set("branchId", branchFilter);
    if (unassignedOnly) qs.set("unassigned", "true");
    try {
      for (let p = 1; p <= 50; p++) {
        qs.set("page", String(p));
        const res = await fetch(`/api/drivers?${qs.toString()}`);
        if (!res.ok) throw new Error("Export fetch failed");
        const data = await res.json();
        const items = data.rows ?? [];
        allRows.push(...items);
        if (allRows.length >= (data.total ?? 0) || items.length === 0) break;
      }
    } catch {
      toast("error", "Could not collect rows for export");
      return;
    }
    if (allRows.length === 0) { toast("error", "Nothing to export"); return; }
    const scope = hasFilters ? "filtered" : "all";
    const meta = exportMeta(scope === "all" ? "Full registry" : `Filtered view (${allRows.length} of ${total})`);
    const data = allRows.map(exportColumns);
    const name = reportFilename("Driver Registry", scope);
    if (format === "csv") exportCsv(`${name}.csv`, data);
    else if (format === "excel") exportXlsx(`${name}.xlsx`, data, meta);
    else exportPdf(rowsToHtmlTable(`Drivers (${scope})`, data), `Drivers (${scope})`, companyName, toPdfMeta(meta, allRows.length));
    toast("success", `Exported ${allRows.length} driver(s)`);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(search || deptFilter || statusFilter || branchFilter || unassignedOnly);

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `"${search}"`, clear: () => setSearch("") });
  if (deptFilter) chips.push({ key: "dept", label: `Dept: ${departments.find((d) => d.id === deptFilter)?.name ?? "…"}`, clear: () => setDeptFilter("") });
  if (statusFilter) chips.push({ key: "status", label: `Status: ${statusFilter === "ACTIVE" ? "Active" : "Inactive"}`, clear: () => setStatusFilter("") });
  if (branchFilter) chips.push({ key: "branch", label: `Branch: ${branches.find((b) => b.id === branchFilter)?.name ?? "…"}`, clear: () => setBranchFilter("") });
  if (unassignedOnly) chips.push({ key: "unassigned", label: "Unassigned only", clear: () => setUnassignedOnly(false) });

  function clearAllFilters() {
    setSearch(""); setDeptFilter(""); setStatusFilter(""); setBranchFilter(""); setUnassignedOnly(false);
    setPage(1);
  }

  function resetForm() {
    setForm({ fullName: "", employeeId: "", licenseNo: "", phone: "", departmentId: "", isActive: true });
    setFieldErrors({});
    setErr(null);
  }

  function openCreate() {
    resetForm();
    setEditId(null);
    setFormOpen(true);
  }

  function openEdit(row: DriverRow) {
    resetForm();
    setEditId(row.id);
    setForm({
      fullName: row.fullName,
      employeeId: row.employeeId ?? "",
      licenseNo: row.licenseNo ?? "",
      phone: row.phone ?? "",
      departmentId: row.departmentId ?? "",
      isActive: row.isActive,
    });
    setFormOpen(true);
  }

  async function doSave() {
    setBusy(true);
    setErr(null);
    setFieldErrors({});
    const url = editId ? `/api/drivers/${editId}` : "/api/drivers";
    const method = editId ? "PATCH" : "POST";
    const body: Record<string, unknown> = {
      fullName: form.fullName,
      employeeId: form.employeeId || null,
      licenseNo: form.licenseNo || null,
      phone: form.phone || null,
      departmentId: form.departmentId || null,
      isActive: form.isActive,
    };
    try {
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        if (data.issues) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.issues)) {
            if (Array.isArray(v)) flat[k] = v[0] as string;
          }
          setFieldErrors(flat);
        }
        setErr(data.error ?? "Failed to save driver");
        return;
      }
      setFormOpen(false);
      toast("success", editId ? "Driver updated" : "Driver created");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/drivers/${deleteId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast("error", data.error ?? "Failed to delete driver");
        return;
      }
      setDeleteId(null);
      toast("success", "Driver deleted");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const canManage = can(PERMISSIONS.DRIVER_MANAGE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Driver Management</h2>
          <p className="text-sm text-slate-500">Manage drivers, their vehicles &amp; assignments</p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && !loading && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
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
          {canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="mr-1 h-4 w-4" /> Add Driver
            </button>
          )}
        </div>
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input w-full pl-9"
            placeholder="Search name, employee ID, license…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          className="w-full sm:w-48"
          value={deptFilter}
          onChange={(v) => { setDeptFilter(v); setPage(1); }}
          placeholder="All Departments"
          options={[
            { value: "", label: "All Departments" },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
          ]}
          clearable
        />
        <Select
          className="w-full sm:w-36"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1); }}
          options={STATUS_OPTIONS}
        />
        <Select
          className="w-full sm:w-44"
          value={branchFilter}
          onChange={(v) => { setBranchFilter(v); setPage(1); }}
          placeholder="All Branches"
          options={[
            { value: "", label: "All Branches" },
            ...branches.map((b) => ({ value: b.id, label: b.name })),
          ]}
          clearable
        />
        <button
          onClick={() => { setUnassignedOnly((u) => !u); setPage(1); }}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${unassignedOnly ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
        >
          <Users className="h-3.5 w-3.5" /> Unassigned only
        </button>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Active:</span>
          {chips.map((c) => (
            <button key={c.key} onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20">
              {c.label} <X className="h-3 w-3" />
            </button>
          ))}
          <button onClick={clearAllFilters} className="text-xs text-slate-400 underline hover:text-slate-600">Clear all</button>
        </div>
      )}

      <div className="card overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertOctagon className="h-10 w-10 text-red-300" />
            <h3 className="text-base font-semibold text-slate-700">Couldn't load drivers</h3>
            <p className="text-sm text-slate-400">{error}</p>
            <button className="btn-outline mt-1" onClick={() => load()}>Try again</button>
          </div>
        ) : loading ? (
          <BrandLoader />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-base font-semibold text-slate-700">No drivers found</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-400">
              {hasFilters ? "No drivers match the current filters." : "Add a driver to get started."}
            </p>
            {hasFilters && <button className="btn-outline mt-3" onClick={clearAllFilters}>Clear filters</button>}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-sm font-medium text-slate-600">{total} driver(s)</span>
              <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Employee ID</th>
                      <th className="px-4 py-3">License</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Current Vehicle</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="cursor-pointer text-sm hover:bg-slate-50" onClick={() => navigate(`/drivers/${row.id}`)} title="Open driver profile">
                      <td className="px-4 py-3">
                        <Link to={`/drivers/${row.id}`} className="inline-flex items-center gap-2 font-medium text-slate-800 hover:text-primary">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                            <UserRound className="h-3.5 w-3.5" />
                          </span>
                          {row.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.employeeId || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.licenseNo || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.department?.name || "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {row.vehicles[0] ? (
                          <Link to={`/vehicles/${row.vehicles[0].id}`} className="text-primary hover:underline">
                            {row.vehicles[0].plateNumber} <span className="text-xs text-slate-400">({row.vehicles[0].vehicleCode})</span>
                          </Link>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge ${row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Dropdown
                          align="right"
                          trigger={({ toggle }) => (
                            <button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          )}
                          items={[
                            { label: "View", icon: <UserRound className="h-4 w-4" />, onClick: () => navigate(`/drivers/${row.id}`) },
                            ...(canManage ? [
                              { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(row) },
                              { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(row.id) },
                            ] : []),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {rows.map((row) => (
                <div key={row.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/drivers/${row.id}`} className="min-w-0 flex-1 font-medium text-slate-800">
                      <span className="block truncate">
                        {row.fullName}
                        {row.employeeId && <span className="ml-2 font-mono text-xs text-slate-500">#{row.employeeId}</span>}
                      </span>
                    </Link>
                    <span className={`badge whitespace-nowrap ${row.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-slate-500">License:</span>
                    <span className="text-slate-700">{row.licenseNo || "—"}</span>
                    <span className="text-slate-500">Department:</span>
                    <span className="text-slate-700">{row.department?.name || "—"}</span>
                    <span className="text-slate-500">Vehicle:</span>
                    <span className="text-slate-700">{row.vehicles[0]?.plateNumber || "—"}</span>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Dropdown
                      align="right"
                      trigger={({ toggle }) => (
                        <button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                      items={[
                        { label: "View", icon: <UserRound className="h-4 w-4" />, onClick: () => navigate(`/drivers/${row.id}`) },
                        ...(canManage ? [
                          { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(row) },
                          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(row.id) },
                        ] : []),
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
              <div className="flex items-center gap-3">
                <span>{total} driver(s)</span>
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
                <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span>Page {page} / {totalPages}</span>
                <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => !busy && setFormOpen(false)}
        title={editId ? "Edit Driver" : "Create Driver"}
        size="lg"
        footer={
          <>
            <button className="btn-outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={doSave} disabled={busy}>
              {busy ? "Saving…" : editId ? "Save Changes" : "Create Driver"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Full Name *
            <input className={`input mt-1 ${fieldErrors.fullName ? "border-red-400" : ""}`}
              value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} disabled={busy} />
            {fieldErrors.fullName && <p className="mt-0.5 text-xs text-red-500">{fieldErrors.fullName}</p>}
          </label>
          <label className="text-sm">
            Employee ID
            <input className={`input mt-1 ${fieldErrors.employeeId ? "border-red-400" : ""}`}
              value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} disabled={busy} />
            {fieldErrors.employeeId && <p className="mt-0.5 text-xs text-red-500">{fieldErrors.employeeId}</p>}
          </label>
          <label className="text-sm">
            License No.
            <input className="input mt-1"
              value={form.licenseNo} onChange={(e) => setForm({ ...form, licenseNo: e.target.value })} disabled={busy} />
          </label>
          <label className="text-sm">
            Phone
            <span className="mt-1 block">
              <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} disabled={busy} />
            </span>
          </label>
          <label className="text-sm">
            Department
            <div className="mt-1">
              <Select
                className="w-full"
                value={form.departmentId}
                onChange={(v) => setForm({ ...form, departmentId: v })}
                options={[
                  { value: "", label: "No department" },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
                clearable
              />
            </div>
          </label>
          <label className="text-sm">
            Status
            <div className="mt-1">
              <Select
                className="w-full"
                value={form.isActive ? "ACTIVE" : "INACTIVE"}
                onChange={(v) => setForm({ ...form, isActive: v === "ACTIVE" })}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
            </div>
          </label>
        </div>
        {err && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      </Modal>

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Delete Driver"
        message="This permanently removes the driver and their entire assignment history. Drivers with active vehicle assignments cannot be deleted — return the vehicle first."
        confirmLabel="Delete"
      />
    </div>
  );
}
