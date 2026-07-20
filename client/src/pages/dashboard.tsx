import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import {
  Car, ClipboardList, ShieldCheck, AlertTriangle, ChevronRight, CalendarClock,
  Search, Activity, Gauge, MapPin, Wrench, Ban, Archive, History,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLoader } from "@/components/ui/brand-loader";
import { formatDateTime } from "@/lib/format";
import { label } from "@/lib/constants";

const PALETTE = ["#273274", "#012169", "#e8941a", "#698dcf", "#10b981", "#f59e0b", "#ec4899", "#94a3b8"];
const WINDOWS = [90, 60, 30, 7];

interface Kpis {
  totalVehicles: number; registeredVehicles: number; activeVehicles: number;
  assignedVehicles: number; vehiclesUnderMaintenance: number; disposedVehicles: number;
  expiredRegistrations: number; pendingRenewal: number; suspendedRegistrations: number;
  expiredInsurance: number; averageAge: number;
  newestVehicle: { code: string; year: number } | null;
  oldestVehicle: { code: string; year: number } | null;
  expiringInWindow: { registration: Record<number, number>; insurance: Record<number, number> };
}
interface Dist { byType: any[]; byStatus: any[]; byBranch: any[]; byMake: any[]; byModel: any[]; byYear: any[]; byFuel: any[] }
interface ActivityItem { id: string; action: string; entity: string; createdAt: string; user: string }

function StatCard({ icon: Icon, label, value, sub, tone = "primary" }: any) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary", red: "bg-red-100 text-red-600",
    amber: "bg-amber-100 text-amber-600", green: "bg-green-100 text-green-700",
    blue: "bg-secondary/10 text-secondary",
  };
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-6 w-6" /></div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold text-slate-800">{value}</div>
        <div className="truncate text-sm text-slate-500">{label}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return <span className="badge bg-slate-100 text-slate-500">—</span>;
  if (days < 0) return <span className="badge bg-red-100 text-red-700">Expired</span>;
  if (days <= 7) return <span className="badge bg-orange-100 text-orange-700">{days}d left</span>;
  if (days <= 30) return <span className="badge bg-amber-100 text-amber-700">{days}d left</span>;
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

const pie = (data: any[]) => ({
  tooltip: { trigger: "item" },
  legend: { bottom: 0, type: "scroll" },
  series: [{ type: "pie", radius: ["42%", "70%"], center: ["50%", "44%"], itemStyle: { borderColor: "#fff", borderWidth: 2 }, label: { formatter: "{b}: {c}" },
    data: data.map((d, i) => ({ name: d.name, value: d.value, itemStyle: { color: PALETTE[i % PALETTE.length] } })) }],
});
const barH = (data: any[]) => ({
  tooltip: { trigger: "axis" }, grid: { left: 8, right: 24, top: 10, bottom: 8, containLabel: true },
  xAxis: { type: "value" }, yAxis: { type: "category", data: data.map((d) => d.name), axisLabel: { fontSize: 10, interval: 0, width: 140, overflow: "truncate" } },
  series: [{ type: "bar", data: data.map((d) => d.value), itemStyle: { color: "#273274", borderRadius: 4 }, barWidth: "55%" }],
});
const barV = (data: any[]) => ({
  tooltip: { trigger: "axis" }, grid: { left: 8, right: 20, top: 10, bottom: 8, containLabel: true },
  xAxis: { type: "category", data: data.map((d) => d.name), axisLabel: { rotate: 30, fontSize: 10, interval: 0, width: 90, overflow: "truncate" } },
  yAxis: { type: "value" },
  series: [{ type: "bar", data: data.map((d) => d.value), itemStyle: { color: "#273274", borderRadius: 4 }, barWidth: "55%" }],
});

