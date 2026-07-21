import { useCallback, useEffect, useState } from "react";
import { History, ChevronDown, ChevronRight, Search } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/datepicker";
import { formatDateTime } from "@/lib/format";

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
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
};

export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actions, setActions] = useState<string[]>([]);
  const [entities, setEntities] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/audit/actions").then((r) => r.json()).then(setActions).catch(() => {});
    fetch("/api/audit/entities").then((r) => r.json()).then(setEntities).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (action) qs.set("action", action);
    if (entity) qs.set("entity", entity);
    if (userSearch) qs.set("userId", userSearch);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    const res = await fetch(`/api/audit?${qs.toString()}`);
    const data = await res.json();
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    if (data.pageSize) setPageSize(data.pageSize);
    setLoading(false);
  }, [page, action, entity, userSearch, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold text-slate-800 flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Audit Trail
        </h2>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
        <div className="flex-1 sm:flex-initial">
          <label className="mb-1 block text-xs font-medium text-slate-500">Action</label>
          <Select
            className="w-full sm:w-36"
            value={action}
            onChange={setAction}
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
            onChange={setEntity}
            options={[
              { value: "", label: "All Entities" },
              ...entities.map((e) => ({ value: e, label: e })),
            ]}
          />
        </div>
        <div className="flex-1 sm:flex-initial">
          <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
          <DatePicker value={from} onChange={setFrom} />
        </div>
        <div className="flex-1 sm:flex-initial">
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <DatePicker value={to} onChange={setTo} />
        </div>
        <button className="btn-primary h-9" onClick={() => { setPage(1); load(); }}>
          <Search className="mr-1 h-4 w-4" />
          Filter
        </button>
        <button
          className="btn-outline h-9"
          onClick={() => {
            setAction(""); setEntity(""); setUserSearch(""); setFrom(""); setTo(""); setPage(1);
          }}
        >
          Reset
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        {loading ? (
          <div className="flex justify-center py-16"><BrandLoader /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <History className="mb-2 h-10 w-10" />
            <p>No audit logs found</p>
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
                return (
                  <tr key={row.id} className="group text-sm hover:bg-slate-50">
                    <td className="px-3 py-2.5">
                      {hasDiff && (
                        <button onClick={() => toggle(row.id)} className="text-slate-300 hover:text-slate-600">
                          {expanded.has(row.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
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
                        <span className="font-mono text-xs">{row.plateNumber ?? row.vehicleCode}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.user}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{row.ipAddress ?? "—"}</td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-500">{formatDateTime(row.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-slate-100 sm:hidden">
          {rows.map((row) => {
            const hasDiff = !!(row.oldValue || row.newValue);
            return (
              <div key={row.id} className="space-y-2 px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className={`badge ${ACTION_COLORS[row.action] ?? "bg-slate-100 text-slate-600"}`}>{row.action}</span>
                  <span className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(row.createdAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-slate-500">Entity:</span>
                  <span className="text-slate-700">{row.entity}</span>
                  <span className="text-slate-500">Vehicle:</span>
                  <span className="text-slate-700">{row.plateNumber ?? row.vehicleCode ?? "—"}</span>
                  <span className="text-slate-500">User:</span>
                  <span className="text-slate-700">{row.user}</span>
                  <span className="text-slate-500">IP:</span>
                  <span className="font-mono text-slate-700">{row.ipAddress ?? "—"}</span>
                </div>
                {hasDiff && (
                  <>
                    <button onClick={() => toggle(row.id)} className="flex items-center gap-1 text-xs text-primary">
                      {expanded.has(row.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {expanded.has(row.id) ? "Hide details" : "Show details"}
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Expanded detail rows */}
        {expanded.size > 0 && (
          <div className="border-t border-slate-100">
            {rows
              .filter((r) => expanded.has(r.id))
              .map((row) => (
                <div key={`detail-${row.id}`} className="border-b border-slate-50 bg-slate-50 px-4 py-3 text-xs">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <h4 className="mb-1 font-semibold text-slate-500">Previous Value</h4>
                      <pre className="max-h-48 overflow-auto rounded bg-white p-2 font-mono text-xs text-slate-700">
                        {row.oldValue ? JSON.stringify(row.oldValue, null, 2) : "—"}
                      </pre>
                    </div>
                    <div>
                      <h4 className="mb-1 font-semibold text-slate-500">New Value</h4>
                      <pre className="max-h-48 overflow-auto rounded bg-white p-2 font-mono text-xs text-slate-700">
                        {row.newValue ? JSON.stringify(row.newValue, null, 2) : "—"}
                      </pre>
                    </div>
                  </div>
                  {row.userAgent && (
                    <p className="mt-2 text-slate-400">User-Agent: {row.userAgent}</p>
                  )}
                </div>
              ))}
          </div>
        )}

          </>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{total} log(s)</span>
        <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
        <div className="flex gap-2">
          <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>
      </div>
    </div>
  );
}
