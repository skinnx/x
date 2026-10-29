// Anchored popover: render inside a `relative` wrapper that also holds the trigger. Opening moves focus into it;
// outside click, Esc (focus goes back to the trigger) and focus leaving the wrapper close it.
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../lib/util.ts";

const FOCUSABLE = "input, select, textarea, button, a[href], [tabindex]:not([tabindex='-1'])";

export function Popover(p: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { open } = p;
  const closeRef = useRef(p.onClose);
  useEffect(() => {
    closeRef.current = p.onClose;
  });
  useEffect(() => {
    if (!open) return;
    const onClose = () => closeRef.current();
    const wrapper = ref.current?.parentElement;
    // Move focus in, unless a field inside already took it (autoFocus).
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) {
      const first = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => !el.hasAttribute("disabled"));
      (first ?? box).focus({ preventScroll: true });
    }
    const onDown = (e: PointerEvent) => {
      if (!wrapper?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      // Back to the trigger: the first focusable in the wrapper that isn't inside the popover.
      const trigger = [...(wrapper?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].find((el) => !box?.contains(el));
      onClose();
      trigger?.focus();
    };
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Node && !wrapper?.contains(e.target)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      data-popover
      tabIndex={-1}
      className={cx(
        "absolute z-30 w-80 animate-rise rounded-xl border border-line bg-surface p-3 shadow-xl shadow-black/10 outline-none max-sm:fixed max-sm:inset-x-3 max-sm:bottom-24 max-sm:w-auto dark:shadow-black/50",
        p.className,
      )}
    >
      {p.children}
    </div>
  );
}
