import { useBrand } from "@/lib/brand-context";
import { cn } from "@/lib/format";

export function BrandLoader({
  fullscreen = false,
  label = "Loading…",
  className,
}: {
  fullscreen?: boolean;
  label?: string;
  className?: string;
}) {
  const { companyName } = useBrand();

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4",
        fullscreen ? "min-h-dvh w-full bg-slate-50" : "py-16",
        className
      )}
    >
      <img
        src="/dashen-logo.svg"
        alt={companyName}
        className="h-12 w-12 object-contain animate-bounce"
      />

      <div className="text-center">
        <div className="text-sm font-bold tracking-wide text-primary">
          {companyName}
        </div>
        <div className="mt-0.5 text-xs font-medium italic text-secondary/80">
          Always One Step Ahead
        </div>
      </div>

      {label && (
        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          {label}
        </div>
      )}
    </div>
  );
}
