import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Check, BellDot } from "lucide-react";
import { useAuth } from "./auth-context";
import { useBrand } from "@/lib/brand-context";
import { formatDateTime } from "@/lib/format";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/vehicles": "Vehicle Registry",
  "/registrations": "Registration Management",
  "/documents": "Document Management",
  "/search": "Search",
  "/reports": "Reports",
  "/notifications": "Notifications",
  "/audit": "Audit Trail",
  "/admin/users": "User Management",
  "/admin/roles": "Roles & Permissions",
  "/admin/settings": "System Settings",
};

interface Notif {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function Topbar({
  collapsed,
  onToggleCollapse,
  onOpenMobile,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { companyName, systemName } = useBrand();
  const [unread, setUnread] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const title =
    TITLES[pathname] ??
    Object.entries(TITLES).find(([k]) => pathname.startsWith(k))?.[1] ??
    systemName;

  useEffect(() => {
    fetch("/api/notifications/unread-count")
      .then((r) => r.json())
      .then((d) => setUnread(d.count ?? 0))
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (!panelOpen) return;
    fetch("/api/notifications?pageSize=5&unreadOnly=true")
      .then((r) => r.json())
      .then((d) => setNotifs(d.items ?? []))
      .catch(() => {});
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen]);

  async function markAll() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setUnread(0);
    setNotifs([]);
  }

  async function markOne(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifs((prev) => prev.filter((n) => n.id !== id));
    setUnread((u) => Math.max(0, u - 1));
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onOpenMobile}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          onClick={onToggleCollapse}
          className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:block"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-slate-800 sm:text-lg">{title}</h1>
          <p className="hidden text-xs text-slate-400 sm:block">{companyName} — Facilities Department</p>
        </div>
      </div>

      <div className="relative flex items-center gap-4">
        <button
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          onClick={() => setPanelOpen((o) => !o)}
        >
          {unread > 0 ? <BellDot className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        {panelOpen && (
          <div
            ref={panelRef}
            className="absolute right-0 top-full z-[80] mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-800">
                Notifications {unread > 0 && <span className="text-xs font-normal text-slate-400">({unread})</span>}
              </span>
              <div className="flex gap-2">
                {unread > 0 && (
                  <button onClick={markAll} className="text-xs text-primary hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-slate-400">
                  <Bell className="mb-1 h-6 w-6" />
                  <span className="text-sm">No new notifications</span>
                </div>
              ) : (
                notifs.map((n) => (
                  <div key={n.id} className="group border-b border-slate-50 px-4 py-3 transition-colors hover:bg-slate-50">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={n.link ?? "#"}
                        onClick={() => markOne(n.id)}
                        className="min-w-0 flex-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 shrink-0 rounded-full bg-primary"></span>
                          <span className="truncate text-sm font-medium text-slate-800">{n.title}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{n.message}</p>
                        <span className="mt-1 block text-[10px] text-slate-400">{formatDateTime(n.createdAt)}</span>
                      </Link>
                      <button
                        onClick={() => markOne(n.id)}
                        className="mt-1 shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-slate-600 group-hover:opacity-100"
                        title="Dismiss"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <Link
              to="/notifications"
              onClick={() => setPanelOpen(false)}
              className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-primary hover:bg-slate-50"
            >
              View all notifications
            </Link>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white"
            title={user?.fullName ?? "User"}
          >
            {user?.fullName
              ?.split(" ")
              .filter(Boolean)
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase() || "?"}
          </div>
        </div>
      </div>
    </header>
  );
}
