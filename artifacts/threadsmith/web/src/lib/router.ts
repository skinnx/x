// Tiny history-based router plus query params (?post, ?slot, ?copy, ?tab):
//   /  (or /inbox) the Inbox · /write the composer · /queue · /connect · /plugins.
// Links from chats, push and older versions open posts as /?post=<id>: "/" with ?post or ?slot is the composer.
import { useMemo, useSyncExternalStore } from "react";

export type View = "inbox" | "compose" | "queue" | "connect" | "plugins";

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
// Includes the blank-draft counter so "New draft" on "/write" re-renders with a fresh composer key.
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
    const p = url.pathname;
    const view: View = p.startsWith("/queue")
      ? "queue"
      : p.startsWith("/connect")
        ? "connect"
        : p.startsWith("/plugins")
          ? "plugins"
        : p.startsWith("/write") || url.searchParams.has("post") || url.searchParams.has("slot")
          ? "compose"
          : "inbox";
    return { view, params: url.searchParams };
  }, [href]);
}

// The composer is remounted when the user opens another post or starts a new draft, but not when a new
// draft gets its id from the server (the URL changes from "/write" to "/write?post=<id>" mid-session).
let blankSession = 0;
const aliases = new Map<string, string>();

export function composerKey(postId: string | null): string {
  return postId ? (aliases.get(postId) ?? postId) : `new-${blankSession}`;
}

/** Called by the composer when its blank draft is first saved. */
export function adoptPostId(postId: string, key: string) {
  aliases.set(postId, key);
  navigate(`/write?post=${postId}`, { replace: true });
}

export function openPost(id: string) {
  navigate(`/write?post=${id}`);
}

export function newDraft(slot?: string) {
  blankSession++;
  if (slot) navigate(`/write?slot=${encodeURIComponent(slot)}`);
  else if (path() === "/write") dispatchEvent(new Event(EVENT));
  else navigate("/write");
}

addEventListener("popstate", () => blankSession++);
