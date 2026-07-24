import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  delay?: number;
}

export function Tooltip({ content, children, delay = 300 }: TooltipProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const targetRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (targetRef.current) {
        const rect = targetRef.current.getBoundingClientRect();
        setPos({
          top: rect.bottom + 6,
          left: rect.left + rect.width / 2,
        });
        setShow(true);
      }
    }, delay);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(false), 80);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <>
      <div
        ref={targetRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="inline-flex"
      >
        {children}
      </div>
      {show &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] -translate-x-1/2"
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="flex flex-col items-center">
              <div className="h-0 w-0 border-[5px] border-transparent border-b-white" />
              <div className="whitespace-nowrap rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-xl">
                {content}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
