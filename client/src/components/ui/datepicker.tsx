
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/format";
import { Tooltip } from "@/components/ui/tooltip";
import { Select } from "./select";

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseYMD(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function DatePicker({ value, onChange, placeholder = "Select date", disabled, id }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const d = parseYMD(value) ?? new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const POPUP_H = 310;
    const w = Math.max(rect.width, 280);
    let left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    let top: number;
    if (spaceBelow >= POPUP_H) {
      top = rect.bottom + 4;
    } else if (spaceAbove >= POPUP_H) {
      top = rect.top - POPUP_H - 4;
    } else {
      top = Math.max(4, spaceBelow > spaceAbove ? rect.bottom + 4 : rect.top - POPUP_H - 4);
    }
    setCoords({ top, left, width: w });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || popRef.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest('[role="listbox"]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if ((e.target as HTMLElement).closest('[role="listbox"]')) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const selected = parseYMD(value);
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function pick(day: number) {
    onChange(toYMD(new Date(view.y, view.m, day)));
    setOpen(false);
  }
  function shiftMonth(delta: number) {
    setView((v) => {
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "input flex items-center justify-between text-left",
          disabled && "cursor-not-allowed opacity-50",
          open && "border-slate-400 ring-2 ring-slate-200"
        )}
      >
        <span className={cn("truncate", !selected && "text-slate-400")}>
          {selected ? selected.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" }) : placeholder}
        </span>
        <span className="flex items-center gap-1">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Clear date"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <Calendar className="h-4 w-4 text-slate-400" />
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[80] w-[300px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
            style={coords ? { top: coords.top, left: coords.left, width: coords.width } : undefined}
          >
            <div className="mb-2 flex items-center justify-between">
              <Tooltip content="Previous month">
                <button type="button" onClick={() => shiftMonth(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </Tooltip>
              <div className="flex items-center gap-1">
                <div className="w-[130px]">
                  <Select
                    value={String(view.m)}
                    onChange={(v) => setView((p) => ({ ...p, m: Number(v) }))}
                    options={MONTHS.map((mn, i) => ({ value: String(i), label: mn }))}
                  />
                </div>
                <div className="w-[90px]">
                  <Select
                    value={String(view.y)}
                    onChange={(v) => setView((p) => ({ ...p, y: Number(v) }))}
                    options={years.map((y) => ({ value: String(y), label: String(y) }))}
                  />
                </div>
              </div>
              <Tooltip content="Next month">
                <button type="button" onClick={() => shiftMonth(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-400">
              {DOW.map((d) => (<div key={d}>{d}</div>))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (day === null) return <div key={i} />;
                const isSel = selected && selected.getFullYear() === view.y && selected.getMonth() === view.m && selected.getDate() === day;
                const isToday = new Date().toDateString() === new Date(view.y, view.m, day).toDateString();
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pick(day)}
                    className={cn(
                      "flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors",
                      isSel
                        ? "bg-primary font-medium text-white"
                        : isToday
                          ? "bg-primary/10 font-medium text-primary hover:bg-primary/20"
                          : "text-slate-700 hover:bg-slate-100"
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => { const t = new Date(); setView({ y: t.getFullYear(), m: t.getMonth() }); onChange(toYMD(t)); setOpen(false); }}
              className="mt-2 w-full rounded-lg border border-slate-200 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Today
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
