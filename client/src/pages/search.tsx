
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search as SearchIcon, Car, ClipboardList, ShieldCheck, FileText, X, ArrowRight } from "lucide-react";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { VEHICLE_STATUS_OPTIONS, REGISTRATION_STATUS_OPTIONS, label } from "@/lib/constants";
import { daysUntil, expiryState } from "@/lib/services/reminders";

interface Opt { value: string; label: string }
interface Result {
  vehicles: any[];
  registrations: any[];
  insurances: any[];
  documents: any[];
  total: number;
}

const KIND_META: Record<string, { label: string; icon: any; pill: string }> = {
  vehicle: { label: "Vehicles", icon: Car, pill: "bg-primary/10 text-primary" },
  registration: { label: "Registrations", icon: ClipboardList, pill: "bg-blue-100 text-blue-700" },
  insurance: { label: "Insurance", icon: ShieldCheck, pill: "bg-emerald-100 text-emerald-700" },
  document: { label: "Documents", icon: FileText, pill: "bg-purple-100 text-purple-700" },
};

const KIND_ORDER = ["vehicle", "registration", "insurance", "document"];

function ExpiryPill({ date, label: lbl }: { date: string; label: string }) {
  const days = daysUntil(date);
  const state = expiryState(date);
  const cls =
    state === "EXPIRED" ? "bg-red-100 text-red-700"
      : state === "CRITICAL" ? "bg-orange-100 text-orange-700"
        : state === "WARNING" ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-600";
  const text = days !== null && days >= 0 ? `${days}d left` : "expired";
  return (
    <span className="text-xs text-slate-400">
      {lbl}: <span className={`badge ${cls}`}>{text}</span>
    </span>
  );
}

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const [branchId, setBranchId] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [regStatus, setRegStatus] = useState("");
  const [branches, setBranches] = useState<Opt[]>([]);
  const [types, setTypes] = useState<Opt[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    fetch("/api/reference/lookups").then((r) => r.json()).then((d) => {
      setBranches(d.branches ?? []);
      setTypes(d.vehicleTypes ?? []);
    });
  }, []);

  const runSearch = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (year) qs.set("year", year);
    if (branchId) qs.set("branchId", branchId);
    if (vehicleType) qs.set("vehicleType", vehicleType);
    if (regStatus) qs.set("registrationStatus", regStatus);
    const res = await fetch(`/api/search?${qs.toString()}`);
    const data = await res.json();
    setResult(data);
    setSearched(true);
    setLoading(false);
  }, [q, status, year, branchId, vehicleType, regStatus]);

  useEffect(() => {
    const t = setTimeout(() => { runSearch(); }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, status, year, branchId, vehicleType, regStatus]);

  function clearFilters() {
    setQ(""); setStatus(""); setYear(""); setBranchId(""); setVehicleType(""); setRegStatus("");
  }

  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (q) chips.push({ key: "q", label: `"${q}"`, clear: () => setQ("") });
  if (status) chips.push({ key: "status", label: `Status: ${label(status)}`, clear: () => setStatus("") });
  if (regStatus) chips.push({ key: "reg", label: `Reg: ${label(regStatus)}`, clear: () => setRegStatus("") });
  if (branchId) chips.push({ key: "branch", label: `Branch: ${branches.find((b) => b.value === branchId)?.label ?? "?"}`, clear: () => setBranchId("") });
  if (vehicleType) chips.push({ key: "type", label: `Type: ${vehicleType}`, clear: () => setVehicleType("") });
  if (year) chips.push({ key: "year", label: `Year: ${year}`, clear: () => setYear("") });

  // Group results by kind.
  const grouped: Record<string, any[]> = { vehicle: [], registration: [], insurance: [], document: [] };
  if (result) {
    for (const v of result.vehicles) grouped.vehicle.push(v);
    for (const r of result.registrations) grouped.registration.push(r);
    for (const i of result.insurances) grouped.insurance.push(i);
    for (const d of result.documents) grouped.document.push(d);
  }

  return (
    <div className="space-y-4">
      {/* Hero search */}
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Global Search</h2>
        <p className="text-sm text-slate-500">Find vehicles, registrations, insurance &amp; documents</p>
      </div>

      <div className="card p-4">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-12 pr-4 text-base outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            placeholder="Search plate, driver, branch, policy no, filename…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Select className="w-full" value={status} onChange={setStatus} placeholder="Vehicle Status"
            options={[{ value: "", label: "Vehicle Status" }, ...VEHICLE_STATUS_OPTIONS.map((s) => ({ value: s, label: label(s) }))]} />
          <Select className="w-full" value={regStatus} onChange={setRegStatus} placeholder="Reg Status"
            options={[{ value: "", label: "Reg Status" }, ...REGISTRATION_STATUS_OPTIONS.map((s) => ({ value: s, label: label(s) }))]} />
          <Select className="w-full" value={branchId} onChange={setBranchId} placeholder="Branch"
            options={[{ value: "", label: "Branch" }, ...branches]} searchable />
          <Select className="w-full" value={vehicleType} onChange={setVehicleType} placeholder="Vehicle Type"
            options={[{ value: "", label: "Vehicle Type" }, ...types]} />
          <input className="input" type="number" min={1900} max={2100} placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Active:</span>
            {chips.map((c) => (
              <button
                key={c.key}
                onClick={c.clear}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {c.label}
                <X className="h-3 w-3" />
              </button>
            ))}
            <button onClick={clearFilters} className="text-xs text-slate-400 underline hover:text-slate-600">Clear all</button>
          </div>
        )}
      </div>

      {/* Results */}
      {loading && <BrandLoader label="Searching…" />}

      {!loading && searched && result && result.total === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <SearchIcon className="mb-3 h-10 w-10 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">No results found</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            {q ? `Nothing matched "${q}"` : "Nothing matched"}{chips.length > 0 ? " with the active filters." : "."} Try adjusting or clearing them.
          </p>
          {chips.length > 0 && (
            <button onClick={clearFilters} className="btn-outline mt-4">Clear all filters</button>
          )}
        </div>
      )}

      {!loading && result && result.total > 0 && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <span className="text-sm font-medium text-slate-600">{result.total} result(s)</span>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                {KIND_ORDER.filter((k) => grouped[k].length > 0).map((k) => (
                  <span key={k} className="flex items-center gap-1">
                    {(() => { const Icon = KIND_META[k].icon; return <Icon className="h-3 w-3" />; })()}
                    {grouped[k].length}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {KIND_ORDER.filter((k) => grouped[k].length > 0).map((kind) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            return (
              <div key={kind} className="card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
                  <Icon className="h-4 w-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
                  <span className="badge bg-slate-100 text-slate-500">{grouped[kind].length}</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {kind === "vehicle" && grouped.vehicle.map((v: any) => (
                    <li key={v.id}>
                      <Link to={`/vehicles/${v.id}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Car className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-slate-800">{v.plateNumber}</span>
                            <StatusBadge status={v.status} />
                            {v.registrationStatus && <StatusBadge status={v.registrationStatus} />}
                          </div>
                          <div className="truncate text-xs text-slate-400">
                            {v.vehicleCode} · {v.make} {v.model} · {v.year}
                            {v.branchName && <> · {v.branchName}</>}
                            {v.driverName && <> · Driver: {v.driverName}</>}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
                          {v.registrationStatus === "ACTIVE" && <ExpiryPill date={v.insuranceEnd ?? ""} label="Ins" />}
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                        </div>
                      </Link>
                    </li>
                  ))}

                  {kind === "registration" && grouped.registration.map((r: any) => (
                    <li key={r.id}>
                      <Link to={`/vehicles/${r.vehicleId}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                          <ClipboardList className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-slate-800">{r.regNumber}</span>
                            <span className={`badge flex-shrink-0 bg-blue-50 text-blue-700`}>Registration</span>
                            <StatusBadge status={r.status} />
                          </div>
                          <div className="truncate text-xs text-slate-400">
                            Plate {r.plateNumber}{r.office && <> · {r.office}</>}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
                          <ExpiryPill date={r.expiryDate} label="Expiry" />
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                        </div>
                      </Link>
                    </li>
                  ))}

                  {kind === "insurance" && grouped.insurance.map((i: any) => (
                    <li key={i.id}>
                      <Link to={`/vehicles/${i.vehicleId}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                          <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-slate-800">{i.company}</span>
                            <span className={`badge flex-shrink-0 bg-emerald-50 text-emerald-700`}>Insurance</span>
                            <span className="badge bg-emerald-50 text-emerald-700">{i.coverage}</span>
                          </div>
                          <div className="truncate text-xs text-slate-400">
                            Policy {i.policyNo} · {i.plateNumber}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
                          <ExpiryPill date={i.endDate} label="Expiry" />
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                        </div>
                      </Link>
                    </li>
                  ))}

                  {kind === "document" && grouped.document.map((d: any) => (
                    <li key={d.id}>
                      <Link to={`/vehicles/${d.vehicleId}`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="truncate text-sm font-semibold text-slate-800">{d.title}</span>
                            <span className={`badge flex-shrink-0 bg-purple-50 text-purple-700`}>Document</span>
                            <span className="badge bg-purple-50 text-purple-700">{label(d.category)}</span>
                          </div>
                          <div className="truncate text-xs text-slate-400">
                            {d.plateNumber}
                          </div>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
                          <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-primary hover:underline">View</a>
                          <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
