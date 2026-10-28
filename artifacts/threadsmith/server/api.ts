// REST API mounted at /api (documented at /openapi.json), plus /media/:id file serving.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRoute, z } from "@hono/zod-openapi";
import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { threadToText } from "../shared/thread.ts";
import { APP_EVENT_TYPES, POST_STATUSES, type Health, type PostSource, type PostStatus } from "../shared/types.ts";
import { aiStatus } from "./ai/provider.ts";
import { buildQueue, getConfig, nextFreeSlots, resolveWhen } from "./config.ts";
import { env, VERSION, xConfigured } from "./env.ts";
import { createRouter } from "./http.ts";
import {
  attemptsFor,
  ConflictError,
  createMedia,
  createPost,
  deleteMedia,
  deletePost,
  getMedia,
  idempotent,
  IMAGE_MIMES,
  listPosts,
  markPublished,
  MAX_IMAGE_BYTES,
  NotFoundError,
  requirePost,
  schedulePost,
  unschedulePost,
  updateMediaAlt,
  updatePost,
} from "./repo.ts";
import { publishNow, retryPost } from "./scheduler.ts";
import { eventStream } from "./sse.ts";
import { createWebhook, deleteWebhook, listWebhooks, testWebhook } from "./webhooks.ts";

const FETCH_TIMEOUT_MS = 15_000;

// ---------- schemas (named ones become components in /openapi.json) ----------

const When = z
  .union([
    z.literal("next"),
    z.iso.datetime({ offset: true, local: true, error: 'use "next" or an ISO-8601 date-time, e.g. 2026-11-02T09:00:00+07:00, …Z, or 2026-11-02T09:00 (configured timezone)' }),
  ])
  .openapi({
    description: '"next" takes the next free posting slot from threadsmith.config.json; otherwise an ISO-8601 date-time. Without an offset it is read in the configured timezone (GET /config). Must not be in the past.',
    example: "next",
  });
const DateFilter = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO-8601 date or date-time")
  .optional();

const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "not_found", description: "Machine-readable code: invalid_request, bad_request, unauthorized, not_found, conflict, internal." }),
    message: z.string().openapi({ description: "Human-readable explanation; safe to show to the user." }),
  })
  .openapi("Error");

const OkSchema = z.object({ ok: z.literal(true) }).openapi("Ok");

const SegmentSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    mediaIds: z.array(z.string()).openapi({ description: "Media ids attached to this post (max 4)." }),
  })
  .openapi("Segment", { description: "One post of a thread." });

const PostSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable().openapi({ description: "Private label; never posted." }),
    status: z.enum(POST_STATUSES).openapi({
      description:
        "draft: not queued · scheduled: waits for scheduledAt · publishing: X API calls in flight · " +
        "due: time arrived but no X API keys, the user must copy & post by hand · published: live on X · " +
        "failed: X API error (see `error`; `xPostIds` lists tweets that did go out, retry resumes after them).",
    }),
    thread: z.array(SegmentSchema).openapi({ description: "Posts in thread order; a single post is a one-item thread." }),
    scheduledAt: z.iso.datetime().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    error: z.string().nullable(),
    xPostIds: z.array(z.string()),
    url: z.string().nullable().openapi({ description: "Link to the first tweet once published." }),
    source: z.enum(["ui", "api", "mcp", "cli", "ai"]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Post", { description: "A single X post or a thread, with its scheduling state." });

const PostDetailSchema = PostSchema.extend({
  attempts: z
    .array(z.object({ at: z.iso.datetime(), ok: z.boolean(), detail: z.string().nullable() }))
    .openapi({ description: "Publish attempts, newest first (max 50)." }),
}).openapi("PostDetail");

const SegmentInputSchema = z
  .object({
    id: z.string().optional().openapi({ description: "Existing segment id to keep when editing; omit for new posts." }),
    text: z.string(),
    mediaIds: z.array(z.string()).max(4).optional().openapi({ description: "Up to 4 image ids from POST /media." }),
  })
  .openapi("SegmentInput");

const threadFields = {
  text: z.string().optional().openapi({
    description: "The whole thread as one string; a line containing only `---` separates posts. Send this OR `thread`.",
    example: "Posts are separated by a line of three dashes.\n---\nThis is the second post.",
  }),
  thread: z.array(SegmentInputSchema).optional().openapi({ description: "Structured posts in order. Send this OR `text`." }),
  title: z.string().max(200).nullable().optional().openapi({ description: "Private label shown in the UI; never posted." }),
};
const notBoth = (b: { text?: unknown; thread?: unknown }) => b.text === undefined || b.thread === undefined;
const NOT_BOTH = "send either `text` or `thread`, not both";

const CreatePostSchema = z
  .object({ ...threadFields, scheduledAt: When.nullable().optional() })
  .refine(notBoth, NOT_BOTH)
  .openapi("CreatePost");
const UpdatePostSchema = z.object(threadFields).refine(notBoth, NOT_BOTH).openapi("UpdatePost");

const MediaSchema = z
  .object({
    id: z.string(),
    filename: z.string(),
    mime: z.enum(Object.keys(IMAGE_MIMES) as [string, ...string[]]),
    size: z.number().int(),
    alt: z.string().nullable(),
    url: z.string().openapi({ description: "Path of the image file (served outside /api, e.g. /media/<id>); prefix the server origin." }),
    createdAt: z.iso.datetime(),
  })
  .openapi("Media");

const QueueSlotSchema = z
  .object({ type: z.literal("slot"), at: z.iso.datetime() })
  .openapi("QueueSlot", { description: "A free posting slot from the config." });
const QueuePostSchema = z.object({ type: z.literal("post"), at: z.iso.datetime(), post: PostSchema }).openapi("QueuePost");
const QueueSchema = z
  .object({
    timezone: z.string(),
    days: z.array(
      z.object({
        date: z.string().openapi({ description: "YYYY-MM-DD in the configured timezone." }),
        items: z.array(z.discriminatedUnion("type", [QueueSlotSchema, QueuePostSchema])),
      }),
    ),
  })
  .openapi("Queue");

const ConfigSchema = z
  .object({
    timezone: z.string(),
    maxChars: z.number().int(),
    slots: z.array(
      z.union([
        z.object({ days: z.string(), times: z.array(z.string()) }),
        z.object({ days: z.string(), from: z.string(), to: z.string(), everyMinutes: z.number().int() }),
      ]),
    ),
    schedulerIntervalSeconds: z.number().int(),
    voiceCount: z.number().int().openapi({ description: "How many voice samples the AI copilot imitates." }),
  })
  .openapi("Config");

const HealthSchema = z
  .object({
    ok: z.literal(true),
    version: z.string(),
    timezone: z.string(),
    maxChars: z.number().int(),
    x: z.object({
      configured: z.boolean(),
      mode: z.enum(["api", "manual"]).openapi({ description: "api: auto-posts via X API v2. manual: notifies the user to copy & post." }),
    }),
    ai: z.object({ configured: z.boolean(), provider: z.string().nullable(), model: z.string().nullable() }),
    auth: z.object({ required: z.boolean() }),
  })
  .openapi("Health");

const EventType = z.enum(APP_EVENT_TYPES);
const AppEventSchema = z
  .union([
    z.object({ type: EventType.exclude(["post.deleted"]), post: PostSchema }),
    z.object({ type: z.literal("post.deleted"), id: z.string() }),
  ])
  .openapi("AppEvent", { description: "Emitted on every state change, from any surface (UI, API, MCP, scheduler)." });

const WebhookSchema = z
  .object({
    id: z.string(),
    url: z.string(),
    events: z.array(EventType),
    createdAt: z.iso.datetime(),
    lastStatus: z.number().int().nullable().openapi({ description: "HTTP status of the latest delivery attempt; null if it got no response." }),
    lastError: z.string().nullable(),
    lastAt: z.iso.datetime().nullable(),
  })
  .openapi("Webhook");
const WebhookCreatedSchema = WebhookSchema.extend({
  secret: z.string().openapi({ description: "HMAC key for X-Threadsmith-Signature. Shown only once — store it now." }),
}).openapi("WebhookCreated");
const WebhookDeliverySchema = z
  .object({
    id: z.string().openapi({ description: "Delivery id (also in X-Threadsmith-Delivery); dedupe on it." }),
    type: z.union([EventType, z.literal("ping")]),
    createdAt: z.iso.datetime(),
    data: z.record(z.string(), z.unknown()).openapi({ description: "The event minus `type`: { post } for post.* events, { id } for post.deleted." }),
  })
  .openapi("WebhookDelivery", {
    description:
      "Body POSTed to webhook URLs. Headers: X-Threadsmith-Event (= type), X-Threadsmith-Delivery (= id), " +
      "X-Threadsmith-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with the webhook secret>.",
  });

// ---------- helpers ----------

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });
const body = <T extends z.ZodType>(schema: T, required = true) => ({ required, content: { "application/json": { schema } } });
const E400 = json(ErrorSchema, "Invalid input; `message` names the field and the problem.");
const E404 = json(ErrorSchema, "Not found.");
const E409 = json(ErrorSchema, "Not allowed in the current state (e.g. the post is already published or publishing).");
const IdParam = z.object({ id: z.string().openapi({ description: "Resource id (UUID)." }) });
const IdemHeaders = z.object({
  "Idempotency-Key": z.string().max(200).optional().openapi({
    description: "Retry-safe creates: a repeat request with the same key returns the first result (header Idempotent-Replayed: true) instead of a duplicate.",
  }),
  "X-Threadsmith-Source": z.string().optional().openapi({ description: "Who created the post: ui, cli or ai. Anything else is recorded as api." }),
});

