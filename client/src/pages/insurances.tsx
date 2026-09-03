
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Download, Plus, Search, ShieldCheck, MoreVertical, CalendarRange, Pencil, Trash2, RefreshCcw, History, X, AlertOctagon } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Dropdown } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { StatusBadge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth-context";
import { useBrand } from "@/lib/brand-context";
import { useToast } from "@/lib/toast-context";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable } from "@/lib/export";
import { Tooltip } from "@/components/ui/tooltip";
import { COVERAGE_OPTIONS, label } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/rbac";
import { effectiveInsuranceStatus, type ReminderWindows } from "@/lib/services/reminders";
import { ExpiryPill } from "@/components/ui/expiry-pill.js";
import { InsuranceRenewModal } from "@/components/insurance-modals";

interface InsRow {
  id: string;
  company: string;
  policyNo: string;
  coverage: string;
  startDate: string;
  endDate: string;
  status: string;
  vehicle: { id: string; plateNumber: string; vehicleCode: string; branch?: { name: string } | null };
}

// 30-day minimum policy period — mirrors the server's MIN_INSURANCE_DAYS so
// the create/edit modal rejects miss-swapped dates before submission.
const MIN_INSURANCE_DAYS = 30;

export default function InsurancesPage() {
  const { can } = useAuth();
  const { companyName } = useBrand();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState<InsRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [coverage, setCoverage] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expiringWithin, setExpiringWithin] = useState<string | null>(searchParams.get("expiringWithin"));
  // ?vehicle=<id> deep-links from a vehicle's InsurancePanel "View all" —
  // pre-filters the list and pre-selects the vehicle when creating.
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(searchParams.get("vehicle"));
  const [branchId, setBranchId] = useState<string | null>(searchParams.get("branch"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(15);
  const [status, setStatus] = useState<string>("");
  const [branches, setBranches] = useState<{ value: string; label: string }[]>([]);
  const [reminderWindows, setReminderWindows] = useState<ReminderWindows | undefined>(undefined);

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renewRow, setRenewRow] = useState<InsRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Expiry pills and the due-within quick filter speak the admin-configured
  // reminder windows, same as the notifications and Registrations page.
  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const w = d?.reminderWindows?.registration;
        if (Array.isArray(w) && w.length === 4) setReminderWindows(w as ReminderWindows);
      })
      .catch(() => {});
    fetch("/api/reference/lookups")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.branches) setBranches(d.branches); })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (search) qs.set("search", search);
    if (coverage) qs.set("coverage", coverage);
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (expiringWithin) qs.set("expiringWithin", expiringWithin);
    if (vehicleFilter) qs.set("vehicleId", vehicleFilter);
    if (branchId) qs.set("branchId", branchId);
    try {
      const res = await fetch(`/api/insurances?${qs.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      if (data.pageSize) setPageSize(data.pageSize);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load insurances");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, coverage, from, to, expiringWithin, vehicleFilter, branchId, status]);

  useEffect(() => { load(); }, [load]);

  async function afterAction() {
    setCreateOpen(false); setEditId(null); setDeleteId(null); setRenewRow(null);
    await load();
  }

  const [form, setForm] = useState({ vehicleId: "", company: "", policyNo: "", coverage: "Comprehensive", startDate: "", endDate: "", confirmSupersede: false });
  const [vehicles, setVehicles] = useState<{ value: string; label: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  // The active policy a create would supersede — fetched lightly when a
  // vehicle is picked, so the warning names the actual policy.
  const [activePolicy, setActivePolicy] = useState<{ policyNo: string; endDate: string } | null>(null);

  async function fetchVehicles() {
    const res = await fetch("/api/vehicles?pageSize=9999");
    const data = await res.json();
    // Insuring a disposed vehicle is never the intent — keep it out of the picker.
    setVehicles((data.items ?? [])
      .filter((v: any) => v.status !== "DISPOSED")
      .map((v: any) => ({ value: v.id, label: `${v.plateNumber} (${v.vehicleCode})` })));
  }

  // Light check via the list endpoint: does the chosen vehicle already have a
  // policy in force today?
  async function checkActivePolicy(vehicleId: string) {
    setActivePolicy(null);
    setForm((f) => ({ ...f, confirmSupersede: false }));
    if (!vehicleId) return;
    try {
      const res = await fetch(`/api/insurances?vehicleId=${vehicleId}&status=CURRENT`);
      const d = await res.json();
      const current = (d?.items ?? [])[0];
      if (current) setActivePolicy({ policyNo: current.policyNo, endDate: current.endDate });
    } catch {
      setActivePolicy(null);
    }
  }

  async function openCreate() {
    setErr(null);
    setFieldErrs({});
    setForm({ vehicleId: vehicleFilter ?? "", company: "", policyNo: "", coverage: "Comprehensive", startDate: "", endDate: "", confirmSupersede: false });
    setActivePolicy(null);
    await fetchVehicles();
    if (vehicleFilter) await checkActivePolicy(vehicleFilter);
    setCreateOpen(true);
  }

  function openEdit(r: InsRow) {
    setErr(null);
    setFieldErrs({});
    setForm({
      vehicleId: r.vehicle.id,
      company: r.company,
      policyNo: r.policyNo,
      coverage: r.coverage,
      startDate: r.startDate.slice(0, 10),
      endDate: r.endDate.slice(0, 10),
      confirmSupersede: false, // meaningless in edit mode — never pre-checked
    });
    setEditId(r.id);
  }

  function validateSave(): boolean {
    const fe: Record<string, string> = {};
    if (!editId && !form.vehicleId) fe.vehicleId = "Vehicle is required";
    if (!form.company.trim()) fe.company = "Insurance company is required";
    if (!form.policyNo.trim()) fe.policyNo = "Policy number is required";
    if (!form.startDate) fe.startDate = "Start date is required";
    if (!form.endDate) fe.endDate = "End date is required";
    if (form.startDate && form.endDate) {
      if (form.endDate <= form.startDate) {
        fe.endDate = "End date must be after the start date";
      } else {
        const days = (new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / (24 * 60 * 60 * 1000);
        if (days < MIN_INSURANCE_DAYS) {
          fe.endDate = `A policy must cover at least ${MIN_INSURANCE_DAYS} days`;
        }
      }
    }
    setFieldErrs(fe);
    return Object.keys(fe).length === 0;
  }

  async function submitSave() {
    if (!validateSave()) return;
    setBusy(true); setErr(null); setFieldErrs({});
    try {
      const payload = editId
        ? { company: form.company, policyNo: form.policyNo, coverage: form.coverage, startDate: form.startDate, endDate: form.endDate }
        : form;
      const res = await fetch(editId ? `/api/insurances/${editId}` : "/api/insurances", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d?.issues) {
          const fe: Record<string, string> = {};
          for (const [k, v] of Object.entries(d.issues)) fe[k] = (v as string[])[0];
          setFieldErrs(fe);
        } else if (d?.field === "confirmSupersede") {
          setFieldErrs({ confirmSupersede: d.error ?? "Confirm superseding the active policy" });
        } else if (d?.field) {
          setFieldErrs({ [d.field]: d.error ?? "Invalid value" });
        } else {
          setErr(d?.error ?? "Failed to save");
        }
        return;
      }
      toast("success", editId ? "Insurance policy updated" : "Insurance policy created");
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doRenew(endDate: string) {
    if (!renewRow) return; setBusy(true);
    try {
      const res = await fetch(`/api/insurances/${renewRow.id}/renew`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endDate }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast("error", d?.error ?? "Renewal failed"); return; }
      toast("success", "Insurance policy renewed");
      await afterAction();
    } finally { setBusy(false); setRenewRow(null); }
  }

  async function doDelete() {
    if (!deleteId) return; setBusy(true);
    try {
      const res = await fetch(`/api/insurances/${deleteId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { toast("error", d?.error ?? "Delete failed"); return; }
      toast("success", "Insurance policy deleted");
      await afterAction();
    } finally { setBusy(false); }
  }

  const exportColumns = (r: InsRow) => ({
    Company: r.company,
    "Policy No": r.policyNo,
    Coverage: r.coverage,
    Status: label(effectiveInsuranceStatus(r.status, r.startDate, r.endDate)),
    Vehicle: `${r.vehicle.plateNumber} (${r.vehicle.vehicleCode})`,
    Branch: r.vehicle.branch?.name ?? "",
    "Start Date": formatDate(r.startDate),
    "End Date": formatDate(r.endDate),
  });

  function exportPage(format: "csv" | "excel" | "pdf") {
    const data = rows.map(exportColumns);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") exportCsv(`insurances_page${page}_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`insurances_page${page}_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable(`Insurance Policies (page ${page})`, data), `Insurance Policies (page ${page})`, companyName);
  }

  async function exportAll(format: "csv" | "excel" | "pdf") {
    const allRows: InsRow[] = [];
    const qs = new URLSearchParams();
    qs.set("pageSize", "1000");
    if (search) qs.set("search", search);
    if (coverage) qs.set("coverage", coverage);
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (expiringWithin) qs.set("expiringWithin", expiringWithin);
    if (vehicleFilter) qs.set("vehicleId", vehicleFilter);
    if (branchId) qs.set("branchId", branchId);
    try {
      for (let p = 1; p <= 50; p++) {
        qs.set("page", String(p));
        const res = await fetch(`/api/insurances?${qs.toString()}`);
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
    if (allRows.length === 0) { toast("error", "Nothing to export"); return; }
    const scope = hasFilters ? "filtered" : "all";
    const stamp = new Date().toISOString().slice(0, 10);
    const data = allRows.map(exportColumns);
    if (format === "csv") exportCsv(`insurances_${scope}_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`insurances_${scope}_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable(`Insurance Policies (${scope})`, data), `Insurance Policies (${scope})`, companyName);
    toast("success", `Exported ${allRows.length} polic${allRows.length === 1 ? "y" : "ies"}`);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilters = Boolean(search || coverage || status || from || to || expiringWithin || vehicleFilter || branchId);

  const dueWithinOptions = (reminderWindows ?? [90, 60, 30, 7])
    .slice()
    .sort((a, b) => b - a)
    .map((w) => ({ value: String(w), label: `Due within ${w} days` }));

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `"${search}"`, clear: () => setSearch("") });
  if (coverage) chips.push({ key: "cov", label: `Coverage: ${coverage}`, clear: () => setCoverage("") });
  if (status) chips.push({ key: "stat", label: `Status: ${status === "CURRENT" ? "Current" : label(status)}`, clear: () => setStatus("") });
  if (from) chips.push({ key: "from", label: `From: ${from}`, clear: () => setFrom("") });
  if (to) chips.push({ key: "to", label: `To: ${to}`, clear: () => setTo("") });
  if (expiringWithin) chips.push({
    key: "window",
    label: Number(expiringWithin) < 0 ? "Expired only" : `Expiring ≤ ${expiringWithin}d`,
    clear: () => { setExpiringWithin(null); setPage(1); navigate("/insurances", { replace: true }); },
  });
  if (branchId) chips.push({
    key: "branch",
    label: `Branch: ${branches.find((b) => b.value === branchId)?.label ?? "…"}`,
    clear: () => { setBranchId(null); setPage(1); },
  });
  if (vehicleFilter) chips.push({
    key: "vehicle",
    label: "One vehicle's policies",
    clear: () => { setVehicleFilter(null); setPage(1); navigate("/insurances", { replace: true }); },
  });

  function clearAllFilters() {
    setSearch(""); setCoverage(""); setStatus(""); setFrom(""); setTo("");
    setExpiringWithin(null); setBranchId(null); setVehicleFilter(null);
    setPage(1);
    navigate("/insurances", { replace: true });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Insurance</h2>
          <p className="text-sm text-slate-500">View and manage insurance policies across all vehicles</p>
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
          {can(PERMISSIONS.INSURANCE_MANAGE) && (
            <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> New Insurance</button>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search policy, company, plate..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select className="w-auto" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="All statuses"
            options={[
              { value: "", label: "All statuses" },
              { value: "CURRENT", label: "Current (in force today)" },
              { value: "PENDING", label: "Pending (future-dated)" },
              { value: "ACTIVE", label: label("ACTIVE") },
              { value: "EXPIRED", label: label("EXPIRED") },
              { value: "CANCELLED", label: label("CANCELLED") },
            ]} />
          <Select className="w-auto" value={coverage} onChange={(v) => { setCoverage(v); setPage(1); }}
            placeholder="All coverage"
            options={[{ value: "", label: "All coverage" }, ...COVERAGE_OPTIONS.map((c) => ({ value: c, label: c }))]} />
          <Select className="w-auto" value={branchId ?? ""} onChange={(v) => { setBranchId(v || null); setPage(1); }}
            placeholder="All branches"
            options={[{ value: "", label: "All branches" }, ...branches]} />
          <Select className="w-auto" value="" onChange={(v) => { if (v) { setExpiringWithin(v); setPage(1); } }}
            placeholder="Due within…"
            options={[{ value: "", label: "Due within…" }, ...dueWithinOptions]} />
          <div className="inline-flex w-full items-center gap-1 rounded-md border border-slate-200 px-2 py-1 sm:w-auto">
            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <DatePicker value={from} onChange={(v) => { setFrom(v); setPage(1); }} placeholder="Ends from" className="w-24" />
            <span className="text-slate-300">–</span>
            <DatePicker value={to} onChange={(v) => { setTo(v); setPage(1); }} placeholder="to" className="w-24" />
          </div>
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
      </div>

      {error ? (
        <div className="card flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertOctagon className="h-10 w-10 text-red-300" />
          <h3 className="text-base font-semibold text-slate-700">Couldn't load insurances</h3>
          <p className="text-sm text-slate-400">{error}</p>
          <button className="btn-outline mt-1" onClick={() => load()}>Try again</button>
        </div>
      ) : loading ? (
        <BrandLoader />
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">No insurance records found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {hasFilters ? "No policies match the current filters." : "Add your first insurance policy to get started."}
          </p>
          {hasFilters && (
            <button className="btn-outline mt-3" onClick={clearAllFilters}>Clear filters</button>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-medium text-slate-600">{total} policy/policies</span>
            <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const eff = effectiveInsuranceStatus(r.status, r.startDate, r.endDate);
              const showPill = eff !== "CANCELLED";
              return (
                <li key={r.id} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/insurances/${r.id}/history`} className="truncate text-sm font-semibold text-slate-800 hover:text-primary" title="Policy history">
                        {r.company}
                      </Link>
                      <StatusBadge status={eff} />
                      <span className="truncate text-xs text-slate-500">({r.coverage})</span>
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      <Link to={`/vehicles/${r.vehicle.id}`} className="text-blue-600 hover:underline">{r.vehicle.plateNumber}</Link>
                      {" · "}{r.vehicle.vehicleCode} · {r.vehicle.branch?.name ?? "-"} · Policy: {r.policyNo}
                    </div>
                  </div>
                  <div className="hidden text-right text-xs text-slate-500 sm:block">
                    <div>{formatDate(r.startDate)} – {formatDate(r.endDate)}</div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    {showPill && <ExpiryPill date={r.endDate} windows={reminderWindows} />}
                    {can(PERMISSIONS.INSURANCE_VIEW) && (
                      <Dropdown align="right"
                        trigger={({ toggle }) => (<button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions"><MoreVertical className="h-4 w-4" /></button>)}
                        items={[
                          ...(can(PERMISSIONS.INSURANCE_MANAGE) ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) }] : []),
                          ...(can(PERMISSIONS.INSURANCE_MANAGE) && r.status !== "ACTIVE" ? [
                            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(r.id) },
                          ] : []),
                          ...((can(PERMISSIONS.INSURANCE_MANAGE) || can(PERMISSIONS.INSURANCE_RENEW)) && (r.status === "ACTIVE" || r.status === "EXPIRED") ? [
                            { label: "Renew", icon: <RefreshCcw className="h-4 w-4" />, onClick: () => setRenewRow(r) },
                          ] : []),
                          { label: "History", icon: <History className="h-4 w-4" />, onClick: () => navigate(`/insurances/${r.id}/history`) },
                        ]}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}

      <Modal open={createOpen || editId !== null} onClose={() => !busy && (setCreateOpen(false), setEditId(null))}
        title={editId ? "Edit Insurance" : "New Insurance"} footer={
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={() => { setCreateOpen(false); setEditId(null); }} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submitSave} disabled={busy}>{editId ? "Save" : "Create"}</button>
        </div>
      }>
        {err && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editId && (
            <label className="text-sm sm:col-span-2">Vehicle <span className="text-red-400">*</span>
              <div className="mt-1">
                <Select
                  className="w-full"
                  value={form.vehicleId}
                  onChange={(v) => { setForm((f) => ({ ...f, vehicleId: v })); setFieldErrs((p) => ({ ...p, vehicleId: "" })); checkActivePolicy(v); }}
                  placeholder="Select vehicle…"
                  options={vehicles}
                  searchable
                />
              </div>
              {fieldErrs.vehicleId && <p className="mt-1 text-xs text-red-500">{fieldErrs.vehicleId}</p>}
            </label>
          )}
          <label className="text-sm">Company <span className="text-red-400">*</span>
            <input className="input mt-1" value={form.company} onChange={(e) => { setForm({ ...form, company: e.target.value }); setFieldErrs((p) => ({ ...p, company: "" })); }} />
            {fieldErrs.company && <p className="mt-1 text-xs text-red-500">{fieldErrs.company}</p>}
          </label>
          <label className="text-sm">Policy No <span className="text-red-400">*</span>
            <input className="input mt-1" value={form.policyNo} onChange={(e) => { setForm({ ...form, policyNo: e.target.value }); setFieldErrs((p) => ({ ...p, policyNo: "" })); }} />
            {fieldErrs.policyNo && <p className="mt-1 text-xs text-red-500">{fieldErrs.policyNo}</p>}
          </label>
          <label className="text-sm">Coverage
            <div className="mt-1">
              <Select
                className="w-full"
                value={form.coverage}
                onChange={(v) => setForm({ ...form, coverage: v })}
                options={COVERAGE_OPTIONS.map((s) => ({ value: s, label: s }))}
              />
            </div>
          </label>
          <label className="text-sm">Start Date <span className="text-red-400">*</span>
            <div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => { setForm({ ...form, startDate: v }); setFieldErrs((p) => ({ ...p, startDate: "" })); }} /></div>
            {fieldErrs.startDate && <p className="mt-1 text-xs text-red-500">{fieldErrs.startDate}</p>}
          </label>
          <label className="text-sm">End Date <span className="text-red-400">*</span>
            <div className="mt-1"><DatePicker value={form.endDate} onChange={(v) => { setForm({ ...form, endDate: v }); setFieldErrs((p) => ({ ...p, endDate: "" })); }} /></div>
            {fieldErrs.endDate && <p className="mt-1 text-xs text-red-500">{fieldErrs.endDate}</p>}
          </label>
          {!editId && activePolicy && (
            <div className="space-y-2 sm:col-span-2">
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                This vehicle already has a policy in force: <span className="font-medium">{activePolicy.policyNo}</span>,
                ending {formatDate(activePolicy.endDate)}. Creating a new one will cancel it — its history is kept.
              </div>
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={form.confirmSupersede} onChange={(e) => setForm({ ...form, confirmSupersede: e.target.checked })} />
                I confirm this will replace the current policy.
              </label>
              {fieldErrs.confirmSupersede && <p className="text-xs text-red-500">{fieldErrs.confirmSupersede}</p>}
            </div>
          )}
        </div>
      </Modal>

      <InsuranceRenewModal
        open={renewRow !== null}
        onClose={() => setRenewRow(null)}
        onConfirm={doRenew}
        loading={busy}
        currentEndDate={renewRow?.endDate}
      />

      <ConfirmModal open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={doDelete} loading={busy}
        title="Delete Insurance" message="This permanently removes the policy and its history. Policies currently in force cannot be deleted — renew, edit, or cancel them instead." confirmLabel="Delete" />
    </div>
  );
}
