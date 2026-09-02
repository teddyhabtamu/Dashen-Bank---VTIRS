
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Download, Plus, Search, ShieldCheck, MoreVertical, CalendarRange, Pencil, Trash2, RefreshCcw } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Dropdown } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAuth } from "@/components/auth-context";
import { useBrand } from "@/lib/brand-context";
import { useToast } from "@/lib/toast-context";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable } from "@/lib/export";
import { Tooltip } from "@/components/ui/tooltip";
import { COVERAGE_OPTIONS } from "@/lib/constants";
import { INSURANCE_STATUS_OPTIONS } from "@/lib/constants";
import { formatDate } from "@/lib/format";

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

import { ExpiryPill } from "@/components/ui/expiry-pill.js";

export default function InsurancesPage() {
  const { can } = useAuth();
  const { companyName } = useBrand();
  const { toast } = useToast();
  const [rows, setRows] = useState<InsRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [coverage, setCoverage] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(15);

  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (search) qs.set("search", search);
    if (coverage) qs.set("coverage", coverage);
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const res = await fetch(`/api/insurances?${qs.toString()}`);
    const data = await res.json();
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    if (data.pageSize) setPageSize(data.pageSize);
    setLoading(false);
  }, [page, search, coverage, from, to]);

  useEffect(() => { load(); }, [load]);

  async function afterAction() {
    setCreateOpen(false); setEditId(null); setDeleteId(null);
    await load();
  }

  const [form, setForm] = useState({ vehicleId: "", company: "", policyNo: "", coverage: "", startDate: "", endDate: "", confirmSupersede: false });
  const [vehicles, setVehicles] = useState<{ value: string; label: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  async function openCreate() {
    setErr(null);
    setForm({ vehicleId: "", company: "", policyNo: "", coverage: "Comprehensive", startDate: "", endDate: "", confirmSupersede: false });
    const res = await fetch("/api/vehicles?pageSize=9999");
    const data = await res.json();
    setVehicles((data.items ?? []).map((v: any) => ({ value: v.id, label: `${v.plateNumber} (${v.vehicleCode})` })));
    setCreateOpen(true);
  }

  async function openEdit(r: InsRow) {
    setErr(null);
    setForm({ vehicleId: r.vehicle.id, company: r.company, policyNo: r.policyNo, coverage: r.coverage, startDate: r.startDate.slice(0, 10), endDate: r.endDate.slice(0, 10), confirmSupersede: r.status !== "ACTIVE" });
    setEditId(r.id);
  }

  async function openRenew(r: InsRow) {
    setErr(null);
    setForm({ vehicleId: r.vehicle.id, company: r.company, policyNo: r.policyNo, coverage: r.coverage, startDate: r.startDate.slice(0, 10), endDate: "", confirmSupersede: false });
    setEditId(r.id + "-renew");
    setCreateOpen(true);
  }

  async function submitSave() {
    setBusy(true); setErr(null);
    try {
      const isRenew = editId?.endsWith("-renew");
      const url = isRenew ? `/api/insurances/${editId!.replace("-renew", "")}/renew` : (editId ? `/api/insurances/${editId}` : "/api/insurances");
      const method = isRenew ? "POST" : (editId ? "PATCH" : "POST");
      const body = isRenew ? JSON.stringify({ endDate: form.endDate }) : JSON.stringify(form);
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body,
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error ?? "Failed to save"); return; }
      toast("success", isRenew ? "Insurance policy renewed" : (editId ? "Insurance policy updated" : "Insurance policy created"));
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doDelete() {
    if (!deleteId) return; setBusy(true);
    try {
      await fetch(`/api/insurances/${deleteId}`, { method: "DELETE" });
      toast("success", "Insurance policy deleted");
      await afterAction();
    } finally { setBusy(false); }
  }

  function exportInsurances(format: "csv" | "excel" | "pdf") {
    const data = rows.map((r) => ({
      Company: r.company,
      "Policy No": r.policyNo,
      Coverage: r.coverage,
      "Start Date": r.startDate,
      "End Date": r.endDate,
      Vehicle: `${r.vehicle.plateNumber} (${r.vehicle.vehicleCode})`,
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") exportCsv(`insurances_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`insurances_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable("Insurance Policies", data), "Insurance Policies", companyName);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `"${search}"`, clear: () => setSearch("") });
  if (coverage) chips.push({ key: "cov", label: `Coverage: ${coverage}`, clear: () => setCoverage("") });
  if (status) chips.push({ key: "stat", label: `Status: ${status}`, clear: () => setStatus("") });
  if (from) chips.push({ key: "from", label: `From: ${from}`, clear: () => setFrom("") });
  if (to) chips.push({ key: "to", label: `To: ${to}`, clear: () => setTo("") });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Insurance</h2>
          <p className="text-sm text-slate-500">View and manage insurance policies across all vehicles</p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
              items={[
                { label: "CSV", onClick: () => exportInsurances("csv") },
                { label: "Excel", onClick: () => exportInsurances("excel") },
                { label: "PDF", onClick: () => exportInsurances("pdf") },
              ]}
            />
          )}
          {can("insurance:manage") && (
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
<Select className="w-auto" value={coverage} onChange={(v) => { setCoverage(v); setPage(1); }}
          placeholder="All coverage"
          options={[{ value: "", label: "All coverage" }, ...COVERAGE_OPTIONS.map((c) => ({ value: c, label: c }))]} />
          <Select className="w-auto" value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="All status"
            options={[{ value: "", label: "All status" }, ...INSURANCE_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))]} />
          <div className="inline-flex w-full items-center gap-1 rounded-md border border-slate-200 px-2 py-1 sm:w-auto">
            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <DatePicker value={from} onChange={(v) => { setFrom(v); setPage(1); }} placeholder="End from" className="w-24" />
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
                {c.label} <span className="text-primary/60">✕</span>
              </button>
            ))}
            <button onClick={() => { setSearch(""); setCoverage(""); setFrom(""); setTo(""); }} className="text-xs text-slate-400 underline hover:text-slate-600">Clear all</button>
          </div>
        )}
      </div>

      {loading ? (
        <BrandLoader />
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">No insurance records found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {search ? "No policies match the current search." : "Add your first insurance policy to get started."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-medium text-slate-600">{total} policy/policies</span>
            <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-800">{r.company}</span>
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
                  <ExpiryPill date={r.endDate} />
                  {can("insurance:manage") && (
                    <Dropdown align="right"
                      trigger={({ toggle }) => (<button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions"><MoreVertical className="h-4 w-4" /></button>)}
                      items={[
                        { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) },
                        ...(r.status === "ACTIVE" ? [] : [
                          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(r.id) },
                        ]),
                        ...(r.status === "ACTIVE" || r.status === "EXPIRED" ? [
                          { label: "Renew", icon: <RefreshCcw className="h-4 w-4" />, onClick: () => openRenew(r) },
                        ] : []),
                      ]}
                    />
                  )}
                  {can("insurance:view") && (
                    <Link to={`/insurances/${r.id}/history`} className="underline text-slate-400 hover:text-slate-600" title="View History">
                      History
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}

      <Modal open={createOpen || editId !== null} onClose={() => !busy && (setCreateOpen(false), setEditId(null))}
        title={editId ? "Edit Insurance" : "New Insurance"} footer={
        <><button className="btn-outline" onClick={() => { setCreateOpen(false); setEditId(null); }} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={submitSave} disabled={busy}>{editId ? "Save" : "Create"}</button></>
      }>
        {err && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!editId && (
            <label className="text-sm sm:col-span-2">Vehicle <span className="text-red-400">*</span>
              <div className="mt-1">
                <Select
                  className="w-full"
                  value={form.vehicleId}
                  onChange={(v) => setForm({ ...form, vehicleId: v })}
                  placeholder="Select vehicle…"
                  options={vehicles}
                  searchable
                />
              </div>
            </label>
          )}
          <label className="text-sm">Company <span className="text-red-400">*</span>
            <input className="input mt-1" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </label>
          <label className="text-sm">Policy No <span className="text-red-400">*</span>
            <input className="input mt-1" value={form.policyNo} onChange={(e) => setForm({ ...form, policyNo: e.target.value })} />
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
            <div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} /></div>
          </label>
          <label className="text-sm">End Date <span className="text-red-400">*</span>
            <div className="mt-1"><DatePicker value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} /></div>
          </label>
          <div className="mt-2">
            <input type="checkbox" checked={form.confirmSupersede} onChange={(e) => setForm({ ...form, confirmSupersede: e.target.checked })} className="rounded-md accent-color-primary" />
            <span className="ml-2 text-xs text-slate-500">Confirm to supersede existing active policy</span>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={doDelete} loading={busy}
        title="Delete Insurance" message="This permanently removes the insurance record." confirmLabel="Delete" />
    </div>
  );
}
