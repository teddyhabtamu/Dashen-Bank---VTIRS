import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Car,
  ClipboardList,
  FileText,
  Search,
  BarChart3,
  Bell,
  Users,
  Shield,
  Settings,
  History,
  LogOut,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "./auth-context";
import { PERMISSIONS } from "@/lib/rbac";
import { cn } from "@/lib/format";
import { ConfirmModal } from "./ui/confirm-modal";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: null, ready: true },
  { href: "/vehicles", label: "Vehicle Registry", icon: Car, perm: PERMISSIONS.VEHICLE_VIEW, ready: true },
  { href: "/registrations", label: "Registrations", icon: ClipboardList, perm: PERMISSIONS.REGISTRATION_MANAGE, ready: true },
  { href: "/documents", label: "Documents", icon: FileText, perm: PERMISSIONS.DOCUMENT_VIEW, ready: true },
  { href: "/search", label: "Search", icon: Search, perm: PERMISSIONS.VEHICLE_VIEW, ready: true },
  { href: "/reports", label: "Reports", icon: BarChart3, perm: PERMISSIONS.REPORT_VIEW, ready: true },
  { href: "/notifications", label: "Notifications", icon: Bell, perm: null, ready: true },
  { href: "/audit", label: "Audit Logs", icon: History, perm: PERMISSIONS.AUDIT_VIEW, ready: true },
  { href: "/admin/users", label: "Users", icon: Users, perm: PERMISSIONS.USER_MANAGE, ready: true },
  { href: "/admin/roles", label: "Roles & Permissions", icon: Shield, perm: PERMISSIONS.ROLE_MANAGE, ready: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, perm: PERMISSIONS.SETTING_MANAGE, ready: false },
];

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const { pathname } = useLocation();
  const { user, can, logout } = useAuth();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen flex-col bg-primary text-white transition-all duration-200",
          "lg:static lg:z-auto lg:translate-x-0",
          collapsed ? "lg:w-20" : "lg:w-64",
          "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 px-5 py-5",
            collapsed && "lg:justify-center lg:px-3"
          )}
        >
          <img
            src="/logo-sidebar.png"
            alt="Dashen Bank"
            className="h-10 w-10 shrink-0 object-contain"
          />
          <div className={cn("leading-tight", collapsed && "lg:hidden")}>
            <div className="text-sm font-bold tracking-wide text-white">Dashen Bank</div>
            <div className="text-[11px] font-medium text-white/60">VTIRS</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {NAV.map((item) => {
            const allowed = !item.perm || can(item.perm);
            const disabled = !item.ready || !allowed;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            const Icon = item.icon;
            if (disabled) {
              return (
                <span
                  key={item.href}
                  title={
                    collapsed
                      ? item.label
                      : allowed
                        ? "Coming soon"
                        : "Access restricted"
                  }
                  className={cn(
                    "flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/30",
                    collapsed && "lg:justify-center"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
                  {!item.ready && (
                    <span
                      className={cn(
                        "ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40",
                        collapsed && "lg:hidden"
                      )}
                    >
                      soon
                    </span>
                  )}
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                to={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  collapsed && "lg:justify-center",
                  active
                    ? "bg-white/15 font-medium text-white ring-1 ring-inset ring-white/20"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className={cn("mb-2 px-2 text-xs text-white/60", collapsed && "lg:hidden")}>
            <div className="font-medium text-white/90">{user?.fullName}</div>
            <div>{user?.roleName}</div>
          </div>
          <button
            onClick={() => setConfirmSignOut(true)}
            title={collapsed ? "Sign out" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white",
              collapsed && "lg:justify-center"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && "lg:hidden")}>Sign out</span>
          </button>
        </div>
      </aside>

      <ConfirmModal
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={() => { setConfirmSignOut(false); logout(); }}
        title="Sign Out"
        message="Are you sure you want to sign out of VTIRS?"
        confirmLabel="Sign Out"
      />
    </>
  );
}
