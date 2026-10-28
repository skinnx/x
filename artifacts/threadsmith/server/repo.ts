// Domain service: every surface (REST, MCP, CLI via REST, scheduler) goes through these functions,
// so state changes always emit events for SSE, webhooks and push.
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { splitThread } from "../shared/thread.ts";
import type { Media, Post, PostSource, PostStatus, Segment } from "../shared/types.ts";
import { db, tx } from "./db.ts";
import { env } from "./env.ts";
import { bus } from "./events.ts";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
/** Invalid input from a caller; errorResponse maps the status to a 400. */
export class BadInputError extends Error {
  status = 400;
}

const now = () => new Date().toISOString();
const newId = () => randomUUID();

// ---------- posts ----------

interface PostRow {
  id: string;
  title: string | null;
  status: PostStatus;
  thread: string;
  scheduled_at: string | null;
  published_at: string | null;
  error: string | null;
  x_post_ids: string;
  url: string | null;
  source: PostSource;
  created_at: string;
  updated_at: string;
}

function toPost(r: PostRow): Post {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    thread: JSON.parse(r.thread),
    scheduledAt: r.scheduled_at,
    publishedAt: r.published_at,
    error: r.error,
    xPostIds: JSON.parse(r.x_post_ids),
    url: r.url,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface SegmentInput {
  id?: string;
  text: string;
  mediaIds?: string[];
}

/**
 * Accepts either structured segments or one string with "---" separators. When `previous` is given and the
 * input is plain text, segment ids and images carry over by position, so editing text never drops images.
 */
export function normalizeThread(input: { thread?: SegmentInput[]; text?: string }, previous: Segment[] = []): Segment[] {
  const parts: SegmentInput[] =
    input.thread ??
    (input.text !== undefined
      ? splitThread(input.text).map((text, i) => ({ id: previous[i]?.id, text, mediaIds: previous[i]?.mediaIds }))
      : []);
  const segments = parts.map((p) => ({ id: p.id ?? newId(), text: p.text, mediaIds: p.mediaIds ?? [] }));
  return segments.length ? segments : [{ id: newId(), text: "", mediaIds: [] }];
}

function assertTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) throw new BadInputError(`Invalid date: ${iso}`);
  return t.toISOString();
}

export function getPost(id: string): Post | undefined {
  const row = db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as PostRow | undefined;
  return row ? toPost(row) : undefined;
}

export function requirePost(id: string): Post {
  const post = getPost(id);
  if (!post) throw new NotFoundError(`Post ${id} not found`);
  return post;
}

export interface ListFilter {
  status?: PostStatus[];
  from?: string; // scheduled_at >= from
  to?: string; // scheduled_at < to
  limit?: number;
}

export function listPosts(filter: ListFilter = {}): Post[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.status?.length) {
    where.push(`status IN (${filter.status.map(() => "?").join(",")})`);
    params.push(...filter.status);
  }
  if (filter.from) {
    where.push("scheduled_at >= ?");
    params.push(assertTime(filter.from));
  }
  if (filter.to) {
    where.push("scheduled_at < ?");
    params.push(assertTime(filter.to));
  }
  const sql =
    `SELECT * FROM posts ${where.length ? "WHERE " + where.join(" AND ") : ""} ` +
    `ORDER BY COALESCE(scheduled_at, updated_at) ${filter.from || filter.to ? "ASC" : "DESC"} LIMIT ?`;
  params.push(filter.limit ?? 500);
  return (db.prepare(sql).all(...params) as unknown as PostRow[]).map(toPost);
}

export function createPost(input: {
  thread?: SegmentInput[];
  text?: string;
  title?: string | null;
  scheduledAt?: string | null;
  source: PostSource;
}): Post {
  const id = newId();
  const ts = now();
  const scheduledAt = input.scheduledAt ? assertTime(input.scheduledAt) : null;
  const thread = normalizeThread(input);
  db.prepare(
    `INSERT INTO posts (id, title, status, thread, scheduled_at, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.title ?? null, scheduledAt ? "scheduled" : "draft", JSON.stringify(thread), scheduledAt, input.source, ts, ts);
  const post = requirePost(id);
  bus.emit({ type: "post.created", post });
  if (scheduledAt) bus.emit({ type: "post.scheduled", post });
  return post;
}

const EDITABLE: PostStatus[] = ["draft", "scheduled", "due", "failed"];

/**
 * Autosave target. Editing a published or in-flight post is refused, and so is changing the posts of a
 * partly published thread that are already live on X (Retry resumes after them by position).
 */
export function updatePost(id: string, patch: { thread?: SegmentInput[]; text?: string; title?: string | null }): Post {
  const post = requirePost(id);
  if (!EDITABLE.includes(post.status)) throw new ConflictError(`Post is ${post.status} and can no longer be edited`);
  const thread = patch.thread !== undefined || patch.text !== undefined ? normalizeThread(patch, post.thread) : post.thread;
  const live = post.xPostIds.length;
  for (let i = 0; i < live; i++) {
    const before = post.thread[i]!;
    const after = thread[i];
    if (!after || after.text.trim() !== before.text.trim() || after.mediaIds.join() !== before.mediaIds.join()) {
      throw new ConflictError(
        `The first ${live} post${live > 1 ? "s are" : " is"} already live on X and can't be changed, removed or reordered. ` +
          `Edit only the posts after ${live > 1 ? "them" : "it"}, then Retry.`,
      );
    }
    thread[i] = { ...after, id: before.id };
  }
  const title = patch.title !== undefined ? patch.title : post.title;
  db.prepare("UPDATE posts SET thread = ?, title = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(thread), title, now(), id);
  const updated = requirePost(id);
  bus.emit({ type: "post.updated", post: updated });
  return updated;
}

