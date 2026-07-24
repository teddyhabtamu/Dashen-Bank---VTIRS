import { useEffect, useState } from "react";
import { Link, useParams, useBlocker } from "react-router-dom";
import { Pencil } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { RegistrationPanel } from "@/components/registration-panel";
import { InsurancePanel } from "@/components/insurance-panel";
import { AssignmentPanel } from "@/components/assignment-panel";
import { DocumentManager } from "@/components/document-manager";
import { useAuth } from "@/components/auth-context";
import { label } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/rbac";

function Attr({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="truncate text-right text-[15px] font-medium text-slate-800">{value ?? "-"}</span>
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [v, setV] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const blocker = useBlocker(pendingUploads);

  useEffect(() => {
    if (blocker.state === "blocked") setBlockConfirm(true);
  }, [blocker.state]);

  useEffect(() => {
    if (!pendingUploads) return;
    function onBefore(e: BeforeUnloadEvent) { e.preventDefault(); }
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [pendingUploads]);

  function confirmLeave() {
    setPendingUploads(false);
    setBlockConfirm(false);
    if (blocker.state === "blocked") blocker.proceed();
  }

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/vehicles/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => { if (d?.vehicle) setV(d.vehicle); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <BrandLoader />;

  if (notFound || !v) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-center text-slate-400">
        <span className="text-sm font-medium">Vehicle not found</span>
        <Link to="/vehicles" className="text-xs text-primary hover:underline">Back to registry</Link>
      </div>
    );
  }

  const documents = (v.documents ?? []) as any[];

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {/* Back */}
      <Link to="/vehicles" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors">
        ← Vehicles
      </Link>

      {/* Hero */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-800">
              {v.make} {v.model}{v.trim ? ` ${v.trim}` : ""}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xl font-semibold text-slate-600">{v.plateNumber}</span>
              <StatusBadge status={v.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-400">
              {v.year && <span>{v.year}</span>}
              {v.year && <span className="text-slate-300">·</span>}
              <span>{label(v.transmission) || "—"}</span>
              <span className="text-slate-300">·</span>
              <span>{label(v.fuelType) || "—"}</span>
              {v.driveType && <><span className="text-slate-300">·</span><span>{label(v.driveType)}</span></>}
              <span className="text-slate-300">·</span>
              <span>{(v.odometer ?? 0).toLocaleString()} km</span>
              {v.engineNo && <><span className="text-slate-300">·</span><span className="font-mono">ENG {v.engineNo.slice(0, 8)}</span></>}
              {v.chassisNo && <><span className="text-slate-300">·</span><span className="font-mono">VIN {v.chassisNo.slice(0, 8)}</span></>}
            </div>
          </div>
          {can(PERMISSIONS.VEHICLE_EDIT) && (
            <Link to={`/vehicles/${v.id}/edit`} className="btn-primary flex-shrink-0 gap-1.5 text-xs px-3 py-1.5">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Link>
          )}
        </div>
      </div>

      {/* Detail sections — 2-col grid */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Basic Information */}
        <section>
          <h2 className="mb-4 text-[18px] font-semibold text-slate-700">Basic Information</h2>
          <div className="divide-y divide-slate-100">
            <Attr label="Plate Number" value={v.plateNumber} />
            <Attr label="Previous Plate" value={v.prevPlateNo} />
            <Attr label="Make / Model" value={`${v.make} ${v.model}`} />
            <Attr label="Trim" value={v.trim} />
            <Attr label="Year" value={v.year} />
            <Attr label="Color" value={v.color} />
            <Attr label="Category" value={v.category} />
            <Attr label="Type" value={v.type} />
          </div>
        </section>

        {/* Technical Specifications */}
        <section>
          <h2 className="mb-4 text-[18px] font-semibold text-slate-700">Technical Specifications</h2>
          <div className="divide-y divide-slate-100">
            <Attr label="Engine Number" value={v.engineNo} />
            <Attr label="Chassis (VIN)" value={v.chassisNo} />
            <Attr label="Engine Capacity" value={v.engineCC ? `${v.engineCC} CC` : "-"} />
            <Attr label="Fuel Type" value={label(v.fuelType)} />
            <Attr label="Transmission" value={label(v.transmission)} />
            <Attr label="Drive Type" value={v.driveType ? label(v.driveType) : "-"} />
            <Attr label="Odometer" value={`${(v.odometer ?? 0).toLocaleString()} km`} />
          </div>
        </section>

        {/* Ownership */}
        <section>
          <h2 className="mb-4 text-[18px] font-semibold text-slate-700">Ownership</h2>
          <div className="divide-y divide-slate-100">
            <Attr label="Owner" value={v.ownerName} />
            <Attr label="Department" value={v.department?.name} />
            <Attr label="Branch" value={v.branch?.name} />
            <Attr label="Driver" value={v.currentDriver?.fullName} />
            <Attr label="Acquired" value={formatDate(v.acquisitionDate)} />
            <Attr label="Cost" value={formatCurrency(v.purchaseCost)} />
            <Attr label="Supplier" value={v.supplier} />
          </div>
        </section>

        {/* Location */}
        <section>
          <h2 className="mb-4 text-[18px] font-semibold text-slate-700">Location</h2>
          <div className="divide-y divide-slate-100">
            <Attr label="Branch Code" value={v.branch?.code} />
            <Attr label="Region" value={v.branch?.region} />
            <Attr label="Address" value={v.branch?.address} />
          </div>
        </section>
      </div>

      {/* Driver Assignments */}
      <section>
        <h2 className="mb-4 text-[18px] font-semibold text-slate-700">Driver Assignments</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <AssignmentPanel
            vehicleId={v.id}
            initial={v.assignments ?? []}
            currentDriver={v.currentDriver}
            canManage={can(PERMISSIONS.VEHICLE_EDIT)}
          />
        </div>
      </section>

      {/* Registration & Insurance */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-[18px] font-semibold text-slate-700">Registration</h2>
          <RegistrationPanel
            vehicleId={v.id}
            initial={v.registrations}
            canRenew={can(PERMISSIONS.REGISTRATION_RENEW)}
            canSuspend={can(PERMISSIONS.REGISTRATION_SUSPEND)}
          />
        </section>

        <section>
          <h2 className="mb-4 text-[18px] font-semibold text-slate-700">Insurance</h2>
          <InsurancePanel
            vehicleId={v.id}
            initial={v.insurances ?? []}
            canManage={can(PERMISSIONS.INSURANCE_MANAGE)}
          />
        </section>
      </div>

      {/* Documents */}
      <section>
        <h2 className="mb-4 text-[18px] font-semibold text-slate-700">
          Documents {documents.length > 0 && <span className="font-normal text-slate-400">({documents.length})</span>}
        </h2>
        <div className="rounded-xl border border-slate-200 bg-white">
          <DocumentManager
            vehicleId={v.id}
            initialDocs={documents.map((d: any) => ({
              id: d.id, title: d.title, category: d.category, fileName: d.fileName,
              originalName: d.originalName, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
              version: d.version, createdAt: d.createdAt,
            }))}
            initialImages={(v.images ?? []).map((i: any) => ({
              id: i.id, category: i.category, originalName: i.originalName,
              mimeType: i.mimeType, sizeBytes: i.sizeBytes, createdAt: i.createdAt,
            }))}
            canUpload={can(PERMISSIONS.DOCUMENT_UPLOAD)}
            canDelete={can(PERMISSIONS.DOCUMENT_DELETE)}
            onPendingChange={setPendingUploads}
          />
        </div>
      </section>

      <ConfirmModal
        open={blockConfirm}
        onClose={() => { setBlockConfirm(false); if (blocker.state === "blocked") blocker.reset(); }}
        onConfirm={confirmLeave}
        title="Unsaved files"
        message="You have files selected but not uploaded. Leave anyway?"
        confirmLabel="Leave"
      />
    </div>
  );
}
