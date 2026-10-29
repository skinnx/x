// Inbox: the control room. Agents do the work; the person decides here — waiting approvals, the kill switch,
// the built-in operator, the approval chats (Telegram/Discord) and a readable activity log.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  CircleAlert,
  CircleCheck,
  CirclePause,
  CirclePlay,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  PenLine,
  Play,
  Send,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { AuditEntry, ChannelStatus, ControlState, Health, OperatorRun, Post } from "../../../shared/types.ts";
import { api, ApiError, type PreviewTarget } from "../api.ts";
import { DecisionBar } from "../components/Approval.tsx";
import { Card } from "../components/Card.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { toast, toastError } from "../components/Toasts.tsx";
import { useControl } from "../lib/control.ts";
import { actorName, askerLabel, deciderLabel } from "../lib/actors.ts";
import { PlatformIcon } from "../lib/platforms.tsx";
import { openPost } from "../lib/router.ts";
import { formatWhen, timeAgo } from "../lib/time.ts";
import { cx, firstLine } from "../lib/util.ts";

const btn = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50";

export function InboxView({ health }: { health: Health }) {
  const control = useControl();
  const approvals = useQuery({ queryKey: ["approvals"], queryFn: api.approvals, refetchInterval: 60_000 });
  const pending = approvals.data?.filter((p) => p.approval?.state === "pending") ?? [];
  const sentBack = approvals.data?.filter((p) => p.approval?.state === "changes_requested") ?? [];
  const tz = health.timezone;
  const paused = control.data?.paused ?? null;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] space-y-8 px-4 pt-6 pb-24 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
            <p className="mt-0.5 text-sm text-ink-2">Agents do the work. You decide what goes out.</p>
          </div>
          {control.data && !paused && <PauseButton />}
        </header>

        {paused && <PausedBanner paused={paused} />}

        <section aria-labelledby="waiting">
          <SectionTitle id="waiting" title="Waiting for you" count={pending.length} />
          {approvals.isPending ? (
            <div className="h-32 animate-pulse rounded-2xl bg-subtle" />
          ) : approvals.error ? (
            <p className="text-sm text-red-600">Couldn't load approvals: {approvals.error.message}</p>
          ) : pending.length ? (
            <ul className="space-y-3">
              {pending.map((p) => (
                <li key={p.id}>
                  <ApprovalCard post={p} tz={tz} paused={Boolean(paused)} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              Nothing waiting. When an agent queues a post, it shows up here
              {control.data?.channels.some((c) => c.configured) ? " and in your chats" : ""}.
              {control.data?.approval.require === "never" && " (Approval is off in threadsmith.config.json: agents publish without asking.)"}
            </Empty>
          )}
        </section>

        {sentBack.length > 0 && (
          <section aria-labelledby="sent-back">
            <SectionTitle id="sent-back" title="Sent back to the agent" count={sentBack.length} />
            <ul className="space-y-1.5">
              {sentBack.map((p) => (
                <li key={p.id}>
                  <SentBackRow post={p} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <OperatorPanel control={control.data} tz={tz} />
          <ChannelsPanel control={control.data} />
        </div>

        <ActivityPanel tz={tz} />
      </div>
    </div>
  );
}

function SectionTitle({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <h2 id={id} className="mb-2.5 flex items-baseline gap-2 text-sm font-semibold">
      {title}
      {!!count && <span className="text-xs font-normal text-ink-3 tabular-nums">{count}</span>}
    </h2>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-strong px-4 py-5 text-sm leading-relaxed text-ink-2">{children}</p>;
}

// ---------- kill switch ----------

function useSetControl() {
  const qc = useQueryClient();
  return (state: ControlState) => {
    qc.setQueryData(["control"], state);
    void qc.invalidateQueries({ queryKey: ["audit"] });
  };
}

function PauseButton() {
  const setControl = useSetControl();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const pause = useMutation({
    mutationFn: () => api.pause(reason.trim() || undefined),
    onSuccess: (s) => {
      setControl(s);
      setOpen(false);
      setReason("");
      toast({ title: "Publishing paused", description: "Nothing goes out until you resume." });
    },
    onError: (e) => toastError("Couldn't pause", e),
  });
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className={cx(btn, "border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink")}>
        <CirclePause size={14} /> Pause everything
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        pause.mutate();
      }}
      className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2 sm:w-auto"
    >
      <input
        autoFocus
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        maxLength={500}
        placeholder="Reason (optional)"
        aria-label="Reason for pausing (optional)"
        className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 text-sm focus:border-line-strong sm:w-56"
      />
      <button type="submit" disabled={pause.isPending} className={cx(btn, "bg-red-600 text-white hover:bg-red-700")}>
        {pause.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <CirclePause size={13} />} Pause
      </button>
      <button type="button" onClick={() => setOpen(false)} className={cx(btn, "text-ink-2 hover:bg-subtle")}>
        Cancel
      </button>
    </form>
  );
}

function PausedBanner({ paused }: { paused: NonNullable<ControlState["paused"]> }) {
  const setControl = useSetControl();
  const resume = useMutation({
    mutationFn: api.resume,
    onSuccess: (s) => {
      setControl(s);
      toast({ title: "Publishing resumed", description: "Posts whose time passed go out now.", tone: "success" });
    },
    onError: (e) => toastError("Couldn't resume", e),
  });
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-50"
    >
      <CirclePause size={18} className="shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Publishing is paused</p>
        <p className="text-xs opacity-80">
          {actorName(paused.by)} paused it {timeAgo(paused.at)}
          {paused.reason ? `: “${paused.reason}”` : ""}. Nothing goes out, approved or not, until you resume.
        </p>
      </div>
      <button onClick={() => resume.mutate()} disabled={resume.isPending} className={cx(btn, "bg-ink text-canvas hover:opacity-90")}>
        {resume.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <CirclePlay size={13} />} Resume
      </button>
    </div>
  );
}

// ---------- approvals ----------

function ApprovalCard({ post, tz, paused }: { post: Post; tz: string; paused: boolean }) {
  const preview = useQuery({
    queryKey: ["preview", post.id, post.updatedAt],
    queryFn: () => api.preview(post.id),
    staleTime: 60_000,
  });
  const when = post.scheduledAt && Date.parse(post.scheduledAt) > Date.now() ? formatWhen(post.scheduledAt, tz) : null;
  const problems = preview.data?.filter((t) => t.problem).length ?? 0;
  return (
    <article className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-line px-4 py-2.5 text-xs text-ink-3">
        <span className="flex items-center gap-1.5 font-medium text-ink-2">
          <Bot size={13} /> {askerLabel(post)}
        </span>
        <span>asked {post.approval?.at ? timeAgo(post.approval.at) : timeAgo(post.updatedAt)}</span>
        <span className="flex-1" />
        <span className={cx(!when && "font-medium text-amber-700 dark:text-amber-400")}>
          {paused ? "Paused · " : ""}
          {when ? `Goes out ${when}` : "Goes out as soon as you approve"}
        </span>
      </div>
      <div className="space-y-3 px-4 py-3">
        {post.title && <p className="text-sm font-semibold">{post.title}</p>}
        {preview.data ? (
          <div className="space-y-3">
            {preview.data.map((t) => (
              <DestinationPreview key={t.accountId ?? t.platform} target={t} multi={preview.data.length > 1} />
            ))}
          </div>
        ) : (
          <ThreadText items={post.thread.map((s) => ({ text: s.text, images: s.mediaIds.length }))} />
        )}
        {problems > 0 && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-300">
            <CircleAlert size={13} /> {problems === 1 ? "A destination" : `${problems} destinations`} would refuse this as it is. Request changes, or open it
            and fix it.
          </p>
        )}
        <DecisionBar
          post={post}
          tz={tz}
          extra={
            <button onClick={() => openPost(post.id)} className={cx(btn, "ml-auto text-ink-2 hover:bg-subtle hover:text-ink")}>
              <PenLine size={13} /> Open
            </button>
          }
        />
      </div>
    </article>
  );
}

function DestinationPreview({ target: t, multi }: { target: PreviewTarget; multi: boolean }) {
  const posts = t.items.length;
  return (
    <div>
      {(multi || t.accountId) && (
        <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
          <PlatformIcon platform={t.platform} size={12} />
          <span className="font-medium text-ink-2">{t.label}</span>
          <span>
            · {posts === 1 ? "1 post" : `${posts} posts`}
            {t.threadMode === "single" && posts > 1 ? " joined into one" : ""} · limit {t.limit}
          </span>
        </p>
      )}
      <ThreadText items={t.items} limit={t.limit} />
      {t.problem && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
          <CircleAlert size={13} className="mt-px shrink-0" /> {t.problem}
        </p>
      )}
    </div>
  );
}

function ThreadText({ items, limit }: { items: { text: string; count?: number; fits?: boolean; images: number }[]; limit?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 3);
  return (
    <ol className="space-y-1.5">
      {shown.map((it, i) => (
        <li key={i} className={cx("rounded-xl border-l-2 bg-canvas py-2 pr-3 pl-3", it.fits === false ? "border-red-500" : "border-line-strong")}>
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{it.text.trim() || <span className="text-ink-3">Empty post</span>}</p>
          {(it.count !== undefined || it.images > 0 || items.length > 1) && (
            <p className="mt-1 flex items-center gap-2 text-[11px] text-ink-3 tabular-nums">
              {items.length > 1 && <span>{i + 1}/{items.length}</span>}
              {it.count !== undefined && (
                <span className={cx(it.fits === false && "font-medium text-red-600 dark:text-red-400")}>
                  {it.count}
                  {limit ? `/${limit}` : ""} chars
                </span>
              )}
              {it.images > 0 && (
                <span className="flex items-center gap-0.5">
                  <ImageIcon size={11} /> {it.images}
                </span>
              )}
            </p>
          )}
        </li>
      ))}
      {items.length > 3 && (
        <li>
          <button onClick={() => setAll(!all)} className="text-xs font-medium text-ink-2 hover:text-ink">
            {all ? "Show less" : `Show ${items.length - 3} more`}
          </button>
        </li>
      )}
    </ol>
  );
}

function SentBackRow({ post }: { post: Post }) {
  const text = firstLine(post.thread.find((s) => s.text.trim())?.text ?? "", 100) || "Empty post";
  return (
    <button onClick={() => openPost(post.id)} className="block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:bg-subtle/60">
      <span className="block truncate text-sm">{post.title || text}</span>
      {post.approval?.note && (
        <span className="mt-1 block text-xs leading-relaxed break-words text-orange-800 dark:text-orange-300">
          {capitalize(deciderLabel(post.approval.by))} asked: “{post.approval.note}”
        </span>
      )}
      <span className="mt-0.5 block text-[11px] text-ink-3">
        {post.approval?.at ? `${timeAgo(post.approval.at)} · ` : ""}Waiting for the agent's revision, which asks you again
      </span>
    </button>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- operator ----------

function OperatorPanel({ control, tz }: { control: ControlState | undefined; tz: string }) {
  const qc = useQueryClient();
  const op = control?.operator;
  const runs = useQuery({
    queryKey: ["operator", "runs"],
    queryFn: () => api.operatorRuns(5),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
    refetchInterval: op?.running ? 5_000 : 60_000,
  });
  const [task, setTask] = useState("");
  const run = useMutation({
    mutationFn: () => api.runOperator(task.trim() || undefined),
    onSuccess: () => {
      setTask("");
      toast({ title: "Operator started", description: "Anything it queues waits here for you." });
      void qc.invalidateQueries({ queryKey: ["control"] });
      void qc.invalidateQueries({ queryKey: ["operator"] });
    },
    onError: (e) => toastError("Couldn't start the operator", e),
  });

  const state = !op
    ? null
    : op.running
      ? { dot: "bg-sky-500 animate-pulse", text: "Running now" }
      : op.reason
        ? { dot: "bg-amber-500", text: "Can't run" }
        : op.enabled
          ? { dot: "bg-emerald-500", text: op.nextRunAt ? `Next run ${formatWhen(op.nextRunAt, tz)}` : "On schedule" }
          : { dot: "bg-ink-3", text: "Schedule off · runs when you ask" };

  return (
    <Card icon={<Bot size={16} />} title="Operator" badge={op?.model ?? undefined}>
      {!op ? (
        <div className="h-16 animate-pulse rounded-xl bg-subtle" />
      ) : (
        <>
          <div>
            <p className="flex items-center gap-2 font-medium text-ink">
              <span className={cx("size-2 shrink-0 rounded-full", state!.dot)} />
              {state!.text}
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              {op.reason ??
                (op.enabled
                  ? "Claude works through your brief on a schedule. What it queues waits for your approval."
                  : "Turn on operator.enabled in threadsmith.config.json to run it on a schedule.")}
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run.mutate();
            }}
            className="flex gap-2"
          >
            <input
              value={task}
              onChange={(e) => setTask(e.target.value)}
              disabled={Boolean(op.reason)}
              maxLength={2000}
              placeholder="Task for this run (optional)"
              aria-label="Task for this run (optional)"
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 text-sm text-ink placeholder:text-ink-3 focus:border-line-strong disabled:opacity-50"
            />
            <button type="submit" disabled={Boolean(op.reason) || run.isPending} className={cx(btn, "bg-ink text-canvas hover:opacity-90")}>
              {run.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Play size={13} />} {op.running ? "Queue run" : "Run now"}
            </button>
          </form>
          <RunList runs={runs.data ?? (op.lastRun ? [op.lastRun] : [])} />
        </>
      )}
    </Card>
  );
}

function RunList({ runs }: { runs: OperatorRun[] }) {
  if (!runs.length) return <p className="text-xs text-ink-3">No runs yet.</p>;
  return (
    <ul className="-mx-1 space-y-2 border-t border-line pt-3">
      {runs.map((r) => (
        <li key={r.id} className="flex items-start gap-2 px-1 text-xs">
          {r.status === "running" ? (
            <LoaderCircle size={13} className="mt-px shrink-0 animate-spin text-sky-600" />
          ) : r.status === "failed" ? (
            <CircleAlert size={13} className="mt-px shrink-0 text-red-600 dark:text-red-400" />
          ) : (
            <CircleCheck size={13} className="mt-px shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-ink-3">
              {timeAgo(r.startedAt)} · {r.trigger}
              {r.toolCalls > 0 && ` · ${r.toolCalls} tool call${r.toolCalls === 1 ? "" : "s"}`}
            </p>
            {r.task && <p className="truncate text-ink-2">Task: {r.task}</p>}
            {r.error ? (
              <p className="line-clamp-2 break-words text-red-700 dark:text-red-300">{r.error}</p>
            ) : (
              r.summary && <p className="line-clamp-3 break-words whitespace-pre-line text-ink-2">{r.summary}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- approval chats ----------

const CHANNELS: { id: ChannelStatus["id"]; name: string; env: [string, string] }[] = [
  { id: "telegram", name: "Telegram", env: ["TELEGRAM_APPROVAL_BOT_TOKEN", "TELEGRAM_APPROVAL_CHAT_ID"] },
  { id: "discord", name: "Discord", env: ["DISCORD_APPROVAL_BOT_TOKEN", "DISCORD_APPROVAL_CHANNEL_ID"] },
];

function ChannelsPanel({ control }: { control: ControlState | undefined }) {
  const qc = useQueryClient();
  const [digestOpen, setDigestOpen] = useState(false);
  const test = useMutation({
    mutationFn: () => api.testChannels(),
    onSuccess: (channels) => {
      qc.setQueryData<ControlState>(["control"], (c) => (c ? { ...c, channels } : c));
      const bad = channels.filter((c) => c.configured && (c.error || !c.connected));
      toast(
        bad.length
          ? { title: "Test message failed", description: bad.map((c) => `${c.id}: ${c.error ?? "not connected"}`).join(" · "), tone: "error" }
          : { title: "Test message sent", description: "Check your chat.", tone: "success" },
      );
    },
    onError: (e) => toastError("Couldn't send the test message", e),
  });
  const anyConfigured = control?.channels.some((c) => c.configured) ?? false;

  return (
    <Card icon={<MessageCircle size={16} />} title="Approval chats">
      <ul className="space-y-2.5">
        {CHANNELS.map((ch) => {
          const s = control?.channels.find((c) => c.id === ch.id);
          const status = !s?.configured
            ? { dot: "bg-ink-3", text: "Not set up" }
            : s.error
              ? { dot: "bg-red-500", text: "Error" }
              : s.connected
                ? { dot: "bg-emerald-500", text: "Connected" }
                : { dot: "bg-amber-500", text: "Configured, not connected yet" };
          return (
            <li key={ch.id}>
              <p className="flex items-center gap-2">
                <span className={cx("size-2 shrink-0 rounded-full", status.dot)} />
                <span className="font-medium text-ink">{ch.name}</span>
                <span className="text-xs text-ink-3">{status.text}</span>
              </p>
              {s?.error && <p className="mt-0.5 pl-4 text-xs break-words text-red-700 dark:text-red-300">{s.error}</p>}
              {!s?.configured && (
                <p className="mt-0.5 pl-4 text-xs leading-relaxed text-ink-3">
                  Set <code className="font-mono text-[11px]">{ch.env[0]}</code> and <code className="font-mono text-[11px]">{ch.env[1]}</code> in .env,
                  then restart.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs leading-relaxed">Each request lands in your chat with Approve, Request changes and Reject, plus a daily digest.</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => test.mutate()}
          disabled={!anyConfigured || test.isPending}
          title={anyConfigured ? undefined : "Set up a chat in .env first"}
          className={cx(btn, "border border-line bg-surface text-ink hover:bg-subtle")}
        >
          {test.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <Send size={13} />} Send test message
        </button>
        <button onClick={() => setDigestOpen(true)} className={cx(btn, "text-ink-2 hover:bg-subtle hover:text-ink")}>
          <FileText size={13} /> Today's digest
        </button>
      </div>
      {digestOpen && <DigestDialog onClose={() => setDigestOpen(false)} />}
    </Card>
  );
}

function DigestDialog({ onClose }: { onClose: () => void }) {
  const { data, isPending, error } = useQuery({ queryKey: ["digest"], queryFn: api.digest, staleTime: 0 });
  return (
    <Dialog title="Today's digest" onClose={onClose}>
      {isPending ? (
        <div className="h-32 animate-pulse rounded-xl bg-subtle" />
      ) : error ? (
        <p className="text-sm text-red-600">{error.message}</p>
      ) : (
        <pre className="max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-canvas p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap">
          {data}
        </pre>
      )}
      <p className="mt-3 text-xs text-ink-3">Your approval chats get this every day.</p>
    </Dialog>
  );
}

// ---------- activity ----------

const quote = (s: string | null) => (s ? `“${s}”` : "");

function describe(e: AuditEntry, tz: string): string {
  const who = actorName(e.actor);
  const d = e.detail;
  switch (e.action) {
    case "post.approval_requested":
      return `${who} asked to publish ${quote(d) || "a post"}`;
    case "post.approved":
      return `${who} approved a post${d ? `: ${quote(d)}` : ""}`;
    case "post.changes_requested":
      return `${who} sent a post back${d ? `: ${quote(d)}` : ""}`;
    case "post.rejected":
      return `${who} rejected a post${d ? `: ${quote(d)}` : ""}`;
    case "post.created":
      return `${who} drafted ${quote(d) || "a post"}`;
    case "post.updated":
      return `${who} edited ${quote(d) || "a post"}`;
    case "post.scheduled":
      return `${who} scheduled a post${d && !Number.isNaN(Date.parse(d)) ? ` for ${formatWhen(d, tz)}` : ""}`;
    case "post.published":
      return `${who === "The scheduler" ? "A post" : `${who} published a post`}${who === "The scheduler" ? " went out" : ""}`;
    case "post.failed":
      return `A post failed to publish${d ? `: ${d}` : ""}`;
    case "post.due":
      return `A post is due to post by hand${d ? `: ${d}` : ""}`;
    case "post.deleted":
      return `${who} deleted a post`;
    case "publishing.paused":
      return `${who} paused publishing${d ? `: ${quote(d)}` : ""}`;
    case "publishing.resumed":
      return `${who} resumed publishing`;
    default:
      return `${who}: ${e.action}${d ? ` ${quote(d)}` : ""}`;
  }
}

const ACTION_DOT: Record<string, string> = {
  "post.approval_requested": "bg-violet-500",
  "post.approved": "bg-emerald-500",
  "post.published": "bg-emerald-500",
  "post.changes_requested": "bg-orange-500",
  "post.rejected": "bg-red-500",
  "post.failed": "bg-red-500",
  "publishing.paused": "bg-red-500",
  "post.due": "bg-amber-500",
};

/** An agent's "drafted" + "scheduled" lines are noise next to its "asked to publish" for the same post: keep the ask. */
function condense(entries: AuditEntry[]): AuditEntry[] {
  const asks = entries.filter((e) => e.action === "post.approval_requested");
  return entries.filter(
    (e) =>
      !(e.action === "post.created" || e.action === "post.scheduled") ||
      !asks.some((a) => a.postId === e.postId && a.actor === e.actor && Math.abs(Date.parse(a.at) - Date.parse(e.at)) < 10_000),
  );
}

function ActivityPanel({ tz }: { tz: string }) {
  const { data, isPending, error } = useQuery({ queryKey: ["audit", 60], queryFn: () => api.audit({ limit: 60 }), refetchInterval: 60_000 });
  const entries = data && condense(data).slice(0, 30);
  return (
    <Card icon={<Activity size={16} />} title="Activity" badge="who did what">
      {isPending ? (
        <div className="h-24 animate-pulse rounded-xl bg-subtle" />
      ) : error ? (
        <p className="text-red-600">Couldn't load activity: {error.message}</p>
      ) : !entries?.length ? (
        <p className="text-xs">Nothing yet. Every draft, request, decision and publish is logged here with who did it.</p>
      ) : (
        <ul className="-mx-2 -my-1">
          {entries.map((e) => {
            const url = e.action === "post.published" && e.detail?.startsWith("http") ? e.detail.split(" ")[0] : null;
            const text = url ? describe({ ...e, detail: null }, tz) : describe(e, tz);
            const linkable = e.postId && e.action !== "post.deleted";
            return (
              <li key={e.id} className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-subtle/60">
                <span className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", ACTION_DOT[e.action] ?? "bg-ink-3")} />
                <p className="min-w-0 flex-1 text-[13px] leading-snug break-words text-ink">
                  {linkable ? (
                    <button onClick={() => openPost(e.postId!)} className="text-left hover:underline">
                      {text}
                    </button>
                  ) : (
                    text
                  )}
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-ink-2 hover:text-ink">
                      View <ExternalLink size={11} />
                    </a>
                  )}
                </p>
                <time dateTime={e.at} title={formatWhen(e.at, tz)} className="shrink-0 pt-px text-[11px] text-ink-3 tabular-nums">
                  {timeAgo(e.at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
