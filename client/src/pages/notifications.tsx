import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, BellDot, MoreVertical, Check, Trash2 } from "lucide-react";
import { BrandLoader } from "@/components/ui/brand-loader";
import { Select } from "@/components/ui/select";
import { csrfHeaders } from "@/lib/csrf";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Dropdown } from "@/components/ui/dropdown";
import { formatDateTime, label } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

interface NotifRow {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<NotifRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    fetch("/api/notifications/types").then((r) => r.json()).then(setTypes).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("page", String(page));
    if (typeFilter) qs.set("type", typeFilter);
    const res = await fetch(`/api/notifications?${qs.toString()}`);
    const data = await res.json();
    setRows(data.items ?? []);
    setTotal(data.total ?? 0);
    if (data.pageSize) setPageSize(data.pageSize);
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { load(); }, [load]);

  async function markOne(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH", headers: csrfHeaders() });
    setRows((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST", headers: csrfHeaders() });
    setRows((prev) => prev.map((n) => ({ ...n, isRead: true })));
    toast("success", "All notifications marked as read");
  }

  async function deleteOne(id: string) {
    await fetch(`/api/notifications/${id}`, { method: "DELETE", headers: csrfHeaders() });
    setRows((prev) => prev.filter((n) => n.id !== id));
    setTotal((prev) => prev - 1);
    toast("success", "Notification deleted");
  }

  async function clearAll() {
    await fetch("/api/notifications/", { method: "DELETE", headers: csrfHeaders() });
    setRows([]);
    setTotal(0);
    toast("success", "All notifications cleared");
    setClearConfirmOpen(false);
  }

  const unreadCount = rows.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="mr-auto flex items-center gap-2 text-lg font-semibold text-slate-800">
          <Bell className="h-5 w-5 text-primary" />
          Notifications
        </h2>
        {rows.length > 0 && (
          <>
            {unreadCount > 0 && (
              <button className="btn-outline text-xs" onClick={markAll}>
                <Check className="mr-1 h-3.5 w-3.5" /> Mark all read
              </button>
            )}
            <button className="btn-outline text-xs text-red-600 hover:bg-red-50" onClick={() => setClearConfirmOpen(true)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear all
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4">
        <Select
          className="w-full sm:w-52"
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
          placeholder="All types"
          options={[
            { value: "", label: "All types" },
            ...types.map((t) => ({ value: t, label: label(t) })),
          ]}
        />
        <span className="text-sm text-slate-500">
          {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        {loading ? (
          <div className="flex justify-center py-16"><BrandLoader /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-400">
            <BellDot className="mb-2 h-10 w-10" />
            <p className="text-base font-medium text-slate-600">All caught up!</p>
            <p className="mt-1 text-sm">No notifications match the current filter.</p>
          </div>
        ) : (
          <>
            <div className="hidden min-w-0 sm:block">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="w-4 px-4 py-3" />
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3 text-right">Date</th>
                    <th className="w-12 px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className={cn("text-sm hover:bg-slate-50", row.isRead ? "text-slate-500" : "font-medium text-slate-800")}>
                      <td className="px-4 py-3">
                        {!row.isRead && <span className="block h-2 w-2 rounded-full bg-primary" />}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge bg-blue-100 text-blue-700">{label(row.type)}</span>
                      </td>
                      <td className="min-w-0 px-4 py-3">
                        {row.link ? (
                          <Link to={row.link} onClick={() => markOne(row.id)} className="hover:text-primary">
                            <span className="font-medium">{row.title}</span>
                            <p className="mt-0.5 text-xs text-slate-500">{row.message}</p>
                          </Link>
                        ) : (
                          <>
                            <span className="font-medium">{row.title}</span>
                            <p className="mt-0.5 text-xs text-slate-500">{row.message}</p>
                          </>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-400">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Dropdown
                          align="right"
                          trigger={({ toggle }) => (
                            <button onClick={toggle} className="rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600" title="Actions">
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          )}
                          items={[
                            ...(!row.isRead ? [{ label: "Mark read", icon: <Check className="h-4 w-4" />, onClick: () => markOne(row.id) }] : []),
                            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => deleteOne(row.id) },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 sm:hidden">
              {rows.map((row) => (
                <div key={row.id} className={cn("space-y-1 px-4 py-3 text-sm", !row.isRead && "bg-primary/5")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {!row.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <div>
                        <span className={`badge ${row.isRead ? "bg-slate-100 text-slate-500" : "bg-blue-100 text-blue-700"}`}>
                          {label(row.type)}
                        </span>
                      </div>
                    </div>
                    <span className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(row.createdAt)}</span>
                  </div>
                  {row.link ? (
                    <Link to={row.link} onClick={() => markOne(row.id)} className="block hover:text-primary">
                      <div className="font-medium">{row.title}</div>
                      <p className="text-xs text-slate-500">{row.message}</p>
                    </Link>
                  ) : (
                    <>
                      <div className="font-medium">{row.title}</div>
                      <p className="text-xs text-slate-500">{row.message}</p>
                    </>
                  )}
                  <div className="flex justify-end pt-1">
                    <Dropdown
                      align="right"
                      trigger={({ toggle }) => (
                        <button onClick={toggle} className="rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600" title="Actions">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      )}
                      items={[
                        ...(!row.isRead ? [{ label: "Mark read", icon: <Check className="h-4 w-4" />, onClick: () => markOne(row.id) }] : []),
                        { label: "Delete", icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => deleteOne(row.id) },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">{total} notification(s)</span>
          <span className="text-xs text-slate-400">Page {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button className="btn-outline px-3 py-1" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <button className="btn-outline px-3 py-1" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      )}

      <ConfirmModal
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={clearAll}
        title="Clear all notifications?"
        message="This will permanently delete all notifications."
        confirmLabel="Clear all"
      />
    </div>
  );
}

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
