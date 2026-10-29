// Settings-style section card and a copyable code block.
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";
import { copyText } from "../lib/util.ts";
import { toastError } from "./Toasts.tsx";

export function Card(p: { icon: ReactNode; title: string; badge?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
        <span className="text-ink-2">{p.icon}</span>
        <h2 className="font-semibold">{p.title}</h2>
        {p.badge && <span className="text-xs text-ink-3">{p.badge}</span>}
        <div className="flex-1" />
        {p.action}
      </div>
      <div className="space-y-4 px-5 py-4 text-sm leading-relaxed text-ink-2">{p.children}</div>
    </section>
  );
}

export function Code({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-ink-3">{label}</p>
      <div className="group relative">
        <pre className="overflow-x-auto rounded-xl border border-line bg-canvas py-2.5 pr-12 pl-3 font-mono text-[12.5px] leading-relaxed text-ink">
          {value}
        </pre>
        <button
          onClick={() =>
            copyText(value).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              (e: unknown) => toastError("Couldn't copy", e),
            )
          }
          aria-label={`Copy ${label}`}
          className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-lg border border-line bg-surface text-ink-2 hover:text-ink"
        >
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
