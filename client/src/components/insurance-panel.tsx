import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, MoreVertical, Pencil, Trash2, History, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { Tooltip } from "@/components/ui/tooltip";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { InsuranceRenewModal } from "@/components/insurance-modals";
import { formatDate, daysUntil } from "@/lib/format";
import { COVERAGE_OPTIONS } from "@/lib/constants";

interface Ins {
  id: string;
  company: string;
  policyNo: string;
  coverage: string;
  startDate: Date | string;
  endDate: Date | string;
  status?: string;
}

const EXPIRY_BADGE: Record<string, string> = {
  EXPIRED: "bg-red-100 text-red-700",
  CRITICAL: "bg-orange-100 text-orange-700",
  WARNING: "bg-amber-100 text-amber-700",
  OK: "bg-slate-100 text-slate-600",
};



export function InsurancePanel({ vehicleId, initial, canManage }: {
  vehicleId: string;
  initial: Ins[];
  canManage: boolean;
}) {
  const [items, setItems] = useState<Ins[]>(initial);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [renewIns, setRenewIns] = useState<Ins | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    company: "",
    policyNo: "",
    coverage: "",
    startDate: "",
    endDate: "",
  });

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}`, { cache: "no-store" });
    const data = await res.json();
    setItems(data.vehicle.insurances ?? []);
  }, [vehicleId]);

  function resetForm() {
    setForm({ company: "", policyNo: "", coverage: "", startDate: "", endDate: "" });
    setErr(null);
  }

  function openCreate() {
    resetForm();
    setEditId(null);
    setFormOpen(true);
  }

  function openEdit(ins: Ins) {
    setForm({
      company: ins.company,
      policyNo: ins.policyNo,
      coverage: ins.coverage,
      startDate: typeof ins.startDate === "string" ? ins.startDate.slice(0, 10) : ins.startDate.toISOString().slice(0, 10),
      endDate: typeof ins.endDate === "string" ? ins.endDate.slice(0, 10) : ins.endDate.toISOString().slice(0, 10),
    });
    setEditId(ins.id);
    setErr(null);
    setFormOpen(true);
  }

  async function doSave() {
    setBusy(true);
    setErr(null);
    try {
      const body = { ...form, vehicleId };
      const url = editId ? `/api/insurances/${editId}` : "/api/insurances";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.issues ? Object.values(data.issues).flat().join(", ") : data.error ?? "Failed to save");
        return;
      }
      setFormOpen(false);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await fetch(`/api/insurances/${deleteId}`, { method: "DELETE" });
      setDeleteId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function doRenew(endDate: string) {
    if (!renewIns) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/insurances/${renewIns.id}/renew`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endDate }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error ?? "Renewal failed");
        return;
      }
      setErr(null);
      await refresh();
    } finally {
      setBusy(false);
      setRenewIns(null);
    }
  }

  if (items.length === 0 && !canManage) {
    return <p className="text-sm text-slate-400">No insurance policy recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 p-4">
          <p className="text-sm text-slate-400">No insurance policy recorded yet.</p>
          {canManage && (
            <button className="btn-outline text-xs" onClick={openCreate}>
              <Plus className="mr-1 h-3 w-3" /> Add Insurance
            </button>
          )}
        </div>
      ) : (
        <>
          {canManage && (
            <div className="flex justify-end">
              <button className="btn-outline text-xs" onClick={openCreate}>
                <Plus className="mr-1 h-3 w-3" /> Add Insurance
              </button>
            </div>
          )}
          {items.map((ins) => {
            const days = daysUntil(ins.endDate);
            const state = days !== null ? (days < 0 ? "EXPIRED" : days <= 7 ? "CRITICAL" : days <= 30 ? "WARNING" : "OK") : "OK";
            return (
              <div key={ins.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate font-medium text-slate-800">{ins.company}</div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className={`badge ${EXPIRY_BADGE[state]}`}>
                      {days !== null && days >= 0 ? `${days}d left` : "expired"}
                    </span>
                    <Link to={`/insurances/${ins.id}/history`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primary" title="Policy history">
                      <History className="h-4 w-4" />
                    </Link>
                    {canManage && (
                      <Dropdown align="right"
                        trigger={({ toggle }) => (<Tooltip content="Actions"><button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button></Tooltip>)}
                        items={[
                          { label: "Edit", icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(ins) },
                          ...(ins.status === "ACTIVE" || ins.status === "EXPIRED" ? [
                            { label: "Renew", icon: <RefreshCw className="h-4 w-4" />, onClick: () => setRenewIns(ins) },
                          ] : []),
                          { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDeleteId(ins.id) },
                        ]}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                  <div>Policy No: <span className="text-slate-800">{ins.policyNo}</span></div>
                  <div>Coverage: <span className="text-slate-800">{ins.coverage}</span></div>
                  <div>Start: <span className="text-slate-800">{formatDate(ins.startDate)}</span></div>
                  <div>End: <span className="text-slate-800">{formatDate(ins.endDate)}</span></div>
                </div>
              </div>
            );
          })}
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => !busy && setFormOpen(false)}
        title={editId ? "Edit Insurance" : "Add Insurance"}
        size="lg"
        footer={
          <><button className="btn-outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={doSave} disabled={busy}>{busy ? "Saving…" : editId ? "Save Changes" : "Add Insurance"}</button></>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">Insurance Company *
            <input className="input mt-1" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} disabled={busy} />
          </label>
          <label className="text-sm">Policy Number *
            <input className="input mt-1" value={form.policyNo} onChange={(e) => setForm({ ...form, policyNo: e.target.value })} disabled={busy} />
          </label>
          <label className="text-sm">Coverage Type *
            <div className="mt-1">
              <Select className="w-full" value={form.coverage} onChange={(v) => setForm({ ...form, coverage: v })} options={COVERAGE_OPTIONS.map((s) => ({ value: s, label: s }))} />
            </div>
          </label>
          <label className="text-sm">Start Date *
            <div className="mt-1"><DatePicker value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} /></div>
          </label>
          <label className="text-sm">End Date *
            <div className="mt-1"><DatePicker value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} /></div>
          </label>
        </div>
        {err && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      </Modal>

      <ConfirmModal
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Delete Insurance"
        message="This permanently removes this insurance policy."
        confirmLabel="Delete"
      />

      <InsuranceRenewModal
        open={renewIns !== null}
        onClose={() => setRenewIns(null)}
        onConfirm={doRenew}
        loading={busy}
        currentEndDate={renewIns?.endDate as string | undefined}
      />
    </div>
  );
}
