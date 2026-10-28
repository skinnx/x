// Toast store (callable from anywhere, including the SSE handler) and its viewport.
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cx } from "../lib/util.ts";

export interface ToastAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: "default" | "success" | "error";
  actions?: ToastAction[];
  /** ms; 0 keeps it until dismissed. */
  duration?: number;
  /** Replaces an existing toast with the same id. */
  id?: string;
}

interface ToastItem extends ToastOptions {
  id: string;
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, number>();
let seq = 0;

function emit() {
  listeners.forEach((l) => l());
}

export function dismissToast(id: string) {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function toast(opts: ToastOptions): string {
  const id = opts.id ?? `t${++seq}`;
  const item = { ...opts, id };
  toasts = [...toasts.filter((t) => t.id !== id), item].slice(-4);
  window.clearTimeout(timers.get(id));
  const duration = opts.duration ?? (opts.actions?.length ? 7000 : 3500);
  if (duration > 0) timers.set(id, window.setTimeout(() => dismissToast(id), duration));
  emit();
  return id;
}

export const toastError = (title: string, e: unknown) =>
  toast({ title, description: e instanceof Error ? e.message : String(e), tone: "error", duration: 7000 });

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const ICONS = { success: CircleCheck, error: CircleAlert, default: Info };

export function Toaster() {
  const items = useSyncExternalStore(subscribe, () => toasts);
  return (
    <div
      aria-live="polite"
      data-toaster
      // Above the composer footer (two rows on phones), so toasts never cover its buttons.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 max-sm:bottom-[calc(7.5rem+env(safe-area-inset-bottom))]"
    >
      {items.map((t) => {
        const Icon = ICONS[t.tone ?? "default"];
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-md animate-rise sm:w-96 items-start gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lg shadow-black/5 backdrop-blur dark:shadow-black/40"
          >
            <Icon
              size={18}
              className={cx(
                "mt-0.5 shrink-0",
                t.tone === "success" && "text-emerald-600 dark:text-emerald-400",
                t.tone === "error" && "text-red-600 dark:text-red-400",
                (!t.tone || t.tone === "default") && "text-ink-3",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm break-words text-ink-2">{t.description}</p>}
              {t.actions && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {t.actions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => {
                        a.onClick();
                        dismissToast(t.id);
                      }}
                      className={cx(
                        "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                        a.primary ? "bg-ink text-canvas hover:opacity-90" : "bg-subtle text-ink hover:bg-line",
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => dismissToast(t.id)} aria-label="Dismiss" className="-mr-1 rounded p-1 text-ink-3 hover:text-ink">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
