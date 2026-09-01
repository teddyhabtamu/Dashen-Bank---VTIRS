import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Pencil, RefreshCw, Car, Phone, BadgeCheck, Building2, Calendar } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { PhoneInput } from "@/components/ui/phone-input";
import { useAuth } from "@/components/auth-context";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/rbac";

interface VehicleOption { id: string; plateNumber: string; vehicleCode: string; make?: string | null; model?: string | null; }

interface AssignRow {
  id: string;
  assignedAt: string;
  returnedAt: string | null;
  vehicle: { id: string; plateNumber: string; vehicleCode: string; make?: string | null; model?: string | null };
  branch: { id: string; name: string } | null;
}

interface DriverDetail {
  id: string;
  fullName: string;
  employeeId: string | null;
  licenseNo: string | null;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  vehicles: VehicleOption[];
  assignments: AssignRow[];
}

function Attr({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="truncate text-right text-[15px] font-medium text-slate-800">{value ?? "-"}</span>
    </div>
  );
}

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { toast } = useToast();
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [shiftOpen, setShiftOpen] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [editForm, setEditForm] = useState({
    fullName: "",
    employeeId: "",
    licenseNo: "",
    phone: "",
    departmentId: "",
    isActive: true,
  });

  useEffect(() => {
    fetch("/api/reference/lookups")
      .then((r) => r.json())
      .then((d) =>
        setDepartments((d.departments ?? []).map((dep: { value: string; label: string }) => ({ id: dep.value, name: dep.label })))
      )
      .catch(() => setDepartments([]));
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/drivers/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d?.driver) setDriver(d.driver); })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function openShift() {
    setErr(null);
    setSelectedVehicle("");
    setShiftOpen(true);
    fetch("/api/vehicles?pageSize=100")
      .then((r) => r.json())
      .then((d) => setVehicles((d.items ?? []).map((v: any) => ({
        id: v.id,
        plateNumber: v.plateNumber,
        vehicleCode: v.vehicleCode,
        make: v.make,
        model: v.model,
      }))))
      .catch(() => setVehicles([]));
  }

  async function doTransfer() {
    if (!selectedVehicle) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/drivers/${id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId: selectedVehicle }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Failed to shift vehicle");
        return;
      }
      setShiftOpen(false);
      toast("success", "Vehicle assigned to driver");
      await load();
    } catch {
      setErr("Failed to shift vehicle");
    } finally {
      setBusy(false);
    }
  }

  function openEdit() {
    if (!driver) return;
    setEditErr(null);
    setEditFieldErrors({});
    setEditForm({
      fullName: driver.fullName,
      employeeId: driver.employeeId ?? "",
      licenseNo: driver.licenseNo ?? "",
      phone: driver.phone ?? "",
      departmentId: driver.departmentId ?? "",
      isActive: driver.isActive,
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!id) return;
    setEditBusy(true);
    setEditErr(null);
    setEditFieldErrors({});
    try {
      const res = await fetch(`/api/drivers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName,
          employeeId: editForm.employeeId || null,
          licenseNo: editForm.licenseNo || null,
          phone: editForm.phone || null,
          departmentId: editForm.departmentId || null,
          isActive: editForm.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.issues) {
          const flat: Record<string, string> = {};
          for (const [k, v] of Object.entries(data.issues)) {
            if (Array.isArray(v)) flat[k] = v[0] as string;
          }
          setEditFieldErrors(flat);
        }
        setEditErr(data.error ?? "Failed to save driver");
        return;
      }
      setEditOpen(false);
      toast("success", "Driver updated");
      await load();
    } finally {
      setEditBusy(false);
    }
  }

  if (loading) return <BrandLoader />;

  if (notFound || !driver) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center text-slate-400">
        <span className="text-sm font-medium">Driver not found</span>
        <Link to="/drivers" className="text-xs text-primary hover:underline">Back to drivers</Link>
      </div>
    );
  }

  const canManage = can(PERMISSIONS.BRANCH_MANAGE);
  const currentVehicle = driver.vehicles[0];
  const hasVehicle = !!currentVehicle;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/drivers" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" /> Drivers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {driver.fullName.trim().charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">{driver.fullName}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {driver.employeeId && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs text-slate-600">#{driver.employeeId}</span>}
              <span className={`badge ${driver.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {driver.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {canManage && (
            <>
              <button className="btn-primary inline-flex items-center gap-1.5 text-xs" onClick={openShift}>
                <RefreshCw className="h-3.5 w-3.5" /> {hasVehicle ? "Change Vehicle" : "Assign Vehicle"}
              </button>
              <button className="btn-outline inline-flex items-center gap-1.5 text-xs" onClick={openEdit}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Current Vehicle</h2>
          {currentVehicle ? (
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Car className="h-4 w-4 text-slate-400" />
                <Link to={`/vehicles/${currentVehicle.id}`} className="font-medium text-primary hover:underline">
                  {currentVehicle.plateNumber}
                </Link>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {currentVehicle.vehicleCode}
                {currentVehicle.make && currentVehicle.model ? ` · ${currentVehicle.make} ${currentVehicle.model}` : ""}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No vehicle currently assigned.</p>
          )}
          {canManage && (
            <button className="btn-outline mt-3 w-full text-xs" onClick={openShift}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> {hasVehicle ? "Change Vehicle" : "Assign Vehicle"}
            </button>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Details</h2>
          <div className="divide-y divide-slate-100">
            <Attr label="Employee ID" value={driver.employeeId ? <span className="font-mono">{driver.employeeId}</span> : null} />
            <Attr label={<span className="inline-flex items-center gap-1"><BadgeCheck className="h-3.5 w-3.5" /> License</span>} value={driver.licenseNo} />
            <Attr label={<span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</span>} value={driver.phone} />
            <Attr label={<span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Department</span>} value={driver.department?.name} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Summary</h2>
          <div className="divide-y divide-slate-100">
            <Attr label="Active Assignment" value={driver.assignments.some((a) => a.returnedAt === null) ? "Yes" : "No"} />
            <Attr label="Assignment Count" value={String(driver.assignments.length)} />
            <Attr label="Joined" value={formatDate(driver.createdAt)} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Assignment History</h2>
        {driver.assignments.length === 0 ? (
          <p className="text-sm text-slate-400">No assignment history recorded.</p>
        ) : (
          <div className="space-y-2">
            {driver.assignments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
                <div className="flex items-center gap-2">
                  <Car className="h-4 w-4 text-slate-400" />
                  <Link to={`/vehicles/${a.vehicle.id}`} className="font-medium text-slate-800 hover:text-primary">
                    {a.vehicle.plateNumber}
                  </Link>
                  <span className="text-xs text-slate-400">({a.vehicle.vehicleCode})</span>
                  {a.branch && <span className="text-xs text-slate-400">· {a.branch.name}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {formatDate(a.assignedAt)}</span>
                  <span className={`badge ${a.returnedAt ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                    {a.returnedAt ? "Returned" : "Active"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={shiftOpen}
        onClose={() => !busy && setShiftOpen(false)}
        title={hasVehicle ? "Change Vehicle" : "Assign Vehicle"}
        footer={
          <>
            <button className="btn-outline" onClick={() => setShiftOpen(false)} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={doTransfer} disabled={busy || !selectedVehicle}>
              {busy ? "Shifting…" : hasVehicle ? "Change Vehicle" : "Assign Vehicle"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {hasVehicle ? (
              <>
                Assign <span className="font-medium text-slate-800">{driver.fullName}</span> to a different vehicle. This returns the driver from any previous vehicle and assigns them to the new one, keeping full history.
              </>
            ) : (
              <>
                Assign <span className="font-medium text-slate-800">{driver.fullName}</span> to a vehicle. If the chosen vehicle has another driver, they will be returned first. Full history is kept.
              </>
            )}
          </p>
          <label className="text-sm">
            Vehicle *
            <div className="mt-1">
              <Select
                className="w-full"
                value={selectedVehicle}
                onChange={setSelectedVehicle}
                placeholder="Select a vehicle…"
                searchable
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: `${v.plateNumber} (${v.vehicleCode})${v.make && v.model ? ` · ${v.make} ${v.model}` : ""}`,
                }))}
              />
            </div>
          </label>
          {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={() => !editBusy && setEditOpen(false)}
        title="Edit Driver"
        size="lg"
        footer={
          <>
            <button className="btn-outline" onClick={() => setEditOpen(false)} disabled={editBusy}>Cancel</button>
            <button className="btn-primary" onClick={saveEdit} disabled={editBusy}>
              {editBusy ? "Saving…" : "Save Changes"}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Full Name *
            <input className={`input mt-1 ${editFieldErrors.fullName ? "border-red-400" : ""}`}
              value={editForm.fullName} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} disabled={editBusy} />
            {editFieldErrors.fullName && <p className="mt-0.5 text-xs text-red-500">{editFieldErrors.fullName}</p>}
          </label>
          <label className="text-sm">
            Employee ID
            <input className={`input mt-1 ${editFieldErrors.employeeId ? "border-red-400" : ""}`}
              value={editForm.employeeId} onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })} disabled={editBusy} />
            {editFieldErrors.employeeId && <p className="mt-0.5 text-xs text-red-500">{editFieldErrors.employeeId}</p>}
          </label>
          <label className="text-sm">
            License No.
            <input className="input mt-1"
              value={editForm.licenseNo} onChange={(e) => setEditForm({ ...editForm, licenseNo: e.target.value })} disabled={editBusy} />
          </label>
          <label className="text-sm">
            Phone
            <span className="mt-1 block">
              <PhoneInput value={editForm.phone} onChange={(v) => setEditForm({ ...editForm, phone: v })} disabled={editBusy} />
            </span>
          </label>
          <label className="text-sm">
            Department
            <div className="mt-1">
              <Select
                className="w-full"
                value={editForm.departmentId}
                onChange={(v) => setEditForm({ ...editForm, departmentId: v })}
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
                value={editForm.isActive ? "ACTIVE" : "INACTIVE"}
                onChange={(v) => setEditForm({ ...editForm, isActive: v === "ACTIVE" })}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" },
                ]}
              />
            </div>
          </label>
        </div>
        {editErr && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{editErr}</div>}
      </Modal>
    </div>
  );
}
