// Draft state + autosave: the post is created on the first keystroke, then PATCHed ~600ms after edits stop.
// Every edit is mirrored to localStorage first, so a reload or crash before the save lands never loses text.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Post, Segment } from "../../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { toastError } from "../components/Toasts.tsx";
import { uid } from "../lib/util.ts";

export type SaveState = "idle" | "saving" | "saved" | "offline";

const BUFFER_KEY = "threadsmith:unsaved";
const EDITABLE: Post["status"][] = ["draft", "scheduled", "due", "failed"];
const DEBOUNCE_MS = 600;

interface Buffer {
  session: string; // also the Idempotency-Key of the create request
  postId: string | null;
  thread: Segment[];
  at: number;
}

export const blankSegment = (text = ""): Segment => ({ id: uid(), text, mediaIds: [] });
export const isBlank = (thread: Segment[]) => thread.every((s) => !s.text.trim() && !s.mediaIds.length);
const signature = (t: Segment[]) => JSON.stringify(t.map((s) => [s.id, s.text, s.mediaIds]));

function readBuffer(): Buffer | null {
  try {
    return JSON.parse(localStorage.getItem(BUFFER_KEY) ?? "null") as Buffer | null;
  } catch {
    return null;
  }
}
function writeBuffer(b: Buffer) {
  try {
    localStorage.setItem(BUFFER_KEY, JSON.stringify(b));
  } catch {
    // storage full or disabled: the server save still happens
  }
}

export function useDraft(postId: string | null, onCreated: (post: Post) => void) {
  const [thread, setThreadState] = useState<Segment[] | null>(null);
  const [post, setPost] = useState<Post | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [missing, setMissing] = useState(false);

  const r = useRef({
    id: postId,
    session: uid(),
    latest: [] as Segment[],
    dirty: false,
    loop: null as Promise<void> | null,
    timer: 0,
    mounted: true,
    onCreated,
  }).current;
  r.onCreated = onCreated;

  const ops = useMemo(() => {
    const clearBuffer = () => {
      if (readBuffer()?.session === r.session) localStorage.removeItem(BUFFER_KEY);
    };

    const run = async () => {
      while (r.dirty) {
        r.dirty = false;
        const snapshot = r.latest;
        if (!r.id && isBlank(snapshot)) continue;
        setSaveState("saving");
        try {
          const saved = r.id
            ? await api.updatePost(r.id, { thread: snapshot })
            : await api.createPost({ thread: snapshot }, r.session);
          if (!r.id) {
            r.id = saved.id;
            // An idempotent replay returns the first version; push what we have now.
            if (signature(saved.thread) !== signature(snapshot)) r.dirty = true;
            if (r.mounted) r.onCreated(saved);
          }
          setPost(saved);
        } catch (e) {
          if (e instanceof ApiError && e.status === 409 && r.id) {
            // Published or publishing meanwhile, or the edit touched posts already live on X: show the server's version.
            const fresh = await api.getPost(r.id).catch(() => null);
            if (fresh && EDITABLE.includes(fresh.status)) toastError("Your last edit wasn't saved", e);
            if (fresh) {
              setPost(fresh);
              r.latest = fresh.thread;
              setThreadState(fresh.thread);
            }
            clearBuffer();
            setSaveState("idle");
            return;
          }
          r.dirty = true;
          setSaveState("offline");
          r.timer = window.setTimeout(flush, 5000);
          return;
        }
      }
      setSaveState((s) => (s === "saving" ? "saved" : s));
      clearBuffer();
    };

    const flush = (): Promise<void> => {
      window.clearTimeout(r.timer);
      r.loop ??= run().finally(() => (r.loop = null));
      return r.loop;
    };

    const setThread = (next: Segment[] | ((prev: Segment[]) => Segment[])) => {
      const value = typeof next === "function" ? next(r.latest) : next;
      r.latest = value;
      r.dirty = true;
      setThreadState(value);
      writeBuffer({ session: r.session, postId: r.id, thread: value, at: Date.now() });
      window.clearTimeout(r.timer);
      if (!r.id) void flush();
      else {
        setSaveState("saving");
        r.timer = window.setTimeout(flush, DEBOUNCE_MS);
      }
    };

    /** Server-side change (SSE, schedule response…): adopt it unless the user has unsent edits. */
    const applyRemote = (p: Post) => {
      if (p.id !== r.id) return;
      setPost(p);
      if (!r.dirty && !r.loop && signature(p.thread) !== signature(r.latest)) {
        r.latest = p.thread;
        setThreadState(p.thread);
      }
    };

    const init = (base: Segment[], server: Post | null) => {
      const buf = readBuffer();
      const matches = buf && buf.postId === (server?.id ?? null) && !isBlank(buf.thread);
      const newer = matches && (!server || buf.at > Date.parse(server.updatedAt));
      const editable = !server || EDITABLE.includes(server.status);
      if (buf && matches && newer && editable && signature(buf.thread) !== signature(base)) {
        r.session = buf.session;
        r.latest = buf.thread;
        r.dirty = true;
        setThreadState(buf.thread);
        void flush();
      } else {
        r.latest = base;
        setThreadState(base);
      }
    };

    return { flush, setThread, applyRemote, init, setPost };
  }, [r]);

  useEffect(() => {
    let cancelled = false;
    if (!postId) ops.init([blankSegment()], null);
    else
      api.getPost(postId).then(
        (p) => {
          if (cancelled) return;
          setPost(p);
          ops.init(p.thread, p);
        },
        () => !cancelled && setMissing(true),
      );
    return () => {
      cancelled = true;
    };
    // Mount-only on purpose: the composer is keyed per post.
  }, []);

  useEffect(() => {
    r.mounted = true;
    // Last-chance save when the tab closes; keepalive lets the request outlive the page.
    const onHide = () => {
      if (!r.dirty) return;
      if (r.id) void api.updatePost(r.id, { thread: r.latest }, true).catch(() => {});
      else if (!isBlank(r.latest)) void api.createPost({ thread: r.latest }, r.session, true).catch(() => {});
    };
    addEventListener("pagehide", onHide);
    return () => {
      removeEventListener("pagehide", onHide);
      r.mounted = false;
      if (r.dirty) void ops.flush();
    };
  }, [r, ops]);

  return {
    thread,
    post,
    saveState,
    missing,
    currentId: () => r.id,
    flush: ops.flush,
    setThread: ops.setThread,
    applyRemote: ops.applyRemote,
    setPost: ops.setPost,
  };
}
