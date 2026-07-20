import { cn } from "@/lib/format";
import { label } from "@/lib/constants";

// Color mapping for vehicle/registration status badges.
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  ASSIGNED: "bg-blue-100 text-blue-700",
  RESERVED: "bg-purple-100 text-purple-700",
  UNDER_MAINTENANCE: "bg-amber-100 text-amber-700",
  DISPOSED: "bg-slate-200 text-slate-600",
  PENDING_RENEWAL: "bg-amber-100 text-amber-700",
  EXPIRED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-red-100 text-red-700",
  INACTIVE: "bg-slate-200 text-slate-600",
  LOCKED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-slate-100 text-slate-600";
  return <span className={cn("badge", cls)}>{label(status)}</span>;
}
