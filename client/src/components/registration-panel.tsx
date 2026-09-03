
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Ban, Play, History, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { DatePicker } from "@/components/ui/datepicker";
import { RegistrationRenewModal } from "@/components/registration-modals";
import { MoreVertical } from "lucide-react";
import { formatDate, daysUntil } from "@/lib/format";
import { REGISTRATION_STATUS, label } from "@/lib/constants";
import { useToast } from "@/lib/toast-context";
import { expiryState, effectiveRegistrationStatus, type ReminderWindows } from "@/lib/services/reminders";

interface Reg {
  id: string;
  regNumber: string;
  regDate: Date | string;
  expiryDate: Date | string;
  office: string | null;
  status: string;
}

const EXPIRY_BADGE: Record<string, string> = {
  EXPIRED: "bg-red-100 text-red-700",
  CRITICAL: "bg-orange-100 text-orange-700",
  WARNING: "bg-amber-100 text-amber-700",
  OK: "bg-slate-100 text-slate-600",
};

export function RegistrationPanel({ vehicleId, initial, canRenew, canSuspend, canManage, onChanged }: {
  vehicleId: string;
  initial: Reg[];
  canRenew: boolean;
  canSuspend: boolean;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [regs, setRegs] = useState<Reg[]>(initial);
  const [renewId, setRenewId] = useState<{ id: string; expiryDate: string } | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminderWindows, setReminderWindows] = useState<ReminderWindows | undefined>(undefined);

  // Inline create — the vehicle is already known on this page, so there is no
  // picker and no supersede pre-fetch: the panel's own `regs` state already
  // knows the vehicle's live registrations.
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ regNumber: "", regDate: "", expiryDate: "", office: "" });
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});
  const [confirmSupersede, setConfirmSupersede] = useState(false);

  useEffect(() => {
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const w = d?.reminderWindows?.registration;
        if (Array.isArray(w) && w.length === 4) setReminderWindows(w as ReminderWindows);
      })
      .catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}`, { cache: "no-store" });
    const data = await res.json();
    setRegs(data.vehicle.registrations ?? []);
  }, [vehicleId]);

  const liveRegs = regs.filter((r) => r.status !== REGISTRATION_STATUS.ARCHIVED);
  const needsSupersede = liveRegs.length > 0;

  function openCreate() {
    setForm({ regNumber: "", regDate: "", expiryDate: "", office: "" });
    setFieldErrs({});
    setConfirmSupersede(false);
    setCreateOpen(true);
  }

  function validateCreate(): boolean {
    const fe: Record<string, string> = {};
    if (!form.regNumber.trim()) fe.regNumber = "Registration number is required";
    if (!form.regDate) fe.regDate = "Registration date is required";
    if (!form.expiryDate) fe.expiryDate = "Expiry date is required";
    if (form.regDate && form.expiryDate && form.regDate >= form.expiryDate) {
      fe.expiryDate = "Expiry date must be after the registration date";
    }
    setFieldErrs(fe);
    return Object.keys(fe).length === 0;
  }

  async function submitCreate() {
    if (!validateCreate()) return;
    setBusy(true);
    setFieldErrs({});
    try {
      const res = await fetch("/api/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, vehicleId, confirmSupersede }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d?.issues) {
          const fe: Record<string, string> = {};
          for (const [k, v] of Object.entries(d.issues)) fe[k] = (v as string[])[0];
          setFieldErrs(fe);
        } else if (d?.field) {
          setFieldErrs({ [d.field]: d.error ?? "Invalid value" });
        } else {
          toast("error", d?.error ?? "Failed to create registration");
        }
        return;
      }
      toast("success", "Registration created");
      setCreateOpen(false);
      await refresh();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function doRenew(date: string) {
    if (!renewId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${renewId.id}/renew`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiryDate: date }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Renewal failed"); return; }
      await refresh();
      onChanged?.();
    } finally { setBusy(false); setRenewId(null); }
  }
  async function doSuspend(note: string) {
    if (!suspendId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${suspendId}/suspend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Suspension failed"); return; }
      await refresh();
      onChanged?.();
    } finally { setBusy(false); setSuspendId(null); }
  }
  async function doResume() {
    if (!resumeId) return; setBusy(true);
    try {
      const res = await fetch(`/api/registrations/${resumeId}/resume`, { method: "POST", headers: { "Content-Type": "application/json" } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast("error", d?.error ?? "Resume failed"); return; }
      await refresh();
      onChanged?.();
    } finally { setBusy(false); setResumeId(null); }
  }

  if (regs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-4 py-6 text-center">
        <p className="text-sm text-slate-400">No registration recorded for this vehicle yet.</p>
        {canManage ? (
          <button onClick={openCreate} className="btn-outline mt-3 inline-flex items-center gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add Registration
          </button>
        ) : (
          <Link to="/registrations" className="btn-outline mt-3 inline-flex items-center gap-1.5 text-xs">
            View registrations <History className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex justify-end">
          <button onClick={openCreate} className="btn-outline text-xs">
            <Plus className="mr-1 h-3 w-3" /> Add Registration
          </button>
        </div>
      )}
      {regs.map((r) => {
        const eff = effectiveRegistrationStatus(r.status, r.expiryDate);
        const state = expiryState(r.expiryDate, reminderWindows);
        const days = daysUntil(r.expiryDate);
        const showLivePill = ["ACTIVE", "PENDING_RENEWAL", "EXPIRED"].includes(eff);
        return (
          <div key={r.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Link to={`/registrations/${r.id}/history`} className="truncate font-medium text-slate-800 hover:text-primary" title="Registration history">
                  {r.regNumber}
                </Link>
                <StatusBadge status={eff} />
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Link to={`/registrations/${r.id}/history`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary" title="History">
                  <History className="h-4 w-4" />
                </Link>
                {(canRenew || canSuspend) && (
                  <Dropdown align="right"
                    trigger={({ toggle }) => (<Tooltip content="Actions"><button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button></Tooltip>)}
                    items={eff === "SUSPENDED" ? [
                      ...(canSuspend ? [{ label: "Resume", icon: <Play className="h-4 w-4" />, onClick: () => setResumeId(r.id) }] : []),
                    ] : [
                      ...(canRenew ? [{ label: "Renew", icon: <RefreshCw className="h-4 w-4" />, onClick: () => setRenewId({ id: r.id, expiryDate: r.expiryDate as string }) }] : []),
                      ...(canSuspend ? [{ label: "Suspend", icon: <Ban className="h-4 w-4" />, danger: true, onClick: () => setSuspendId(r.id) }] : []),
                    ]}
                  />
                )}
              </div>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
              <div>Reg Date: <span className="text-slate-800">{formatDate(r.regDate)}</span></div>
              <div>Office: <span className="text-slate-800">{r.office ?? "-"}</span></div>
              <div className="sm:col-span-2">
                Expiry: <span className={showLivePill ? `badge ${EXPIRY_BADGE[state]}` : "text-slate-400"}>{formatDate(r.expiryDate)}{showLivePill ? ` · ${days !== null && days >= 0 ? `${days}d left` : "expired"}` : " · no longer current"}</span>
              </div>
            </div>
          </div>
        );
      })}

      <RegistrationRenewModal open={renewId !== null} onClose={() => setRenewId(null)} onConfirm={doRenew} loading={busy} currentExpiry={renewId?.expiryDate} />
      <SuspendModal open={suspendId !== null} onClose={() => setSuspendId(null)} onConfirm={doSuspend} loading={busy} />
      <ResumeModal open={resumeId !== null} onClose={() => setResumeId(null)} onConfirm={doResume} loading={busy} />

      <Modal open={createOpen} onClose={() => !busy && setCreateOpen(false)} title="Add Registration" footer={
        <div className="flex justify-end gap-2">
          <button className="btn-outline" onClick={() => setCreateOpen(false)} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submitCreate} disabled={busy || (needsSupersede && !confirmSupersede)}>Create</button>
        </div>
      }>
        {needsSupersede && (
          <div className="mb-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <p className="font-medium">This vehicle already has a live registration:</p>
            {liveRegs.map((s) => (
              <p key={s.id}>
                {s.regNumber} · expires {formatDate(s.expiryDate)} ({label(effectiveRegistrationStatus(s.status, s.expiryDate))})
              </p>
            ))}
            <p>Creating a new one will automatically archive it. Its history is kept.</p>
          </div>
        )}
        {needsSupersede && (
          <label className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={confirmSupersede} onChange={(e) => setConfirmSupersede(e.target.checked)} />
            I confirm this will replace the current registration.
          </label>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">Reg Number <span className="text-red-400">*</span>
            <input className="input mt-1" value={form.regNumber} onChange={(e) => { setForm({ ...form, regNumber: e.target.value }); setFieldErrs((p) => ({ ...p, regNumber: "" })); }} />
            {fieldErrs.regNumber && <p className="mt-1 text-xs text-red-500">{fieldErrs.regNumber}</p>}
          </label>
          <label className="text-sm">Office
            <input className="input mt-1" value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} />
          </label>
          <label className="text-sm">Reg Date <span className="text-red-400">*</span>
            <div className="mt-1"><DatePicker value={form.regDate} onChange={(v) => { setForm({ ...form, regDate: v }); setFieldErrs((p) => ({ ...p, regDate: "" })); }} /></div>
            {fieldErrs.regDate && <p className="mt-1 text-xs text-red-500">{fieldErrs.regDate}</p>}
          </label>
          <label className="text-sm">Expiry Date <span className="text-red-400">*</span>
            <div className="mt-1"><DatePicker value={form.expiryDate} onChange={(v) => { setForm({ ...form, expiryDate: v }); setFieldErrs((p) => ({ ...p, expiryDate: "" })); }} /></div>
            {fieldErrs.expiryDate && <p className="mt-1 text-xs text-red-500">{fieldErrs.expiryDate}</p>}
          </label>
        </div>
      </Modal>
    </div>
  );
}

function SuspendModal({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (note: string) => void; loading: boolean }) {
  const [note, setNote] = useState("");
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

function ResumeModal({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Resume Registration" footer={
      <><button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
      <button className="btn-primary" onClick={onConfirm} disabled={loading}>Resume</button></>
    }>
      <p className="text-sm text-slate-600">
        This brings the suspended registration back into service. Its status is re-derived from the expiry date.
      </p>
    </Modal>
  );
}
