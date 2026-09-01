
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/format";

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  indicator?: {
    label: string;
    variant: "warning" | "success" | "danger";
  };
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  clearable?: boolean;
  id?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  searchable,
  clearable,
  id,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 200;
    const menuW = rect.width;
    let left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    const top = spaceBelow >= menuH
      ? rect.bottom + 4
      : spaceAbove >= menuH
        ? rect.top - menuH - 4
        : spaceBelow > spaceAbove
          ? window.innerHeight - menuH - 8
          : 8;
    setCoords({ top, left, width: menuW });
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    if (searchable) setTimeout(() => searchRef.current?.focus(), 10);
    const onDocClick = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
      // Ignore scrolling that happens *inside* the menu itself
      // (e.g. scrolling the option list or the search box).
      if (menuRef.current?.contains(e.target as Node)) return;
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
  }, [open, searchable]);

  const filtered = searchable
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    setQuery("");
  }

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
          open && "border-slate-400 ring-2 ring-slate-200",
          className
        )}
      >
        <span className={cn("truncate", !selected && "text-slate-400")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={cn("ml-2 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[80] max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            style={coords ? { top: coords.top, left: coords.left, width: coords.width } : undefined}
            role="listbox"
          >
            {clearable && value !== "" && (
              <button
                type="button"
                role="option"
                onClick={() => choose("")}
                className="flex w-full items-center gap-2 whitespace-nowrap border-b border-slate-100 px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
              >
                <X className="h-4 w-4 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="truncate">None (clear)</span>
                </div>
              </button>
            )}
            {searchable && (
              <div className="sticky top-0 border-b border-slate-100 bg-white p-2">
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
                />
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No options</div>
            ) : (
              filtered.map((o) => {
                const active = o.value === value;
                return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => choose(o.value)}
                      className={cn(
                        "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors",
                        o.icon ? "font-semibold text-primary" : active && "bg-primary/10 font-medium text-primary"
                      )}
                    >
                      {o.icon}
                      <div className="flex-1 min-w-0">
                        <span className="truncate">{o.label}</span>
                        {o.description && (
                          <span className="block text-xs text-slate-400 truncate">{o.description}</span>
                        )}
                      </div>
                      {o.indicator && (
                        <span className={cn(
                          "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight",
                          o.indicator.variant === "warning" && "bg-amber-50 text-amber-700",
                          o.indicator.variant === "success" && "bg-emerald-50 text-emerald-700",
                          o.indicator.variant === "danger" && "bg-red-50 text-red-700"
                        )}>
                          {o.indicator.label}
                        </span>
                      )}
                      {active && <Check className={cn("h-4 w-4 shrink-0", o.icon ? "text-primary" : "text-primary")} />}
                    </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </>
  );
}
