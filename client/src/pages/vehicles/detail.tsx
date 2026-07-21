import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Car, FileText, ShieldCheck, User, MapPin, Fuel } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { RegistrationPanel } from "@/components/registration-panel";
import { InsurancePanel } from "@/components/insurance-panel";
import { DocumentManager } from "@/components/document-manager";
import { useAuth } from "@/components/auth-context";
import { label } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import { PERMISSIONS } from "@/lib/rbac";

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-slate-50 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value ?? "-"}</span>
    </div>
  );
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [v, setV] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/vehicles/${id}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d?.vehicle) setV(d.vehicle);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <BrandLoader />;
  }

  if (notFound || !v) {
    return (
      <div className="py-20 text-center text-slate-400">
        <Car className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        Vehicle not found.
        <div className="mt-3">
          <Link to="/vehicles" className="text-primary hover:underline">Back to registry</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Link to="/vehicles" className="mt-0.5 rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-slate-800 sm:text-xl">
                {v.make} {v.model} {v.trim}
              </h2>
              <StatusBadge status={v.status} />
            </div>
            <p className="truncate font-mono text-xs text-slate-400">
              {v.vehicleCode} · {v.plateNumber}
            </p>
          </div>
        </div>
        {can(PERMISSIONS.VEHICLE_EDIT) && (
          <Link to={`/vehicles/${v.id}/edit`} className="btn-primary flex-shrink-0">
            <Pencil className="h-4 w-4" /> Edit
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Basic Information" icon={<Car className="h-4 w-4" />}>
          <Row label="Plate Number" value={v.plateNumber} />
          <Row label="Previous Plate" value={v.prevPlateNo} />
          <Row label="Category" value={v.category} />
          <Row label="Type" value={v.type} />
          <Row label="Make / Model" value={`${v.make} ${v.model}`} />
          <Row label="Trim" value={v.trim} />
          <Row label="Year" value={v.year} />
          <Row label="Color" value={v.color} />
        </Section>

        <Section title="Technical Identification" icon={<Fuel className="h-4 w-4" />}>
          <Row label="Engine Number" value={v.engineNo} />
          <Row label="Chassis (VIN)" value={v.chassisNo} />
          <Row label="Engine Capacity" value={v.engineCC ? `${v.engineCC} CC` : "-"} />
          <Row label="Fuel Type" value={label(v.fuelType)} />
          <Row label="Transmission" value={label(v.transmission)} />
          <Row label="Drive Type" value={v.driveType ? label(v.driveType) : "-"} />
          <Row label="Odometer" value={`${(v.odometer ?? 0).toLocaleString()} km`} />
        </Section>

        <Section title="Ownership" icon={<User className="h-4 w-4" />}>
          <Row label="Owner" value={v.ownerName} />
          <Row label="Department" value={v.department?.name} />
          <Row label="Branch" value={v.branch?.name} />
          <Row label="Current Driver" value={v.currentDriver?.fullName} />
          <Row label="Acquisition Date" value={formatDate(v.acquisitionDate)} />
          <Row label="Purchase Cost" value={formatCurrency(v.purchaseCost)} />
          <Row label="Supplier" value={v.supplier} />
        </Section>

        <Section title="Registrations" icon={<ShieldCheck className="h-4 w-4" />}>
          <RegistrationPanel
            vehicleId={v.id}
            initial={v.registrations}
            canRenew={can(PERMISSIONS.REGISTRATION_RENEW)}
            canSuspend={can(PERMISSIONS.REGISTRATION_SUSPEND)}
          />
        </Section>

        <Section title="Insurance" icon={<ShieldCheck className="h-4 w-4" />}>
          <InsurancePanel
            vehicleId={v.id}
            initial={v.insurances ?? []}
            canManage={can(PERMISSIONS.INSURANCE_MANAGE)}
          />
        </Section>

        <Section title="Documents & Images" icon={<FileText className="h-4 w-4" />}>
          <DocumentManager
            vehicleId={v.id}
            initialDocs={(v.documents ?? []).map((d: any) => ({
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
          />
        </Section>

        <Section title="Location" icon={<MapPin className="h-4 w-4" />}>
          <Row label="Branch Code" value={v.branch?.code} />
          <Row label="Region" value={v.branch?.region} />
          <Row label="Address" value={v.branch?.address} />
        </Section>
      </div>
    </div>
  );
}