const badRequest = (message: string) => new HTTPException(400, { message });

function sourceOf(c: Context): PostSource {
  const s = c.req.header("x-threadsmith-source");
  return s === "ui" || s === "cli" || s === "ai" ? s : "api";
}

/** Idempotency-Key support, scoped per path so one key can't replay another endpoint's response. */
function once<T>(c: Context, fn: () => T): T {
  const key = c.req.header("idempotency-key");
  let fresh = false;
  const out = idempotent(key && `${c.req.path} ${key}`, () => ((fresh = true), fn()));
  if (key && !fresh) c.header("Idempotent-Replayed", "true");
  return out;
}

function when(at: string): string {
  let iso: string;
  try {
    iso = resolveWhen(at);
  } catch (err) {
    throw new ConflictError((err as Error).message); // no free slot left in the horizon
  }
  if (Date.parse(iso) < Date.now() - 60_000) {
    throw badRequest(`${at} is in the past; pick a future time, use "next", or POST /api/posts/{id}/publish to post now`);
  }
  return iso;
}

function checkMedia(thread?: { mediaIds?: string[] }[]) {
  const missing = (thread ?? []).flatMap((s) => s.mediaIds ?? []).filter((id) => !getMedia(id));
  if (missing.length) throw badRequest(`Unknown media id(s): ${missing.join(", ")}. Upload images with POST /api/media first.`);
}

/** Trust the bytes, not the declared type: only real PNG/JPEG/WebP/GIF data is stored and served. */
function sniffImage(b: Uint8Array): string | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
}

const tooBig = () => badRequest(`Image is larger than X's ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit`);

function saveImage(data: Uint8Array, declared: string, filename: string | undefined, alt: string | null | undefined) {
  if (data.byteLength > MAX_IMAGE_BYTES) throw tooBig();
  const mime = sniffImage(data);
  if (!mime || !IMAGE_MIMES[mime]) throw badRequest(`Not a PNG, JPEG, WebP or GIF image (declared type: ${declared || "none"})`);
  return createMedia({ data, mime, filename: filename || undefined, alt });
}

