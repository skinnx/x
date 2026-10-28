// ⌘K command palette: registered commands plus jump-to-draft, filtered as you type, fully keyboard driven.
// The <dialog> stays mounted and is opened/closed in place: removing a modal dialog while it closes leaves
// Chromium's focus half-restored, and keystrokes in the composer were silently dropped.
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.ts";
import { useAllCommands, type Command } from "../lib/commands.ts";
import { openPost } from "../lib/router.ts";
import { cx } from "../lib/util.ts";
import { draftTitle } from "./Sidebar.tsx";

function matches(c: Command, terms: string[]) {
  const hay = `${c.title} ${c.group} ${c.keywords ?? ""}`.toLowerCase();
  return terms.every((t) => hay.includes(t));
}

export function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const commands = useAllCommands();
  const { data: drafts } = useQuery({
    queryKey: ["posts", "draft"],
    queryFn: () => api.listPosts({ status: ["draft"], limit: 100 }),
    enabled: open,
  });
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const draftCommands: Command[] = (drafts ?? []).slice(0, 30).map((d) => ({
      id: `draft-${d.id}`,
      group: "Drafts",
      title: draftTitle(d),
      icon: FileText,
      keywords: d.thread.map((s) => s.text).join(" ").slice(0, 400),
      run: () => openPost(d.id),
    }));
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const all = [...commands, ...(terms.length ? draftCommands : draftCommands.slice(0, 5))];
    const hits = all.filter((c) => matches(c, terms));
    // Title-prefix hits first, then keep the registration order.
    return terms.length ? hits.sort((a, b) => Number(!a.title.toLowerCase().startsWith(terms[0]!)) - Number(!b.title.toLowerCase().startsWith(terms[0]!))) : hits;
  }, [commands, drafts, query]);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const el = ref.current!;
    const close = () => onCloseRef.current();
    el.addEventListener("close", close);
    return () => el.removeEventListener("close", close);
  }, []);
  useEffect(() => {
    const el = ref.current!;
    if (open && !el.open) {
      setQuery("");
      setActive(0);
      el.showModal();
      inputRef.current?.focus();
    } else if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    // Let the dialog close (and give focus back) before the command moves focus itself.
    requestAnimationFrame(() => c.run());
  };

  let lastGroup = "";
  return (
    <dialog
      ref={ref}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[12vh] w-[min(36rem,calc(100vw-1.5rem))] animate-rise overflow-hidden rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <Search size={16} className="shrink-0 text-ink-3" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(results[active]);
            }
          }}
          placeholder="Type a command or search drafts…"
          aria-label="Command"
          aria-controls="palette-list"
          aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
          className="h-13 flex-1 bg-transparent text-[15px] placeholder:text-ink-3"
        />
        <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-3">esc</kbd>
      </div>
      <ul ref={listRef} id="palette-list" role="listbox" className="max-h-[min(24rem,60vh)] overflow-y-auto p-1.5">
        {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">No matching command or draft</li>}
        {results.map((c, i) => {
          const header = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          const Icon = c.icon;
          return (
            <li key={c.id} role="presentation">
              {header && <p className="px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-ink-3">{header}</p>}
              <button
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => run(c)}
                className={cx(
                  "flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm",
                  i === active ? "bg-subtle text-ink" : "text-ink-2",
                )}
              >
                {Icon && <Icon size={16} className={cx("shrink-0", c.group === "AI" ? "text-ai" : "text-ink-3")} />}
                <span className="flex-1 truncate">{c.title}</span>
                {c.shortcut && <kbd className="text-xs text-ink-3">{c.shortcut}</kbd>}
                {i === active && <CornerDownLeft size={14} className="text-ink-3" />}
              </button>
            </li>
          );
        })}
      </ul>
    </dialog>
  );
}
