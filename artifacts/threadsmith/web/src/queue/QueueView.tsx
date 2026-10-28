// Queue: the next 14 days grouped by day (posts + open slots), with due/failed actions, and the published list.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CircleCheck, Copy, ExternalLink, Image, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { Health, Post, QueueDay, QueueItem } from "../../../shared/types.ts";
import { api, intentUrl, type AppConfig } from "../api.ts";
import { toast, toastError } from "../components/Toasts.tsx";
import type { useReminders } from "../connect/Reminders.tsx";
import { copyThread } from "../lib/live.ts";
import { navigate, newDraft, openPost } from "../lib/router.ts";
import { formatDate, formatTime, formatWhen, relativeDay } from "../lib/time.ts";
import { cx, firstLine, modKey } from "../lib/util.ts";

const STATUS_STYLE: Record<Post["status"], string> = {
  draft: "bg-subtle text-ink-2",
  scheduled: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  due: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  publishing: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  published: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function StatusBadge({ status }: { status: Post["status"] }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", STATUS_STYLE[status])}>
      {status === "publishing" && <LoaderCircle size={10} className="animate-spin" />}
      {status}
    </span>
  );
}

interface Props {
  health: Health;
  tab: "upcoming" | "published";
  reminders: ReturnType<typeof useReminders>;
}

export function QueueView({ health, tab, reminders }: Props) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-24 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3 pt-6 pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Queue</h1>
            <p className="mt-0.5 text-sm text-ink-2">Times in {health.timezone.replace(/_/g, " ")}</p>
          </div>
          <div role="tablist" className="flex rounded-lg border border-line p-0.5 text-sm">
            {(["upcoming", "published"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => navigate(t === "upcoming" ? "/queue" : "/queue?tab=published", { replace: true })}
                className={cx("h-8 rounded-md px-3 font-medium capitalize", tab === t ? "bg-subtle text-ink" : "text-ink-3 hover:text-ink")}
              >
                {t}
              </button>
            ))}
          </div>
        </header>
        {health.x.mode === "manual" && reminders.state === "off" && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
            <Bell size={16} className="shrink-0 text-ink-3" />
            <p className="min-w-0 flex-1 text-ink-2">
              Manual mode: Threadsmith tells you when it's time to post. Turn on reminders to get them even with this tab closed.
            </p>
            <button
              onClick={() => reminders.enable.mutate()}
              disabled={reminders.enable.isPending}
              className="h-8 rounded-lg bg-ink px-3 text-xs font-medium text-canvas hover:opacity-90"
            >
              Enable reminders
            </button>
          </div>
        )}
        {tab === "upcoming" ? <Upcoming health={health} /> : <Published health={health} />}
      </div>
    </div>
  );
}

function Upcoming({ health }: { health: Health }) {
  const { data: queue, isPending, error } = useQuery({ queryKey: ["queue"], queryFn: () => api.queue(14), refetchInterval: 60_000 });
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 60_000 });
  const tz = queue?.timezone ?? health.timezone;
  const counts = useMemo(() => {
    const items = queue?.days.flatMap((d) => d.items) ?? [];
    return { posts: items.filter((i) => i.type === "post").length, slots: items.filter((i) => i.type === "slot").length };
  }, [queue]);

  if (isPending) return <Skeleton />;
  if (error) return <p className="py-10 text-center text-sm text-red-600">Couldn't load the queue: {error.message}</p>;

  if (!counts.posts && !counts.slots) return <NoSlots config={config} />;

  return (
    <>
      {!counts.posts && (
        <div className="mb-4 rounded-2xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
          <p className="font-medium text-ink">Nothing queued yet</p>
          <p className="mt-1 leading-relaxed">
            The faint rows are your posting slots. Write a draft and press <kbd className="font-sans font-medium">{modKey}↵</kbd> to drop it into
            the next free one, or click a slot to write for it.
          </p>
        </div>
      )}
      <div className="space-y-1">
        {queue.days.map((day) => (
          <Day key={day.date} day={day} tz={tz} />
        ))}
      </div>
    </>
  );
}

