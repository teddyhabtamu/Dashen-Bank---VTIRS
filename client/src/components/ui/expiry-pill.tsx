import { expiryState, type ReminderWindows } from "@/lib/services/reminders.js";

export function ExpiryPill({ date, windows }: { date: string; windows?: ReminderWindows }) {
  const state = expiryState(date, windows);
  const cls =
    state === "EXPIRED" ? "bg-red-50 text-red-700"
      : state === "CRITICAL" ? "bg-orange-50 text-orange-700"
        : state === "WARNING" ? "bg-amber-50 text-amber-700"
          : "bg-slate-50 text-slate-500";
  const text = state === "EXPIRED" ? "Expired" : `${state}`;
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${cls}`}>{text}</span>;
}

export default ExpiryPill;