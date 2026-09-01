
import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/format";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock the actual scroll container (the app <main>), not just <body>,
    // so the underlying content can't shift while the modal is open.
    const scroller = document.querySelector("main");
    const prev = scroller ? scroller.style.overflow : "";
    if (scroller) scroller.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      if (scroller) scroller.style.overflow = prev;
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto sm:items-start sm:justify-center sm:p-4 sm:py-[8vh]">
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:my-auto sm:rounded-2xl",
          "max-h-[92vh] sm:max-h-[84vh]",
          SIZE[size]
        )}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-slate-800 sm:text-base">{title}</h3>
              )}
              {description && (
                <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
