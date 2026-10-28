// Typed client for the Threadsmith REST API (same origin). Auth token lives in localStorage + a cookie for <img>/SSE.
import type { AppEventType, Health, Media, Post, PostStatus, Queue, Segment } from "../../shared/types.ts";

const TOKEN_KEY = "threadsmith_token";

export const auth = {
  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; SameSite=Strict; max-age=31536000${secure}`;
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    document.cookie = `${TOKEN_KEY}=; path=/; SameSite=Strict; max-age=0`;
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface CallOptions {
  body?: unknown;
  headers?: Record<string, string>;
  keepalive?: boolean;
}

async function call<T>(method: string, path: string, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Threadsmith-Source": "ui", ...opts.headers };
  const token = auth.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body, keepalive: opts.keepalive });
  } catch {
    throw new ApiError(0, "network", "Can't reach the Threadsmith server");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("threadsmith:unauthorized"));
    const err = (data ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, err.error ?? "error", err.message ?? `${res.status} ${res.statusText}`);
  }
  return data as T;
}

export type ThreadInput = Pick<Segment, "id" | "text" | "mediaIds">[];
export type PostDetail = Post & { attempts: { at: string; ok: boolean; detail: string | null }[] };
export interface ThreadExport {
  text: string;
  posts: string[];
  intentUrl: string;
}
export type SlotRule = { days: string; times: string[] } | { days: string; from: string; to: string; everyMinutes: number };
export interface AppConfig {
  timezone: string;
  maxChars: number;
  slots: SlotRule[];
  schedulerIntervalSeconds: number;
  voiceCount: number;
}
export interface Webhook {
  id: string;
  url: string;
  events: AppEventType[];
  createdAt: string;
  lastStatus: number | null;
  lastError: string | null;
  lastAt: string | null;
}

/** Same formula as the server's export: X web intent prefilled with the first post. */
export const intentUrl = (firstPost: string) => `https://x.com/intent/post?text=${encodeURIComponent(firstPost)}`;

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

export const api = {
  health: () => call<Health>("GET", "/api/health"),
  config: () => call<AppConfig>("GET", "/api/config"),

  listPosts: (opts: { status?: PostStatus[]; limit?: number } = {}) =>
    call<{ posts: Post[] }>("GET", `/api/posts${q({ status: opts.status?.join(","), limit: opts.limit })}`).then((r) => r.posts),
  getPost: (id: string) => call<PostDetail>("GET", `/api/posts/${id}`),
  createPost: (body: { thread: ThreadInput; scheduledAt?: string }, idempotencyKey?: string, keepalive?: boolean) =>
    call<Post>("POST", "/api/posts", { body, keepalive, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {} }),
  updatePost: (id: string, body: { thread: ThreadInput }, keepalive?: boolean) =>
    call<Post>("PATCH", `/api/posts/${id}`, { body, keepalive }),
  deletePost: (id: string) => call<{ ok: true }>("DELETE", `/api/posts/${id}`),
  schedule: (id: string, at: string) => call<Post>("POST", `/api/posts/${id}/schedule`, { body: { at } }),
  unschedule: (id: string) => call<Post>("POST", `/api/posts/${id}/unschedule`),
  publish: (id: string) => call<Post>("POST", `/api/posts/${id}/publish`),
  retry: (id: string) => call<Post>("POST", `/api/posts/${id}/retry`),
  markPublished: (id: string, url?: string) => call<Post>("POST", `/api/posts/${id}/mark-published`, { body: url ? { url } : {} }),
  exportPost: (id: string) => call<ThreadExport>("GET", `/api/posts/${id}/export`),
  duplicate: (id: string) => call<Post>("POST", `/api/posts/${id}/duplicate`),

  queue: (days = 14) => call<Queue>("GET", `/api/queue?days=${days}`),
  nextSlots: (count = 5) => call<{ slots: string[] }>("GET", `/api/slots/next?count=${count}`).then((r) => r.slots),

  uploadMedia: (file: File) => {
    const form = new FormData();
    form.set("file", file);
    return call<Media>("POST", "/api/media", { body: form });
  },
  /** Metadata (alt text). Not every server version exposes it; null means unknown. */
  getMedia: (id: string) =>
    call<Media>("GET", `/api/media/${id}`).catch((e: unknown) => {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return null;
      throw e;
    }),
  updateMediaAlt: (id: string, alt: string | null) => call<Media>("PATCH", `/api/media/${id}`, { body: { alt } }),

  webhooks: () => call<{ webhooks: Webhook[] }>("GET", "/api/webhooks").then((r) => r.webhooks),
  createWebhook: (url: string, events?: AppEventType[]) =>
    call<Webhook & { secret: string }>("POST", "/api/webhooks", { body: { url, events } }),
  deleteWebhook: (id: string) => call<{ ok: true }>("DELETE", `/api/webhooks/${id}`),
  testWebhook: (id: string) => call<{ ok: boolean; status: number | null; error: string | null }>("POST", `/api/webhooks/${id}/test`),

  pushPublicKey: () => call<{ publicKey: string }>("GET", "/api/push/public-key").then((r) => r.publicKey),
  pushSubscribe: (sub: PushSubscriptionJSON) => call<{ ok: true }>("POST", "/api/push/subscribe", { body: sub }),
  pushUnsubscribe: (endpoint: string) => call<{ ok: true }>("POST", "/api/push/unsubscribe", { body: { endpoint } }),
  pushTest: () => call<{ ok: true; message: string }>("POST", "/api/push/test"),

  ai: {
    threadify: (text: string, instructions?: string) =>
      call<{ posts: string[] }>("POST", "/api/ai/threadify", { body: { text, instructions: instructions || undefined } }),
    rewrite: (text: string, instruction: string) => call<{ text: string }>("POST", "/api/ai/rewrite", { body: { text, instruction } }),
    hooks: (text: string, count = 3) => call<{ variants: string[] }>("POST", "/api/ai/hooks", { body: { text, count } }),
    fit: (text: string, maxChars: number) => call<{ text: string }>("POST", "/api/ai/fit", { body: { text, maxChars } }),
    altText: (mediaId: string) => call<{ alt: string }>("POST", "/api/ai/alt-text", { body: { mediaId } }),
  },
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
