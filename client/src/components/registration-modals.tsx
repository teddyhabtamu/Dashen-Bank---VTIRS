import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/datepicker";

// Shared renewal modal used by BOTH the Registrations page and the vehicle
// detail's RegistrationPanel — the two had diverged (the panel rejected
// past/today dates client-side, the page did not, so identical actions
// validated differently depending on where they were launched).
export function RegistrationRenewModal({ open, onClose, onConfirm, loading, currentExpiry }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  loading: boolean;
  currentExpiry?: string | null;
}) {
  const [date, setDate] = useState("");
  useEffect(() => { if (open) setDate(""); }, [open]);

  // Renewals must land in the future (server-enforced: new expiry must be
  // after the current expiry AND after today); catch it client-side so the
  // user isn't told only after submitting.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const valid = Boolean(date) && date >= tomorrow;
  const reason =
    !date
      ? null
      : date < tomorrow
        ? "The new expiry must be a future date."
        : currentExpiry && date <= currentExpiry.slice(0, 10)
          ? "The new expiry must be after the current expiry date."
          : null;

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Renew Registration" footer={
      <div className="flex justify-end gap-2">
        <button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
        <button className="btn-primary" onClick={() => onConfirm(date)} disabled={loading || !valid}>Renew</button>
      </div>
    }>
      <label className="text-sm">New Expiry Date <span className="text-red-400">*</span>
        <div className="mt-1">
          <DatePicker value={date} onChange={(v) => setDate(v)} />
        </div>
      </label>
      {reason && <p className="mt-2 text-xs text-red-500">{reason}</p>}
      {currentExpiry && (
        <p className="mt-2 text-xs text-slate-400">Current expiry: {new Date(currentExpiry).toLocaleDateString("en-GB")}</p>
      )}
    </Modal>
  );
}
