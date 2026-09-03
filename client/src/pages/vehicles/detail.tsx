import { useCallback, useEffect, useState } from "react";
import { Link, useParams, useBlocker } from "react-router-dom";
import { Pencil, History, ArrowRight, Copy, Check, Car, ShieldCheck, FileCheck, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { RegistrationPanel } from "@/components/registration-panel";
import { InsurancePanel } from "@/components/insurance-panel";
import { AssignmentPanel } from "@/components/assignment-panel";
import { DocumentManager } from "@/components/document-manager";
import { useAuth } from "@/components/auth-context";
import { label } from "@/lib/constants";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { PERMISSIONS } from "@/lib/rbac";
import { expiryState } from "@/lib/services/reminders";
import { useToast } from "@/lib/toast-context";

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  user: string;
  createdAt: string;
};

function Attr({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="truncate text-right text-[15px] font-medium text-slate-800">{value ?? "-"}</span>
    </div>
  );
}

// One-click copy for identity fields (plate, code, VIN, engine no) — registry
// work means pasting these into other systems constantly.
function CopyChip({ value, label: text, mono = true }: { value: string | null | undefined; label: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  if (!value) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          toast("success", `${text} copied`);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => toast("error", "Copy failed"));
      }}
      className="group inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
      title={`Copy ${text}: ${value}`}
    >
      <span className={mono ? "font-mono" : ""}>{value}</span>
      {copied
        ? <Check className="h-3 w-3 text-emerald-500" />
        : <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />}
    </button>
  );
}