export default function DashboardPage() {
  const navigate = useNavigate();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [regs, setRegs] = useState<any[]>([]);
  const [ins, setIns] = useState<any[]>([]);
  const [dist, setDist] = useState<Dist | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [quick, setQuick] = useState("");

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then((d) => {
      setKpis(d.kpis); setRegs(d.registrations ?? []); setIns(d.insurances ?? []);
      setDist(d.distributions ?? null); setActivity(d.activity ?? []);
    }).finally(() => setLoading(false));
  }, []);

  function submitQuick(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(quick)}`);
  }

  if (loading || !kpis || !dist) {
    return <BrandLoader label="Loading dashboard…" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Dashboard</h2>
          <p className="text-sm text-slate-500">Fleet overview &amp; upcoming document expirations</p>
        </div>
        <form onSubmit={submitQuick} className="flex w-full max-w-sm items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input name="q" value={quick} onChange={(e) => setQuick(e.target.value)} className="input pl-9" placeholder="Quick search plate, engine, VIN…" />
          </div>
          <button className="btn-primary px-3 py-2" type="submit"><Search className="h-4 w-4" /></button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Car} label="Total Vehicles" value={kpis.totalVehicles} sub={`${kpis.registeredVehicles} registered`} tone="primary" />
        <StatCard icon={Gauge} label="Active Vehicles" value={kpis.activeVehicles} sub={`${kpis.assignedVehicles} assigned`} tone="green" />
        <StatCard icon={Wrench} label="Under Maintenance" value={kpis.vehiclesUnderMaintenance} tone="amber" />
        <StatCard icon={Ban} label="Expired Registrations" value={kpis.expiredRegistrations} sub={`${kpis.pendingRenewal} pending`} tone="red" />
        <StatCard icon={ShieldCheck} label="Expired Insurance" value={kpis.expiredInsurance} tone="red" />
        <StatCard icon={Archive} label="Disposed Vehicles" value={kpis.disposedVehicles} tone="blue" />
        <StatCard icon={History} label="Avg Vehicle Age" value={`${kpis.averageAge}y`} sub={kpis.newestVehicle ? `Newest ${kpis.newestVehicle.year}` : "-"} tone="primary" />
        <StatCard icon={Car} label="Oldest Vehicle" value={kpis.oldestVehicle?.year ?? "-"} sub={kpis.oldestVehicle?.code ?? "-"} tone="blue" />
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <CalendarClock className="h-4 w-4" /> Expiring Within (next 90 days)
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {WINDOWS.map((w) => (
            <div key={w} className="flex items-center justify-between rounded-lg border border-slate-100 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-700">≤ {w} days</div>
                <div className="text-xs text-slate-400">Reminder window</div>
              </div>
              <div className="flex gap-4 text-center">
                <div><div className="text-lg font-semibold text-slate-800">{kpis.expiringInWindow.registration[w] ?? 0}</div><div className="text-[11px] text-slate-400">Reg</div></div>
                <div><div className="text-lg font-semibold text-slate-800">{kpis.expiringInWindow.insurance[w] ?? 0}</div><div className="text-[11px] text-slate-400">Ins</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Vehicles by Type" icon={Car}>{dist.byType.length ? <ReactECharts option={pie(dist.byType)} style={{ height: 280 }} /> : <Empty />}</ChartCard>
        <ChartCard title="Vehicles by Status" icon={Activity}>{dist.byStatus.length ? <ReactECharts option={pie(dist.byStatus)} style={{ height: 280 }} /> : <Empty />}</ChartCard>
        <ChartCard title="Vehicles by Branch" icon={MapPin}>{dist.byBranch.length ? <ReactECharts option={barH(dist.byBranch)} style={{ height: 280 }} /> : <Empty />}</ChartCard>
        <ChartCard title="Vehicles by Fuel Type" icon={Gauge}>{dist.byFuel.length ? <ReactECharts option={pie(dist.byFuel)} style={{ height: 280 }} /> : <Empty />}</ChartCard>
        <ChartCard title="Vehicles by Make" icon={Car}>{dist.byMake.length ? <ReactECharts option={barH(dist.byMake)} style={{ height: 280 }} /> : <Empty />}</ChartCard>
        <ChartCard title="Vehicles by Year" icon={History}>{dist.byYear.length ? <ReactECharts option={barV(dist.byYear)} style={{ height: 280 }} /> : <Empty />}</ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"><Activity className="h-4 w-4" /> Recent Activity</div>
          {activity.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No recent activity.</p> : (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3 border-b border-slate-100 pb-3 last:border-0">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Activity className="h-3.5 w-3.5" /></div>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-700"><span className="font-medium">{a.action}</span> <span className="text-slate-400">on {label(a.entity)}</span></div>
                    <div className="text-xs text-slate-400">{a.user} · {formatDateTime(a.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"><ClipboardList className="h-4 w-4" /> Registrations</div>
            <Link to="/registrations" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:gap-2 transition-all">View all <ChevronRight className="h-3.5 w-3.5" /></Link>
          </div>
          {regs.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No upcoming registrations.</p> : (
            <ul className="divide-y divide-slate-100">
              {regs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/vehicles/${r.vehicle.id}`} className="truncate text-sm font-medium text-slate-800 hover:text-primary">{r.vehicle.plateNumber}</Link>
                    <div className="truncate text-xs text-slate-400">{r.regNumber} · {r.vehicle.branch?.name ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-2"><StatusBadge status={r.status} /><ExpiryBadge days={r.daysLeft} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"><ShieldCheck className="h-4 w-4" /> Insurance</div>
        {ins.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No upcoming insurance.</p> : (
          <ul className="divide-y divide-slate-100">
            {ins.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><div className="truncate text-sm font-medium text-slate-800">{i.company}</div><div className="truncate text-xs text-slate-400">{i.policyNo} · {i.vehicle.plateNumber}</div></div>
                <ExpiryBadge days={i.daysLeft} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {(kpis.expiredRegistrations + kpis.expiredInsurance > 0) && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Compliance attention needed</p>
              <p className="text-sm text-amber-700">
                {kpis.expiredRegistrations > 0 && (
                  <>{kpis.expiredRegistrations} registration{kpis.expiredRegistrations > 1 ? "s" : ""}</>
                )}
                {kpis.expiredRegistrations > 0 && kpis.expiredInsurance > 0 && " and "}
                {kpis.expiredInsurance > 0 && (
                  <>{kpis.expiredInsurance} insurance polic{kpis.expiredInsurance > 1 ? "ies" : "y"}</>
                )}
                {" "}have expired and should be renewed.
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            {kpis.expiredRegistrations > 0 && (
              <Link to="/registrations" className="btn-outline whitespace-nowrap border-amber-300 text-amber-800 hover:bg-amber-100">
                Review registrations
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Empty() { return <div className="py-10 text-center text-sm text-slate-400">No data.</div>; }
