// Banner above the thread for posts that need attention: due (copy & post by hand), failed, publishing, published.
import { useMutation } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Copy, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { Health, Post } from "../../../shared/types.ts";
import { api, intentUrl } from "../api.ts";
import { Popover } from "../components/Popover.tsx";
import { toast, toastError } from "../components/Toasts.tsx";
import { openPost } from "../lib/router.ts";
import { formatWhen } from "../lib/time.ts";
import { copyText, cx } from "../lib/util.ts";

interface Props {
  post: Post;
  health: Health;
  /** Opened from a reminder (`?copy=1`): lead with the copy button. */
  fromReminder: boolean;
  onCopy: () => Promise<void>;
  onChange: (post: Post) => void;
}

const primary = "flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-50";
const secondary = "flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm hover:bg-subtle disabled:opacity-50";

export function StatusBanner(p: Props) {
  const { post } = p;
  const tz = p.health.timezone;

  const retry = useMutation({
    mutationFn: () => api.retry(post.id),
    onSuccess: (r) => {
      p.onChange(r);
      toast({ title: r.status === "published" ? "Posted to X" : r.status === "due" ? "Ready to post by hand" : "Retried", tone: "success" });
    },
    onError: (e) => toastError("Retry failed", e),
  });
  const duplicate = useMutation({
    mutationFn: () => api.duplicate(post.id),
    onSuccess: (r) => openPost(r.id),
    onError: (e) => toastError("Couldn't duplicate", e),
  });

  if (post.status === "publishing")
    return (
      <Shell tone="info">
        <LoaderCircle size={16} className="animate-spin" /> <span className="font-medium">Publishing to X…</span>
      </Shell>
    );

  if (post.status === "published")
    return (
      <Shell tone="ok">
        <CircleCheck size={16} className="shrink-0" />
        <span className="flex-1">
          <span className="font-medium">Published</span>
          {post.publishedAt && <span className="opacity-70"> · {formatWhen(post.publishedAt, tz)}</span>}
        </span>
        {post.url && (
          <a href={post.url} target="_blank" rel="noopener noreferrer" className={secondary}>
            <ExternalLink size={14} /> View on X
          </a>
        )}
        <button onClick={() => duplicate.mutate()} disabled={duplicate.isPending} className={secondary}>
          <Copy size={14} /> Duplicate as draft
        </button>
      </Shell>
    );

  if (post.status === "failed")
    return (
      <Shell tone="error">
        <div className="flex w-full flex-col gap-2.5">
          <div className="flex gap-2">
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium">This post failed to publish</p>
              {post.error && <p className="mt-0.5 text-sm break-words opacity-80">{post.error}</p>}
              {post.xPostIds.length > 0 && (
                <p className="mt-1 text-sm opacity-80">
                  {post.xPostIds.length} of {post.thread.length} posts are already live; Retry continues from there.
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            <button onClick={() => retry.mutate()} disabled={retry.isPending} className={primary}>
              {retry.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />} Retry
            </button>
            <MarkPosted post={post} onChange={p.onChange} />
          </div>
        </div>
      </Shell>
    );

  if (post.status === "due" || p.fromReminder) return <DueBanner {...p} />;
  return null;
}

function DueBanner(p: Props) {
  const { post } = p;
  const [copied, setCopied] = useState<number | "all" | null>(null);
  const multi = post.thread.length > 1;
  return (
    <Shell tone="due">
      <div className="flex w-full flex-col gap-3">
        <div>
          <p className="font-semibold">{post.status === "due" ? "Time to post" : "Ready to post"}</p>
          <p className="mt-0.5 text-sm opacity-80">
            {multi
              ? "Copy the thread, or copy post by post into X's composer (use + to add each reply), then mark it posted."
              : "Copy it, post it on X, then mark it posted."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            autoFocus={p.fromReminder}
            onClick={() => void p.onCopy().then(() => setCopied("all"))}
            className={cx(primary, "h-10 px-4")}
          >
            {copied === "all" ? <CircleCheck size={15} /> : <Copy size={15} />}
            {copied === "all" ? "Copied" : multi ? "Copy thread" : "Copy post"}
          </button>
          <a href={intentUrl(post.thread[0]?.text ?? "")} target="_blank" rel="noopener noreferrer" className={cx(secondary, "h-10")}>
            <ExternalLink size={14} /> Open in X
          </a>
          <MarkPosted post={post} onChange={p.onChange} />
        </div>
        {multi && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="opacity-70">Copy one:</span>
            {post.thread.map((s, i) => (
              <button
                key={s.id}
                onClick={() =>
                  copyText(s.text).then(
                    () => setCopied(i),
                    (e: unknown) => toastError("Couldn't copy", e),
                  )
                }
                className={cx(
                  "rounded-full border px-2.5 py-1 tabular-nums transition-colors",
                  copied === i ? "border-current font-medium" : "border-amber-300/70 hover:border-current dark:border-amber-800",
                )}
              >
                {copied === i ? "✓ " : ""}
                {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

function MarkPosted({ post, onChange }: { post: Post; onChange: (p: Post) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const mark = useMutation({
    mutationFn: () => api.markPublished(post.id, url.trim() || undefined),
    onSuccess: (r) => {
      onChange(r);
      setOpen(false);
      toast({ title: "Marked as posted", tone: "success" });
    },
    onError: (e) => toastError("Couldn't mark as posted", e),
  });
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={secondary}>
        <CircleCheck size={14} /> Mark posted
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="top-full left-0 mt-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mark.mutate();
          }}
          className="space-y-2.5 text-ink"
        >
          <label className="block text-xs font-medium text-ink-2">
            Link to the post on X (optional)
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://x.com/you/status/…"
              className="mt-1 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm font-normal text-ink focus:border-line-strong"
            />
          </label>
          <button type="submit" disabled={mark.isPending} className={cx(primary, "w-full justify-center")}>
            {mark.isPending && <LoaderCircle size={14} className="animate-spin" />} Mark as posted
          </button>
        </form>
      </Popover>
    </div>
  );
}

function Shell({ tone, children }: { tone: "info" | "ok" | "error" | "due"; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        "mb-5 flex animate-rise flex-wrap items-center gap-2.5 rounded-2xl border px-4 py-3.5 text-sm",
        tone === "info" && "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100",
        tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100",
        tone === "error" && "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100",
        tone === "due" && "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50",
      )}
    >
      {children}
    </div>
  );
}
