// Left rail: navigation (Inbox first, with waiting approvals), drafts list (title = first line), live status of publishing / operator.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Command, Inbox, PenLine, Plug, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Health, Post } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { useControl } from "../lib/control.ts";
import { useAccounts } from "../lib/platforms.tsx";
import { navigate, newDraft, openPost, type View } from "../lib/router.ts";
import { formatWhen, timeAgo } from "../lib/time.ts";
import { cx, firstLine, keys, modKey } from "../lib/util.ts";
import { toastError } from "./Toasts.tsx";

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="size-6 shrink-0" aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-ink" />
      <rect x="16" y="15" width="32" height="8" rx="4" className="fill-canvas" />
      <rect x="16" y="28" width="24" height="8" rx="4" className="fill-canvas" opacity=".7" />
      <rect x="16" y="41" width="28" height="8" rx="4" className="fill-ai" />
    </svg>
  );
}

export const draftTitle = (p: Post) => p.title?.trim() || firstLine(p.thread.find((s) => s.text.trim())?.text ?? "", 60) || "Untitled draft";

interface Props {
  view: View;
  activePostId: string | null;
  health: Health;
  onOpenPalette: () => void;
  onNavigate?: () => void;
}

export function Sidebar(p: Props) {
  const { data: drafts, isPending } = useQuery({
    queryKey: ["posts", "draft"],
    queryFn: () => api.listPosts({ status: ["draft"], limit: 100 }),
  });
  const { data: attention } = useQuery({
    queryKey: ["posts", "attention"],
    queryFn: () => api.listPosts({ status: ["due", "failed"], limit: 50 }),
  });
  const { data: accounts } = useAccounts();
  const { data: control } = useControl();
  const paused = control?.paused ?? null;
  const op = control?.operator;
  const go = (fn: () => void) => () => {
    fn();
    p.onNavigate?.();
  };

  const nav: { view: View; label: string; icon: typeof PenLine; to: string; badge?: number; badgeTone?: string; badgeTitle?: string }[] = [
    {
      view: "inbox",
      label: "Inbox",
      icon: Inbox,
      to: "/",
      badge: control?.pendingApprovals,
      badgeTone: "bg-violet-600",
      badgeTitle: "Posts waiting for your approval",
    },
    { view: "compose", label: "Write", icon: PenLine, to: "/write" },
    { view: "queue", label: "Queue", icon: CalendarClock, to: "/queue", badge: attention?.length, badgeTitle: "Due or failed posts" },
    { view: "connect", label: "Agents", icon: Plug, to: "/connect" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <Logo />
        <span className="font-semibold tracking-tight">Threadsmith</span>
        {paused && (
          <button
            onClick={go(() => navigate("/"))}
            title={`Publishing paused${paused.reason ? `: ${paused.reason}` : ""}`}
            className="flex h-5 shrink-0 items-center gap-1 rounded-full bg-red-100 px-1.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-300"
          >
            <span className="size-1.5 rounded-full bg-red-500" /> Paused
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={p.onOpenPalette}
          title={`Command palette (${keys.palette})`}
          className="flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-line px-1.5 text-[11px] whitespace-nowrap text-ink-3 hover:border-line-strong hover:text-ink [@media(hover:none)]:hidden"
        >
          {modKey === "⌘" ? <Command size={11} /> : "Ctrl "}K
        </button>
      </div>

      <nav className="space-y-0.5 px-2">
        {nav.map((n) => (
          <button
            key={n.view}
            onClick={go(() => navigate(n.to))}
            aria-current={p.view === n.view ? "page" : undefined}
            className={cx(
              "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
              p.view === n.view ? "bg-subtle font-medium text-ink" : "text-ink-2 hover:bg-subtle/70 hover:text-ink",
            )}
          >
            <n.icon size={16} />
            <span className="flex-1 text-left">{n.label}</span>
            {!!n.badge && (
              <span
                title={n.badgeTitle}
                className={cx("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold text-white", n.badgeTone ?? "bg-amber-500")}
              >
                {n.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-6 flex items-center justify-between px-4 pb-1.5">
        <h2 className="text-xs font-medium text-ink-3">Drafts</h2>
        <button
          onClick={go(() => newDraft())}
          aria-label="New draft"
          title="New draft"
          className="grid size-6 place-items-center rounded-md text-ink-3 hover:bg-subtle hover:text-ink"
        >
          <Plus size={15} />
        </button>
      </div>
      <ul id="drafts-list" className="min-h-0 flex-1 space-y-px overflow-y-auto px-2 pb-4">
        {isPending && [0, 1, 2].map((i) => <li key={i} className="mx-2 my-2 h-8 animate-pulse rounded-md bg-subtle" />)}
        {drafts?.length === 0 && (
          <li className="px-2.5 py-2 text-xs leading-relaxed text-ink-3">
            Drafts save as you type. Agents can add them too, over MCP or the API.
          </li>
        )}
        {drafts?.map((d) => (
          <DraftItem key={d.id} post={d} active={p.view === "compose" && p.activePostId === d.id} onOpen={go(() => openPost(d.id))} />
        ))}
      </ul>

      <div className="space-y-1 border-t border-line px-4 py-3 text-xs text-ink-3">
        {accounts?.length ? (
          <button
            onClick={go(() => navigate("/connect"))}
            title={`Posts without destinations go to X ${p.health.x.mode === "api" ? "with the API keys in .env" : "by copy & post"}`}
            className="flex w-full items-start gap-2 text-left hover:text-ink"
          >
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="min-w-0">
              <span className="block">
                {accounts.length} account{accounts.length === 1 ? "" : "s"} connected
              </span>
              <span className="block truncate text-[11px] opacity-80">
                No destination: X {p.health.x.mode === "api" ? "via .env keys" : "by copy & post"}
              </span>
            </span>
          </button>
        ) : (
          <button onClick={go(() => navigate("/connect"))} className="flex w-full items-center gap-2 hover:text-ink">
            <span className={cx("size-1.5 rounded-full", p.health.x.mode === "api" ? "bg-emerald-500" : "bg-amber-500")} />
            X: {p.health.x.mode === "api" ? "auto-posting" : "manual (copy & post)"}
          </button>
        )}
        {paused && (
          <button onClick={go(() => navigate("/"))} className="flex w-full items-center gap-2 font-medium text-red-700 hover:text-red-900 dark:text-red-400">
            <span className="size-1.5 rounded-full bg-red-500" />
            <span className="truncate">Publishing paused</span>
          </button>
        )}
        {op && (
          <button onClick={go(() => navigate("/"))} title={op.reason ?? undefined} className="flex w-full items-center gap-2 hover:text-ink">
            <span
              className={cx(
                "size-1.5 shrink-0 rounded-full",
                op.running ? "animate-pulse bg-sky-500" : op.reason ? "bg-amber-500" : op.enabled ? "bg-emerald-500" : "bg-ink-3",
              )}
            />
            <span className="truncate">
              Operator:{" "}
              {op.running
                ? "running"
                : op.reason
                  ? "not set up"
                  : op.enabled && op.nextRunAt
                    ? `next ${formatWhen(op.nextRunAt, p.health.timezone)}`
                    : op.enabled
                      ? "on"
                      : "on request"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function DraftItem({ post, active, onOpen }: { post: Post; active: boolean; onOpen: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deletePost(post.id),
    onSuccess: () => {
      qc.setQueryData<Post[]>(["posts", "draft"], (list) => list?.filter((p) => p.id !== post.id));
      if (active) newDraft();
    },
    onError: (e) => toastError("Couldn't delete the draft", e),
  });
  return (
    <li className="group relative">
      <button
        onClick={onOpen}
        className={cx(
          "block w-full rounded-lg py-2 pr-8 pl-2.5 text-left transition-colors",
          active ? "bg-subtle" : "hover:bg-subtle/70",
          remove.isPending && "opacity-40",
        )}
      >
        <span className={cx("block truncate text-sm", active ? "font-medium text-ink" : "text-ink-2")}>{draftTitle(post)}</span>
        <span className="block text-[11px] text-ink-3">
          {timeAgo(post.updatedAt)}
          {post.thread.length > 1 && ` · ${post.thread.length} posts`}
          {post.source !== "ui" && ` · via ${post.source}`}
        </span>
      </button>
      <button
        onClick={() => (confirm ? remove.mutate() : setConfirm(true))}
        onBlur={() => setConfirm(false)}
        aria-label={`Delete draft ${draftTitle(post)}`}
        className={cx(
          "absolute top-1/2 right-1.5 grid h-6 -translate-y-1/2 place-items-center rounded-md px-1 text-[11px] font-medium transition-opacity",
          confirm
            ? "bg-red-600 px-2 text-white opacity-100"
            : "text-ink-3 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100 [@media(hover:none)]:opacity-60",
        )}
      >
        {confirm ? "Delete" : <Trash2 size={13} />}
      </button>
    </li>
  );
}
