import { useLocation } from "react-router-dom";
import { Bell, Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "./auth-context";

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

  const title =
    TITLES[pathname] ??
    Object.entries(TITLES).find(([k]) => pathname.startsWith(k))?.[1] ??
    "VTIRS";

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
          <p className="hidden text-xs text-slate-400 sm:block">Dashen Bank — Facilities Department</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
        </button>
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
