import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, ChevronDown, ChevronRight, Search, Download } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { useBrand } from "@/lib/brand-context";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { formatDateTime, formatRelative } from "@/lib/format";
import { exportCsv, exportXlsx, exportPdf, rowsToHtmlTable, downloadServerCsv, reportFilename, type ExportMeta } from "@/lib/export";
import { Dropdown } from "@/components/ui/dropdown";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/lib/toast-context";
import { useAuth } from "@/components/auth-context";
import { PERMISSIONS } from "@/lib/rbac";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  vehicleId: string | null;
  vehicleCode: string | null;
  plateNumber: string | null;
  user: string;
  oldValue: unknown | null;
  newValue: unknown | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-700",
  UPDATE: "bg-blue-100 text-blue-700",
  DELETE: "bg-red-100 text-red-700",
  LOGIN: "bg-purple-100 text-purple-700",
  RENEW: "bg-cyan-100 text-cyan-700",
  SUSPEND: "bg-orange-100 text-orange-700",
  UPLOAD: "bg-indigo-100 text-indigo-700",
  RETURN: "bg-teal-100 text-teal-700",
  ASSIGN: "bg-sky-100 text-sky-700",
  ARCHIVE: "bg-stone-100 text-stone-600",
  RESTORE_TRASH: "bg-lime-100 text-lime-700",
  PURGE: "bg-red-100 text-red-700",
  EXPORT: "bg-violet-100 text-violet-700",
  ACCOUNT_LOCKED: "bg-red-100 text-red-700",
  CANCELLED: "bg-slate-200 text-slate-600",
};

function fmtDiffVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

