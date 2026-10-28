// Domain types shared by server, web UI, CLI and MCP tools.

export const POST_STATUSES = ["draft", "scheduled", "publishing", "due", "published", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
// draft      – not in the queue
// scheduled  – waiting for its time
// publishing – claimed by the scheduler, X API calls in flight
// due        – time arrived but nothing can auto-post (no X keys): user is notified to copy & post by hand
// published  – live on X (via API, or marked by hand)
// failed     – X API error; `error` says why, `xPostIds` lists any tweets that did go out

export type PostSource = "ui" | "api" | "mcp" | "cli" | "ai";

export interface Segment {
  id: string;
  text: string;
  mediaIds: string[];
}

export interface Post {
  id: string;
  title: string | null;
  status: PostStatus;
  thread: Segment[];
  scheduledAt: string | null; // ISO-8601 UTC
  publishedAt: string | null;
  error: string | null;
  xPostIds: string[]; // tweets already posted, in thread order (lets a failed thread resume)
  url: string | null; // link to the first tweet once published
  source: PostSource;
  createdAt: string;
  updatedAt: string;
}

export interface Media {
  id: string;
  filename: string;
  mime: string;
  size: number;
  alt: string | null;
  url: string; // served at /media/:id
  createdAt: string;
}

export interface QueueSlotItem {
  type: "slot";
  at: string; // ISO UTC, a free slot from the config
}
export interface QueuePostItem {
  type: "post";
  at: string;
  post: Post;
}
export type QueueItem = QueueSlotItem | QueuePostItem;

export interface QueueDay {
  date: string; // YYYY-MM-DD in the configured timezone
  items: QueueItem[];
}

export interface Queue {
  timezone: string;
  days: QueueDay[];
}

export type AppEvent =
  | { type: "post.created" | "post.updated" | "post.scheduled" | "post.due" | "post.published" | "post.failed"; post: Post }
  | { type: "post.deleted"; id: string };

export type AppEventType = AppEvent["type"];

export const APP_EVENT_TYPES: AppEventType[] = [
  "post.created",
  "post.updated",
  "post.scheduled",
  "post.due",
  "post.published",
  "post.failed",
  "post.deleted",
];

export interface Health {
  ok: true;
  version: string;
  timezone: string;
  maxChars: number;
  x: { configured: boolean; mode: "api" | "manual" };
  ai: { configured: boolean; provider: string | null; model: string | null };
  auth: { required: boolean };
}