function Day({ day, tz }: { day: QueueDay; tz: string }) {
  const rel = relativeDay(day.date, tz);
  const posts = day.items.filter((i) => i.type === "post").length;
  return (
    <section>
      <h2 className="sticky top-0 z-10 -mx-2 flex items-baseline gap-2 bg-canvas/90 px-2 pt-4 pb-2 backdrop-blur">
        <span className="text-sm font-semibold">{rel ?? formatDate(day.date).split(",")[0]}</span>
        <span className="text-sm text-ink-3">{rel ? formatDate(day.date) : formatDate(day.date).split(", ").slice(1).join(", ")}</span>
        {posts > 0 && <span className="ml-auto text-xs text-ink-3">{posts} queued</span>}
      </h2>
      {day.items.length ? (
        <ul className="space-y-1.5">
          {day.items.map((item) => (
            <li key={item.type === "post" ? item.post.id : item.at}>
              <Row item={item} tz={tz} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-1 text-xs text-ink-3">No slots this day</p>
      )}
    </section>
  );
}

function Row({ item, tz }: { item: QueueItem; tz: string }) {
  if (item.type === "slot")
    return (
      <button
        onClick={() => newDraft(item.at)}
        className="group flex w-full items-center gap-4 rounded-xl border border-dashed border-transparent px-3 py-2 text-left text-sm text-ink-3 transition-colors hover:border-line-strong hover:bg-surface hover:text-ink-2"
      >
        <time className="w-16 shrink-0 tabular-nums">{formatTime(item.at, tz)}</time>
        <span className="flex-1">Empty slot</span>
        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Plus size={14} /> Write for this slot
        </span>
      </button>
    );
  return <PostRow post={item.post} at={item.at} tz={tz} />;
}

function Preview({ post }: { post: Post }) {
  const images = post.thread.reduce((n, s) => n + s.mediaIds.length, 0);
  return (
    <>
      <p className="line-clamp-2 text-sm leading-relaxed break-words">{post.thread[0]?.text.trim() || <span className="text-ink-3">Empty post</span>}</p>
      <p className="mt-1 flex items-center gap-2 text-xs text-ink-3">
        {post.thread.length > 1 && <span>{post.thread.length} posts</span>}
        {images > 0 && (
          <span className="flex items-center gap-0.5">
            <Image size={12} /> {images}
          </span>
        )}
        {post.source !== "ui" && <span>via {post.source.toUpperCase()}</span>}
      </p>
    </>
  );
}

function PostRow({ post, at, tz }: { post: Post; at: string; tz: string }) {
  const qc = useQueryClient();
  const retry = useMutation({
    mutationFn: () => api.retry(post.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
    onError: (e) => toastError("Retry failed", e),
  });
  const mark = useMutation({
    mutationFn: (url?: string) => api.markPublished(post.id, url),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["queue"] });
      void qc.invalidateQueries({ queryKey: ["posts"] });
      toast({ title: "Marked as posted", tone: "success" });
    },
    onError: (e) => toastError("Couldn't mark as posted", e),
  });
  const [askUrl, setAskUrl] = useState(false);
  const [url, setUrl] = useState("");
  const due = post.status === "due";
  const failed = post.status === "failed";
  const action = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium";

  return (
    <div
      className={cx(
        "rounded-xl border bg-surface transition-colors",
        due ? "border-amber-300 bg-amber-50/60 shadow-sm dark:border-amber-800 dark:bg-amber-950/30" : failed ? "border-red-200 dark:border-red-900" : "border-line",
      )}
    >
      <button onClick={() => openPost(post.id)} className="flex w-full items-start gap-4 rounded-xl px-3 py-2.5 text-left hover:bg-subtle/60">
        <time className="w-16 shrink-0 pt-0.5 text-sm font-medium tabular-nums">{formatTime(at, tz)}</time>
        <div className="min-w-0 flex-1">
          <Preview post={post} />
        </div>
        <StatusBadge status={post.status} />
      </button>
      {failed && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:pl-23">
          <p className="w-full text-xs break-words text-red-700 dark:text-red-300">{post.error ?? "Publishing failed."}</p>
          <button onClick={() => retry.mutate()} disabled={retry.isPending} className={cx(action, "bg-ink text-canvas")}>
            {retry.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <RotateCcw size={13} />} Retry
          </button>
        </div>
      )}
      {due && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 sm:pl-23">
          <button onClick={() => void copyThread(post.id)} className={cx(action, "bg-ink text-canvas hover:opacity-90")}>
            <Copy size={13} /> Copy thread
          </button>
          <a href={intentUrl(post.thread[0]?.text ?? "")} target="_blank" rel="noopener noreferrer" className={cx(action, "border border-line bg-surface hover:bg-subtle")}>
            <ExternalLink size={13} /> Open in X
          </a>
          {askUrl ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mark.mutate(url.trim() || undefined);
              }}
              className="flex min-w-0 flex-1 gap-1.5"
            >
              <input
                autoFocus
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Link on X (optional)"
                className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 text-xs focus:border-line-strong"
              />
              <button type="submit" disabled={mark.isPending} className={cx(action, "border border-line bg-surface hover:bg-subtle")}>
                <CircleCheck size={13} /> Done
              </button>
            </form>
          ) : (
            <button onClick={() => setAskUrl(true)} className={cx(action, "border border-line bg-surface hover:bg-subtle")}>
              <CircleCheck size={13} /> Mark posted
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Published({ health }: { health: Health }) {
  const { data: posts, isPending } = useQuery({
    queryKey: ["posts", "published"],
    queryFn: () => api.listPosts({ status: ["published"], limit: 100 }),
  });
  if (isPending) return <Skeleton />;
  if (!posts?.length)
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-2">
        <p className="font-medium text-ink">Nothing published yet</p>
        <p className="mt-1">
          Posts land here once they go out, whether Threadsmith posted them or you marked them as posted after copying.
        </p>
      </div>
    );
  return (
    <ul className="space-y-1.5">
      {posts.map((post) => (
        <li key={post.id} className="flex items-start gap-4 rounded-xl border border-line bg-surface px-3 py-2.5">
          <button onClick={() => openPost(post.id)} className="min-w-0 flex-1 text-left">
            <time className="text-xs text-ink-3">{post.publishedAt ? formatWhen(post.publishedAt, health.timezone) : ""}</time>
            <div className="mt-0.5">
              <Preview post={post} />
            </div>
          </button>
          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-ink-2 hover:bg-subtle hover:text-ink"
            >
              View <ExternalLink size={12} />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function NoSlots({ config }: { config: AppConfig | undefined }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-ink-2">
      <p className="font-medium text-ink">No posting slots in the next two weeks</p>
      <p className="mt-1.5 leading-relaxed">
        “Add to queue” drops a thread into the next free slot. Slots come from <code className="font-mono text-xs text-ink">threadsmith.config.json</code>
        {config ? ` (timezone ${config.timezone})` : ""}; edits apply without a restart:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-subtle p-3 font-mono text-xs leading-relaxed text-ink">
        {`"slots": [
  { "days": "mon-fri", "times": ["09:00", "12:30", "16:00"] },
  { "days": "sat,sun", "from": "10:00", "to": "14:00", "everyMinutes": 120 }
]`}
      </pre>
      <p className="mt-3">You can still schedule any post for an exact time with “Pick time” in the composer.</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 pt-4" aria-busy>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-subtle" />
      ))}
    </div>
  );
}
