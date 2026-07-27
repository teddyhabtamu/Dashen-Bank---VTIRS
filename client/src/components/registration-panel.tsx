
import { useCallback, useState } from "react";
import { RefreshCw, Ban } from "lucide-react";
import { csrfHeaders } from "@/lib/csrf";
import { StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { DatePicker } from "@/components/ui/datepicker";
import { MoreVertical } from "lucide-react";
import { formatDate, daysUntil } from "@/lib/format";
import { expiryState, effectiveRegistrationStatus } from "@/lib/services/reminders";

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

export function RegistrationPanel({ vehicleId, initial, canRenew, canSuspend }: {
  vehicleId: string;
  initial: Reg[];
  canRenew: boolean;
  canSuspend: boolean;
}) {
  const [regs, setRegs] = useState<Reg[]>(initial);
  const [renewId, setRenewId] = useState<string | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}`, { cache: "no-store" });
    const data = await res.json();
    setRegs(data.vehicle.registrations ?? []);
  }, [vehicleId]);

  async function doRenew(date: string) {
    if (!renewId) return; setBusy(true);
    try { await fetch(`/api/registrations/${renewId}/renew`, { method: "POST", headers: { "Content-Type": "application/json", ...csrfHeaders() }, body: JSON.stringify({ expiryDate: date }) }); await refresh(); }
    finally { setBusy(false); setRenewId(null); }
  }
  async function doSuspend(note: string) {
    if (!suspendId) return; setBusy(true);
    try { await fetch(`/api/registrations/${suspendId}/suspend`, { method: "POST", headers: { "Content-Type": "application/json", ...csrfHeaders() }, body: JSON.stringify({ note }) }); await refresh(); }
    finally { setBusy(false); setSuspendId(null); }
  }

  if (regs.length === 0) {
    return <p className="text-sm text-slate-400">No registration recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {regs.map((r) => {
        const eff = effectiveRegistrationStatus(r.status, r.expiryDate);
        const state = expiryState(r.expiryDate);
        const days = daysUntil(r.expiryDate);
        return (
          <div key={r.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-800">{r.regNumber}</div>
              <div className="flex items-center gap-2">
                <StatusBadge status={eff} />
                {(canRenew || canSuspend) && (
                  <Dropdown align="right"
                    trigger={({ toggle }) => (<Tooltip content="Actions"><button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button></Tooltip>)}
                    items={[
                      ...(canRenew ? [{ label: "Renew", icon: <RefreshCw className="h-4 w-4" />, onClick: () => setRenewId(r.id) }] : []),
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
                Expiry: <span className={`badge ${EXPIRY_BADGE[state]}`}>{formatDate(r.expiryDate)} · {days !== null && days >= 0 ? `${days}d left` : "expired"}</span>
              </div>
            </div>
          </div>
        );
      })}

      <RenewModal open={renewId !== null} onClose={() => setRenewId(null)} onConfirm={doRenew} loading={busy} />
      <SuspendModal open={suspendId !== null} onClose={() => setSuspendId(null)} onConfirm={doSuspend} loading={busy} />
    </div>
  );
}

function RenewModal({ open, onClose, onConfirm, loading }: { open: boolean; onClose: () => void; onConfirm: (date: string) => void; loading: boolean }) {
  const [date, setDate] = useState("");
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Renew Registration" footer={
      <><button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
      <button className="btn-primary" onClick={() => onConfirm(date)} disabled={loading || !date}>Renew</button></>
    }>
      <label className="text-sm">New Expiry Date
        <div className="mt-1">
          <DatePicker value={date} onChange={(v) => setDate(v)} />
        </div>
      </label>
    </Modal>
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