async function download(url: string): Promise<{ data: Uint8Array; type: string; filename: string }> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "image/*" } });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get("content-length")) > MAX_IMAGE_BYTES) throw tooBig();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (const reader = res.body.getReader(); ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.byteLength) > MAX_IMAGE_BYTES) {
        reader.cancel().catch(() => {});
        throw tooBig();
      }
      chunks.push(value);
    }
    return { data: Buffer.concat(chunks), type: res.headers.get("content-type") ?? "", filename: path.posix.basename(new URL(res.url || url).pathname) };
  } catch (err) {
    if (err instanceof HTTPException) throw err;
    const e = err as Error & { cause?: Error };
    const reason = e.name === "TimeoutError" ? `no response within ${FETCH_TIMEOUT_MS / 1000}s` : (e.cause?.message ?? e.message);
    throw badRequest(`Could not fetch ${url}: ${reason}`);
  }
}

// ---------- routes ----------

export const apiRoutes = createRouter();

// Not used by any route body, but agents need these shapes.
apiRoutes.openAPIRegistry.register("AppEvent", AppEventSchema);
apiRoutes.openAPIRegistry.register("WebhookDelivery", WebhookDeliverySchema);

// Posts

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/posts",
    tags: ["Posts"],
    operationId: "listPosts",
    summary: "List posts",
    description:
      "Lists drafts, queued and past posts. Without from/to: newest first by scheduledAt (or updatedAt for drafts). " +
      "With from/to: only posts whose scheduledAt falls in [from, to), oldest first — drafts have no scheduledAt, so they are excluded. " +
      "For a calendar view with free slots use GET /queue instead.",
    request: {
      query: z.object({
        status: z
          .string()
          .optional()
          .refine((s) => !s || s.split(",").every((x) => POST_STATUSES.includes(x.trim() as PostStatus)), `comma-separated list of: ${POST_STATUSES.join(", ")}`)
          .openapi({ description: `Comma-separated filter: ${POST_STATUSES.join(", ")}.`, example: "draft,scheduled" }),
        from: DateFilter.openapi({ description: "scheduledAt ≥ from (ISO-8601)." }),
        to: DateFilter.openapi({ description: "scheduledAt < to (ISO-8601)." }),
        limit: z.coerce.number().int().min(1).max(1000).optional().openapi({ description: "Default 500." }),
      }),
    },
    responses: { 200: json(z.object({ posts: z.array(PostSchema) }), "Matching posts."), 400: E400 },
  }),
  (c) => {
    const q = c.req.valid("query");
    const status = q.status?.split(",").map((s) => s.trim() as PostStatus);
    return c.json({ posts: listPosts({ status, from: q.from, to: q.to, limit: q.limit }) }, 200);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/posts",
    tags: ["Posts"],
    operationId: "createPost",
    summary: "Create a post or thread (draft or scheduled)",
    description:
      "Creates a draft, or queues it when `scheduledAt` is set. Give the content either as `text` (posts separated by a line containing only `---`) " +
      'or as structured `thread` segments. `scheduledAt: "next"` takes the next free slot from the posting schedule in threadsmith.config.json; ' +
      "an ISO date-time must be in the future (no offset = configured timezone). Posts longer than maxChars (GET /health) are accepted as drafts but fail when publishing, " +
      "so keep each post within the limit (URLs count 23, emoji 2). Send an `Idempotency-Key` header when you might retry.",
    request: { headers: IdemHeaders, body: body(CreatePostSchema) },
    responses: { 201: json(PostSchema, "The created post."), 400: E400, 409: json(ErrorSchema, 'No free slot for "next".') },
  }),
  (c) => {
    const input = c.req.valid("json");
    checkMedia(input.thread);
    const post = once(c, () =>
      createPost({ ...input, scheduledAt: input.scheduledAt ? when(input.scheduledAt) : null, source: sourceOf(c) }),
    );
    return c.json(post, 201);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/posts/{id}",
    tags: ["Posts"],
    operationId: "getPost",
    summary: "Get one post with its publish attempts",
    description: "Returns the post plus its publish attempt log (newest first). Check `status` and `error` after publishing.",
    request: { params: IdParam },
    responses: { 200: json(PostDetailSchema, "The post."), 404: E404 },
  }),
  (c) => {
    const { id } = c.req.valid("param");
    return c.json({ ...requirePost(id), attempts: attemptsFor(id) }, 200);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/posts/{id}",
    tags: ["Posts"],
    operationId: "updatePost",
    summary: "Edit a post's content or title",
    description:
      "Replaces the content (send `text` or `thread`; the whole thread is replaced) and/or the title. Omitted fields stay unchanged. " +
      "Scheduling is unaffected — use /schedule or /unschedule. Refused with 409 once the post is publishing or published.",
    request: { params: IdParam, body: body(UpdatePostSchema) },
    responses: { 200: json(PostSchema, "The updated post."), 400: E400, 404: E404, 409: E409 },
  }),
  (c) => {
    const patch = c.req.valid("json");
    checkMedia(patch.thread);
    return c.json(updatePost(c.req.valid("param").id, patch), 200);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/posts/{id}",
    tags: ["Posts"],
    operationId: "deletePost",
    summary: "Delete a post",
    description: "Permanently deletes the post from Threadsmith (never deletes anything on X). 409 while it is publishing.",
    request: { params: IdParam },
    responses: { 200: json(OkSchema, "Deleted."), 404: E404, 409: E409 },
  }),
  (c) => {
    deletePost(c.req.valid("param").id);
    return c.json({ ok: true as const }, 200);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/schedule",
    tags: ["Posts"],
    operationId: "schedulePost",
    summary: "Queue a post for a time or the next free slot",
    description:
      'Sets status to scheduled. `at: "next"` picks the next free slot from the config (GET /slots/next previews them); ' +
      "an ISO date-time must be in the future (no offset = configured timezone). Also reschedules scheduled/due/failed posts.",
    request: { params: IdParam, body: body(z.object({ at: When })) },
    responses: { 200: json(PostSchema, "The scheduled post."), 400: E400, 404: E404, 409: E409 },
  }),
  (c) => c.json(schedulePost(c.req.valid("param").id, when(c.req.valid("json").at)), 200),
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/unschedule",
    tags: ["Posts"],
    operationId: "unschedulePost",
    summary: "Move a post back to drafts",
    description: "Removes it from the queue (status draft, scheduledAt null). Content is kept.",
    request: { params: IdParam },
    responses: { 200: json(PostSchema, "The post, now a draft."), 404: E404, 409: E409 },
  }),
  (c) => c.json(unschedulePost(c.req.valid("param").id), 200),
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/publish",
    tags: ["Posts"],
    operationId: "publishPost",
    summary: "Publish to X right now",
    description:
      "Posts the thread to X immediately via the X API and waits: returns the post as published, or as failed with `error` " +
      "(X errors are not HTTP errors here — check `status`). Requires X API keys (GET /health → x.mode = api); in manual mode it answers 409 — " +
      "instead get the text from GET /posts/{id}/export, post it by hand, then call POST /posts/{id}/mark-published.",
    request: { params: IdParam },
    responses: { 200: json(PostSchema, "The post after publishing (check status/error)."), 404: E404, 409: E409 },
  }),
  async (c) => c.json(await publishNow(c.req.valid("param").id), 200),
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/retry",
    tags: ["Posts"],
    operationId: "retryPost",
    summary: "Retry a failed post",
    description:
      "For failed or due posts only (409 otherwise). With X API keys it publishes again: tweets already posted (xPostIds) are not re-sent, " +
      "the thread resumes after them. In manual mode it marks the post due again, which re-sends the copy & post notification.",
    request: { params: IdParam },
    responses: { 200: json(PostSchema, "The post after the retry."), 404: E404, 409: E409 },
  }),
  async (c) => c.json(await retryPost(c.req.valid("param").id), 200),
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/mark-published",
    tags: ["Posts"],
    operationId: "markPostPublished",
    summary: "Record that the user posted it by hand",
    description:
      "Manual mode: after the user copied the thread (GET /posts/{id}/export) and posted it on X themselves, mark it published, optionally with the tweet URL. " +
      "Calling it again on a published post is a no-op.",
    request: {
      params: IdParam,
      body: body(z.object({ url: z.url({ protocol: /^https?$/ }).optional().openapi({ description: "Link to the first tweet." }) }), false),
    },
    responses: { 200: json(PostSchema, "The published post."), 400: E400, 404: E404, 409: E409 },
  }),
  (c) => {
    const { id } = c.req.valid("param");
    const post = requirePost(id);
    if (post.status === "publishing") throw new ConflictError("Post is being published via the X API right now");
    if (post.status === "published") return c.json(post, 200);
    return c.json(markPublished(id, { url: c.req.valid("json").url }), 200);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/posts/{id}/export",
    tags: ["Posts"],
    operationId: "exportPost",
    summary: "Get the thread as plain text and an X intent link",
    description:
      "For copy & paste posting: `text` is the whole thread with `---` separators, `posts` the individual posts, " +
      "`intentUrl` opens X's composer prefilled with the first post (X intents can't create threads or attach images).",
    request: { params: IdParam },
    responses: {
      200: json(z.object({ text: z.string(), posts: z.array(z.string()), intentUrl: z.url() }), "Exported text."),
      404: E404,
    },
  }),
  (c) => {
    const post = requirePost(c.req.valid("param").id);
    const posts = post.thread.map((s) => s.text);
    return c.json(
      { text: threadToText(post.thread), posts, intentUrl: `https://x.com/intent/post?text=${encodeURIComponent(posts[0] ?? "")}` },
      200,
    );
  },
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/posts/{id}/duplicate",
    tags: ["Posts"],
    operationId: "duplicatePost",
    summary: "Copy a post into a new draft",
    description: "Creates a new unscheduled draft with the same content and images (works for published posts too, e.g. to re-run a thread).",
    request: { params: IdParam, headers: IdemHeaders },
    responses: { 201: json(PostSchema, "The new draft."), 404: E404 },
  }),
  (c) => {
    const src = requirePost(c.req.valid("param").id);
    const post = once(c, () =>
      createPost({
        title: src.title && `${src.title} (copy)`,
        thread: src.thread.map(({ text, mediaIds }) => ({ text, mediaIds })),
        source: sourceOf(c),
      }),
    );
    return c.json(post, 201);
  },
);

