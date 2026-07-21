import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Field, Select } from "@/components/ui/field";
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

const SECTIONS: { title: string; fields: (keyof VehicleFormData)[] }[] = [
  { title: "Basic Information", fields: ["plateNumber", "prevPlateNo", "category", "type", "make", "model", "trim", "year", "color"] },
  { title: "Technical Identification", fields: ["engineNo", "chassisNo", "engineCC", "fuelType", "transmission", "driveType", "odometer"] },
  { title: "Ownership", fields: ["ownerName", "departmentId", "branchId", "currentDriverId", "acquisitionDate", "purchaseCost", "supplier"] },
  { title: "Status", fields: ["status"] },
];

export function VehicleForm({ vehicleId }: { vehicleId?: string }) {
  const navigate = useNavigate();
  const isEdit = Boolean(vehicleId);
  const [data, setData] = useState<VehicleFormData>(EMPTY);
  const [branches, setBranches] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/reference/lookups")
      .then((r) => r.json())
      .then((d) => {
        setBranches(d.branches ?? []);
        setDepartments(d.departments ?? []);
        setDrivers(d.drivers ?? []);
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

  function set<K extends keyof VehicleFormData>(k: K, v: string) {
    setData((d) => ({ ...d, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
    navigate("/vehicles");
  }

  if (loading) {
    return <BrandLoader />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors._form && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {errors._form}
        </div>
      )}

      {SECTIONS.map((section) => (
        <div key={section.title} className="card p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {section.title}
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {section.fields.map((f) => (
              <Field key={f} label={f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} error={errors[f]}>
                {f === "fuelType" ? (
                  <Select value={data.fuelType} onChange={(v) => set("fuelType", v)} options={FUEL_TYPE_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />
                ) : f === "transmission" ? (
                  <Select value={data.transmission} onChange={(v) => set("transmission", v)} options={TRANSMISSION_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />
                ) : f === "driveType" ? (
                  <Select value={data.driveType} onChange={(v) => set("driveType", v)} options={DRIVE_TYPE_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />
                ) : f === "status" ? (
                  <Select value={data.status} onChange={(v) => set("status", v)} options={VEHICLE_STATUS_OPTIONS.map((o) => ({ value: o, label: label(o) }))} />
                ) : f === "branchId" ? (
                  <Select value={data.branchId} onChange={(v) => set("branchId", v)} options={branches} placeholder="Select branch" />
                ) : f === "departmentId" ? (
                  <Select value={data.departmentId} onChange={(v) => set("departmentId", v)} options={departments} placeholder="Select department" />
                ) : f === "currentDriverId" ? (
                  <Select value={data.currentDriverId} onChange={(v) => set("currentDriverId", v)} options={drivers} placeholder="Select driver" />
                ) : f === "acquisitionDate" ? (
                  <DatePicker value={data.acquisitionDate} onChange={(v) => set("acquisitionDate", v)} />
                ) : (
                  <input
                    className="input"
                    value={data[f]}
                    onChange={(e) => set(f, e.target.value)}
                    inputMode={
                      f === "year" || f === "engineCC" || f === "odometer" || f === "purchaseCost"
                        ? "numeric"
                        : "text"
                    }
                  />
                )}
              </Field>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={() => navigate(-1)} className="btn-outline">
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Update Vehicle" : "Register Vehicle"}
        </button>
      </div>
    </form>
  );
}
