import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/datepicker";

// Shared insurance renewal modal — replaces the page's old disguised-edit
// flow (which opened the full create/edit modal titled "Edit Insurance" but
// silently submitted only the end date, discarding every other field the
// user might have touched). Shows the current end date and validates
// client-side against the same rules the server enforces: new end must be
// in the future AND after the current end date.
export function InsuranceRenewModal({ open, onClose, onConfirm, loading, currentEndDate }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (endDate: string) => void;
  loading: boolean;
  currentEndDate?: string | null;
}) {
  const [date, setDate] = useState("");
  useEffect(() => { if (open) setDate(""); }, [open]);

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const valid = Boolean(date) && date >= tomorrow;
  const reason =
    !date
      ? null
      : date < tomorrow
        ? "The new end date must be a future date."
        : currentEndDate && date <= currentEndDate.slice(0, 10)
          ? "The new end date must be after the current end date."
          : null;

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} title="Renew Insurance Policy" footer={
      <div className="flex justify-end gap-2">
        <button className="btn-outline" onClick={onClose} disabled={loading}>Cancel</button>
        <button className="btn-primary" onClick={() => onConfirm(date)} disabled={loading || !valid}>Renew</button>
      </div>
    }>
      <label className="text-sm">New End Date <span className="text-red-400">*</span>
        <div className="mt-1">
          <DatePicker value={date} onChange={(v) => setDate(v)} />
        </div>
      </label>
      {reason && <p className="mt-2 text-xs text-red-500">{reason}</p>}
      {currentEndDate && (
        <p className="mt-2 text-xs text-slate-400">Current end date: {new Date(currentEndDate).toLocaleDateString("en-GB")}</p>
      )}
      <p className="mt-3 text-xs text-slate-400">
        The policy's coverage window is extended to the new end date and returns to in force.
      </p>
    </Modal>
  );
}
