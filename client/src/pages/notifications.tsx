import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BellDot, Check, Trash2, Car, ShieldCheck, CheckCheck, Inbox } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Select } from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { formatDateTime, formatRelative, label } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

interface NotifMeta { stage?: string | null }
interface NotifRow {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  meta?: NotifMeta | string | null;
}

// Fallback list so the type filter stays usable even when the user has
// dismissed everything — /types only returns types with live rows.
const STATIC_TYPES = ["REGISTRATION_REMINDER", "INSURANCE_REMINDER"];

function parseStage(n: NotifRow): string | null {
  if (!n.meta) return null;
  if (typeof n.meta === "string") {
    try { const p = JSON.parse(n.meta); return p?.stage ?? null; } catch { return null; }
  }
  return n.meta.stage ?? null;
}

// Severity styling — the server already escalates primary → secondary →
// warning → critical → expired; surface it visually.
function severityOf(n: NotifRow): "expired" | "critical" | "warning" | "info" {
  const stage = parseStage(n);
  if (stage === "expired") return "expired";
  if (stage === "critical") return "critical";
  if (stage === "warning") return "warning";
  return "info";
}

const SEVERITY_META = {
  expired:  { label: "Expired",  badge: "bg-red-100 text-red-700",    dot: "bg-red-600",    row: "" },
  critical: { label: "Critical", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500", row: "" },
  warning:  { label: "Warning",  badge: "bg-amber-100 text-amber-700",  dot: "bg-amber-500",  row: "" },
  info:     { label: "Info",     badge: "bg-blue-100 text-blue-700",   dot: "bg-blue-500",   row: "" },
} as const;

function typeIcon(type: string) {
  return type.startsWith("INSURANCE") ? ShieldCheck : Car;
}

function dayBucket(iso: string): "today" | "yesterday" | "earlier" {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    fetch("/api/notifications/types").then((r) => r.json()).then(setTypes).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (typeFilter) qs.set("type", typeFilter);
    if (unreadOnly) qs.set("unreadOnly", "true");
    const res = await fetch(`/api/notifications?${qs.toString()}`);
    const data = await res.json();
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    setUnreadTotal(data.unreadTotal ?? 0);
    if (data.pageSize) setPageSize(data.pageSize);
    setSelected(new Set());
    setLoading(false);
  }, [page, typeFilter, unreadOnly]);

  useEffect(() => { load(); }, [load]);

  // Fresh type list after dismissals so the dropdown doesn't offer empty filters.
  useEffect(() => {
    if (loading) return;
    fetch("/api/notifications/types").then((r) => r.json()).then(setTypes).catch(() => {});
  }, [total, loading]);

  function patchLocal(id: string, patch: Partial<NotifRow>) {
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    setUnreadTotal((u) => Math.max(0, u - 1));
  }

  async function markOne(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    patchLocal(id, { isRead: true });
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
  }

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setRows((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadTotal(0);
    toast("success", "All notifications marked as read");
  }

  async function deleteOne(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    setRows((prev) => prev.filter((n) => n.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    toast("success", "Notification dismissed");
  }

  async function clearAll() {
    await fetch("/api/notifications/", { method: "DELETE" });
    setRows([]);
    setTotal(0);
    setUnreadTotal(0);
    toast("success", "All notifications dismissed");
    setClearConfirmOpen(false);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  async function bulkAction(action: "read" | "dismiss") {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const res = await fetch("/api/notifications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast("error", d.error ?? "Bulk action failed");
      return;
    }
    const d = await res.json();
    toast("success", `${d.updated} notification${d.updated === 1 ? "" : "s"} ${action === "read" ? "marked as read" : "dismissed"}`);
    // Soft-failover: if the page emptied out, go back to the last valid page.
    const remaining = total - (action === "dismiss" ? d.updated : 0);
    if (action === "dismiss" && remaining <= (page - 1) * pageSize && page > 1) {
      setPage((p) => Math.max(1, p - 1));
    } else {
      await load();
    }
  }

  const unreadOnPage = rows.some((n) => !n.isRead);

  const grouped = useMemo(() => {
    const buckets: Record<"today" | "yesterday" | "earlier", NotifRow[]> = { today: [], yesterday: [], earlier: [] };
    for (const r of rows) buckets[dayBucket(r.createdAt)].push(r);
    return buckets;
  }, [rows]);

  const allTypes = useMemo(
    () => Array.from(new Set([...types, ...STATIC_TYPES])).sort(),
    [types]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Notifications</h2>
          <p className="text-sm text-slate-500">Alerts &amp; reminders</p>
        </div>
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {unreadOnPage && (
              <button className="btn-outline text-xs" onClick={markAll}>
                <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
              </button>
            )}
            <button className="btn-outline text-xs text-red-600 hover:bg-red-50" onClick={() => setClearConfirmOpen(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Dismiss all
            </button>
          </div>
        )}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <Select
          className="w-full sm:w-52"
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
          placeholder="All types"
          options={[
            { value: "", label: "All types" },
            ...allTypes.map((t) => ({ value: t, label: label(t) })),
          ]}
        />
        <button
          onClick={() => { setUnreadOnly((u) => !u); setPage(1); }}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${unreadOnly ? "border-primary bg-primary/10 text-primary" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"}`}
        >
          <Inbox className="h-3.5 w-3.5" /> Unread only
        </button>
        <span className="text-sm text-slate-500">
          {unreadTotal > 0 ? `${unreadTotal} unread` : "All read"}
        </span>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <BrandLoader />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BellDot className="mb-3 h-10 w-10 text-slate-300" />
            <h3 className="text-base font-semibold text-slate-700">All caught up!</h3>
            <p className="mt-1 text-sm text-slate-400">
              {unreadOnly || typeFilter ? "No notifications match the current filter." : "You'll get alerts here when registrations or insurance policies near expiry."}
            </p>
          </div>
        ) : selected.size > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium text-primary">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <button className="btn-outline px-3 py-1.5 text-xs" onClick={() => bulkAction("read")}>
                <CheckCheck className="mr-1 h-3.5 w-3.5" /> Mark read
              </button>
              <button className="btn-outline px-3 py-1.5 text-xs text-red-600 hover:bg-red-50" onClick={() => bulkAction("dismiss")}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Dismiss
              </button>
              <button className="px-2 text-xs text-slate-400 underline hover:text-slate-600" onClick={() => setSelected(new Set())}>Clear selection</button>
            </div>
          </div>
        ) : null}

        {!loading && rows.length > 0 && (
          <>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-xs text-slate-400">
              <button onClick={toggleSelectAll} className="inline-flex items-center gap-1.5 hover:text-slate-600">
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected.size === rows.length ? "border-primary bg-primary text-white" : "border-slate-300"}`}>
                  {selected.size === rows.length && <Check className="h-3 w-3" />}
                </span>
                {selected.size === rows.length ? "Deselect all" : "Select all"}
              </button>
              <span>{rows.length} on this page</span>
            </div>

            {(["today", "yesterday", "earlier"] as const).map((bucket) =>
              grouped[bucket].length === 0 ? null : (
                <div key={bucket}>
                  <div className="bg-slate-50/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {bucket === "today" ? "Today" : bucket === "yesterday" ? "Yesterday" : "Earlier"}
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {grouped[bucket].map((row) => {
                      const sev = SEVERITY_META[severityOf(row)];
                      const Icon = typeIcon(row.type);
                      return (
                        <li key={row.id} className={`group flex items-start gap-3 px-4 py-3 hover:bg-slate-50 ${!row.isRead ? "bg-primary/[0.03]" : ""}`}>
                          <button
                            onClick={() => toggleSelect(row.id)}
                            className={`touch-visible mt-1 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${selected.has(row.id) ? "border-primary bg-primary text-white" : "border-slate-300 opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
                            title="Select"
                          >
                            {selected.has(row.id) && <Check className="h-3 w-3" />}
                          </button>

                          <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${row.isRead ? "bg-transparent" : sev.dot}`} />

                          <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${sev.badge}`}>
                            <Icon className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {row.link ? (
                                <Link to={row.link} onClick={() => !row.isRead && markOne(row.id)} className="text-sm font-medium text-slate-800 hover:text-primary">
                                  {row.title}
                                </Link>
                              ) : (
                                <span className={`text-sm ${row.isRead ? "text-slate-500" : "font-medium text-slate-800"}`}>{row.title}</span>
                              )}
                              <span className={`badge shrink-0 ${sev.badge}`}>{sev.label}</span>
                              <span className="badge shrink-0 bg-slate-100 text-slate-500">{label(row.type)}</span>
                            </div>
                            <p className={`mt-0.5 text-xs ${row.isRead ? "text-slate-400" : "text-slate-500"}`}>{row.message}</p>
                          </div>

                          <div className="flex flex-shrink-0 items-center gap-1">
                            <span className="hidden whitespace-nowrap text-xs text-slate-400 sm:block" title={formatDateTime(row.createdAt)}>
                              {formatRelative(row.createdAt)}
                            </span>
                            {!row.isRead && (
                              <button
                                onClick={() => markOne(row.id)}
                                className="touch-visible rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 focus:opacity-100"
                                title="Mark read"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => deleteOne(row.id)}
                              className="touch-visible rounded-md p-1 text-slate-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 focus:opacity-100"
                              title="Dismiss"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
            )}
          </>
        )}

        {!loading && rows.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
            <span className="text-sm font-medium text-slate-600">{total} notification(s)</span>
            <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
            <div className="flex gap-2">
              <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={clearAll}
        title="Dismiss all notifications?"
        message="This hides every notification from your list. Expiring items will still re-appear if they remain unresolved."
        confirmLabel="Dismiss all"
      />
    </div>
  );
}
