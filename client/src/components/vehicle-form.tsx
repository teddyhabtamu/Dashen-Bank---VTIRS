import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Eye, Plus } from "lucide-react";
import { cn } from "@/lib/format";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useToast } from "@/lib/toast-context";
import { Field, Select } from "@/components/ui/field";
import type { SelectOption } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/datepicker";
import {
  FUEL_TYPE_OPTIONS,
  TRANSMISSION_OPTIONS,
  DRIVE_TYPE_OPTIONS,
  VEHICLE_STATUS_OPTIONS,
  label,
} from "@/lib/constants";

interface Option {
  value: string;
  label: string;
}
interface VehicleFormData {
  plateNumber: string;
  prevPlateNo: string;
  category: string;
  type: string;
  make: string;
  model: string;
  trim: string;
  year: string;
  color: string;
  engineNo: string;
  chassisNo: string;
  engineCC: string;
  fuelType: string;
  transmission: string;
  driveType: string;
  odometer: string;
  ownerName: string;
  departmentId: string;
  branchId: string;
  currentDriverId: string;
  acquisitionDate: string;
  purchaseCost: string;
  supplier: string;
  status: string;
}

const EMPTY: VehicleFormData = {
  plateNumber: "",
  prevPlateNo: "",
  category: "",
  type: "",
  make: "",
  model: "",
  trim: "",
  year: String(new Date().getFullYear()),
  color: "",
  engineNo: "",
  chassisNo: "",
  engineCC: "",
  fuelType: "PETROL",
  transmission: "MANUAL",
  driveType: "FWD",
  odometer: "0",
  ownerName: "",
  departmentId: "",
  branchId: "",
  currentDriverId: "",
  acquisitionDate: "",
  purchaseCost: "",
  supplier: "",
  status: "ACTIVE",
};

const LABELS: Record<string, string> = {
  plateNumber: "Plate No.",
  prevPlateNo: "Previous Plate No.",
  category: "Category",
  type: "Type",
  make: "Make",
  model: "Model",
  trim: "Trim",
  year: "Year",
  color: "Color",
  engineNo: "Engine No.",
  chassisNo: "Chassis No.",
  engineCC: "Engine CC",
  fuelType: "Fuel Type",
  transmission: "Transmission",
  driveType: "Drive Type",
  odometer: "Odometer (km)",
  ownerName: "Owner Name",
  departmentId: "Department",
  branchId: "Branch",
  currentDriverId: "Current Driver",
  acquisitionDate: "Acquisition Date",
  purchaseCost: "Purchase Cost",
  supplier: "Supplier",
  status: "Status",
};

const STEPS = ["Basic Info", "Technical", "Ownership", "Status", "Review"];

const STEP_FIELDS: (keyof VehicleFormData)[][] = [
  ["plateNumber", "prevPlateNo", "category", "type", "make", "model", "trim", "year", "color"],
  ["engineNo", "chassisNo", "engineCC", "fuelType", "transmission", "driveType", "odometer"],
  ["ownerName", "departmentId", "branchId", "currentDriverId", "acquisitionDate", "purchaseCost", "supplier"],
  ["status"],
];

const REQUIRED: Set<keyof VehicleFormData> = new Set([
  "plateNumber", "category", "type", "make", "model", "year",
  "engineNo", "chassisNo", "fuelType", "transmission", "ownerName",
]);

