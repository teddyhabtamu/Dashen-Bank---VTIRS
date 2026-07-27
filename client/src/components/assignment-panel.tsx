import { useCallback, useEffect, useState } from "react";
import { Plus, MoreVertical, UserCheck, Calendar, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Tooltip } from "@/components/ui/tooltip";
import { csrfHeaders } from "@/lib/csrf";
import { Dropdown } from "@/components/ui/dropdown";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { formatDate } from "@/lib/format";

interface Driver {
  value: string;
  label: string;
  phone?: string;
  occupied?: boolean;
}

interface Assignment {
  id: string;
  driverId: string | null;
  driver: { id: string; fullName: string; licenseNo?: string; phone?: string } | null;
  branch: { id: string; name: string } | null;
  assignedAt: string;
  returnedAt: string | null;
  note: string | null;
}

export function AssignmentPanel({ vehicleId, initial, currentDriver, canManage }: {
  vehicleId: string;
  initial: Assignment[];
  currentDriver?: any;
  canManage: boolean;
}) {
  const [items, setItems] = useState<Assignment[]>(initial);
  const [assignOpen, setAssignOpen] = useState(false);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [formalizeOpen, setFormalizeOpen] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/vehicles/${vehicleId}/assignments`, { cache: "no-store" });
    const data = await res.json();
    setItems(data.assignments ?? []);
  }, [vehicleId]);

  useEffect(() => {
    if (assignOpen || formalizeOpen) {
      fetch("/api/reference/lookups")
        .then((r) => r.json())
        .then((d) => {
          setDrivers((d.drivers ?? []).map((dr: any) => ({ value: dr.value, label: dr.label, phone: dr.phone, occupied: dr.occupied })));
        });
    }
  }, [assignOpen, formalizeOpen]);

  const activeAssignment = items.find((a) => a.returnedAt === null);
  const hasUnformalizedDriver = currentDriver && !activeAssignment;

  async function doFormalize() {
    if (!currentDriver) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ driverId: currentDriver.id, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to register assignment");
        return;
      }
      setFormalizeOpen(false);
      setNote("");
      await refresh();
    } catch {
      setErr("Failed to register assignment");
    } finally {
      setBusy(false);
    }
  }

  async function doAssign() {
    if (!selectedDriver) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders() },
        body: JSON.stringify({ driverId: selectedDriver, note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to assign driver");
        return;
      }
      setAssignOpen(false);
      setSelectedDriver("");
      setNote("");
      await refresh();
    } catch {
      setErr("Failed to assign driver");
    } finally {
      setBusy(false);
    }
  }

  async function doReturn() {
    if (!returnId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/assignments/${returnId}/return`, { method: "PATCH", headers: { ...csrfHeaders() } });
      if (!res.ok) {
        const data = await res.json();
        setErr(data.error ?? "Failed to return driver");
        return;
      }
      setReturnId(null);
      await refresh();
    } catch {
      setErr("Failed to return driver");
    } finally {
      setBusy(false);
    }
  }

  if (items.length === 0 && !canManage && !currentDriver) {
    return <p className="text-sm text-slate-400">No driver assignments recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {activeAssignment && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-800">Currently Assigned</span>
            </div>
            {canManage && (
              <Dropdown align="right"
                trigger={({ toggle }) => (<Tooltip content="Actions"><button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button></Tooltip>)}
                items={[
                  { label: "Return Driver", icon: <Calendar className="h-4 w-4" />, danger: true, onClick: () => setReturnId(activeAssignment.id) },
                ]}
              />
            )}
          </div>
          <div className="mt-2 text-sm">
            <span className="font-medium text-slate-800">{activeAssignment.driver?.fullName ?? "-"}</span>
            {activeAssignment.driver?.licenseNo && <span className="text-slate-500"> · {activeAssignment.driver.licenseNo}</span>}
            <div className="text-slate-500">Assigned {formatDate(activeAssignment.assignedAt)}</div>
            {activeAssignment.note && <div className="mt-1 text-slate-600">{activeAssignment.note}</div>}
          </div>
        </div>
      )}

      {hasUnformalizedDriver && !activeAssignment && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">Current Driver</span>
              <span className="text-xs text-amber-600">(not yet registered)</span>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button className="btn-outline text-xs" onClick={() => { setFormalizeOpen(true); setNote(""); }}>
                  Register
                </button>
                <Dropdown align="right"
                  trigger={({ toggle }) => (<Tooltip content="Actions"><button onClick={toggle} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><MoreVertical className="h-4 w-4" /></button></Tooltip>)}
                  items={[
                    { label: "Remove Driver", icon: <XCircle className="h-4 w-4" />, danger: true, onClick: () => setReturnId("__remove") },
                  ]}
                />
              </div>
            )}
          </div>
          <div className="mt-2 text-sm">
            <span className="font-medium text-slate-800">{currentDriver.fullName ?? "-"}</span>
            {currentDriver.licenseNo && <span className="text-slate-500"> · {currentDriver.licenseNo}</span>}
          </div>
        </div>
      )}

      {!hasUnformalizedDriver && !activeAssignment && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 p-4">
          <p className="text-sm text-slate-400">No driver assigned.</p>
          {canManage && (
            <button className="btn-outline text-xs" onClick={() => setAssignOpen(true)}>
              <Plus className="mr-1 h-3 w-3" /> Assign Driver
            </button>
          )}
        </div>
      )}

      {items.length > 0 && !activeAssignment && (
        <>
          {canManage && (
            <div className="flex justify-end">
              <button className="btn-outline text-xs" onClick={() => setAssignOpen(true)}>
                <Plus className="mr-1 h-3 w-3" /> Assign Driver
              </button>
            </div>
          )}
          {items.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium text-slate-800">{a.driver?.fullName ?? "-"}</div>
                <span className={`badge ${a.returnedAt ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                  {a.returnedAt ? "Returned" : "Active"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-slate-600 sm:grid-cols-2">
                <div>Assigned: <span className="text-slate-800">{formatDate(a.assignedAt)}</span></div>
                <div>Returned: <span className="text-slate-800">{a.returnedAt ? formatDate(a.returnedAt) : "-"}</span></div>
                {a.driver?.licenseNo && <div>License: <span className="text-slate-800">{a.driver.licenseNo}</span></div>}
                {a.branch && <div>Branch: <span className="text-slate-800">{a.branch.name}</span></div>}
              </div>
              {a.note && <div className="mt-1 text-sm text-slate-600">{a.note}</div>}
            </div>
          ))}
        </>
      )}

      <Modal
        open={assignOpen}
        onClose={() => !busy && setAssignOpen(false)}
        title="Assign Driver"
        footer={
          <>
            <button className="btn-outline" onClick={() => setAssignOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={doAssign} disabled={busy || !selectedDriver}>{busy ? "Assigning…" : "Assign"}</button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="text-sm">Driver *
            <div className="mt-1">
              <Select
                className="w-full"
                value={selectedDriver}
                onChange={setSelectedDriver}
                placeholder="Select a driver…"
                searchable
                options={drivers.map((d) => ({
                  value: d.value,
                  label: d.label,
                  description: d.phone,
                  indicator: d.occupied ? { label: "Occupied", variant: "warning" } : undefined,
                }))}
              />
            </div>
          </label>
          <label className="text-sm">Note (optional)
            <textarea
              className="input mt-1"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              placeholder="Any remarks about this assignment…"
            />
          </label>
        </div>
        {err && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      </Modal>

      <Modal
        open={formalizeOpen}
        onClose={() => !busy && setFormalizeOpen(false)}
        title="Register Driver Assignment"
        footer={
          <>
            <button className="btn-outline" onClick={() => setFormalizeOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={doFormalize} disabled={busy}>Register</button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Register <span className="font-medium text-slate-800">{currentDriver?.fullName}</span> as a formal assignment for this vehicle?
        </p>
        <label className="text-sm mt-4">Note (optional)
          <textarea
            className="input mt-1"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            placeholder="Any remarks about this assignment…"
          />
        </label>
        {err && <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      </Modal>

      <ConfirmModal
        open={returnId === "__remove"}
        onClose={() => setReturnId(null)}
        onConfirm={async () => {
          setReturnId(null);
          setBusy(true);
          try {
            const res = await fetch(`/api/vehicles/${vehicleId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...csrfHeaders() },
              body: JSON.stringify({ currentDriverId: null }),
            });
            if (!res.ok) throw new Error("Failed to remove driver");
            await refresh();
          } catch {
            setErr("Failed to remove driver");
          } finally {
            setBusy(false);
          }
        }}
        loading={busy}
        title="Remove Driver"
        message={`Remove ${currentDriver?.fullName} from this vehicle?`}
        confirmLabel="Remove"
      />

      <ConfirmModal
        open={returnId !== null && returnId !== "__remove"}
        onClose={() => setReturnId(null)}
        onConfirm={doReturn}
        loading={busy}
        title="Return Driver"
        message="Mark this driver assignment as returned?"
        confirmLabel="Return"
      />
    </div>
  );
}