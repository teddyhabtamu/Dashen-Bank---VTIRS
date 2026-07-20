
import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "./modal";
import { cn } from "@/lib/format";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
}: ConfirmModalProps) {
  const [busy, setBusy] = useState(false);
  const isBusy = busy || loading;

  async function handleConfirm() {
    try {
      setBusy(true);
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={isBusy ? () => {} : onClose}
      size="sm"
      footer={
        <>
          <button
            className="btn-outline"
            onClick={onClose}
            disabled={isBusy}
          >
            {cancelLabel}
          </button>
          <button
            className={cn(
              "btn",
              variant === "danger"
                ? "bg-red-600 text-white hover:bg-red-700"
                : "btn-primary"
            )}
            onClick={handleConfirm}
            disabled={isBusy}
          >
            {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