// Field-level before→after rendering: changed fields highlighted, unchanged
// collapsed behind a toggle — far easier to review than two raw JSON blobs.
function DiffView({ row }: { row: AuditRow }) {
  const [showAll, setShowAll] = useState(false);
  const oldObj = row.oldValue && typeof row.oldValue === "object" ? (row.oldValue as Record<string, unknown>) : null;
  const newObj = row.newValue && typeof row.newValue === "object" ? (row.newValue as Record<string, unknown>) : null;

  if (!oldObj && !newObj) {
    return (
      <div className="space-y-2">
        {row.entityId && (
          <div className="text-xs text-slate-400">Record ID: <span className="font-mono text-slate-600">{row.entityId}</span></div>
        )}
        <p className="text-xs text-slate-400">No field details recorded for this event.</p>
      </div>
    );
  }

  const keys = Array.from(new Set([...Object.keys(oldObj ?? {}), ...Object.keys(newObj ?? {})])).sort();
  const entries = keys.map((key) => ({
    key,
    from: oldObj?.[key],
    to: newObj?.[key],
    changed: JSON.stringify(oldObj?.[key] ?? null) !== JSON.stringify(newObj?.[key] ?? null),
  }));
  const changed = entries.filter((e) => e.changed);
  const visible = showAll ? entries : changed;

  return (
    <div className="space-y-2">
      {row.entityId && (
        <div className="text-xs text-slate-400">Record ID: <span className="font-mono text-slate-600">{row.entityId}</span></div>
      )}
      {changed.length === 0 ? (
        <p className="text-xs text-slate-400">No field changes recorded.</p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((e) => (
              <li
                key={e.key}
                className={`rounded-lg border px-3 py-2 ${e.changed ? "border-amber-200 bg-amber-50/60" : "border-slate-100 bg-white"}`}
              >
                <div className="font-mono text-xs font-medium text-slate-700">{e.key}</div>
                <div className="mt-1 grid gap-1 sm:grid-cols-2">
                  <div className="rounded bg-white/70 px-2 py-1 font-mono text-xs">
                    <span className="mb-0.5 block font-sans text-[10px] font-medium uppercase tracking-wide text-slate-400">Before</span>
                    <span className={e.changed ? "text-red-600" : "text-slate-500"}>{fmtDiffVal(e.from)}</span>
                  </div>
                  <div className="rounded bg-white/70 px-2 py-1 font-mono text-xs">
                    <span className="mb-0.5 block font-sans text-[10px] font-medium uppercase tracking-wide text-slate-400">After</span>
                    <span className={e.changed ? "text-emerald-700" : "text-slate-500"}>{fmtDiffVal(e.to)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {entries.length > changed.length && (
            <button onClick={() => setShowAll((s) => !s)} className="text-xs font-medium text-primary hover:underline">
              {showAll ? "Hide unchanged fields" : `Show ${entries.length - changed.length} unchanged field(s)`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function AuditLogsPage() {
  const { companyName } = useBrand();
  const { toast } = useToast();
  const { can, user } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actions, setActions] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/audit/actions").then((r) => r.json()).then(setActions).catch(() => {});
    fetch("/api/audit/entities").then((r) => r.json()).then(setEntities).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (action) qs.set("action", action);
    if (entity) qs.set("entity", entity);
    if (search) qs.set("search", search);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    try {
      const res = await fetch(`/api/audit?${qs.toString()}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      if (data.pageSize) setPageSize(data.pageSize);
    } catch (e) {
      // A compliance surface must never report "nothing happened" when it
      // actually failed to look.
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, action, entity, search, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const exportColumns = (r: AuditRow) => ({
    Action: r.action,
    Entity: r.entity,
    "Entity ID": r.entityId ?? "",
    "Vehicle Code": r.vehicleCode ?? "",
    "Plate Number": r.plateNumber ?? "",
    User: r.user,
    "IP Address": r.ipAddress ?? "",
    "User Agent": r.userAgent ?? "",
    "Created At": formatDateTime(r.createdAt),
  });

  function exportMeta(scope: string): ExportMeta {
    const parts: string[] = [];
    if (search) parts.push(`Search: "${search}"`);
    if (action) parts.push(`Action: ${action}`);
    if (entity) parts.push(`Entity: ${entity}`);
    if (from || to) parts.push(`From ${from || "…"} to ${to || "…"}`);
    return {
      title: "Audit Trail",
      subtitle: parts.length ? `${scope} · ${parts.join(" · ")}` : scope,
      generatedBy: user?.fullName,
    };
  }

  function toPdfMeta(meta: ExportMeta, rowCount: number) {
    return { subtitle: meta.subtitle, generatedBy: meta.generatedBy, rowCount, summary: [{ label: "Entries", value: String(rowCount) }] };
  }

  function exportAudit(format: "csv" | "excel" | "pdf") {
    const data = rows.map(exportColumns);
    const meta = exportMeta(`page ${page} of ${totalPages}`);
    const name = reportFilename("Audit Trail", `page-${page}-of-${totalPages}`);
    if (format === "csv") exportCsv(`${name}.csv`, data);
    else if (format === "excel") exportXlsx(`${name}.xlsx`, data, meta);
    else exportPdf(rowsToHtmlTable(`Audit Logs (page ${page} of ${totalPages})`, data), `Audit Logs (page ${page} of ${totalPages})`, companyName, toPdfMeta(meta, data.length));
  }

  async function exportServerCsv() {
    const r = await downloadServerCsv("audit", {
      search: search || undefined,
      action: action || undefined,
      entity: entity || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    if (r.ok) toast("success", `Exported ${r.rows} audit entr${r.rows === 1 ? "y" : "ies"}`);
    else toast("error", r.error);
  }

  async function exportAllAudit(format: "csv" | "excel" | "pdf") {
    const allRows: AuditRow[] = [];
    const qs = new URLSearchParams();
    qs.set("pageSize", "1000");
    if (action) qs.set("action", action);
    if (entity) qs.set("entity", entity);
    if (search) qs.set("search", search);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    try {
      for (let p = 1; p <= 50; p++) {
        qs.set("page", String(p));
        const res = await fetch(`/api/audit?${qs.toString()}`);
        if (!res.ok) throw new Error("Export fetch failed");
        const data = await res.json();
        const items = data.items ?? [];
        allRows.push(...items);
        if (allRows.length >= (data.total ?? 0) || items.length === 0) break;
      }
    } catch {
      toast("error", "Could not collect rows for export");
      return;
    }
    if (allRows.length === 0) { toast("error", "Nothing to export"); return; }
    const meta = exportMeta("Full log");
    const data = allRows.map(exportColumns);
    const name = reportFilename("Audit Trail", "all");
    if (format === "csv") exportCsv(`${name}.csv`, data);
    else if (format === "excel") exportXlsx(`${name}.xlsx`, data, meta);
    else exportPdf(rowsToHtmlTable("Audit Logs (all)", data), "Audit Logs (all)", companyName, toPdfMeta(meta, allRows.length));
    toast("success", `Exported ${allRows.length} audit entr${allRows.length === 1 ? "y" : "ies"}`);
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Audit Trail</h2>
          <p className="text-sm text-slate-500">System-wide activity &amp; change history</p>
        </div>
          {rows.length > 0 && can(PERMISSIONS.DATA_EXPORT) && (
            <Dropdown align="right"
              trigger={({ toggle }) => (<Tooltip content="Export"><button onClick={toggle} className="btn-outline text-xs"><Download className="h-3.5 w-3.5" /> Export</button></Tooltip>)}
              items={[
                { label: "Current view — all pages", header: true },
                { label: "CSV", onClick: () => exportServerCsv() },
                { label: "Excel", onClick: () => exportAllAudit("excel") },
                { label: "PDF", onClick: () => exportAllAudit("pdf") },
                { label: `This page only (${rows.length} rows)`, header: true },
                { label: "CSV", onClick: () => exportAudit("csv") },
                { label: "Excel", onClick: () => exportAudit("excel") },
                { label: "PDF", onClick: () => exportAudit("pdf") },
              ]}
            />
          )}
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="relative min-w-[160px] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
          <Search className="absolute left-3 top-[34px] h-4 w-4 text-slate-400" />
          <input className="input pl-9" placeholder="Action, entity, user..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex-1 sm:flex-initial">
          <label className="mb-1 block text-xs font-medium text-slate-500">Action</label>
          <Select
            className="w-full sm:w-36"
            value={action}
            onChange={(v) => { setAction(v); setPage(1); }}
            options={[
              { value: "", label: "All Actions" },
              ...actions.map((a) => ({ value: a, label: a })),
            ]}
          />
        </div>
        <div className="flex-1 sm:flex-initial">
          <label className="mb-1 block text-xs font-medium text-slate-500">Entity</label>
          <Select
            className="w-full sm:w-44"
            value={entity}
            onChange={(v) => { setEntity(v); setPage(1); }}
            options={[
              { value: "", label: "All Entities" },
              ...entities.map((e) => ({ value: e, label: e })),
            ]}
          />
        </div>
        <div className="flex-1 sm:flex-initial">
          <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
          <DatePicker value={from} onChange={(v) => { setFrom(v); setPage(1); }} />
        </div>
        <div className="flex-1 sm:flex-initial">
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <DatePicker value={to} onChange={(v) => { setTo(v); setPage(1); }} />
        </div>
        {(action || entity || search || from || to) && (
          <button
            className="btn-outline h-9"
            onClick={() => { setAction(""); setEntity(""); setSearch(""); setFrom(""); setTo(""); setPage(1); }}
          >
            Reset
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <History className="h-10 w-10 text-red-300" />
            <h3 className="text-base font-semibold text-slate-700">Couldn't load audit logs</h3>
            <p className="text-sm text-slate-400">{error}</p>
            <button className="btn-outline mt-1" onClick={() => load()}>Try again</button>
          </div>
        ) : loading ? (
          <BrandLoader />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <History className="mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-base font-semibold text-slate-700">No audit logs found</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-400">No activity matches the current filters.</p>
          </div>
        ) : (
<>
        {/* Desktop table */}
        <div className="hidden min-w-0 sm:block">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3">Action</th>
                <th className="px-3 py-3">Entity</th>
                <th className="px-3 py-3">Vehicle</th>
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">IP Address</th>
                <th className="px-3 py-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const hasDiff = !!(row.oldValue || row.newValue);
                const open = expanded.has(row.id);
                return (
                  <React.Fragment key={row.id}>
                  <tr className="group text-sm hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      {hasDiff && (
                        <Tooltip content={open ? "Hide details" : "Show details"}>
                          <button onClick={() => toggle(row.id)} className="text-slate-300 hover:text-slate-600">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </Tooltip>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`badge ${ACTION_COLORS[row.action] ?? "bg-slate-100 text-slate-600"}`}>
                        {row.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{row.entity}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {row.plateNumber || row.vehicleCode ? (
                        row.vehicleId ? (
                          <Link to={`/vehicles/${row.vehicleId}`} className="font-mono text-xs text-blue-600 hover:underline">
                            {row.plateNumber ?? row.vehicleCode}
                          </Link>
                        ) : (
                          <span className="font-mono text-xs">{row.plateNumber ?? row.vehicleCode}</span>
                        )
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.user}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{row.ipAddress ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-500" title={formatDateTime(row.createdAt)}>{formatRelative(row.createdAt)}</td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50">
                      <td colSpan={7} className="px-4 py-3">
                        <DiffView row={row} />
                        {row.userAgent && (
                          <p className="mt-2 text-xs text-slate-400">User-Agent: {row.userAgent}</p>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 sm:hidden">
          {rows.map((row) => {
            const hasDiff = !!(row.oldValue || row.newValue);
            const open = expanded.has(row.id);
            return (
                <div key={row.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`badge ${ACTION_COLORS[row.action] ?? "bg-slate-100 text-slate-600"}`}>{row.action}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400" title={formatDateTime(row.createdAt)}>{formatRelative(row.createdAt)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-slate-500">Entity:</span>
                    <span className="text-slate-700">{row.entity}</span>
                    <span className="text-slate-500">Vehicle:</span>
                    <span className="text-slate-700">
                      {row.plateNumber || row.vehicleCode ? (
                        row.vehicleId ? (
                          <Link to={`/vehicles/${row.vehicleId}`} className="font-mono text-blue-600 hover:underline">
                            {row.plateNumber ?? row.vehicleCode}
                          </Link>
                        ) : (
                          <span className="font-mono">{row.plateNumber ?? row.vehicleCode}</span>
                        )
                      ) : "—"}
                    </span>
                  <span className="text-slate-500">User:</span>
                  <span className="text-slate-700">{row.user}</span>
                  <span className="text-slate-500">IP:</span>
                  <span className="font-mono text-slate-700">{row.ipAddress ?? "—"}</span>
                </div>
                {hasDiff && (
                  <>
                    <button onClick={() => toggle(row.id)} className="flex items-center gap-1 text-xs text-primary">
                      {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {open ? "Hide details" : "Show details"}
                    </button>
                    {open && (
                      <div className="grid gap-3 rounded-lg bg-slate-100 p-3">
                        <DiffView row={row} />
                        {row.userAgent && (
                          <p className="text-xs text-slate-400">User-Agent: {row.userAgent}</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <span className="text-sm font-medium text-slate-600">{total} log(s)</span>
            <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
            <div className="flex gap-2">
              <button className="btn-outline px-3 py-1" onClick={() => load()} title="Refresh the log">Refresh</button>
              <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
