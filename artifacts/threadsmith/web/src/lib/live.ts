// Live updates over SSE (/api/events): refresh queries, notify on due/failed/published, fan out to the composer.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { APP_EVENT_TYPES, type AppEvent, type Post } from "../../../shared/types.ts";
import { api, liveSummary } from "../api.ts";
import { dismissToast, toast, toastError } from "../components/Toasts.tsx";
import { notifyLocally } from "./reminders.ts";
import { openPost } from "./router.ts";
import { copyText, firstLine } from "./util.ts";

const LIVE_EVENT = "threadsmith:event";

/**
 * Copy a thread for posting by hand. Call it synchronously from the click (the clipboard write starts inside the
 * gesture); `id` may still be pending, e.g. while the composer saves. Resolves to whether the copy worked.
 */
export async function copyThread(id: string | Promise<string>, quiet = false): Promise<boolean> {
  try {
    const exported = typeof id === "string" ? api.exportPost(id) : id.then(api.exportPost);
    // A thread that stopped partway on X: copy only the posts that are not live yet.
    await copyText(exported.then((r) => (r.alreadyLive ? r.remainingText : r.text)));
    const r = await exported;
    if (quiet) return true;
    if (r.alreadyLive) {
      const n = r.remainingPosts.length;
      toast({
        title: `Copied the ${n} remaining post${n > 1 ? "s" : ""}`,
        description: `${liveSummary(r.alreadyLive)}. Post these as replies to post ${r.alreadyLive}.`,
        tone: "success",
        duration: 10_000,
        actions: [{ label: `Open post ${r.alreadyLive} on X`, onClick: () => open(r.replyToUrl!, "_blank", "noopener") }],
      });
    } else
      toast({
        title: r.posts.length > 1 ? `Copied ${r.posts.length} posts` : "Copied",
        description: r.posts.length > 1 ? "Posts are separated by --- lines." : undefined,
        tone: "success",
      });
    return true;
  } catch (e) {
    toastError("Couldn't copy the thread", e);
    return false;
  }
}

function announceDue(post: Post) {
  const body = firstLine(post.thread[0]?.text ?? "", 120);
  toast({
    id: `due-${post.id}`,
    title: "Time to post",
    // post.error explains why a human is needed (e.g. it missed its time while the server was off).
    description: [body || "A scheduled thread is ready to copy.", post.error].filter(Boolean).join(" — "),
    duration: 0,
    actions: [
      { label: "Copy thread", primary: true, onClick: () => void copyThread(post.id) },
      { label: "Open", onClick: () => openPost(post.id) },
    ],
  });
  if (document.hidden) void notifyLocally("Time to post", body, `/?post=${post.id}&copy=1`, `due-${post.id}`);
}

export function useLiveEvents() {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource("/api/events");
    const onEvent = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as AppEvent;
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: ["queue"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
      dispatchEvent(new CustomEvent<AppEvent>(LIVE_EVENT, { detail: event }));
      // A "Time to post" / "failed" alert is stale once the post has moved on (posted, retried, rescheduled, deleted).
      const id = event.type === "post.deleted" ? event.id : event.post.id;
      const status = event.type === "post.deleted" ? null : event.post.status;
      if (status !== "due") dismissToast(`due-${id}`);
      if (status !== "failed") dismissToast(`failed-${id}`);
      if (event.type === "post.due") announceDue(event.post);
      else if (event.type === "post.failed")
        toast({
          id: `failed-${event.post.id}`,
          title: "A post failed to publish",
          description: event.post.error ?? undefined,
          tone: "error",
          duration: 0,
          actions: [{ label: "Open", primary: true, onClick: () => openPost(event.post.id) }],
        });
      else if (event.type === "post.published" && event.post.xPostIds.length)
        toast({
          id: `published-${event.post.id}`, // same id as the composer's own toast, so it shows once
          title: "Posted to X",
          tone: "success",
          actions: event.post.url ? [{ label: "View on X", onClick: () => open(event.post.url!, "_blank", "noopener") }] : undefined,
        });
    };
    for (const type of APP_EVENT_TYPES) es.addEventListener(type, onEvent as EventListener);
    return () => es.close();
  }, [qc]);
}

/** Subscribe a component to live events (latest handler wins, no resubscribe churn). */
export function useLiveEvent(handler: (event: AppEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const listener = (e: Event) => ref.current((e as CustomEvent<AppEvent>).detail);
    addEventListener(LIVE_EVENT, listener);
    return () => removeEventListener(LIVE_EVENT, listener);
  }, []);
}
