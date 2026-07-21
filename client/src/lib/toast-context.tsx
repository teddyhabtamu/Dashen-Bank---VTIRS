import { createContext, useCallback, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react";

type Variant = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  variant: Variant;
  message: string;
}

interface ToastCtx {
  toast: (variant: Variant, message: string, duration?: number) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(Ctx);
}

let nextId = 1;

const ICON: Record<Variant, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLE: Record<Variant, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  info: "bg-primary text-white",
  warning: "bg-amber-500 text-white",
};

function ToastItem({ t, onClose }: { t: Toast; onClose: () => void }) {
  const Icon = ICON[t.variant];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl px-4 py-3 shadow-lg animate-slide-in-right ${STYLE[t.variant]}`}
      role="alert"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm font-medium leading-snug">{t.message}</p>
      <button onClick={onClose} className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100 transition-opacity">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((variant: Variant, message: string, duration = 4000) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, variant, message }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <div className="pointer-events-none fixed inset-0 z-[90] flex flex-col items-end justify-end gap-2 p-4">
            {toasts.map((t) => (
              <div key={t.id} className="pointer-events-auto w-full max-w-sm">
                <ToastItem t={t} onClose={() => remove(t.id)} />
              </div>
            ))}
          </div>,
          document.body
        )}
    </Ctx.Provider>
  );
}
