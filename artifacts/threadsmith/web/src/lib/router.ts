// Tiny history-based router: /, /queue, /connect plus query params (?post, ?slot, ?copy, ?tab).
import { useMemo, useSyncExternalStore } from "react";

export type View = "compose" | "queue" | "connect";

const EVENT = "threadsmith:navigate";

function subscribe(cb: () => void) {
  addEventListener("popstate", cb);
  addEventListener(EVENT, cb);
  return () => {
    removeEventListener("popstate", cb);
    removeEventListener(EVENT, cb);
  };
}

const path = () => location.pathname + location.search;
// Includes the blank-draft counter so "New draft" on "/" re-renders with a fresh composer key.
const snapshot = () => `${blankSession}|${path()}`;

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === path()) return;
  history[opts.replace ? "replaceState" : "pushState"](null, "", to);
  dispatchEvent(new Event(EVENT));
}

export function useRoute(): { view: View; params: URLSearchParams } {
  const href = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => {
    const url = new URL(href.slice(href.indexOf("|") + 1), location.origin);
    const view: View = url.pathname.startsWith("/queue") ? "queue" : url.pathname.startsWith("/connect") ? "connect" : "compose";
    return { view, params: url.searchParams };
  }, [href]);
}

// The composer is remounted when the user opens another post or starts a new draft, but not when a new
// draft gets its id from the server (the URL changes from "/" to "/?post=<id>" mid-session).
let blankSession = 0;
const aliases = new Map<string, string>();

export function composerKey(postId: string | null): string {
  return postId ? (aliases.get(postId) ?? postId) : `new-${blankSession}`;
}

/** Called by the composer when its blank draft is first saved. */
export function adoptPostId(postId: string, key: string) {
  aliases.set(postId, key);
  navigate(`/?post=${postId}`, { replace: true });
}

export function openPost(id: string) {
  navigate(`/?post=${id}`);
}

export function newDraft(slot?: string) {
  blankSession++;
  if (slot) navigate(`/?slot=${encodeURIComponent(slot)}`);
  else if (path() === "/") dispatchEvent(new Event(EVENT));
  else navigate("/");
}

addEventListener("popstate", () => blankSession++);