const COMPLIANCE_BADGE: Record<string, string> = {
  EXPIRED: "bg-red-100 text-red-700",
  CRITICAL: "bg-orange-100 text-orange-700",
  WARNING: "bg-amber-100 text-amber-700",
  OK: "bg-green-100 text-green-700",
};

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const [v, setV] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [activity, setActivity] = useState<AuditRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [requiredCategories, setRequiredCategories] = useState<string[]>([]);
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

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/vehicles/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((d) => {
        if (d?.vehicle) setV(d.vehicle);
        if (Array.isArray(d?.requiredCategories)) setRequiredCategories(d.requiredCategories);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!v?.vehicleCode || !can(PERMISSIONS.AUDIT_VIEW)) {
      setActivity([]);
      return;
    }

    const controller = new AbortController();
    setActivityLoading(true);
    fetch(`/api/audit?search=${encodeURIComponent(v.vehicleCode)}&pageSize=5`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load activity"))))
      .then((d) => setActivity(d.items ?? []))
      .catch(() => setActivity([]))
      .finally(() => setActivityLoading(false));

    return () => controller.abort();
  }, [v?.vehicleCode, can]);

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
  const images = (v.images ?? []) as any[];
  const latestRegistration = (v.registrations ?? [])[0];
  const activeInsurance = (v.insurances ?? []).find(
    (i: any) => i.status === "ACTIVE" && (!i.endDate || new Date(i.endDate).getTime() >= Date.now())
  );
  const auditLink = {
    pathname: "/audit",
    search: `?search=${encodeURIComponent(v.vehicleCode)}`,
  };

  // Compliance strip: answers "is this vehicle OK?" in one glance without
  // scrolling through four sections.
  const regExpiryState = latestRegistration
    ? expiryState(latestRegistration.expiryDate)
    : null;
  const insExpiryState = activeInsurance
    ? expiryState(activeInsurance.endDate)
    : null;
  const requiredTotal = requiredCategories.length;
  const requiredPresent = requiredCategories.filter((c) =>
    documents.some((d) => d.category === c)
  ).length;
  const docsComplete = requiredTotal === 0 || requiredPresent === requiredTotal;
  const anyComplianceIssue =
    (regExpiryState && regExpiryState !== "OK") ||
    (insExpiryState && insExpiryState !== "OK") ||
    !activeInsurance ||
    !docsComplete;

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      {/* Back */}
      <Link to="/vehicles" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 transition-colors">
        ← Vehicles
      </Link>

      {/* Hero */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {images.length > 0 && (
              <Link to={`/vehicles/${v.id}`} className="hidden h-20 w-28 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:block" title="Vehicle photo">
                <img
                  src={`/api/documents/${images[0].id}`}
                  alt={`${v.make} ${v.model}`}
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </Link>
            )}
            <div className="min-w-0 space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                {v.make} {v.model}{v.trim ? ` ${v.trim}` : ""}
              </h1>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xl font-semibold text-slate-600">{v.plateNumber}</span>
                <StatusBadge status={v.status} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <CopyChip value={v.vehicleCode} label="Code" />
                {v.engineNo && <CopyChip value={v.engineNo} label="Engine No" />}
                {v.chassisNo && <CopyChip value={v.chassisNo} label="VIN" />}
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
              </div>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
            {can(PERMISSIONS.AUDIT_VIEW) && (
              <Link to={auditLink} className="btn-outline flex-shrink-0 gap-1.5 px-3 py-1.5 text-xs">
                <History className="h-3.5 w-3.5" /> Audit Trail
              </Link>
            )}
            {latestRegistration && (
              <Link
                to={`/registrations/${latestRegistration.id}/history`}
                className="btn-outline flex-shrink-0 gap-1.5 px-3 py-1.5 text-xs"
              >
                <ArrowRight className="h-3.5 w-3.5" /> Registration History
              </Link>
            )}
            {can(PERMISSIONS.VEHICLE_EDIT) && (
              <Link to={`/vehicles/${v.id}/edit`} className="btn-primary flex-shrink-0 gap-1.5 px-3 py-1.5 text-xs">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            )}
          </div>
        </div>

        {/* Compliance strip — registration, insurance, required docs at a glance */}
        <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-2.5 text-sm ${anyComplianceIssue ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"}`}>
          {anyComplianceIssue ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Needs attention
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <Check className="h-4 w-4" /> Compliant
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <Car className="h-4 w-4 text-slate-400" />
            {latestRegistration ? (
              <>
                <span className="text-slate-600">Registration</span>
                <span className={`badge ${COMPLIANCE_BADGE[regExpiryState ?? "OK"]}`}>{regExpiryState === "EXPIRED" ? "Expired" : regExpiryState === "OK" ? "Valid" : regExpiryState === "CRITICAL" ? "Critical" : "Warning"}</span>
              </>
            ) : (
              <span className="badge bg-red-100 text-red-700">No registration</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-slate-400" />
            {activeInsurance ? (
              <>
                <span className="text-slate-600">Insurance</span>
                <span className={`badge ${COMPLIANCE_BADGE[insExpiryState ?? "OK"]}`}>{insExpiryState === "EXPIRED" ? "Expired" : insExpiryState === "OK" ? "Valid" : insExpiryState === "CRITICAL" ? "Critical" : "Warning"}</span>
              </>
            ) : (
              <span className="badge bg-red-100 text-red-700">Uninsured</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileCheck className="h-4 w-4 text-slate-400" />
            <span className="text-slate-600">Documents</span>
            {requiredTotal > 0 ? (
              <span className={`badge ${docsComplete ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {requiredPresent}/{requiredTotal} required
              </span>
            ) : (
              <span className="badge bg-slate-100 text-slate-600">{documents.length} on file</span>
            )}
          </span>
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
            onChanged={load}
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
            canManage={can(PERMISSIONS.REGISTRATION_MANAGE)}
            onChanged={load}
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
                mimeType: i.mimeType, sizeBytes: i.sizeBytes, version: i.version, createdAt: i.createdAt,
              }))}
              canUpload={can(PERMISSIONS.DOCUMENT_UPLOAD)}
              canDelete={can(PERMISSIONS.DOCUMENT_DELETE)}
              onPendingChange={setPendingUploads}
              requiredCategories={requiredCategories}
            />        </div>
      </section>

      {/* Activity & History */}
      {can(PERMISSIONS.AUDIT_VIEW) && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-slate-700">Activity &amp; History</h2>
              <p className="text-sm text-slate-500">Recent audit events tied to this vehicle</p>
            </div>
            <Link to={auditLink} className="text-sm font-medium text-primary hover:underline">
              Open full audit trail
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            {activityLoading ? (
              <BrandLoader label="Loading activity…" />
            ) : activity.length === 0 ? (
              <p className="py-4 text-sm text-slate-400">No recent audit activity found for this vehicle.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {activity.map((row) => (
                  <li key={row.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <History className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge bg-slate-100 text-slate-600">{row.action}</span>
                        <span className="text-sm font-medium text-slate-700">{label(row.entity)}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {row.user} · {formatDateTime(row.createdAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

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
