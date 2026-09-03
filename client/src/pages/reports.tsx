import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import { Download, CalendarRange, Car, Building2, Users, Clock, TrendingUp, CalendarClock, ShieldCheck, ClipboardList, FileCheck, DollarSign, BarChart3, type LucideIcon } from "lucide-react";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth-context";
import { useBrand } from "@/lib/brand-context";
import { VEHICLE_STATUS_OPTIONS, label } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable, reportFilename, type ExportMeta } from "@/lib/export";

const PALETTE = ["#273274", "#012169", "#e8941a", "#f59e0b", "#698dcf", "#10b981", "#ec4899", "#64748b"];

const ICON_MAP: Record<string, LucideIcon> = {
  Car, Building2, Users, Clock, TrendingUp,
  CalendarClock, ShieldCheck, CalendarRange,
  ClipboardList, FileCheck, DollarSign,
};

interface Meta { key: string; title: string; type: string; icon: string; desc?: string; group?: string }
interface GroupDef { key: string; title: string; desc: string }
interface ReportResp {
  reports: Record<string, any>;
  meta: Meta[];
  groups: GroupDef[];
  branches: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}

const DEFAULT_GROUPS: GroupDef[] = [
  { key: "overview", title: "Overview", desc: "Fleet composition and tenure" },
  { key: "expiries", title: "Expiries & Renewals", desc: "What's due soon" },
  { key: "compliance", title: "Compliance & Cost", desc: "Health and value" },
];

