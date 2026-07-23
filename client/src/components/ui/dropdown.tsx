
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/format";

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  menuClassName?: string;
}

export function Dropdown({
  trigger,
  items,
  align = "right",
  menuClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight ?? 200;
    const menuW = menuRef.current?.offsetWidth ?? 200;
    let left = align === "right" ? rect.right - menuW : rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    const spaceBelow = window.innerHeight - rect.bottom - 4;
    const spaceAbove = rect.top - 4;
    const top = spaceBelow >= menuH
      ? rect.bottom + 4
      : spaceAbove >= menuH
        ? rect.top - menuH - 4
        : spaceBelow > spaceAbove
          ? window.innerHeight - menuH - 8
          : 8;
    setCoords({ top, left });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = (e: Event) => {
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
  }, [open]);

  return (
    <>
      <div className="relative inline-block" ref={triggerRef}>
        {trigger({ open, toggle: () => setOpen((o) => !o) })}
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className={cn(
              "fixed z-[80] min-w-[10rem] max-w-[16rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg",
              menuClassName
            )}
            style={coords ? { top: coords.top, left: coords.left } : undefined}
            role="menu"
          >
            {items.map((item, i) => {
              const cls = cn(
                "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-slate-300"
                  : item.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-slate-700 hover:bg-slate-50"
              );
              if (item.href && !item.disabled) {
                return (
                  <a key={i} href={item.href} className={cls} role="menuitem">
                    {item.icon}
                    {item.label}
                  </a>
                );
              }
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  disabled={item.disabled}
                  role="menuitem"
                  onClick={() => {
                    if (item.disabled) return;
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
