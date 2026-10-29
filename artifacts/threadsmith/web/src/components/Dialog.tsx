// Minimal modal on the native <dialog> element: focus trap, Esc and backdrop close for free.
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "../lib/util.ts";

export function Dialog(p: { title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const onClose = useRef(p.onClose);
  useEffect(() => {
    onClose.current = p.onClose;
  });
  useEffect(() => {
    const el = ref.current!;
    const handle = () => onClose.current();
    if (!el.open) el.showModal();
    el.addEventListener("close", handle);
    return () => {
      el.removeEventListener("close", handle);
      el.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === ref.current && p.onClose()}
      className={cx(
        "m-auto w-[min(32rem,calc(100vw-2rem))] animate-rise rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-[2px]",
        p.className,
      )}
    >
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{p.title}</h2>
          <button onClick={p.onClose} aria-label="Close" className="rounded-md p-1 text-ink-3 hover:bg-subtle hover:text-ink">
            <X size={16} />
          </button>
        </div>
        {p.children}
      </div>
    </dialog>
  );
}
