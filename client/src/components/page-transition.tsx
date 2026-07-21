import type { ReactNode } from "react";

export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <div className="animate-fade-in-up">
      {children}
    </div>
  );
}