// Queue & schedule

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/queue",
    tags: ["Queue"],
    operationId: "getQueue",
    summary: "Day-by-day queue with free slots",
    description:
      "Timeline starting today (configured timezone): queued, due, failed and published posts plus open slots, grouped by local day. " +
      "Overdue `due`/`failed` posts from earlier days appear on today.",
    request: { query: z.object({ days: z.coerce.number().int().min(1).max(90).default(14).openapi({ description: "Days to include (default 14)." }) }) },
    responses: { 200: json(QueueSchema, "The queue."), 400: E400 },
  }),
  (c) => c.json(buildQueue(c.req.valid("query").days), 200),
);

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/slots/next",
    tags: ["Queue"],
    operationId: "nextSlots",
    summary: "Preview the next free posting slots",
    description: 'The instants `"next"` would pick, in order. A slot is free when no post is scheduled in that minute.',
    request: { query: z.object({ count: z.coerce.number().int().min(1).max(50).default(5) }) },
    responses: { 200: json(z.object({ slots: z.array(z.iso.datetime()) }), "Free slots (UTC)."), 400: E400 },
  }),
  (c) => c.json({ slots: nextFreeSlots(c.req.valid("query").count).map((d) => d.toISOString()) }, 200),
);

// System

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/config",
    tags: ["System"],
    operationId: "getConfig",
    summary: "Read the scheduling config",
    description: "Timezone, character limit and posting slots from threadsmith.config.json (edit that file to change them; it is re-read automatically).",
    responses: { 200: json(ConfigSchema, "Current config.") },
  }),
  (c) => {
    const { voice, ...config } = getConfig();
    return c.json({ ...config, voiceCount: voice.length }, 200);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/health",
    tags: ["System"],
    operationId: "getHealth",
    summary: "Server status and capabilities",
    description:
      "Call first: tells you the character limit, timezone, whether posts go out automatically (x.mode api) or need a human (manual), and whether AI routes work.",
    responses: { 200: json(HealthSchema, "OK.") },
  }),
  (c) => {
    const { timezone, maxChars } = getConfig();
    const health: Health = {
      ok: true,
      version: VERSION,
      timezone,
      maxChars,
      x: { configured: xConfigured, mode: xConfigured ? "api" : "manual" },
      ai: aiStatus(),
      auth: { required: Boolean(env.authToken) },
    };
    return c.json(health, 200);
  },
);