export function deletePost(id: string): void {
  const post = requirePost(id);
  if (post.status === "publishing") throw new ConflictError("Post is being published right now");
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  bus.emit({ type: "post.deleted", id });
}

export function schedulePost(id: string, at: string): Post {
  const post = requirePost(id);
  if (!EDITABLE.includes(post.status)) throw new ConflictError(`Post is ${post.status} and cannot be rescheduled`);
  db.prepare("UPDATE posts SET status = 'scheduled', scheduled_at = ?, error = NULL, updated_at = ? WHERE id = ?").run(
    assertTime(at),
    now(),
    id,
  );
  const updated = requirePost(id);
  bus.emit({ type: "post.scheduled", post: updated });
  return updated;
}

export function unschedulePost(id: string): Post {
  const post = requirePost(id);
  if (!EDITABLE.includes(post.status)) throw new ConflictError(`Post is ${post.status}`);
  db.prepare("UPDATE posts SET status = 'draft', scheduled_at = NULL, updated_at = ? WHERE id = ?").run(now(), id);
  const updated = requirePost(id);
  bus.emit({ type: "post.updated", post: updated });
  return updated;
}

/**
 * Atomically move the single earliest due `scheduled` post to `publishing`. Claiming one at a time means a restart
 * mid-tick strands only the post in flight; the rest stay `scheduled` for the next tick.
 */
export function claimNextDuePost(at = new Date()): Post | undefined {
  return tx(() => {
    const row = db
      .prepare("SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_at <= ? ORDER BY scheduled_at, created_at LIMIT 1")
      .get(at.toISOString()) as { id: string } | undefined;
    if (!row) return undefined;
    db.prepare("UPDATE posts SET status = 'publishing', updated_at = ? WHERE id = ? AND status = 'scheduled'").run(now(), row.id);
    return requirePost(row.id);
  });
}

/** Claim one specific post for an immediate "publish now". Its time becomes now, so it shows up on today's queue. */
export function claimPost(id: string): Post {
  const post = requirePost(id);
  if (!EDITABLE.includes(post.status)) throw new ConflictError(`Post is ${post.status}`);
  const ts = now();
  const res = db
    .prepare("UPDATE posts SET status = 'publishing', scheduled_at = ?, updated_at = ? WHERE id = ? AND status = ?")
    .run(ts, ts, id, post.status);
  if (res.changes !== 1) throw new ConflictError("Post changed while claiming it; try again");
  return requirePost(id);
}

function logAttempt(postId: string, ok: boolean, detail: string | null) {
  db.prepare("INSERT INTO attempts (post_id, at, ok, detail) VALUES (?, ?, ?, ?)").run(postId, now(), ok ? 1 : 0, detail);
}

