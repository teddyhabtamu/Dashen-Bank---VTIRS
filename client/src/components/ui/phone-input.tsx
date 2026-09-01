import { cn } from "@/lib/format";
import { formatEthiopianPhone, isValidEthiopianPhone } from "@/lib/format";

interface PhoneInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  showHint?: boolean;
}

// Controlled input enforcing the standard Ethiopian phone format
// (+251 9/7XX XXXXXX). Stores the canonical +2519XXXXXXXX / +2517XXXXXXXX form.
export function PhoneInput({
  value,
  onChange,
  disabled,
  className,
  id,
  showHint = true,
}: PhoneInputProps) {
  const hasValue = value !== "";
  const valid = !hasValue || isValidEthiopianPhone(value);
  return (
    <>
      <input
        id={id}
        className={cn(
          "input font-mono",
          className,
          hasValue && !valid && "border-red-400"
        )}
        value={value}
        onChange={(e) => onChange(formatEthiopianPhone(e.target.value))}
        inputMode="tel"
        autoComplete="tel"
        placeholder="+251912345678"
        disabled={disabled}
      />
      {showHint && (
        <p
          className={cn(
            "mt-0.5 text-xs",
            hasValue && !valid ? "text-red-500" : "text-slate-400"
          )}
        >
          {hasValue && !valid
            ? "Use +251 followed by 9 or 7 and 8 digits (e.g. +251912345678)"
            : "Standard: +251 9/7XX XXXXXX"}
        </p>
      )}
    </>
  );
}
