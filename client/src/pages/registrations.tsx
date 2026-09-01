import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search, MoreVertical, History, RotateCcw, AlertCircle, Archive, RefreshCw, Download, ClipboardList, Pencil, Play } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useBrand } from "@/lib/brand-context";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAuth } from "@/components/auth-context";
import { REGISTRATION_STATUS, REGISTRATION_STATUS_OPTIONS, label } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { useToast } from "@/lib/toast-context";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable } from "@/lib/export";
import { effectiveRegistrationStatus, type ReminderWindows } from "@/lib/services/reminders";

interface RegRow {
  id: string;
  regNumber: string;
  regDate: string;
  expiryDate: string;
  office: string | null;
  status: string;
  vehicle: { id: string; plateNumber: string; vehicleCode: string; branch?: { name: string } | null };
}

import { ExpiryPill } from "@/components/ui/expiry-pill.js";

export default function RegistrationsPage() {
  const { can } = useAuth();
  const { companyName } = useBrand();
  const { toast } = useToast();
  const navigate = useNavigate();
  const CURRENT = "CURRENT";
  const [rows, setRows] = useState<RegRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(CURRENT);
  const [loading, setLoading] = useState(true);
  const [pageSize, setPageSize] = useState(15);

  const [createOpen, setCreateOpen] = useState(false);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<RegRow | null>(null);
  const [editForm, setEditForm] = useState({ regNumber: "", office: "", regDate: "", expiryDate: "" });
  const [editErr, setEditErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminderWindows, setReminderWindows] = useState<ReminderWindows | undefined>(undefined);

  // Expiry pills use the admin-configured reminder windows instead of hardcoded
  // thresholds, so badge severity matches the notification settings.
  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const w = d?.reminderWindows?.registration;
        if (Array.isArray(w) && w.length === 4) setReminderWindows(w as ReminderWindows);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (search) qs.set("search", search);
    if (status) qs.set("status", status);
    const res = await fetch(`/api/registrations?${qs.toString()}`);
    const data = await res.json();
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    if (data.pageSize) setPageSize(data.pageSize);
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  async function afterAction() {
    setCreateOpen(false); setRenewId(null); setSuspendId(null); setResumeId(null); setDeleteId(null); setArchiveId(null); setRestoreId(null); setEditRow(null);
    await load();
  }

  const [form, setForm] = useState({ vehicleId: "", regNumber: "", regDate: "", expiryDate: "", office: "", status: "ACTIVE" });
  const [vehicles, setVehicles] = useState<{ value: string; label: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [supersedeRegs, setSupersedeRegs] = useState<string[]>([]);
  const [confirmSupersede, setConfirmSupersede] = useState(false);

  // If the selected vehicle already has a live (non-archived) registration, a
  // new one will supersede it — surface that before the create is allowed.
  async function checkSupersede(vehicleId: string) {
    setSupersedeRegs([]);
    setConfirmSupersede(false);
    if (!vehicleId) return;
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`);
      const d = await res.json();
      const regs: { status: string; regNumber: string }[] = d?.vehicle?.registrations ?? [];
      const live = regs.filter((r) => r.status !== REGISTRATION_STATUS.ARCHIVED);
      setSupersedeRegs(live.map((r) => r.regNumber));
    } catch {
      setSupersedeRegs([]);
    }
  }

  async function openCreate() {
    setErr(null);
    setForm({ vehicleId: "", regNumber: "", regDate: "", expiryDate: "", office: "", status: "ACTIVE" });
    setSupersedeRegs([]);
    setConfirmSupersede(false);
    const res = await fetch("/api/vehicles?pageSize=9999");
    const data = await res.json();
    setVehicles((data.items ?? []).map((v: any) => ({ value: v.id, label: `${v.plateNumber} (${v.vehicleCode})` })));
    setCreateOpen(true);
  }

  async function submitCreate() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/registrations", {
        method: "POST" as const, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, confirmSupersede }),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error ?? "Failed to create"); return; }
      toast("success", "Registration created");
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doRenew(expiryDate: string) {
    if (!renewId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${renewId}/renew`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiryDate }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Renewal failed"); return; }
      toast("success", "Registration renewed");
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doSuspend(note: string) {
    if (!suspendId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${suspendId}/suspend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Suspension failed"); return; }
      toast("warning", "Registration suspended");
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doResume() {
    if (!resumeId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${resumeId}/resume`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Resume failed"); return; }
      toast("success", "Registration resumed");
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doDelete() {
    if (!deleteId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${deleteId}`, { method: "DELETE" });
      if (!res.ok) { toast("error", "Delete failed"); return; }
      toast("success", "Registration deleted");
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doArchive(note: string) {
    if (!archiveId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${archiveId}/archive`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Archive failed"); return; }
      toast("info", "Registration archived");
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doRestore() {
    if (!restoreId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${restoreId}/restore`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Restore failed"); return; }
      toast("success", "Registration restored");
      await afterAction();
    } finally { setBusy(false); }
  }

  function openEdit(row: RegRow) {
    setEditErr(null);
    setEditForm({
      regNumber: row.regNumber,
      office: row.office ?? "",
      regDate: row.regDate.slice(0, 10),
      expiryDate: row.expiryDate.slice(0, 10),
    });
    setEditRow(row);
  }

  async function doEdit() {
    if (!editRow) return; setBusy(true); setEditErr(null);
    try {
      const res = await fetch(`/api/registrations/${editRow.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editForm),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fieldMsg = d?.issues ? Object.values(d.issues).flat()[0] : null;
        setEditErr(fieldMsg ?? d?.error ?? "Failed to update");
        return;
      }
      toast("success", "Registration updated");
      await afterAction();
    } finally { setBusy(false); }
  }

  function exportRegistrations(format: "csv" | "excel" | "pdf") {
    const data = rows.map((r) => ({
      "Reg Number": r.regNumber,
      Vehicle: `${r.vehicle.plateNumber} (${r.vehicle.vehicleCode})`,
      Office: r.office ?? "",
      "Reg Date": r.regDate,
      "Expiry Date": r.expiryDate,
      Status: label(effectiveRegistrationStatus(r.status, r.expiryDate)),
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") exportCsv(`registrations_${stamp}.csv`, data);
    else if (format === "excel") exportXlsx(`registrations_${stamp}.xlsx`, data);
    else exportPdf(rowsToHtmlTable("Registrations", data), "Registrations", companyName);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `“${search}”`, clear: () => setSearch("") });
  if (status) chips.push({ key: "status", label: `Status: ${status === CURRENT ? "Current" : label(status)}`, clear: () => setStatus("") });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Registrations</h2>
          <p className="text-sm text-slate-500">Manage vehicle registrations, renewals &amp; suspensions</p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
              items={[
                { label: "CSV", onClick: () => exportRegistrations("csv") },
                { label: "Excel", onClick: () => exportRegistrations("excel") },
                { label: "PDF", onClick: () => exportRegistrations("pdf") },
              ]}
            />
          )}
          {can("registration:manage") && (
            <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> New Registration</button>
          )}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search reg no, plate, office..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select
            className="w-auto"
            value={status}
            onChange={(v) => { setStatus(v); setPage(1); }}
            placeholder="All statuses"
            options={[
              { value: "", label: "All statuses" },
              { value: CURRENT, label: "Current (Active / Pending renewal)" },
              ...REGISTRATION_STATUS_OPTIONS.map((s) => ({ value: s, label: label(s) })),
            ]}
          />
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
            <button onClick={() => { setSearch(""); setStatus(""); }} className="text-xs text-slate-400 underline hover:text-slate-600">Clear all</button>
          </div>
        )}
      </div>

      {loading ? (
        <BrandLoader />
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Search className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">No registrations found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {search || status ? "No registrations match the current filters." : "Register your first vehicle registration to get started."}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
            <span className="text-sm font-medium text-slate-600">{total} registration(s)</span>
            <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {rows.map((r) => {
              const eff = effectiveRegistrationStatus(r.status, r.expiryDate);
              return (
                <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{r.regNumber}</span>
                      <StatusBadge status={eff} />
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                      <Link to={`/vehicles/${r.vehicle.id}`} className="font-medium text-blue-600 hover:underline">{r.vehicle.plateNumber}</Link>
                      <span>·</span>
                      <span>{r.vehicle.vehicleCode}</span>
                      <span>·</span>
                      <span>{r.vehicle.branch?.name ?? "-"}</span>
                      {r.office && <><span>·</span><span>{r.office}</span></>}
                      <span>·</span>
                      <span>Reg {formatDate(r.regDate)}</span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    {(["ACTIVE", "PENDING_RENEWAL", "EXPIRED"] as string[]).includes(eff) && (
                      <ExpiryPill date={r.expiryDate} windows={reminderWindows} />
                    )}
                    <Dropdown align="right"
                      trigger={({ toggle }) => (
                        <button onClick={toggle} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Actions">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                      items={eff === "ARCHIVED" ? [
                        ...(can("registration:manage") ? [{ label: "Restore", icon: <RotateCcw className="h-4 w-4" />, onClick: () => setRestoreId(r.id) }] : []),
                        { label: "History", icon: <History className="h-4 w-4" />, onClick: () => navigate(`/registrations/${r.id}/history`) },
                      ] : eff === "SUSPENDED" ? [
                        ...(can("registration:manage") ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) }] : []),
                        ...(can("registration:suspend") ? [{ label: "Resume", icon: <Play className="h-4 w-4" />, onClick: () => setResumeId(r.id) }] : []),
                        { label: "History", icon: <History className="h-4 w-4" />, onClick: () => navigate(`/registrations/${r.id}/history`) },
                        ...(can("registration:manage") ? [{ label: "Archive", icon: <Archive className="h-4 w-4" />, onClick: () => setArchiveId(r.id) }] : []),
                      ] : [
                        ...(can("registration:manage") ? [{ label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(r) }] : []),
                        ...(can("registration:renew") ? [{ label: "Renew", icon: <RefreshCw className="h-4 w-4" />, onClick: () => setRenewId(r.id) }] : []),
                        ...(can("registration:suspend") ? [{ label: "Suspend", icon: <AlertCircle className="h-4 w-4" />, onClick: () => setSuspendId(r.id) }] : []),
                        { label: "History", icon: <History className="h-4 w-4" />, onClick: () => navigate(`/registrations/${r.id}/history`) },
                        ...(can("registration:manage") ? [{ label: "Archive", icon: <Archive className="h-4 w-4" />, onClick: () => setArchiveId(r.id) }] : []),
                      ]}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}

      {/* Modals (unchanged) */}
      <Modal open={createOpen} onClose={() => !busy && setCreateOpen(false)} title="New Registration" footer={
        <><button className="btn-outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={submitCreate} disabled={busy || (supersedeRegs.length > 0 && !confirmSupersede)}>Create</button></>
      }>
        {err && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        {supersedeRegs.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            This vehicle already has a live registration ({supersedeRegs.join(", ")}). Creating a new one will automatically archive it.
          </div>
        )}
        {supersedeRegs.length > 0 && (
          <label className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={confirmSupersede} onChange={(e) => setConfirmSupersede(e.target.checked)} />
            I confirm this will replace the current registration.
          </label>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Vehicle <span className="text-red-400">*</span>
            <div className="mt-1">
              <Select className="w-full" value={form.vehicleId} onChange={(v) => { setForm({ ...form, vehicleId: v }); checkSupersede(v); }}
                placeholder="Select vehicle…" options={vehicles} searchable />
            </div>
          </label>
          <label className="text-sm">Reg Number <span className="text-red-400">*</span>
            <input className="input mt-1" value={form.regNumber} onChange={(e) => setForm({ ...form, regNumber: e.target.value })} />
          </label>
          <label className="text-sm">Office
            <input className="input mt-1" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} />
          </label>
          <label className="text-sm">Reg Date <span className="text-red-400">*</span>
            <div className="mt-1"><DatePicker value={form.regDate} onChange={(v) => setForm({ ...form, regDate: v })} /></div>
          </label>
          <label className="text-sm">Expiry Date <span className="text-red-400">*</span>
            <div className="mt-1"><DatePicker value={form.expiryDate} onChange={(v) => setForm({ ...form, expiryDate: v })} /></div>
          </label>
        </div>
      </Modal>

      <EditRegModal open={editRow !== null} row={editRow} form={editForm} onChange={setEditForm}
        error={editErr} onClose={() => !busy && setEditRow(null)} onSave={doEdit} loading={busy} />

      <RenewModal open={renewId !== null} onClose={() => setRenewId(null)} onConfirm={doRenew} loading={busy} />
      <SuspendModal open={suspendId !== null} onClose={() => setSuspendId(null)} onConfirm={doSuspend} loading={busy} />
      <ArchiveModal open={archiveId !== null} onClose={() => setArchiveId(null)} onConfirm={doArchive} loading={busy} />
      <ConfirmModal open={restoreId !== null} onClose={() => setRestoreId(null)} onConfirm={doRestore} loading={busy}
        title="Restore Registration" message="This will restore the registration from the archive. Its status is re-derived from the expiry date." confirmLabel="Restore" />
      <ConfirmModal open={resumeId !== null} onClose={() => setResumeId(null)} onConfirm={doResume} loading={busy}
        title="Resume Registration" message="This brings the suspended registration back into service. Its status is re-derived from the expiry date." confirmLabel="Resume" />
      <ConfirmModal open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={doDelete} loading={busy}
        title="Delete Registration" message="This permanently removes the registration and its history." confirmLabel="Delete" />
    </div>
  );
}

function EditRegModal({ open, row, form, onChange, error, onClose, onSave, loading }: {
  open: boolean;
  row: RegRow | null;
  form: { regNumber: string; office: string; regDate: string; expiryDate: string };
  onChange: (v: { regNumber: string; office: string; regDate: string; expiryDate: string }) => void;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Edit Registration" footer={
      <><button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
      <button className="btn-primary" onClick={onSave} disabled={loading}>Save Changes</button></>
    }>
      {error && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm sm:col-span-2">Vehicle
          <div className="mt-1 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {row?.vehicle.plateNumber} ({row?.vehicle.vehicleCode}){row?.vehicle.branch?.name ? ` · ${row?.vehicle.branch.name}` : ""}
          </div>
        </label>
        <label className="text-sm">Reg Number <span className="text-red-400">*</span>
          <input className="input mt-1" value={form.regNumber} onChange={(e) => onChange({ ...form, regNumber: e.target.value })} />
        </label>
        <label className="text-sm">Office
          <input className="input mt-1" value={form.office} onChange={(e) => onChange({ ...form, office: e.target.value })} />
        </label>
        <label className="text-sm">Reg Date <span className="text-red-400">*</span>
          <div className="mt-1"><DatePicker value={form.regDate} onChange={(v) => onChange({ ...form, regDate: v })} /></div>
        </label>
        <label className="text-sm">Expiry Date <span className="text-red-400">*</span>
          <div className="mt-1"><DatePicker value={form.expiryDate} onChange={(v) => onChange({ ...form, expiryDate: v })} /></div>
        </label>
      </div>
    </Modal>
  );
}

function RenewModal({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (date: string) => void; loading: boolean }) {
  const [date, setDate] = useState("");
  useEffect(() => { if (open) setDate(""); }, [open]);
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Renew Registration" footer={
      <><button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
      <button className="btn-primary" onClick={() => onConfirm(date)} disabled={loading || !date}>Renew</button></>
    }>
      <label className="text-sm">New Expiry Date <span className="text-red-400">*</span>
        <div className="mt-1"><DatePicker value={date} onChange={(v) => setDate(v)} /></div>
      </label>
    </Modal>
  );
}

function SuspendModal({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (note: string) => void; loading: boolean }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (open) setNote(""); }, [open]);
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Suspend Registration" footer={
      <><button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
      <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => onConfirm(note)} disabled={loading}>Suspend</button></>
    }>
      <label className="text-sm">Reason (optional)
        <textarea className="input mt-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}

function ArchiveModal({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (note: string) => void; loading: boolean }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (open) setNote(""); }, [open]);
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Archive Registration" footer={
      <><button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
      <button className="btn-primary" onClick={() => onConfirm(note)} disabled={loading}>Archive</button></>
    }>
      <p className="mb-3 text-sm text-slate-500">The registration will be archived and moved out of active views. It can be restored later.</p>
      <label className="text-sm">Reason (optional)
        <textarea className="input mt-1" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
    </Modal>
  );
}
