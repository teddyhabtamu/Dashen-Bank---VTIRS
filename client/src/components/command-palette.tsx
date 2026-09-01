import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Car, ClipboardList, ShieldCheck, FileText,
  BarChart3, Bell, History, Users, Shield, Settings,
  LayoutDashboard, ChevronRight, Loader2, UserRound,
} from "lucide-react";
import { useAuth } from "./auth-context";
import { PERMISSIONS } from "@/lib/rbac";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: any;
  perm: string | string[] | null;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dash", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, perm: null },
  { id: "vehicles", label: "Vehicle Registry", href: "/vehicles", icon: Car, perm: PERMISSIONS.VEHICLE_VIEW },
  { id: "registrations", label: "Registrations", href: "/registrations", icon: ClipboardList, perm: [PERMISSIONS.REGISTRATION_MANAGE, PERMISSIONS.REGISTRATION_RENEW, PERMISSIONS.REGISTRATION_SUSPEND] },
  { id: "insurance", label: "Insurance", href: "/insurances", icon: ShieldCheck, perm: PERMISSIONS.INSURANCE_MANAGE },
  { id: "documents", label: "Documents", href: "/documents", icon: FileText, perm: PERMISSIONS.DOCUMENT_VIEW },
  { id: "drivers", label: "Drivers", href: "/drivers", icon: UserRound, perm: PERMISSIONS.BRANCH_MANAGE },
  { id: "reports", label: "Reports", href: "/reports", icon: BarChart3, perm: PERMISSIONS.REPORT_VIEW },
  { id: "notifications", label: "Notifications", href: "/notifications", icon: Bell, perm: null },
  { id: "audit", label: "Audit Logs", href: "/audit", icon: History, perm: PERMISSIONS.AUDIT_VIEW },
  { id: "users", label: "Users", href: "/admin/users", icon: Users, perm: PERMISSIONS.USER_MANAGE },
  { id: "roles", label: "Roles & Permissions", href: "/admin/roles", icon: Shield, perm: PERMISSIONS.ROLE_MANAGE },
  { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings, perm: PERMISSIONS.SETTING_MANAGE },
];

const KIND_ICONS: Record<string, any> = {
  vehicle: Car,
  registration: ClipboardList,
  insurance: ShieldCheck,
  document: FileText,
};

const KIND_LABELS: Record<string, string> = {
  vehicle: "Vehicle",
  registration: "Registration",
  insurance: "Insurance",
  document: "Document",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { can } = useAuth();
  const debounceRef = useRef<any>(null);

  const procResults = useCallback((data: any) => {
    const items: any[] = [];
    (data.vehicles ?? []).forEach((v: any) =>
      items.push({
        ...v, _kind: "vehicle", _label: v.plateNumber,
        _sub: `${v.make ?? ""} ${v.model ?? ""} · ${v.vehicleCode}`,
        _href: `/vehicles/${v.id}`,
      })
    );
    (data.registrations ?? []).forEach((r: any) =>
      items.push({
        ...r, _kind: "registration", _label: r.regNumber,
        _sub: r.vehicle?.plateNumber ?? "",
        _href: `/vehicles/${r.vehicleId}`,
      })
    );
    (data.insurances ?? []).forEach((i: any) =>
      items.push({
        ...i, _kind: "insurance", _label: i.policyNo,
        _sub: `${i.company} · ${i.vehicle?.plateNumber ?? ""}`,
        _href: `/vehicles/${i.vehicleId}`,
      })
    );
    (data.documents ?? []).forEach((d: any) =>
      items.push({
        ...d, _kind: "document", _label: d.name,
        _sub: `${d.category} · ${d.vehicle?.plateNumber ?? ""}`,
        _href: `/documents`,
      })
    );
    return items;
  }, []);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setIndex(0);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&pageSize=5`);
        const data = await res.json();
        setResults(procResults(data));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query, procResults]);

  const navItems = NAV_ITEMS.filter((n) => !n.perm || can(n.perm));
  const showSearch = query.trim().length > 0;

  function select(item: any) {
    setOpen(false);
    navigate(item._href);
  }

  function keyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, allItems.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    }
    if (e.key === "Enter" && allItems[index]) {
      select(allItems[index]);
    }
  }

  const allItems = showSearch ? results : navItems;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12dvh]"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl rounded-xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search className="h-5 w-5 flex-shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
            onKeyDown={keyDown}
            placeholder="Search vehicles, plates, VIN, documents…"
            className="flex-1 border-0 bg-transparent text-base text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-400 sm:inline-block">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {!showSearch && (
            <div>
              <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Quick Navigation
              </div>
              {navItems.map((item, i) => {
                const Icon = item.icon;
                const sel = i === index;
                return (
                  <button
                    key={item.id}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      sel ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100"
                    }`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => select({ _href: item.href })}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      sel ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
                    }`}>
                      <Icon className={`h-4 w-4 ${sel ? "text-primary" : ""}`} />
                    </div>
                    <span className="flex-1 font-medium">{item.label}</span>
                    <ChevronRight className={`h-3.5 w-3.5 ${sel ? "text-primary" : "text-slate-300"}`} />
                  </button>
                );
              })}
            </div>
          )}

          {showSearch && results.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-slate-400">
              <Search className="h-8 w-8 text-slate-300" />
              <span>No results for &ldquo;{query}&rdquo;</span>
            </div>
          )}

          {showSearch && results.length > 0 && (
            <div>
              <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Search Results ({results.length})
              </div>
              {results.map((item, i) => {
                const Icon = KIND_ICONS[item._kind] || FileText;
                const sel = i === index;
                return (
                  <button
                    key={`${item._kind}-${item.id}`}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                      sel ? "bg-primary/10 text-primary" : "text-slate-700 hover:bg-slate-100"
                    }`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => select(item)}
                  >
                    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                      sel ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item._label}</div>
                      <div className="truncate text-xs text-slate-400">{item._sub}</div>
                    </div>
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      sel ? "bg-primary/15 text-primary" : "bg-slate-100 text-slate-500"
                    }`}>
                      {KIND_LABELS[item._kind] || ""}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
