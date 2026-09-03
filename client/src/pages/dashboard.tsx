import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import {
  Car, ClipboardList, ShieldCheck, ShieldAlert, AlertTriangle, ChevronRight, CalendarClock,
  Activity, Gauge, MapPin, Wrench, Ban, Archive, History, RefreshCw, ArrowRight, AlertOctagon,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { formatDateTime, formatRelative } from "@/lib/format";
import { label } from "@/lib/constants";
import { classifyExpiryState, type ReminderWindows } from "@/lib/services/reminders";

const PALETTE = ["#273274", "#012169", "#e8941a", "#698dcf", "#10b981", "#f59e0b", "#ec4899", "#94a3b8"];
const FALLBACK_WINDOWS: ReminderWindows = [90, 60, 30, 7];

interface Kpis {
  totalVehicles: number; registeredVehicles: number; activeVehicles: number;
  assignedVehicles: number; vehiclesUnderMaintenance: number; disposedVehicles: number;
  expiredRegistrations: number; pendingRenewal: number; suspendedRegistrations: number;
  expiredInsurance: number; uninsuredVehicles: number; expiredLicenses: number; expiringLicenses: number; averageAge: number;
  newestVehicle: { code: string; year: number } | null;
  oldestVehicle: { code: string; year: number } | null;
  expiringInWindow: { registration: Record<number, number>; insurance: Record<number, number> };
}
interface DistPoint { name: string; value: number }
interface Dist { byType: DistPoint[]; byStatus: DistPoint[]; byBranch: DistPoint[]; byMake: DistPoint[]; byYear: DistPoint[]; byFuel: DistPoint[] }
interface ActivityItem { id: string; action: string; entity: string; createdAt: string; user: string; vehicleId?: string | null }
interface RegItem { id: string; regNumber: string; status: string; expiryDate: string; daysLeft: number | null; vehicle: { id: string; plateNumber: string; branch?: { name: string } | null } }
interface InsItem { id: string; policyNo: string; endDate: string; daysLeft: number | null; vehicle: { id: string; plateNumber: string; branch?: { name: string } | null } }

interface DashboardData {
  kpis: Kpis;
  registrations: RegItem[];
  insurances: InsItem[];
  distributions: Dist;
  activity: ActivityItem[];
  windows: ReminderWindows;
  asOf: string;
}

function StatCard({ icon: Icon, label, value, sub, tone = "primary", to, title }: {
  icon: any; label: string; value: any; sub?: string; tone?: string; to?: string; title?: string;
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary", red: "bg-red-100 text-red-600",
    amber: "bg-amber-100 text-amber-600", green: "bg-green-100 text-green-700",
    blue: "bg-secondary/10 text-secondary",
  };
  const body = (
    <div className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-md">
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-6 w-6" /></div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-slate-800">{value}</div>
        <div className="truncate text-sm text-slate-500">{label}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
      {to && <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" />}
    </div>
  );
  if (to) return <Link to={to} title={title} className="block">{body}</Link>;
  return <div title={title}>{body}</div>;
}

// Severity thresholds come from the admin-configured reminder windows so the
// badges match the notification escalation exactly (used to be hardcoded 7/30).
function ExpiryBadge({ days, windows }: { days: number | null; windows: ReminderWindows }) {
  const state = classifyExpiryState(days, windows);
  if (days === null) return <span className="badge bg-slate-100 text-slate-500">—</span>;
  if (state === "EXPIRED") return <span className="badge bg-red-100 text-red-700">Expired</span>;
  if (state === "CRITICAL") return <span className="badge bg-orange-100 text-orange-700">{days}d left</span>;
  if (state === "WARNING") return <span className="badge bg-amber-100 text-amber-700">{days}d left</span>;
  return <span className="badge bg-slate-100 text-slate-600">{days}d left</span>;
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" /> {title}
      </div>
      {children}
    </div>
  );
}

const pie = (data: DistPoint[]) => ({
  tooltip: { trigger: "item" },
  legend: { bottom: 0, type: "scroll" },
  series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "44%"], itemStyle: { borderColor: "#fff", borderWidth: 2 }, label: { formatter: "{b}: {c}" },
    data: data.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: PALETTE[i % PALETTE.length] } })) }],
});
const barH = (data: DistPoint[]) => ({
  tooltip: { trigger: "axis" }, grid: { left: 8, right: 24, top: 10, bottom: 8, containLabel: true },
  xAxis: { type: "value" }, yAxis: { type: "category", data: data.map((d) => d.name), axisLabel: { fontSize: 10, interval: 0, width: 140, overflow: "truncate" } },
  series: [{ type: "bar", data: data.map((d) => d.value), itemStyle: { color: "#273274", borderRadius: 4 }, barWidth: "55%" }],
});
const barV = (data: DistPoint[]) => ({
  tooltip: { trigger: "axis" }, grid: { left: 8, right: 20, top: 10, bottom: 8, containLabel: true },
  xAxis: { type: "category", data: data.map((d) => d.name), axisLabel: { rotate: 30, fontSize: 10, interval: 0, width: 90, overflow: "truncate" } },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: data.map((d) => d.value), itemStyle: { color: "#273274", borderRadius: 4 }, barWidth: "55%" }],
});

