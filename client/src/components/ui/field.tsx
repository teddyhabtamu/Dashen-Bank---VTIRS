import { cn } from "@/lib/format";
import { Select, SelectOption } from "./select";

export function Field({
  label,
  error,
  children,
  className,
  required,
  dataField,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
  // Marks the wrapper with data-field so failed validation can scroll this
  // field into view (see vehicle-form's validateStep).
  dataField?: string;
}) {
  return (
    <div className={cn("space-y-1", className)} data-field={dataField}>
      <label className="label">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export { Select };
export type { SelectOption };