export default function ReportsPage() {
  const { can, user } = useAuth();
  const { companyName } = useBrand();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ReportResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Deep-link support (?report=…) e.g. from the dashboard's compliance cards.
  const [active, setActive] = useState(searchParams.get("report") ?? "inventory");
  // Renewal-forecast horizon in months — the only report with an extra param.
  const [forecastMonths, setForecastMonths] = useState(12);
  // Bumped by the error-state retry button to re-run the fetch below.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const qs = new URLSearchParams();
    if (branchId) qs.set("branchId", branchId);
    if (departmentId) qs.set("departmentId", departmentId);
    if (status) qs.set("status", status);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (active) qs.set("report", active);
    if (active === "renewalForecast") qs.set("months", String(forecastMonths));
    setLoading(true);
    setError(null);
    fetch(`/api/reports?${qs.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, departmentId, status, from, to, active, forecastMonths, reloadKey]);

  const activeMeta = data?.meta.find((m) => m.key === active);
  const payload = data?.reports?.[active];

  function exportMeta(): ExportMeta {
    const parts: string[] = [];
    if (branchId) parts.push(`Branch: ${data?.branches.find((b) => b.id === branchId)?.name ?? branchId}`);
    if (departmentId) parts.push(`Department: ${data?.departments.find((d) => d.id === departmentId)?.name ?? departmentId}`);
    if (status) parts.push(`Status: ${label(status)}`);
    if (from || to) parts.push(`Acquired: ${from || "…"} to ${to || "…"}`);
    return {
      title: activeMeta?.title ?? "Report",
      subtitle: parts.length ? parts.join(" · ") : undefined,
      generatedBy: user?.fullName,
      moneyColumns: active === "cost" ? ["purchaseCost"] : [],
      // Numeric totals for Excel (true currency cells); the PDF path formats below.
      totals: active === "cost" && payload?.summary
        ? { vehicleCode: "TOTAL", purchaseCost: payload.summary.total }
        : undefined,
      summary: summaryForReport(),
    };
  }

  function summaryForReport(): ExportMeta["summary"] {
    const s = payload?.summary;
    if (!s) return undefined;
    if (active === "cost") {
      return [
        { label: "Total Fleet Cost", value: formatCurrency(s.total) },
        { label: "Average / Vehicle", value: formatCurrency(s.average) },
        { label: "Valued Vehicles", value: String(s.count) },
      ];
    }
    if (active === "documentCompleteness") {
      return [
        { label: "Vehicles", value: String(s.total) },
        { label: "Complete", value: String(s.complete) },
        { label: "Incomplete", value: String(s.incomplete) },
      ];
    }
    if (active === "renewalForecast") {
      return [
        { label: "Registrations Due", value: String(s.registrations) },
        { label: "Insurance Due", value: String(s.insurance) },
        { label: "Total Due", value: String(s.total) },
      ];
    }
    if (active === "fleetAcquisition") {
      return [
        { label: "Vehicles", value: String(s.total) },
        { label: "Avg. Ownership Tenure", value: `${s.avgFleetAge} yrs` },
      ];
    }
    return undefined;
  }

  function exportAll(kind: "csv" | "excel" | "pdf") {
    if (!activeMeta) return;
    const title = activeMeta.title;
    // Internal row ids (vehicle/driver UUIDs) are navigation aids, not report
    // data — strip them so exports don't leak meaningless identifiers.
    const exportRows = flattenRows(active, payload).map((r) => {
      const { id, driverId, vehicleId, ...rest } = r as Record<string, unknown>;
      return rest;
    });
    const meta = exportMeta();
    const name = reportFilename(title, hasFilters ? "filtered" : "all");
    // PDF totals render formatted (Excel gets the numeric ones via meta).
    const pdfTotals = active === "cost" && payload?.summary
      ? { vehicleCode: "TOTAL", purchaseCost: formatCurrency(payload.summary.total) }
      : undefined;
    if (kind === "csv") exportCsv(`${name}.csv`, exportRows);
    else if (kind === "excel") exportXlsx(`${name}.xlsx`, exportRows, meta);
    else exportPdf(rowsToHtmlTable(title, exportRows, pdfTotals), title, companyName, toPdfMeta(meta, exportRows.length));
  }

  function toPdfMeta(meta: ExportMeta, rowCount: number) {
    return { subtitle: meta.subtitle, generatedBy: meta.generatedBy, rowCount, summary: meta.summary };
  }

  const hasFilters = branchId || departmentId || status || from || to;
  const filterCount = [branchId, departmentId, status, from, to].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Reports</h2>
          <p className="text-sm text-slate-500">Fleet analytics &amp; compliance reporting</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-full sm:w-40" value={branchId} onChange={setBranchId} placeholder="All branches"
            options={[{ value: "", label: "All branches" }, ...(data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
          <Select className="w-full sm:w-40" value={departmentId} onChange={setDepartmentId} placeholder="All departments"
            options={[{ value: "", label: "All departments" }, ...(data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))]} />
          <Select className="w-full sm:w-36" value={status} onChange={setStatus} placeholder="All statuses"
            options={[{ value: "", label: "All statuses" }, ...VEHICLE_STATUS_OPTIONS.map((s) => ({ value: s, label: label(s) }))]} />
          <div className="inline-flex w-full items-center gap-1 rounded-md border border-slate-200 px-2 py-1 sm:w-auto" title="Filter by vehicle acquisition date">
            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <DatePicker value={from} onChange={setFrom} placeholder="Acq. from" className="w-24" />
            <span className="text-slate-300">–</span>
            <DatePicker value={to} onChange={setTo} placeholder="Acq. to" className="w-24" />
          </div>
          {hasFilters && (
            <button className="whitespace-nowrap text-xs font-medium text-primary hover:text-primary/80"
              onClick={() => { setBranchId(""); setDepartmentId(""); setStatus(""); setFrom(""); setTo(""); }}>
              Clear ({filterCount})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr] lg:items-start">
      <div className="space-y-4">
        {(data?.groups?.length ? data.groups : DEFAULT_GROUPS).map((g) => {
          const items = (data?.meta ?? []).filter((m) => (m.group ?? g.key) === g.key);
          if (items.length === 0) return null;
          return (
            <div key={g.key} className="space-y-1.5">
              <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</h3>
              <div className="grid grid-cols-1 gap-1.5">
                {items.map((m) => {
                  const Icon = ICON_MAP[m.icon] ?? BarChart3;
                  const isActive = active === m.key;
                  return (
                    <button
                      key={m.key}
                      onClick={() => {
                        setActive(m.key);
                        // Keep the URL in sync so views are shareable and Back
                        // moves between reports instead of leaving the page.
                        setSearchParams({ report: m.key });
                      }}
                      className={`group flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                        isActive
                          ? "border-primary bg-primary text-white"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md ${isActive ? "bg-white/15 text-white" : "bg-slate-100 text-slate-500 group-hover:text-slate-700"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className={`flex-1 truncate text-sm font-medium ${isActive ? "text-white" : "text-slate-800"}`} title={m.desc}>
                        {m.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <BrandLoader />
      ) : error || !data ? (
        <div className="rounded-lg border border-slate-200 bg-white py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Failed to load reports.</p>
          <p className="mt-1 text-xs text-slate-400">{error ?? "Please try again."}</p>
          <button
            className="btn-outline mx-auto mt-4 text-xs"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-800">{activeMeta?.title}</h3>
              {active === "renewalForecast" && (
                <div className="flex items-center gap-1" title="How far ahead to forecast renewals">
                  {[3, 6, 12].map((m) => (
                    <button
                      key={m}
                      onClick={() => setForecastMonths(m)}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                        forecastMonths === m
                          ? "bg-primary text-white"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {m}mo
                    </button>
                  ))}
                </div>
              )}
            </div>
            {can("report:export") && (
              <Dropdown align="right"
                trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
                items={[
                  { label: "CSV", onClick: () => exportAll("csv") },
                  { label: "Excel", onClick: () => exportAll("excel") },
                  { label: "PDF", onClick: () => exportAll("pdf") },
                ]}
              />
            )}
          </div>
          <div className="p-4">
            <ReportView active={active} payload={payload} />
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function ReportView({ active, payload }: { active: string; payload: any }) {
  if (active === "inventory") return <InventoryTable rows={payload ?? []} />;
  if (active === "registrationStatus") return <PieChart rows={payload ?? []} nameKey="status" valueKey="count" />;
  if (active === "registrationExpiry") return <ExpiryTable rows={payload ?? []} kind="registration" />;
  if (active === "insuranceExpiry") return <ExpiryTable rows={payload ?? []} kind="insurance" />;
  if (active === "byBranch") return <BarChart rows={payload ?? []} nameKey="branch" valueKey="count" />;
  if (active === "byDepartment") return <BarChart rows={payload ?? []} nameKey="department" valueKey="count" />;
  if (active === "age") return <BarChart rows={payload ?? []} nameKey="range" valueKey="count" horizontal />;
  if (active === "cost") return <CostReport data={payload} />;
  if (active === "documentCompleteness") return <CompletenessReport data={payload} />;
  if (active === "fleetAcquisition") return <AcquisitionReport data={payload} />;
  if (active === "renewalForecast") return <RenewalForecast data={payload} />;
  return null;
}

function flattenRows(key: string, payload: any): Record<string, unknown>[] {
  if (!payload) return [];
  if (key === "cost") return payload.top ?? [];
  if (key === "documentCompleteness") return payload.rows ?? [];
  if (key === "fleetAcquisition") return payload.trend ?? [];
  if (key === "renewalForecast") return payload.rows ?? [];
  if (Array.isArray(payload)) return payload;
  return [];
}

function InventoryTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return <Empty />;
  const headers = ["vehicleCode", "plateNumber", "make", "model", "year", "category", "type", "status", "branch", "department", "driver", "registrations", "documents"];
  const disp = { vehicleCode: "Code", plateNumber: "Plate", make: "Make", model: "Model", year: "Year", category: "Category", type: "Type", status: "Status", branch: "Branch", department: "Dept", driver: "Driver", registrations: "Regs", documents: "Docs" };
  return (
    <>
      <p className="mb-3 text-xs text-slate-400">{rows.length} vehicle{rows.length === 1 ? "" : "s"}</p>
      <div className="space-y-3 sm:hidden">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-slate-100 p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <VLink id={r.id} className="truncate text-sm font-semibold text-slate-800">
                {r.plateNumber}
              </VLink>
              <span className="badge flex-shrink-0 bg-slate-100 text-slate-600">{r.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
              <div><span className="font-medium text-slate-600">Code:</span> <VLink id={r.id} className="font-medium text-slate-600">{r.vehicleCode}</VLink></div>
              <div><span className="font-medium text-slate-600">Make:</span> {r.make} {r.model}</div>
              <div><span className="font-medium text-slate-600">Year:</span> {r.year}</div>
              <div><span className="font-medium text-slate-600">Cat:</span> {r.category}</div>
              <div><span className="font-medium text-slate-600">Type:</span> {r.type}</div>
              <div className="truncate"><span className="font-medium text-slate-600">Branch:</span> {r.branch}</div>
              <div className="truncate"><span className="font-medium text-slate-600">Dept:</span> {r.department}</div>
            </div>
            {r.driverId && <div className="mt-1 text-xs text-slate-400">Driver: <DLink id={r.driverId}>{r.driver}</DLink></div>}
            <div className="mt-1 flex gap-3 text-xs text-slate-400">
              <span>Regs: {r.registrations}</span>
              <span>Docs: {r.documents}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>{headers.map((h) => <th key={h} className="px-3 py-2">{disp[h as keyof typeof disp]}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                // Cells follow the header order exactly: code, plate, make,
                // model, year, category, type, status, branch, dept, driver,
                // regs, docs.
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <VLink id={r.id} className="font-medium text-slate-800 hover:underline">
                      {r.vehicleCode}
                    </VLink>
                  </td>
                  <td className="px-3 py-2">
                    <VLink id={r.id} className="font-medium text-slate-800 hover:underline">
                      {r.plateNumber}
                    </VLink>
                  </td>
                  <td className="px-3 py-2">{r.make}</td>
                  <td className="px-3 py-2">{r.model}</td>
                  <td className="px-3 py-2">{r.year}</td>
                  <td className="px-3 py-2">{r.category}</td>
                  <td className="px-3 py-2">{r.type}</td>
                  <td className="px-3 py-2"><span className="badge bg-slate-100 text-slate-600">{r.status}</span></td>
                  <td className="px-3 py-2">{r.branch}</td>
                  <td className="px-3 py-2">{r.department}</td>
                  <td className="px-3 py-2">
                    {r.driverId ? <DLink id={r.driverId}>{r.driver}</DLink> : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-3 py-2">{r.registrations}</td>
                  <td className="px-3 py-2">{r.documents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ExpiryTable({ rows, kind }: { rows: any[]; kind: "registration" | "insurance" }) {
  if (!rows?.length) return <Empty />;
  const isReg = kind === "registration";
  const cols = isReg
    ? ["regNumber", "plateNumber", "vehicleCode", "branch", "expiryDate", "daysLeft", "status"]
    : ["policyNo", "company", "plateNumber", "vehicleCode", "branch", "endDate", "daysLeft", "status"];
  const disp: Record<string, string> = { regNumber: "Reg No", policyNo: "Policy No", company: "Company", plateNumber: "Plate", vehicleCode: "Vehicle", branch: "Branch", expiryDate: "Expiry", endDate: "End Date", daysLeft: "Days Left", status: "Status" };

  function DaysBadge({ days }: { days: number | null }) {
    const dcls = days === null || days < 0 ? "bg-red-100 text-red-700" : days <= 30 ? "bg-orange-100 text-orange-700" : days <= 90 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600";
    return <span className={`badge ${dcls}`}>{days !== null && days >= 0 ? `${days}d` : "expired"}</span>;
  }

  return (
    <>
      <p className="mb-3 text-xs text-slate-400">{rows.length} due</p>
      <div className="space-y-3 sm:hidden">
        {rows.map((r, i) => {
          const days = r.daysLeft;
          return (
            <div key={i} className="rounded-lg border border-slate-100 p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-800">
                  {isReg ? r.regNumber : r.policyNo}
                </span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {r.status && <span className="badge bg-slate-100 text-slate-600">{r.status}</span>}
                  <DaysBadge days={days} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                <div><span className="font-medium text-slate-600">Plate:</span> {r.plateNumber}</div>
                <div className="truncate"><span className="font-medium text-slate-600">Veh:</span> <VLink id={r.id} className="font-medium text-slate-600">{r.vehicleCode}</VLink></div>
                <div className="truncate col-span-2"><span className="font-medium text-slate-600">Branch:</span> {r.branch}</div>
                <div className="col-span-2">
                  <span className="font-medium text-slate-600">{isReg ? "Expiry" : "End"}:</span> {formatDate(r.expiryDate || r.endDate)}
                </div>
                {!isReg && <div className="col-span-2 truncate"><span className="font-medium text-slate-600">Company:</span> {r.company}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>{cols.map((c) => <th key={c} className="px-3 py-2">{disp[c]}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const days = r.daysLeft;
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      {isReg ? <span className="badge bg-slate-100 text-slate-600">{r.regNumber}</span> : <span className="badge bg-slate-100 text-slate-600">{r.policyNo}</span>}
                    </td>
                    <td className="px-3 py-2">{r.plateNumber}</td>
                    <td className="px-3 py-2">
                      <VLink id={r.id} className="font-medium text-slate-600 hover:underline">
                        {r.vehicleCode}
                      </VLink>
                    </td>
                    <td className="px-3 py-2">{r.branch}</td>
                    <td className="px-3 py-2">{formatDate(r.expiryDate || r.endDate)}</td>
                    <td className="px-3 py-2">
                      {r.daysLeft !== undefined ? <DaysBadge days={days} /> : null}
                    </td>
                    <td className="px-3 py-2">
                      <span className="badge bg-slate-100 text-slate-600">{r.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function PieChart({ rows, nameKey, valueKey }: any) {
  if (!rows?.length) return <Empty />;
  const option = {
    tooltip: { trigger: "item" },
    legend: { bottom: 0 },
    series: [{
      type: "pie", radius: ["42%", "70%"], center: ["50%", "44%"],
      itemStyle: { borderColor: "#fff", borderWidth: 2 },
      label: { formatter: "{b}: {c}" },
      data: rows.map((r: any, i: number) => ({ name: r[nameKey], value: r[valueKey], itemStyle: { color: PALETTE[i % PALETTE.length] } })),
    }],
  };
  return <ReactECharts option={option} style={{ height: 360 }} />;
}

function BarChart({ rows, nameKey, valueKey, horizontal }: any) {
  if (!rows?.length) return <Empty />;
  const cats = rows.map((r: any) => r[nameKey]);
  const vals = rows.map((r: any) => r[valueKey]);
  const option = {
    tooltip: { trigger: "axis" },
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    xAxis: horizontal
      ? { type: "value" }
      : { type: "category", data: cats, axisLabel: { rotate: 25, fontSize: 10, interval: 0, width: 90, overflow: "truncate" } },
    yAxis: horizontal
      ? { type: "category", data: cats, axisLabel: { fontSize: 10, interval: 0, width: 140, overflow: "truncate" } }
      : { type: "value" },
    series: [{ type: "bar", data: vals, itemStyle: { color: "#273274", borderRadius: 4 }, barWidth: "55%" }],
  };
  return <ReactECharts option={option} style={{ height: 360 }} />;
}

function CostReport({ data }: { data: { summary: { total: number; average: number; count: number }; top: any[]; byBranch?: any[] } }) {
  if (!data) return <Empty />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total Fleet Cost" value={formatCurrency(data.summary.total)} />
        <Stat label="Average / Vehicle" value={formatCurrency(data.summary.average)} />
        <Stat label="Valued Vehicles" value={String(data.summary.count)} />
      </div>
      {data.byBranch?.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Cost by Branch</h3>
          <BarChart rows={data.byBranch} nameKey="branch" valueKey="total" horizontal />
        </div>
      ) : null}
      <h3 className="text-sm font-semibold text-slate-700">Top 20 by Purchase Cost</h3>
      <p className="-mt-2 text-xs text-slate-400">{data.top.length} vehicles</p>
      <div className="space-y-2 sm:hidden">
        {data.top.map((r, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">
                <VLink id={r.id} className="font-medium text-slate-800 hover:underline">{r.plateNumber}</VLink>
              </div>
              <div className="truncate text-xs text-slate-400">{r.vehicleCode} · {r.make} {r.model}</div>
            </div>
            <div className="flex-shrink-0 text-right text-sm font-medium text-slate-800">{formatCurrency(r.purchaseCost)}</div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Code</th><th className="px-3 py-2">Plate</th><th className="px-3 py-2">Make/Model</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2 text-right">Cost</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.top.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    <VLink id={r.id} className="font-medium text-slate-800 hover:underline">{r.vehicleCode}</VLink>
                  </td>
                  <td className="px-3 py-2">
                    <VLink id={r.id} className="font-medium text-slate-800 hover:underline">{r.plateNumber}</VLink>
                  </td>
                  <td className="px-3 py-2">{r.make} {r.model}</td>
                  <td className="px-3 py-2">{r.branch}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.purchaseCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function Empty() {
  return <div className="py-12 text-center text-sm text-slate-400">No data for the current filters.</div>;
}

function VLink({ id, children, className }: { id?: string | null; children: React.ReactNode; className?: string }) {
  if (!id) return <>{children}</>;
  return (
    <Link to={`/vehicles/${id}`} className={`text-blue-600 hover:underline ${className ?? ""}`}>
      {children}
    </Link>
  );
}

function DLink({ id, children, className }: { id?: string | null; children: React.ReactNode; className?: string }) {
  if (!id) return <>{children}</>;
  return (
    <Link to={`/drivers/${id}`} className={`text-blue-600 hover:underline ${className ?? ""}`}>
      {children}
    </Link>
  );
}

function AcquisitionReport({ data }: { data: { summary: { total: number; withAcquisitionDate: number; avgFleetAge: number }; trend: { year: string; count: number }[] } | null }) {
  if (!data) return <Empty />;
  const cats = data.trend.map((t) => t.year);
  const vals = data.trend.map((t) => t.count);
  const option = {
    tooltip: { trigger: "axis" },
    grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: cats, axisLabel: { rotate: 0, fontSize: 10, interval: 0 } },
    yAxis: { type: "value", minInterval: 1 },
    series: [{
      type: "bar", data: vals,
      itemStyle: { color: "#012169", borderRadius: [4, 4, 0, 0] },
      barWidth: "55%",
      label: { show: true, position: "top", fontSize: 10 },
    }],
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Vehicles" value={String(data.summary.total)} />
        <Stat label="Avg. Ownership Tenure" value={`${data.summary.avgFleetAge} yrs`} />
        <Stat label="With Acqu. Date" value={String(data.summary.withAcquisitionDate)} />
      </div>
      {data.trend.length === 0 ? <Empty /> : (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Vehicles by Acquisition Year</h3>
          <ReactECharts option={option} style={{ height: 360 }} />
        </div>
      )}
    </div>
  );
}

function RenewalForecast({ data }: { data: { months: number; summary: { registrations: number; insurance: number; total: number }; rows: any[] } | null }) {
  if (!data) return <Empty />;
  const cols = ["kind", "plateNumber", "vehicleCode", "ref", "branch", "dueDate", "daysLeft"];
  const disp: Record<string, string> = { kind: "Type", plateNumber: "Plate", vehicleCode: "Vehicle", ref: "Ref", branch: "Branch", dueDate: "Due", daysLeft: "Days" };
  const rows = data.rows;

  function KindBadge({ kind }: { kind: string }) {
    return <span className={`badge ${kind === "Registration" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{kind}</span>;
  }
  function DaysBadge({ days }: { days: number | null }) {
    const cls = days === null || days < 0 ? "bg-red-100 text-red-700" : days <= 30 ? "bg-orange-100 text-orange-700" : "bg-amber-100 text-amber-700";
    return <span className={`badge ${cls}`}>{days !== null && days >= 0 ? `${days}d` : "expired"}</span>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Registrations" value={String(data.summary.registrations)} />
        <Stat label="Insurance" value={String(data.summary.insurance)} />
        <Stat label="Total Due" value={String(data.summary.total)} />
      </div>
      <p className="-mt-1 text-xs text-slate-400">{rows.length} item{rows.length === 1 ? "" : "s"} due in the next {data.months} month{data.months === 1 ? "" : "s"}</p>
      {rows.length === 0 ? <Empty /> : (
        <div className="space-y-3 sm:hidden">
          {rows.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-100 p-4">
<div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <KindBadge kind={r.kind} />
                    <VLink id={r.id} className="truncate text-sm font-semibold text-slate-800">
                      {r.plateNumber}
                    </VLink>
                  </div>
                  <DaysBadge days={r.daysLeft} />
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                  <div><span className="font-medium text-slate-600">Vehicle:</span> <VLink id={r.id} className="font-medium text-slate-600">{r.vehicleCode}</VLink></div>
                  <div className="truncate"><span className="font-medium text-slate-600">Ref:</span> {r.ref}</div>
                <div className="truncate col-span-2"><span className="font-medium text-slate-600">Branch:</span> {r.branch}</div>
                <div className="col-span-2"><span className="font-medium text-slate-600">Due:</span> {formatDate(r.dueDate)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {rows.length > 0 && (
        <div className="hidden sm:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>{cols.map((c) => <th key={c} className="px-3 py-2">{disp[c]}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    {cols.map((c) => (
                      <td key={c} className="px-3 py-2">
                        {c === "kind" ? <KindBadge kind={r[c]} />
                          : c === "daysLeft" ? <DaysBadge days={r[c]} />
                          : c === "dueDate" ? formatDate(r[c])
                          : c === "vehicleCode" ? (
                            <VLink id={r.id} className="font-medium text-slate-600 hover:underline">
                              {r[c]}
                            </VLink>
                          ) : r[c]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CompletenessReport({ data }: { data: { required: string[]; summary: { total: number; complete: number; incomplete: number }; categorySummary: { category: string; totalVehicles: number; present: number; missing: number; expired: number }[]; rows: any[] } | null }) {
  if (!data) return <Empty />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Vehicles" value={String(data.summary.total)} />
        <Stat label="Complete" value={String(data.summary.complete)} />
        <Stat label="Incomplete" value={String(data.summary.incomplete)} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Compliance by Document Type</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.categorySummary.map((item) => (
            <div key={item.category} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">{item.category}</span>
                <span className={`badge ${item.missing === 0 && item.expired === 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                  {item.missing === 0 && item.expired === 0 ? "Compliant" : "Needs attention"}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><div className="text-lg font-semibold text-slate-800">{item.present}</div><div className="text-[11px] uppercase tracking-wide text-slate-400">Present</div></div>
                <div><div className="text-lg font-semibold text-slate-800">{item.missing}</div><div className="text-[11px] uppercase tracking-wide text-slate-400">Missing</div></div>
                <div><div className="text-lg font-semibold text-slate-800">{item.expired}</div><div className="text-[11px] uppercase tracking-wide text-slate-400">Expired</div></div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs uppercase tracking-wide text-slate-400">Required:</span>
        {data.required.map((r) => (
          <span key={r} className="badge bg-primary/10 text-primary">{r}</span>
        ))}
      </div>
      {data.rows.length === 0 ? <Empty /> : (
        <div className="flex flex-col gap-3">
          {data.rows.map((r, i) => {
            const missing = Array.isArray(r.missing) ? r.missing : [];
            const expired = Array.isArray(r.expired) ? r.expired : [];
            return (
              <div key={i} className="rounded-lg border border-slate-100 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
<div className="flex items-center gap-2">
                       <span className="truncate text-sm font-semibold text-slate-800">
                         <VLink id={r.id} className="font-medium text-slate-800 hover:underline">{r.plateNumber}</VLink>
                       </span>
                       <VLink id={r.id} className="badge bg-slate-100 text-slate-600 hover:underline">{r.vehicleCode}</VLink>
                    </div>
                    <div className="text-xs text-slate-400">{r.branch}{r.department !== "-" ? ` · ${r.department}` : ""}</div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="badge bg-slate-100 text-slate-600">{r.present}/{r.requiredTotal} present</span>
                    {r.complete
                      ? <span className="badge bg-green-100 text-green-700">Complete</span>
                      : <span className="badge bg-red-100 text-red-700">Incomplete</span>}
                  </div>
                </div>
                {missing.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">Missing:</span> {missing.join(", ")}
                  </div>
                )}
                {expired.length > 0 && (
                  <div className="mt-1 text-xs text-amber-600">
                    <span className="font-medium">Expired:</span> {expired.join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