// Placeholder skeletons shown while (re)loading — the previous full-page loader
// made every refresh feel like a cold start.
function KpiSkeleton() {
  return (
    <div className="card flex animate-pulse items-center gap-4 p-5">
      <div className="h-12 w-12 rounded-xl bg-slate-100" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-6 w-16 rounded bg-slate-100" />
        <div className="h-3 w-24 rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    setError(null);
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error(`Dashboard request failed (${res.status})`);
      const d: DashboardData = await res.json();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card flex flex-col items-center justify-center gap-3 py-16 text-center">
        <AlertOctagon className="h-10 w-10 text-red-300" />
        <h3 className="text-base font-semibold text-slate-700">Couldn't load the dashboard</h3>
        <p className="text-sm text-slate-400">{error}</p>
        <button className="btn-outline mt-2" onClick={() => load()}>
          <RefreshCw className="mr-1 h-4 w-4" /> Try again
        </button>
      </div>
    );
  }

  const k = data.kpis;
  const windows = Array.isArray(data.windows) && data.windows.length === 4 ? data.windows : FALLBACK_WINDOWS;
  // Most urgent window last (the ≤7d tile should sit next to the lists).
  const windowTiles = [...windows].sort((a, b) => b - a);

  const bannerItems = [
    k.expiredRegistrations > 0 && {
      count: k.expiredRegistrations, text: `${k.expiredRegistrations} expired registration${k.expiredRegistrations > 1 ? "s" : ""}`,
      link: "/registrations?status=EXPIRED", linkText: "Review registrations",
    },
    k.expiredInsurance > 0 && {
      count: k.expiredInsurance, text: `${k.expiredInsurance} expired insurance polic${k.expiredInsurance > 1 ? "ies" : "y"}`,
      link: "/insurances?expiringWithin=-1", linkText: "Review insurances",
    },
    k.uninsuredVehicles > 0 && {
      count: k.uninsuredVehicles, text: `${k.uninsuredVehicles} vehicle${k.uninsuredVehicles > 1 ? "s" : ""} without valid insurance`,
      link: "/reports?report=documentCompleteness", linkText: "Check vehicles",
    },
    k.expiredLicenses > 0 && {
      count: k.expiredLicenses, text: `${k.expiredLicenses} expired driver license${k.expiredLicenses > 1 ? "s" : ""}`,
      link: "/drivers?expiringWithin=-1", linkText: "Review drivers",
    },
    k.expiringLicenses > 0 && {
      count: k.expiringLicenses, text: `${k.expiringLicenses} driver license${k.expiringLicenses > 1 ? "s" : ""} expiring soon`,
      link: "/drivers?expiringWithin=30", linkText: "Review drivers",
    },
  ].filter(Boolean) as { count: number; text: string; link: string; linkText: string }[];
  const showBanner = bannerItems.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Dashboard</h2>
          <p className="text-sm text-slate-500">Fleet overview &amp; upcoming document expirations</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span title={formatDateTime(data.asOf)}>As of {formatRelative(data.asOf)}</span>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700 disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {showBanner && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Compliance attention needed</p>
              <p className="text-sm text-amber-700">
                {bannerItems.map((b, i) => (
                  <span key={b.link}>
                    {i > 0 && ", "}
                    {b.text}
                  </span>
                ))}
                {" "}— these need action now.
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {bannerItems.map((b) => (
              <Link key={b.link} to={b.link} className="btn-outline whitespace-nowrap border-amber-300 text-amber-800 hover:bg-amber-100">
                {b.linkText}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Action stats first — what needs work today. All cards drill down. */}
        <StatCard icon={Ban} label="Expired Registrations" value={k.expiredRegistrations} sub={`${k.pendingRenewal} pending renewal`} tone="red" to="/registrations?status=EXPIRED" title="Open registrations filtered to expired" />
        <StatCard icon={ShieldAlert} label="Expired Insurance" value={k.expiredInsurance} tone="red" to="/insurances?expiringWithin=-1" title="Open insurances filtered to expired" />
        <StatCard icon={ShieldAlert} label="Uninsured Vehicles" value={k.uninsuredVehicles} tone="red" to="/reports?report=documentCompleteness" title="Vehicles with no policy in force right now" />
        <StatCard icon={Wrench} label="Under Maintenance" value={k.vehiclesUnderMaintenance} tone="amber" to="/vehicles?status=UNDER_MAINTENANCE" title="Open vehicles filtered to maintenance" />
        {/* Fleet shape next. */}
        <StatCard icon={Car} label="Total Vehicles" value={k.totalVehicles} sub={`${k.registeredVehicles} registered`} tone="primary" to="/vehicles" title="Open the vehicle list" />
        <StatCard icon={Gauge} label="Active Vehicles" value={k.activeVehicles} sub={`${k.assignedVehicles} assigned`} tone="green" to="/vehicles?status=ACTIVE" title="Open vehicles filtered to active" />
        {/* Trivia last. */}
        <StatCard icon={History} label="Avg Vehicle Age" value={`${k.averageAge}y`} sub={k.newestVehicle ? `Newest ${k.newestVehicle.year}` : "-"} tone="primary" />
        <StatCard icon={Archive} label="Disposed Vehicles" value={k.disposedVehicles} tone="blue" to="/vehicles?status=DISPOSED" title="Open vehicles filtered to disposed" />
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <CalendarClock className="h-4 w-4" /> Expiring soon (next {Math.max(...windows)} days)
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {windowTiles.map((w) => {
            const regCount = k.expiringInWindow.registration[w] ?? 0;
            const insCount = k.expiringInWindow.insurance[w] ?? 0;
            return (
              <div key={w} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-700">Due within {w} days</div>
                  <div className="text-xs text-slate-400">Including already expired</div>
                </div>
                <div className="flex items-center gap-4 text-center">
                  <Link to={`/registrations?expiringWithin=${w}`} className="group/reg block rounded-lg px-2 py-1 transition-colors hover:bg-slate-50" title={`Registrations due within ${w} days`}>
                    <div className="text-lg font-semibold text-slate-800 group-hover/reg:text-primary">{regCount}</div>
                    <div className="text-[11px] text-slate-400">Registrations</div>
                  </Link>
                  <Link to={`/insurances?expiringWithin=${w}`} className="group/ins block rounded-lg px-2 py-1 transition-colors hover:bg-slate-50" title={`Insurance policies due within ${w} days`}>
                    <div className="text-lg font-semibold text-slate-800 group-hover/ins:text-primary">{insCount}</div>
                    <div className="text-[11px] text-slate-400">Insurance</div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Vehicles by Type" icon={Car}>{distCharts(data.distributions.byType, pie)}</ChartCard>
        <ChartCard title="Vehicles by Status" icon={Activity}>{distCharts(data.distributions.byStatus, pie)}</ChartCard>
        <ChartCard title="Vehicles by Branch" icon={MapPin}>{distCharts(data.distributions.byBranch, barH)}</ChartCard>
        <ChartCard title="Vehicles by Fuel Type" icon={Gauge}>{distCharts(data.distributions.byFuel, pie)}</ChartCard>
        <ChartCard title="Vehicles by Make" icon={Car}>{distCharts(data.distributions.byMake, barH)}</ChartCard>
        <ChartCard title="Vehicles by Year" icon={History}>{distCharts(data.distributions.byYear, barV)}</ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"><Activity className="h-4 w-4" /> Recent Activity</div>
          {data.activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No recent activity.</p>
          ) : (
            <ul className="space-y-3">
              {data.activity.map((a) => {
                const content = (
                  <div className="min-w-0">
                    <div className="text-sm text-slate-700">
                      <span className="font-medium">{a.action}</span> <span className="text-slate-400">on {label(a.entity)}</span>
                    </div>
                    <div className="text-xs text-slate-400">{a.user} · {formatRelative(a.createdAt)}</div>
                  </div>
                );
                return (
                  <li key={a.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0">
                    <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Activity className="h-3.5 w-3.5" /></div>
                    {a.vehicleId ? (
                      <Link to={`/vehicles/${a.vehicleId}`} className="min-w-0 hover:text-primary" title="Open the vehicle">{content}</Link>
                    ) : content}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"><ClipboardList className="h-4 w-4" /> Registrations due</div>
            <Link to="/registrations" className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-all hover:gap-2">View all <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
          {data.registrations.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Nothing due in the next {Math.max(...windows)} days.</p> : (
            <ul className="divide-y divide-slate-100">
              {data.registrations.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/vehicles/${r.vehicle.id}`} className="truncate text-sm font-medium text-slate-800 hover:text-primary">{r.vehicle.plateNumber}</Link>
                    <div className="truncate text-xs text-slate-400">{r.regNumber} · {r.vehicle.branch?.name ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-2"><StatusBadge status={r.status} /><ExpiryBadge days={r.daysLeft} windows={windows} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"><ShieldCheck className="h-4 w-4" /> Insurance due</div>
          <Link to="/insurances" className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-all hover:gap-2">View all <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
        {data.insurances.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">Nothing due in the next {Math.max(...windows)} days.</p> : (
          <ul className="divide-y divide-slate-100">
            {data.insurances.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    <Link to={`/vehicles/${i.vehicle.id}`} className="text-blue-600 hover:underline">{i.vehicle.plateNumber}</Link>
                  </div>
                  <div className="truncate text-xs text-slate-400">{i.policyNo} · {i.vehicle.branch?.name ?? "—"}</div>
                </div>
                <ExpiryBadge days={i.daysLeft} windows={windows} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function distCharts(rows: DistPoint[], build: (d: DistPoint[]) => any) {
  if (!rows?.length) return <div className="py-10 text-center text-sm text-slate-400">No data.</div>;
  return <ReactECharts option={build(rows)} style={{ height: 280 }} />;
}
