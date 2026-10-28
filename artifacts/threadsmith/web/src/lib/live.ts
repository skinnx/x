// Live updates over SSE (/api/events): refresh queries, notify on due/failed/published, fan out to the composer.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { APP_EVENT_TYPES, type AppEvent, type Post } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { toast, toastError } from "../components/Toasts.tsx";
import { notifyLocally } from "./reminders.ts";
import { openPost } from "./router.ts";
import { copyText, firstLine } from "./util.ts";

const LIVE_EVENT = "threadsmith:event";

export async function copyThread(id: string, quiet = false) {
  try {
    const exported = api.exportPost(id);
    await copyText(exported.then((r) => r.text));
    const { posts } = await exported;
    if (!quiet)
      toast({
        title: posts.length > 1 ? `Copied ${posts.length} posts` : "Copied",
        description: posts.length > 1 ? "Posts are separated by --- lines." : undefined,
        tone: "success",
      });
  } catch (e) {
    toastError("Couldn't copy the thread", e);
  }
}

function announceDue(post: Post) {
  const body = firstLine(post.thread[0]?.text ?? "", 120);
  toast({
    id: `due-${post.id}`,
    title: "Time to post",
    description: body || "A scheduled thread is ready to copy.",
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