// Media

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/media",
    tags: ["Media"],
    operationId: "uploadMedia",
    summary: "Upload an image",
    description:
      "multipart/form-data with field `file` (PNG, JPEG, WebP or GIF, max 5 MB; the bytes are checked, not the filename) and optional `alt`. " +
      "Attach the returned id via a segment's `mediaIds` (max 4 per post).",
    request: {
      body: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.instanceof(File, { message: "attach the image as multipart field `file`" }).openapi({ type: "string", format: "binary" }),
              alt: z.string().max(1000).optional().openapi({ description: "Alt text (X allows up to 1000 characters)." }),
            }),
          },
        },
      },
    },
    responses: { 201: json(MediaSchema, "The stored image."), 400: E400 },
  }),
  async (c) => {
    const { file, alt } = c.req.valid("form");
    if (file.size > MAX_IMAGE_BYTES) throw tooBig();
    return c.json(saveImage(new Uint8Array(await file.arrayBuffer()), file.type, file.name, alt), 201);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/media/from-url",
    tags: ["Media"],
    operationId: "uploadMediaFromUrl",
    summary: "Import an image from a URL",
    description: "The server downloads the image (http/https only, 15 s timeout, max 5 MB, PNG/JPEG/WebP/GIF) and stores it like an upload.",
    request: {
      body: body(
        z.object({
          url: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }),
          alt: z.string().max(1000).optional(),
        }),
      ),
    },
    responses: { 201: json(MediaSchema, "The stored image."), 400: E400 },
  }),
  async (c) => {
    const { url, alt } = c.req.valid("json");
    const img = await download(url);
    return c.json(saveImage(img.data, img.type, img.filename, alt), 201);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/media/{id}",
    tags: ["Media"],
    operationId: "updateMedia",
    summary: "Set an image's alt text",
    description: "Alt text is sent to X with the image. null clears it. POST /api/ai/alt-text can draft one.",
    request: { params: IdParam, body: body(z.object({ alt: z.string().max(1000).nullable() })) },
    responses: { 200: json(MediaSchema, "The updated image."), 400: E400, 404: E404 },
  }),
  (c) => c.json(updateMediaAlt(c.req.valid("param").id, c.req.valid("json").alt), 200),
);

apiRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/media/{id}",
    tags: ["Media"],
    operationId: "deleteMedia",
    summary: "Delete an image",
    description: "Removes the file. Remove its id from posts' mediaIds first, or publishing those posts will fail.",
    request: { params: IdParam },
    responses: { 200: json(OkSchema, "Deleted."), 404: E404 },
  }),
  (c) => {
    deleteMedia(c.req.valid("param").id);
    return c.json({ ok: true as const }, 200);
  },
);

// Events

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/events",
    tags: ["Events"],
    operationId: "streamEvents",
    summary: "Live event stream (Server-Sent Events)",
    description:
      "Streams every state change as SSE: `event:` is the AppEvent type (post.created, post.updated, post.scheduled, post.due, post.published, " +
      "post.failed, post.deleted) and `data:` the AppEvent JSON. A `: ping` comment arrives every 25 s. EventSource can't send headers, " +
      "so authenticate with the threadsmith_token cookie or `?token=`. For server-to-server delivery use webhooks.",
    responses: {
      200: { description: "text/event-stream of AppEvent.", content: { "text/event-stream": { schema: z.string() } } },
    },
  }),
  (c) => eventStream(c),
);

// Webhooks

apiRoutes.openapi(
  createRoute({
    method: "get",
    path: "/webhooks",
    tags: ["Webhooks"],
    operationId: "listWebhooks",
    summary: "List webhook subscriptions",
    description: "Includes the result of each webhook's latest delivery (lastStatus/lastError/lastAt). Secrets are never returned here.",
    responses: { 200: json(z.object({ webhooks: z.array(WebhookSchema) }), "Subscriptions.") },
  }),
  (c) => c.json({ webhooks: listWebhooks() }, 200),
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/webhooks",
    tags: ["Webhooks"],
    operationId: "createWebhook",
    summary: "Subscribe a URL to events",
    description:
      "Threadsmith POSTs a WebhookDelivery JSON body to `url` for each matching event (default: all). " +
      "Verify `X-Threadsmith-Signature: sha256=<hex>` = HMAC-SHA256 of the raw body keyed with the returned `secret` (shown only once). " +
      "Non-2xx answers or no answer within 10 s are retried twice (after 2 s and 10 s); 4xx other than 408/429 are not retried.",
    request: {
      body: body(
        z.object({
          url: z.url({ protocol: /^https?$/, error: "must be an http(s) URL" }),
          events: z.array(EventType).min(1).optional().openapi({ description: "Event types to receive; omit for all." }),
        }),
      ),
    },
    responses: { 201: json(WebhookCreatedSchema, "The subscription, with its secret."), 400: E400 },
  }),
  (c) => c.json(createWebhook(c.req.valid("json")), 201),
);

apiRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/webhooks/{id}",
    tags: ["Webhooks"],
    operationId: "deleteWebhook",
    summary: "Unsubscribe a webhook",
    request: { params: IdParam },
    responses: { 200: json(OkSchema, "Deleted."), 404: E404 },
  }),
  (c) => {
    deleteWebhook(c.req.valid("param").id);
    return c.json({ ok: true as const }, 200);
  },
);

apiRoutes.openapi(
  createRoute({
    method: "post",
    path: "/webhooks/{id}/test",
    tags: ["Webhooks"],
    operationId: "testWebhook",
    summary: "Send a test ping",
    description:
      "Delivers one signed `ping` (data: { webhookId, message }) without retries and reports how the endpoint answered. Use it to check reachability and signature verification.",
    request: { params: IdParam },
    responses: {
      200: json(
        z.object({ ok: z.boolean(), status: z.number().int().nullable(), error: z.string().nullable() }).openapi("WebhookTestResult"),
        "Delivery result (ok false is still a 200).",
      ),
      404: E404,
    },
  }),
  async (c) => c.json(await testWebhook(c.req.valid("param").id), 200),
);

// ---------- /media/:id (outside /api; <img src> friendly) ----------

export const mediaFileRoutes = new Hono();

mediaFileRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const media = getMedia(id);
  const bytes = media && (await readFile(media.path).catch(() => undefined));
  if (!media || !bytes) throw new NotFoundError(`Media ${id} not found`);
  return c.body(bytes, 200, {
    "Content-Type": media.mime,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });
});