/** Record tweet ids as they go out so a failure mid-thread can resume without duplicates. */
export function recordPostedTweets(id: string, xPostIds: string[]): void {
  db.prepare("UPDATE posts SET x_post_ids = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(xPostIds), now(), id);
}

export function markPublished(id: string, result: { xPostIds?: string[]; url?: string | null }): Post {
  const post = requirePost(id);
  const ts = now();
  db.prepare(
    `UPDATE posts SET status = 'published', published_at = ?, error = NULL, x_post_ids = ?, url = ?,
       scheduled_at = COALESCE(scheduled_at, ?), updated_at = ? WHERE id = ?`,
  ).run(ts, JSON.stringify(result.xPostIds ?? post.xPostIds), result.url ?? post.url, ts, ts, id);
  logAttempt(id, true, result.url ?? null);
  const updated = requirePost(id);
  bus.emit({ type: "post.published", post: updated });
  return updated;
}

/**
 * The user posted it by hand (manual mode). Idempotent: an already published post is returned unchanged
 * without a second event; an in-flight API publish is refused.
 */
export function markPublishedManually(id: string, url?: string | null): Post {
  const post = requirePost(id);
  if (post.status === "publishing") throw new ConflictError("Post is being published via the X API right now");
  if (post.status === "published") return post;
  if (url != null && !/^https?:\/\/\S+$/i.test(url)) throw new BadInputError("url must be an http(s) link to the post on X");
  return markPublished(id, { url: url ?? null });
}

export function markFailed(id: string, error: string): Post {
  db.prepare("UPDATE posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?").run(error, now(), id);
  logAttempt(id, false, error);
  const updated = requirePost(id);
  bus.emit({ type: "post.failed", post: updated });
  return updated;
}

/**
 * Hand over to the human (notification + copy button): there are no X keys, or the post missed its time by too
 * much to go out unattended. `note` explains why and is shown with the post.
 */
export function markDue(id: string, note: string | null = null): Post {
  db.prepare("UPDATE posts SET status = 'due', error = ?, updated_at = ? WHERE id = ?").run(note, now(), id);
  logAttempt(id, false, note ?? "manual: no X API credentials, waiting for copy & post");
  const updated = requirePost(id);
  bus.emit({ type: "post.due", post: updated });
  return updated;
}

/** After a crash, posts stuck in `publishing` may or may not be on X. Fail them loudly rather than risk duplicates. */
export function recoverInterrupted(): number {
  const stuck = listPosts({ status: ["publishing"] });
  for (const p of stuck) {
    markFailed(
      p.id,
      `Interrupted while publishing (process restarted). ${p.xPostIds.length} of ${p.thread.length} posts were confirmed on X. ` +
        `Check your profile first: if post ${p.xPostIds.length + 1} is already there, Retry would be refused as a duplicate, so post the rest by hand as replies and mark it published; otherwise Retry posts the rest.`,
    );
  }
  return stuck.length;
}

export function attemptsFor(postId: string): { at: string; ok: boolean; detail: string | null }[] {
  return (db.prepare("SELECT at, ok, detail FROM attempts WHERE post_id = ? ORDER BY id DESC LIMIT 50").all(postId) as {
    at: string;
    ok: number;
    detail: string | null;
  }[]).map((r) => ({ at: r.at, ok: r.ok === 1, detail: r.detail }));
}

// ---------- media ----------

interface MediaRow {
  id: string;
  filename: string;
  mime: string;
  size: number;
  alt: string | null;
  path: string;
  x_media_id: string | null;
  x_media_expires_at: string | null;
  created_at: string;
}

export const IMAGE_MIMES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // X's limit for images

/** Files live in <DATA_DIR>/media; rows store only the file name so data/ can be moved or restored elsewhere. */
const mediaFile = (stored: string) => path.join(env.dataDir, "media", path.basename(stored));

function toMedia(r: MediaRow): Media {
  return { id: r.id, filename: r.filename, mime: r.mime, size: r.size, alt: r.alt, url: `/media/${r.id}`, createdAt: r.created_at };
}

export function createMedia(input: { data: Uint8Array; mime: string; filename?: string; alt?: string | null }): Media {
  const ext = IMAGE_MIMES[input.mime];
  if (!ext) throw new ConflictError(`Unsupported image type ${input.mime}; use png, jpeg, webp or gif`);
  if (input.data.byteLength > MAX_IMAGE_BYTES) throw new ConflictError("Image is larger than X's 5 MB limit");
  const id = newId();
  const name = `${id}.${ext}`;
  writeFileSync(mediaFile(name), input.data);
  db.prepare("INSERT INTO media (id, filename, mime, size, alt, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    id,
    input.filename ?? `${id}.${ext}`,
    input.mime,
    input.data.byteLength,
    input.alt ?? null,
    name,
    now(),
  );
  return toMedia(db.prepare("SELECT * FROM media WHERE id = ?").get(id) as unknown as MediaRow);
}

export function getMedia(id: string): (Media & { path: string; xMediaId: string | null; xMediaExpiresAt: string | null }) | undefined {
  const r = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as MediaRow | undefined;
  return r ? { ...toMedia(r), path: mediaFile(r.path), xMediaId: r.x_media_id, xMediaExpiresAt: r.x_media_expires_at } : undefined;
}

export function readMediaBytes(id: string): Buffer {
  const m = getMedia(id);
  if (!m) throw new NotFoundError(`Media ${id} not found`);
  return readFileSync(m.path);
}

export function updateMediaAlt(id: string, alt: string | null): Media {
  if (!getMedia(id)) throw new NotFoundError(`Media ${id} not found`);
  // X attaches alt text at upload time, so a changed alt needs a fresh upload: drop the cached X media id.
  db.prepare("UPDATE media SET alt = ?, x_media_id = NULL, x_media_expires_at = NULL WHERE id = ?").run(alt, id);
  return toMedia(db.prepare("SELECT * FROM media WHERE id = ?").get(id) as unknown as MediaRow);
}

/** Cache X's media id (valid ~24h) so retries don't re-upload. */
export function setXMediaId(id: string, xMediaId: string, expiresAt: string): void {
  db.prepare("UPDATE media SET x_media_id = ?, x_media_expires_at = ? WHERE id = ?").run(xMediaId, expiresAt, id);
}

export function deleteMedia(id: string): void {
  const m = getMedia(id);
  if (!m) throw new NotFoundError(`Media ${id} not found`);
  db.prepare("DELETE FROM media WHERE id = ?").run(id);
  try {
    unlinkSync(m.path);
  } catch {
    // already gone
  }
}
