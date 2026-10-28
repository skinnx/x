// Anchored popover: render inside a `relative` wrapper that also holds the trigger. Outside click / Esc close it.
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../lib/util.ts";

export function Popover(p: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { open, onClose } = p;
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      data-popover
      className={cx(
        "absolute z-30 w-80 animate-rise rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/10 max-sm:fixed max-sm:inset-x-3 max-sm:bottom-24 max-sm:w-auto dark:shadow-black/50",
        p.className,
      )}
    >
      {p.children}
    </div>
  );
}