const ADD_NEW = "__add_new__";

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((s, idx) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                idx < current && "bg-primary/10 text-primary",
                idx === current && "bg-primary text-white",
                idx > current && "bg-slate-100 text-slate-400",
              )}
            >
              {idx < current ? <Check className="h-3.5 w-3.5" /> : idx + 1}
            </div>
            <span
              className={cn(
                "mt-1 whitespace-nowrap text-[10px]",
                idx <= current ? "text-slate-600" : "text-slate-400",
              )}
            >
              {s}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div
              className={cn(
                "mx-2 h-px w-8 md:w-12",
                idx < current ? "bg-primary" : "bg-slate-200",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function VehicleForm({ vehicleId }: { vehicleId?: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEdit = Boolean(vehicleId);
  const [step, setStep] = useState(0);
  const [data, setData] = useState<VehicleFormData>(EMPTY);
  const [branches, setBranches] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<SelectOption[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addModal, setAddModal] = useState<"branch" | "department" | "driver" | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addForm, setAddForm] = useState({ code: "", name: "", fullName: "", employeeId: "", licenseNo: "", phone: "" });

  useEffect(() => {
    fetch("/api/reference/lookups")
      .then((r) => r.json())
      .then((d) => {
        setBranches(d.branches ?? []);
        setDepartments(d.departments ?? []);
        setDrivers((d.drivers ?? []).map((dr: any) => ({ value: dr.value, label: dr.label, description: dr.phone || undefined, indicator: dr.occupied ? { label: "Occupied", variant: "warning" } : undefined })));
      });
    if (!vehicleId) {
      fetch("/api/settings/public")
        .then((r) => r.json())
        .then((d) => {
          if (d.defaultOwnerName) setData((prev) => ({ ...prev, ownerName: d.defaultOwnerName }));
        })
        .catch(() => {});
    }
    if (vehicleId) {
      setLoading(true);
      fetch(`/api/vehicles/${vehicleId}`)
        .then((r) => r.json())
        .then((d) => {
          const v = d.vehicle;
          setData({
            ...EMPTY,
            plateNumber: v.plateNumber ?? "",
            prevPlateNo: v.prevPlateNo ?? "",
            category: v.category ?? "",
            type: v.type ?? "",
            make: v.make ?? "",
            model: v.model ?? "",
            trim: v.trim ?? "",
            year: String(v.year ?? ""),
            color: v.color ?? "",
            engineNo: v.engineNo ?? "",
            chassisNo: v.chassisNo ?? "",
            engineCC: v.engineCC ? String(v.engineCC) : "",
            fuelType: v.fuelType ?? "PETROL",
            transmission: v.transmission ?? "MANUAL",
            driveType: v.driveType ?? "FWD",
            odometer: String(v.odometer ?? 0),
            ownerName: v.ownerName ?? "",
            departmentId: v.departmentId ?? "",
            branchId: v.branchId ?? "",
            currentDriverId: v.currentDriverId ?? "",
            acquisitionDate: v.acquisitionDate ? v.acquisitionDate.slice(0, 10) : "",
            purchaseCost: v.purchaseCost != null ? String(v.purchaseCost) : "",
            supplier: v.supplier ?? "",
            status: v.status ?? "ACTIVE",
          });
        })
        .finally(() => setLoading(false));
    }
  }, [vehicleId]);

  function onChange<K extends keyof VehicleFormData>(k: K, v: string) {
    if (v === ADD_NEW) {
      if (k === "branchId") { setAddForm({ code: "", name: "", fullName: "", employeeId: "", licenseNo: "", phone: "" }); setAddModal("branch"); }
      if (k === "departmentId") { setAddForm({ code: "", name: "", fullName: "", employeeId: "", licenseNo: "", phone: "" }); setAddModal("department"); }
      if (k === "currentDriverId") { setAddForm({ code: "", name: "", fullName: "", employeeId: "", licenseNo: "", phone: "" }); setAddModal("driver"); }
      return;
    }
    setData((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: "" }));
  }

  async function handleAddSave() {
    setAddBusy(true);
    let url = "";
    let method = "POST";
    let body: Record<string, string | undefined> = {};

    if (addModal === "branch") {
      url = "/api/reference/branches";
      body = { code: addForm.code, name: addForm.name };
    } else if (addModal === "department") {
      url = "/api/reference/departments";
      body = { code: addForm.code, name: addForm.name };
    } else if (addModal === "driver") {
      url = "/api/reference/drivers";
      body = { fullName: addForm.fullName, employeeId: addForm.employeeId || undefined, licenseNo: addForm.licenseNo || undefined, phone: addForm.phone || undefined };
    }

    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setAddBusy(false);
    if (!res.ok) {
      const err = await res.json();
      toast("error", err.error || "Failed to save");
      return;
    }
    const record = await res.json();
    const newOpt = { value: record.id, label: record.name || record.fullName };

    if (addModal === "branch") {
      setBranches((prev) => [...prev, newOpt]);
      setData((d) => ({ ...d, branchId: record.id }));
    } else if (addModal === "department") {
      setDepartments((prev) => [...prev, newOpt]);
      setData((d) => ({ ...d, departmentId: record.id }));
    } else if (addModal === "driver") {
      setDrivers((prev) => [...prev, newOpt]);
      setData((d) => ({ ...d, currentDriverId: record.id }));
    }

    toast("success", `${addModal} added`);
    setAddModal(null);
  }

  function validateStep(s: number): boolean {
    const fields = STEP_FIELDS[s];
    const newErrors: Record<string, string> = {};
    let valid = true;
    for (const f of fields) {
      if (REQUIRED.has(f) && !data[f]?.trim()) {
        newErrors[f] = `${LABELS[f]} is required`;
        valid = false;
      }
    }
    setErrors((prev) => ({ ...prev, ...newErrors }));
    return valid;
  }

  function goNext() {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    setSaving(true);
    setErrors({});
    const payload: Record<string, unknown> = {
      ...data,
      year: Number(data.year),
      engineCC: data.engineCC ? Number(data.engineCC) : undefined,
      odometer: Number(data.odometer || 0),
      purchaseCost: data.purchaseCost ? Number(data.purchaseCost) : undefined,
    };
    const res = await fetch(
      isEdit ? `/api/vehicles/${vehicleId}` : "/api/vehicles",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      if (json.issues) {
        const fe: Record<string, string> = {};
        for (const [k, v] of Object.entries(json.issues)) fe[k] = (v as string[])[0];
        setErrors(fe);
      } else {
        setErrors({ _form: json.error ?? "Save failed" });
      }
      setSaving(false);
      return;
    }
    toast("success", isEdit ? "Vehicle updated" : "Vehicle registered");
    navigate("/vehicles");
  }

  function renderField(f: keyof VehicleFormData) {
    const value = data[f];
    const set = (v: string) => onChange(f, v);

    if (f === "fuelType")
      return <Select value={value} onChange={set} options={FUEL_TYPE_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />;
    if (f === "transmission")
      return <Select value={value} onChange={set} options={TRANSMISSION_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />;
    if (f === "driveType")
      return <Select value={value} onChange={set} options={DRIVE_TYPE_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />;
    if (f === "status")
      return <Select value={value} onChange={set} options={VEHICLE_STATUS_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />;
    if (f === "branchId")
      return <Select searchable value={value} onChange={set} options={[{ value: ADD_NEW, label: "Add new branch", icon: <Plus className="h-4 w-4" /> }, ...branches]} placeholder="Select branch" />;
    if (f === "departmentId")
      return <Select searchable value={value} onChange={set} options={[{ value: ADD_NEW, label: "Add new department", icon: <Plus className="h-4 w-4" /> }, ...departments]} placeholder="Select department" />;
    if (f === "currentDriverId")
      return <Select searchable value={value} onChange={set} options={[{ value: ADD_NEW, label: "Add new driver", icon: <Plus className="h-4 w-4" /> }, ...drivers]} placeholder="Select driver" />;
    if (f === "acquisitionDate")
      return <DatePicker value={value} onChange={set} />;

    return (
      <input
        className="input"
        value={value}
        onChange={(e) => set(e.target.value)}
        inputMode={
          f === "year" || f === "engineCC" || f === "odometer" || f === "purchaseCost"
            ? "numeric"
            : "text"
        }
      />
    );
  }

  if (loading) {
    return <BrandLoader />;
  }

  const isReview = step === STEPS.length - 1;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="px-4 pt-3 pb-1.5">
        <StepIndicator current={step} />
      </div>

      {errors._form && (
        <div className="border-t border-slate-100 px-4 py-2 text-sm text-red-600">
          {errors._form}
        </div>
      )}

      {isReview ? (
        <div className="border-t border-slate-100 px-4 py-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-800">Review & Confirm</h3>
            </div>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary">
              {STEP_FIELDS.reduce((s, f) => s + f.length, 0)} fields
            </span>
          </div>

          <div className="space-y-3">
            {STEP_FIELDS.map((fields, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                    <h4 className="text-xs font-semibold text-slate-700">{STEPS[idx]}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(idx)}
                    className="text-[10px] font-medium text-primary hover:text-primary/80"
                  >
                    Edit
                  </button>
                </div>
                <div className="border-t border-slate-200 px-3 py-2.5">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-3">
                    {fields.map((f) => (
                      <div key={f}>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{LABELS[f]}</span>
                        <p className="mt-0.5 text-sm text-slate-700">
                          {f === "fuelType" || f === "transmission" || f === "driveType" || f === "status"
                            ? label(data[f])
                            : f === "departmentId"
                              ? departments.find((d) => d.value === data[f])?.label || data[f] || "—"
                              : f === "branchId"
                                ? branches.find((b) => b.value === data[f])?.label || data[f] || "—"
                                : f === "currentDriverId"
                                  ? drivers.find((d) => d.value === data[f])?.label || data[f] || "—"
                                  : data[f] || "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-100 px-4 pt-3 pb-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Step {step + 1} · {STEPS[step]}
          </h3>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 md:grid-cols-3">
            {STEP_FIELDS[step].map((f) => (
              <Field key={f} label={LABELS[f]} error={errors[f]} required={REQUIRED.has(f)}
                className={STEP_FIELDS[step].length === 1 ? "md:col-span-3" : ""}>
                {renderField(f)}
              </Field>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
        <button type="button" onClick={() => navigate(-1)} className="btn-outline text-xs">
          Cancel
        </button>
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button type="button" onClick={goBack} className="btn-outline inline-flex items-center gap-1 text-xs">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
          {isReview ? (
            <button type="button" onClick={handleSubmit} disabled={saving} className="btn-primary inline-flex items-center gap-1.5 text-xs">
              {saving ? "Saving…" : isEdit ? "Update Vehicle" : "Register Vehicle"}
            </button>
          ) : (
            <button type="button" onClick={goNext} className="btn-primary inline-flex items-center gap-1 text-xs">
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <Modal
        open={addModal === "branch"}
        onClose={() => setAddModal(null)}
        title="New Branch"
        size="sm"
        footer={
          <>
            <button className="btn-outline" onClick={() => setAddModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddSave} disabled={addBusy}>
              {addBusy ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Code *</label>
            <input className="input" value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })} placeholder="e.g. ADD-001" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
            <input className="input" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Addis Ababa Main" />
          </div>
        </div>
      </Modal>

      <Modal
        open={addModal === "department"}
        onClose={() => setAddModal(null)}
        title="New Department"
        size="sm"
        footer={
          <>
            <button className="btn-outline" onClick={() => setAddModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddSave} disabled={addBusy}>
              {addBusy ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Code *</label>
            <input className="input" value={addForm.code} onChange={(e) => setAddForm({ ...addForm, code: e.target.value })} placeholder="e.g. IT" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Name *</label>
            <input className="input" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Information Technology" />
          </div>
        </div>
      </Modal>

      <Modal
        open={addModal === "driver"}
        onClose={() => setAddModal(null)}
        title="New Driver"
        size="sm"
        footer={
          <>
            <button className="btn-outline" onClick={() => setAddModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleAddSave} disabled={addBusy}>
              {addBusy ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Full Name *</label>
            <input className="input" value={addForm.fullName} onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Employee ID</label>
            <input className="input" value={addForm.employeeId} onChange={(e) => setAddForm({ ...addForm, employeeId: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">License No.</label>
            <input className="input" value={addForm.licenseNo} onChange={(e) => setAddForm({ ...addForm, licenseNo: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
            <input className="input" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
