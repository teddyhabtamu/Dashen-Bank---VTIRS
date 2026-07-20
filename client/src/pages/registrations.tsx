
import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search, ClipboardList, MoreVertical } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Dropdown } from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { Modal } from "@/components/ui/modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAuth } from "@/components/auth-context";
import { REGISTRATION_STATUS_OPTIONS, label } from "@/lib/constants";
import { daysUntil } from "@/lib/format";
import { expiryState, effectiveRegistrationStatus } from "@/lib/services/reminders";

interface RegRow {
  id: string;
  regNumber: string;
  regDate: string;
  expiryDate: string;
  office: string | null;
  status: string;
  vehicle: { id: string; plateNumber: string; vehicleCode: string; branch?: { name: string } | null };
}

function ExpiryPill({ date }: { date: string }) {
  const state = expiryState(date);
  const days = daysUntil(date);
  const cls =
    state === "EXPIRED" ? "bg-red-100 text-red-700"
      : state === "CRITICAL" ? "bg-orange-100 text-orange-700"
        : state === "WARNING" ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";
  const text = days !== null && days >= 0 ? `${days}d left` : "expired";
  return <span className={`badge ${cls}`}>{text}</span>;
}

export default function RegistrationsPage() {
  const { can } = useAuth();
  const [rows, setRows] = useState<RegRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setLoading(false);
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  async function afterAction() {
    setCreateOpen(false); setRenewId(null); setSuspendId(null); setDeleteId(null);
    await load();
  }

  const [form, setForm] = useState({ vehicleId: "", regNumber: "", regDate: "", expiryDate: "", office: "", status: "ACTIVE" });
  const [vehicles, setVehicles] = useState<{ value: string; label: string }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function openCreate() {
    setErr(null);
    setForm({ vehicleId: "", regNumber: "", regDate: "", expiryDate: "", office: "", status: "ACTIVE" });
    const res = await fetch("/api/vehicles?pageSize=200");
    const data = await res.json();
    setVehicles((data.items ?? []).map((v: any) => ({ value: v.id, label: `${v.plateNumber} (${v.vehicleCode})` })));
    setCreateOpen(true);
  }

  async function submitCreate() {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/registrations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error ?? "Failed to create"); return; }
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doRenew(expiryDate: string) {
    if (!renewId) return; setBusy(true);
    try {
      await fetch(`/api/registrations/${renewId}/renew`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiryDate }) });
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doSuspend(note: string) {
    if (!suspendId) return; setBusy(true);
    try {
      await fetch(`/api/registrations/${suspendId}/suspend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      await afterAction();
    } finally { setBusy(false); }
  }

  async function doDelete() {
    if (!deleteId) return; setBusy(true);
    try {
      await fetch(`/api/registrations/${deleteId}`, { method: "DELETE" });
      await afterAction();
    } finally { setBusy(false); }
  }

  const totalPages = Math.max(1, Math.ceil(total / 15));

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (search) chips.push({ key: "q", label: `“${search}”`, clear: () => setSearch("") });
  if (status) chips.push({ key: "status", label: `Status: ${label(status)}`, clear: () => setStatus("") });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Registrations</h2>
          <p className="text-sm text-slate-500">Manage vehicle registrations, renewals &amp; suspensions</p>
        </div>
        {can("registration:manage") && (
          <button className="btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> New Registration</button>
        )}
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

      {/* Results */}
      {loading ? (
        <BrandLoader />
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="mb-3 h-10 w-10 text-slate-300" />
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
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const eff = effectiveRegistrationStatus(r.status, r.expiryDate);
              return (
                <li key={r.id} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{r.regNumber}</span>
                      <StatusBadge status={eff} />
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      <Link to={`/vehicles/${r.vehicle.id}`} className="text-blue-600 hover:underline">{r.vehicle.plateNumber}</Link>
                      {" · "}{r.vehicle.vehicleCode} · {r.vehicle.branch?.name ?? "-"} · Office: {r.office ?? "-"}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-3">
                    <ExpiryPill date={r.expiryDate} />
                    <Dropdown align="right"
                      trigger={({ toggle }) => (<button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Actions"><MoreVertical className="h-4 w-4" /></button>)}
                      items={[
                        { label: "Renew", icon: <ClipboardList className="h-4 w-4" />, onClick: () => setRenewId(r.id) },
                        { label: "Suspend", icon: <ClipboardList className="h-4 w-4" />, onClick: () => setSuspendId(r.id) },
                        ...(can("registration:manage") ? [{ label: "Delete", icon: <ClipboardList className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(r.id) }] : []),
                      ]}
                    />
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

      <Modal open={createOpen} onClose={() => !busy && setCreateOpen(false)} title="New Registration" footer={
        <><button className="btn-outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={submitCreate} disabled={busy}>Create</button></>
      }>
        {err && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">Vehicle
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
          <label className="text-sm">Reg Number
            <input className="input mt-1" value={form.regNumber} onChange={(e) => setForm({ ...form, regNumber: e.target.value })} />
          </label>
          <label className="text-sm">Office
            <input className="input mt-1" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} />
          </label>
          <label className="text-sm">Reg Date
            <div className="mt-1"><DatePicker value={form.regDate} onChange={(v) => setForm({ ...form, regDate: v })} /></div>
          </label>
          <label className="text-sm">Expiry Date
            <div className="mt-1"><DatePicker value={form.expiryDate} onChange={(v) => setForm({ ...form, expiryDate: v })} /></div>
          </label>
          <label className="text-sm sm:col-span-2">Status
            <div className="mt-1">
              <Select
                className="w-full"
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v })}
                options={REGISTRATION_STATUS_OPTIONS.map((s) => ({ value: s, label: label(s) }))}
              />
            </div>
          </label>
        </div>
      </Modal>

      <RenewModal open={renewId !== null} onClose={() => setRenewId(null)} onConfirm={doRenew} loading={busy} />
      <SuspendModal open={suspendId !== null} onClose={() => setSuspendId(null)} onConfirm={doSuspend} loading={busy} />
      <ConfirmModal open={deleteId !== null} onClose={() => setDeleteId(null)} onConfirm={doDelete} loading={busy}
        title="Delete Registration" message="This permanently removes the registration and its history." confirmLabel="Delete" />
    </div>
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
      <label className="text-sm">New Expiry Date
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
