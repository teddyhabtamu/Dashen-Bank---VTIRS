import { Link, useLocation } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";

interface Crumb {
  label: string;
  href?: string;
}

const CRUMB_MAP: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/vehicles": "Vehicle Registry",
  "/registrations": "Registrations",
  "/insurances": "Insurance",
  "/documents": "Documents",
  "/search": "Search",
  "/reports": "Reports",
  "/notifications": "Notifications",
  "/audit": "Audit Logs",
  "/admin": "Admin",
  "/admin/users": "Users",
  "/admin/roles": "Roles & Permissions",
  "/admin/settings": "Settings",
  "/admin/reference": "Reference Data",
};

const DYNAMIC_LABELS: { pattern: RegExp; label: string }[] = [
  { pattern: /^\/vehicles\/new$/, label: "New Vehicle" },
  { pattern: /^\/vehicles\/[^/]+$/, label: "Vehicle Detail" },
  { pattern: /^\/vehicles\/[^/]+\/edit$/, label: "Edit Vehicle" },
  { pattern: /^\/registrations\/[^/]+\/history$/, label: "Registration History" },
];

export function Breadcrumbs() {
  const { pathname } = useLocation();
  if (pathname === "/login") return null;

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ label: "Home", href: "/dashboard" }];

  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;

    const known = CRUMB_MAP[acc];
    const dynamic = DYNAMIC_LABELS.find((d) => d.pattern.test(acc));

    if (known || dynamic) {
      const label = known ?? dynamic!.label;
      const isLast = acc === pathname;
      crumbs.push(isLast ? { label } : { label, href: acc });
    }
  }

  return (
    <nav className="flex items-center gap-1 border-b border-slate-100 bg-white px-4 py-2.5 text-xs sm:px-6">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" />}
          {c.href ? (
            <Link
              to={c.href}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-slate-500 transition-colors hover:bg-primary/10 hover:text-primary"
            >
              {i === 0 && <Home className="h-3 w-3" />}
              {c.label}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {c.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
