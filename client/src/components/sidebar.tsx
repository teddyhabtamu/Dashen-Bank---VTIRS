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
  User,
  UserRound,
  ChevronUp,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";
import { PERMISSIONS } from "@/lib/rbac";
import { cn } from "@/lib/format";
import { ConfirmModal } from "./ui/confirm-modal";
import { useBrand } from "@/lib/brand-context";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm?: string | null;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    label: "Main",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/vehicles", label: "Vehicle Registry", icon: Car, perm: PERMISSIONS.VEHICLE_VIEW },
      { href: "/registrations", label: "Registrations", icon: ClipboardList, perm: PERMISSIONS.REGISTRATION_MANAGE },
    ],
  },
  {
    label: "Fleet",
    items: [
      { href: "/insurances", label: "Insurance", icon: Shield, perm: PERMISSIONS.INSURANCE_MANAGE },
      { href: "/documents", label: "Documents", icon: FileText, perm: PERMISSIONS.DOCUMENT_VIEW },
      { href: "/drivers", label: "Drivers", icon: UserRound, perm: PERMISSIONS.BRANCH_MANAGE },
      { href: "/search", label: "Search", icon: Search, perm: PERMISSIONS.VEHICLE_VIEW },
      { href: "/reports", label: "Reports", icon: BarChart3, perm: PERMISSIONS.REPORT_VIEW },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/audit", label: "Audit Logs", icon: History, perm: PERMISSIONS.AUDIT_VIEW },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", icon: Users, perm: PERMISSIONS.USER_MANAGE },
      { href: "/admin/roles", label: "Roles & Permissions", icon: Shield, perm: PERMISSIONS.ROLE_MANAGE },
    ],
  },
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
  const { companyName, systemName } = useBrand();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const showTooltip = useCallback((label: string, e: React.MouseEvent<HTMLElement>) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2 });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimer.current = setTimeout(() => setTooltip(null), 80);
  }, []);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === href;
    return pathname.startsWith(href) && href !== "/";
  }

  useEffect(() => {
    if (!userMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen flex-col bg-primary text-white transition-all duration-300 ease-in-out",
          "lg:static lg:z-auto lg:translate-x-0",
          collapsed ? "lg:w-20" : "lg:w-64",
          "w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
          <div
            className={cn(
              "flex shrink-0 items-center gap-3 px-4 pt-4 pb-3",
              collapsed && "lg:justify-center"
            )}
          >
            <img
              src="/logo-sidebar.png"
              alt={companyName}
              className="h-8 w-8 shrink-0 object-contain"
            />
            <div className={cn(collapsed && "lg:hidden")}>
              <div className="truncate text-sm font-bold tracking-wide text-white">
                {companyName}
              </div>
              <div className="truncate text-[11px] font-medium text-white/40">
                {systemName}
              </div>
            </div>
          </div>

        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {SECTIONS.map((section) => {
            const visible = section.items.filter(
              (item) => !item.perm || can(item.perm)
            );
            if (visible.length === 0) return null;

            return (
              <div key={section.label} className="mb-3 last:mb-0">
                <div
                  className={cn(
                    "mb-0.5 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/30",
                    collapsed && "lg:hidden"
                  )}
                >
                  {section.label}
                </div>
                {visible.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={onCloseMobile}
                      onMouseEnter={(e) => collapsed && showTooltip(item.label, e)}
                      onMouseLeave={hideTooltip}
                      className={cn(
                        "relative flex items-center rounded-lg px-2 py-1.5 text-sm font-medium transition-all duration-150",
                        collapsed && "lg:justify-center",
                        active
                          ? "bg-white/15 text-white"
                          : "text-white/60 hover:bg-white/10 hover:text-white/90"
                      )}
                    >
                      {active && (
                        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-white" />
                      )}
                      <Icon
                        className={cn(
                          "shrink-0 transition-all duration-150",
                          collapsed ? "h-5 w-5" : "h-[18px] w-[18px]",
                          active ? "text-white" : "text-white/50 group-hover:text-white/80"
                        )}
                      />
                      <span
                        className={cn(
                          "ml-3 truncate transition-all duration-300",
                          collapsed && "lg:hidden"
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div ref={userMenuRef} className="relative shrink-0 border-t border-white/10 px-2 pb-3 pt-2">
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/10",
              collapsed && "lg:justify-center"
            )}
            onMouseEnter={(e) => collapsed && user?.fullName && showTooltip(user.fullName, e)}
            onMouseLeave={hideTooltip}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-[10px] font-semibold text-white">
              {user?.fullName
                ?.split(" ")
                .filter(Boolean)
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "?"}
            </div>
            <div className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
              <div className="truncate text-sm font-medium text-white/90">
                {user?.fullName}
              </div>
              <div className="truncate text-xs text-white/50">{user?.roleName}</div>
            </div>
            <ChevronUp
              className={cn(
                "h-4 w-4 shrink-0 text-white/40 transition-transform duration-200",
                collapsed && "lg:hidden",
                !userMenuOpen && "rotate-180"
              )}
            />
          </button>

          {userMenuOpen && (
            <div
              className={cn(
                "absolute bottom-full mb-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-primary shadow-2xl",
                collapsed ? "left-[80px]" : "left-0 right-0"
              )}
              style={{ zIndex: 60 }}
            >
              <Link
                to="/profile"
                onClick={() => { setUserMenuOpen(false); onCloseMobile(); }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <User className="h-4 w-4 shrink-0" />
                My Profile
              </Link>
              <Link
                to="/admin/settings"
                onClick={() => { setUserMenuOpen(false); onCloseMobile(); }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Settings className="h-4 w-4 shrink-0" />
                Settings
              </Link>
              <button
                onClick={() => { setUserMenuOpen(false); setConfirmSignOut(true); }}
                className="flex w-full items-center gap-3 border-t border-white/10 px-3 py-2.5 text-sm font-medium text-red-300 transition-colors hover:bg-white/10 hover:text-red-200"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Sign out
              </button>
            </div>
          )}
        </div>

        {tooltip && collapsed && (
          <div
            className="pointer-events-none fixed z-50 -translate-y-1/2"
            style={{ left: 88, top: tooltip.top }}
          >
            <div className="flex items-center">
              <div className="h-0 w-0 border-[6px] border-transparent border-r-white" />
              <div className="whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-xl">
                {tooltip.label}
              </div>
            </div>
          </div>
        )}
      </aside>

      <ConfirmModal
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        onConfirm={() => { setConfirmSignOut(false); logout(); }}
        title="Sign Out"
        message={`Are you sure you want to sign out of ${systemName}?`}
        confirmLabel="Sign Out"
      />
    </>
  );
}
