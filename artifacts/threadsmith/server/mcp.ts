// MCP server (Streamable HTTP, stateless: a fresh server + transport per request) mounted at /mcp.
// Tools call the domain service in-process, so every change emits the same events as the UI and REST.
import { readFileSync } from "node:fs";
import path from "node:path";
import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { TZDate } from "@date-fns/tz";
import { Hono } from "hono";
import { z } from "zod";
import { hasUrl, splitThread, threadToText, weightedLength } from "../shared/thread.ts";
import { POST_STATUSES, type Post, type Segment } from "../shared/types.ts";
import { voiceExamples } from "./ai/copilot.ts";
import { threadGuide } from "./ai/guide.ts";
import { aiStatus } from "./ai/provider.ts";
import { buildQueue, getConfig, nextFreeSlots, resolveWhen } from "./config.ts";
import { ROOT, xConfigured } from "./env.ts";
import {
  ConflictError,
  IMAGE_MIMES,
  MAX_IMAGE_BYTES,
  attemptsFor,
  createMedia,
  createPost,
  deletePost,
  listPosts,
  markPublished,
  requirePost,
  schedulePost,
  unschedulePost,
  updatePost,
} from "./repo.ts";
import { publishNow, retryPost } from "./scheduler.ts";

const VERSION = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }).version;
const EDITABLE = ["draft", "scheduled", "due", "failed"];
const MAX_IMAGES_PER_POST = 4;

const INSTRUCTIONS = `Threadsmith is this person's self-hosted composer and scheduler for X (Twitter) posts and threads.
Start with get_settings (timezone, character limit, X mode, their voice). A thread is text with a line containing only --- between posts.
Run count_characters on every draft, show the person the thread, and ask before scheduling, publishing or deleting.
schedule "next" uses the configured posting slots. In manual X mode nothing posts automatically: the person is notified at the scheduled time and copies the thread into X.
Writing guidance: resource threadsmith://guide.`;

// ---------- views ----------

function local(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: getConfig().timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

function counts(texts: string[]) {
  const limit = getConfig().maxChars;
  return texts.map((text, index) => {
    const chars = weightedLength(text);
    return { index, chars, remaining: limit - chars, fits: chars <= limit && text.trim().length > 0, hasLink: hasUrl(text) };
  });
}

function view(p: Post) {
  return {
    id: p.id,
    status: p.status,
    title: p.title,
    scheduledAt: p.scheduledAt,
    scheduledLocal: local(p.scheduledAt),
    posts: p.thread.map((s, i) => ({ index: i, text: s.text, chars: weightedLength(s.text), mediaIds: s.mediaIds })),
    url: p.url,
    error: p.error,
    publishedAt: p.publishedAt,
    source: p.source,
    updatedAt: p.updatedAt,
  };
}

function brief(p: Post) {
  const first = p.thread[0]?.text ?? "";
  return {
    id: p.id,
    status: p.status,
    title: p.title,
    scheduledAt: p.scheduledAt,
    scheduledLocal: local(p.scheduledAt),
    postCount: p.thread.length,
    preview: first.length > 100 ? first.slice(0, 99) + "…" : first,
    url: p.url,
    error: p.error,
  };
}

/** Problems an agent should fix or mention after saving. */
function warnings(p: Post): string[] {
  const out = counts(p.thread.map((s) => s.text))
    .filter((c) => !c.fits)
    .map((c) => (c.chars === 0 ? `Post [${c.index}] is empty.` : `Post [${c.index}] is ${c.chars}/${getConfig().maxChars} characters; shorten it.`));
  if (p.status === "scheduled" && !xConfigured) out.push("Manual X mode: at that time the person is notified to copy the thread and post it by hand.");
  return out;
}

const postResult = (summary: string, p: Post) => {
  const warn = warnings(p);
  return result(warn.length ? `${summary}\nNote: ${warn.join(" ")}` : summary, { post: view(p), warnings: warn });
};

function result(summary: string, data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: `${summary}\n${JSON.stringify(data)}` }], structuredContent: data };
}

/** "next", an ISO instant, or a local "YYYY-MM-DDTHH:MM" read in the configured timezone → future ISO instant. */
function toInstant(at: string): string {
  const s = at.trim();
  if (s === "next") return resolveWhen(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  const ms = m ? new TZDate(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0), getConfig().timezone).getTime() : Date.parse(s);
  if (Number.isNaN(ms)) throw new Error(`Can't read "${at}" as a time; use "next" or ISO-8601 like 2026-11-03T09:00:00+07:00.`);
  if (ms < Date.now() - 60_000) throw new Error(`${at} is in the past. Pick a future time, use "next", or publish_now.`);
  return new Date(ms).toISOString();
}

/** `text` with --- separators or `posts`; existing segments keep their ids and images by position. */
function toThread(args: { text?: string; posts?: string[] }, existing: Segment[] = []) {
  const parts = args.posts ?? (args.text !== undefined ? splitThread(args.text) : undefined);
  return parts?.map((text, i) => ({ id: existing[i]?.id, text, mediaIds: existing[i]?.mediaIds ?? [] }));
}

async function fetchImage(url: string): Promise<{ data: Uint8Array; mime: string; filename?: string }> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) image URLs are supported.");
  const res = await fetch(u, { headers: { accept: "image/*" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Image download failed: HTTP ${res.status}`);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!IMAGE_MIMES[mime]) throw new Error(`Not a supported image (${mime || "unknown type"}); use png, jpeg, webp or gif.`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error("Image is larger than X's 5 MB limit.");
  return { data: new Uint8Array(await res.arrayBuffer()), mime, filename: path.basename(u.pathname) || undefined };
}

// ---------- tool catalog (also listed in /llms-full.txt) ----------

const tools: { name: string; description: string; register: (s: McpServer) => void }[] = [];

function tool<S extends z.ZodRawShape>(
  name: string,
  config: { title: string; description: string; input: S; annotations: ToolAnnotations },
  run: (args: z.infer<z.ZodObject<S>>) => CallToolResult | Promise<CallToolResult>,
) {
  tools.push({
    name,
    description: config.description,
    register: (s) =>
      s.registerTool(
        name,
        { title: config.title, description: config.description, inputSchema: config.input, annotations: { title: config.title, ...config.annotations } },
        run as unknown as ToolCallback<S>,
      ),
  });
}

export const mcpCatalog = () => tools.map(({ name, description }) => ({ name, description }));

const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const id = z.string().min(1).describe("Post id (from list_posts, list_queue or create_post)");
const threadArgs = {
  text: z.string().optional().describe("The thread as one text: posts separated by a line containing only ---"),
  posts: z.array(z.string()).min(1).optional().describe("Alternatively, one string per post, in order"),
};
const when = z
  .string()
  .describe('"next" for the next free posting slot, or an ISO-8601 time, e.g. 2026-11-03T09:00:00+07:00 (without an offset it is read in the configured timezone)');

tool(
  "get_settings",
  {
    title: "Get settings",
    description:
      "Read this instance's settings before drafting or scheduling: timezone and current local time, the per-post character limit (maxChars), " +
      'posting slots, X mode ("api" = Threadsmith publishes automatically at the scheduled time; "manual" = no X API keys, the person is notified ' +
      "and copies the thread into X by hand), whether the built-in AI copilot is on, and voiceExamples: the person's own past posts. " +
      "Match their voice and language when you write for them.",
    input: {},
    annotations: READ,
  },
  () => {
    const c = getConfig();
    const now = new Date().toISOString();
    return result(`Timezone ${c.timezone}, limit ${c.maxChars} characters per post, X mode ${xConfigured ? "api" : "manual"}.`, {
      timezone: c.timezone,
      now,
      nowLocal: local(now),
      maxChars: c.maxChars,
      slots: c.slots,
      xMode: xConfigured ? "api" : "manual",
      ai: aiStatus(),
      voiceExamples: voiceExamples(),
    });
  },
);

tool(
  "count_characters",
  {
    title: "Count characters",
    description:
      "Count each post of a draft exactly as X does (weighted: CJK characters, emoji and Vietnamese letters with a built-in tone mark count 2, " +
      "every link counts 23) against this instance's limit. Pass `text` (posts separated by a line containing only ---) or `posts`. " +
      "Use it on every draft before create_post or update_post, and shorten any post where fits is false. " +
      "hasLink marks posts containing a URL: those cost more on X's API and usually get less reach.",
    input: threadArgs,
    annotations: { ...READ, idempotentHint: true },
  },
  (args) => {
    const parts = toThread(args)?.map((s) => s.text);
    if (!parts) throw new Error("Give `text` or `posts`.");
    const posts = counts(parts);
    const limit = getConfig().maxChars;
    const allFit = posts.length > 0 && posts.every((p) => p.fits);
    return result(
      `${posts.length} post(s), limit ${limit}: ${posts.map((p) => `[${p.index}] ${p.chars}${p.fits ? "" : " OVER"}`).join(", ")}${allFit ? " — all fit." : ""}`,
      { limit, allFit, posts },
    );
  },
);

tool(
  "list_queue",
  {
    title: "Show the queue",
    description:
      "Show the posting timeline day by day (in the configured timezone): scheduled, due, failed and published posts, plus the free slots still open. " +
      'Use it to answer "what\'s scheduled?" or to pick a time. Free slots are what schedule "next" fills, earliest first. ' +
      "Due posts (manual mode) are waiting for the person to copy and post them by hand.",
    input: { days: z.number().int().min(1).max(60).default(7).describe("How many days ahead, starting today") },
    annotations: READ,
  },
  ({ days }) => {
    const q = buildQueue(days);
    const hhmm = (iso: string) => local(iso)!.slice(-5);
    const out = q.days.map((d) => ({
      date: d.date,
      items: d.items.map((it) => (it.type === "slot" ? { type: "slot", at: it.at, time: hhmm(it.at) } : { type: "post", at: it.at, time: hhmm(it.at), ...brief(it.post) })),
    }));
    const posts = out.reduce((n, d) => n + d.items.filter((i) => i.type === "post").length, 0);
    const slots = out.reduce((n, d) => n + d.items.filter((i) => i.type === "slot").length, 0);
    return result(`Next ${days} day(s) in ${q.timezone}: ${posts} post(s), ${slots} free slot(s).`, { timezone: q.timezone, days: out });
  },
);

tool(
  "list_posts",
  {
    title: "List posts",
    description:
      "List posts, most recent first, optionally filtered by status: draft (not queued), scheduled (waiting for its time), publishing, " +
      "due (manual mode: time arrived, waiting for the person to post it by hand), published, failed (see error, then retry_post). " +
      "Returns previews of the first post; use get_post for the full thread.",
    input: {
      status: z.array(z.enum(POST_STATUSES)).optional().describe("Only these statuses"),
      limit: z.number().int().min(1).max(200).default(50),
    },
    annotations: READ,
  },
  ({ status, limit }) => {
    const posts = listPosts({ status, limit }).map(brief);
    return result(`${posts.length} post(s).`, { posts });
  },
);

tool(
  "get_post",
  {
    title: "Get a post",
    description:
      "Get one post: every post of the thread with its character count and attached image ids, title, status, schedule (UTC and local), " +
      "the X URL once published, the last error, and the log of publish attempts.",
    input: { id },
    annotations: READ,
  },
  ({ id }) => {
    const p = requirePost(id);
    return result(`${p.status} post with ${p.thread.length} part(s).`, { post: view(p), warnings: warnings(p), attempts: attemptsFor(id) });
  },
);

tool(
  "create_post",
  {
    title: "Create a post or thread",
    description:
      "Save a new post or thread. Give `text` (posts separated by a line containing only ---) or `posts` (one string per post). " +
      "Without `schedule` it is saved as a draft the person can review in the Threadsmith UI. " +
      'schedule "next" puts it in the next free posting slot from the configured schedule; an ISO-8601 time schedules it exactly. ' +
      "Run count_characters first and show the person the thread before scheduling it. " +
      "In manual X mode nothing is posted automatically: at the scheduled time the person is notified and copies the thread into X.",
    input: {
      ...threadArgs,
      title: z.string().max(200).optional().describe("Private label shown in the queue; never posted"),
      schedule: when.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  ({ text, posts, title, schedule }) => {
    const thread = toThread({ text, posts });
    if (!thread?.some((s) => s.text.trim())) throw new Error("Give the post text as `text` or `posts`.");
    const p = createPost({ thread, title: title ?? null, scheduledAt: schedule ? toInstant(schedule) : null, source: "mcp" });
    return postResult(p.scheduledAt ? `Scheduled for ${local(p.scheduledAt)} (${getConfig().timezone}).` : "Saved as a draft.", p);
  },
);

tool(
  "update_post",
  {
    title: "Edit a post",
    description:
      "Replace the text (and optionally the title) of a draft, scheduled, due or failed post; published posts can't be edited. " +
      "Give the whole new thread as `text` (--- separators) or `posts`. Images stay attached to the post at the same position. " +
      "The schedule is unchanged. Check counts with count_characters first.",
    input: { id, ...threadArgs, title: z.string().max(200).nullable().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  ({ id, text, posts, title }) => {
    const thread = toThread({ text, posts }, requirePost(id).thread);
    if (!thread && title === undefined) throw new Error("Nothing to change: give `text`, `posts` or `title`.");
    return postResult("Updated.", updatePost(id, { thread, title }));
  },
);

tool(
  "schedule_post",
  {
    title: "Schedule a post",
    description:
      'Schedule or reschedule a post. at: "next" for the next free slot from the configured posting schedule, or an ISO-8601 time with offset. ' +
      "Works on drafts and on scheduled, due or failed posts. Confirm the time with the person and tell them the result in their timezone.",
    input: { id, at: when },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  ({ id, at }) => {
    const p = schedulePost(id, toInstant(at));
    return postResult(`Scheduled for ${local(p.scheduledAt)} (${getConfig().timezone}).`, p);
  },
);

tool(
  "unschedule_post",
  {
    title: "Unschedule a post",
    description: "Take a post out of the queue. It stays saved as a draft and its slot becomes free.",
    input: { id },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ({ id }) => postResult("Moved back to drafts.", unschedulePost(id)),
);

tool(
  "delete_post",
  {
    title: "Delete a post",
    description: "Permanently delete a post from Threadsmith. Cannot be undone, and does not remove anything already on X. Only when the person asks.",
    input: { id },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  ({ id }) => {
    deletePost(id);
    return result("Deleted.", { ok: true, id });
  },
);

tool(
  "publish_now",
  {
    title: "Publish now",
    description:
      "Publish a post or thread to X right now through the X API, ignoring its schedule. Public, irreversible and billed per post by X: " +
      "only when the person explicitly asks. In manual X mode (no API keys) this fails; use export_thread instead, let the person post it, then mark_published.",
    input: { id },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ id }) => {
    if (!xConfigured) {
      throw new ConflictError("X API keys aren't configured (manual mode). Use export_thread, have the person post it on X, then call mark_published.");
    }
    const p = await publishNow(id);
    return postResult(p.status === "published" ? `Published: ${p.url ?? "(no URL)"}` : `Status: ${p.status}${p.error ? ` — ${p.error}` : ""}`, p);
  },
);

tool(
  "retry_post",
  {
    title: "Retry a failed post",
    description:
      "Retry publishing a failed post. A thread resumes after the last post that reached X, so nothing is duplicated. " +
      "Read the error with get_post first and fix the cause (text over the limit, credentials, a deleted image) before retrying.",
    input: { id },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ id }) => {
    const p = await retryPost(id);
    return postResult(`Status: ${p.status}${p.error ? ` — ${p.error}` : ""}`, p);
  },
);

tool(
  "mark_published",
  {
    title: "Mark as posted by hand",
    description:
      "Record that the person posted this on X themselves (manual mode, or after copying it). Pass the URL of the first post if known. Moves it to published.",
    input: { id, url: z.string().url().optional().describe("Link to the first post on X") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ({ id, url }) => {
    requirePost(id);
    return postResult("Marked as published.", markPublished(id, { url: url ?? null }));
  },
);

tool(
  "next_free_slots",
  {
    title: "Next free slots",
    description:
      "List the next open posting slots from the configured schedule (taken slots are skipped), with local times. " +
      'Offer them to the person, then pass the chosen ISO time as `at` / `schedule` (or just use "next" for the first one).',
    input: { count: z.number().int().min(1).max(20).default(5) },
    annotations: READ,
  },
  ({ count }) => {
    const slots = nextFreeSlots(count).map((d) => ({ at: d.toISOString(), local: local(d.toISOString()) }));
    return result(`Next free slots (${getConfig().timezone}): ${slots.map((s) => s.local).join("; ")}`, { timezone: getConfig().timezone, slots });
  },
);

tool(
  "export_thread",
  {
    title: "Export for posting by hand",
    description:
      "Get a post ready to publish by hand: the full text (posts separated by ---), the individual posts, and an X intent URL that opens " +
      "the X composer with the first post filled in. X's intent link can't create a thread, so the person adds the remaining posts as replies. " +
      "Use in manual mode or whenever the person wants to post it themselves; afterwards call mark_published.",
    input: { id },
    annotations: READ,
  },
  ({ id }) => {
    const p = requirePost(id);
    const posts = p.thread.map((s) => s.text);
    const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(posts[0] ?? "")}`;
    return result(`${posts.length} post(s) ready to copy.`, { text: threadToText(p.thread), posts, intentUrl });
  },
);

tool(
  "attach_image_from_url",
  {
    title: "Attach an image from a URL",
    description:
      "Download an image (png, jpeg, webp or gif, at most 5 MB) from a public http(s) URL and attach it to one post of a thread " +
      `(postIndex 0 = the first post; up to ${MAX_IMAGES_PER_POST} images per post). Always pass alt text describing the image for screen-reader users.`,
    input: {
      postId: id,
      postIndex: z.number().int().min(0).describe("Which post of the thread, 0-based"),
      url: z.string().url(),
      alt: z.string().max(1000).optional().describe("Alt text (X allows up to 1000 characters)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ postId, postIndex, url, alt }) => {
    const p = requirePost(postId);
    if (!EDITABLE.includes(p.status)) throw new ConflictError(`Post is ${p.status} and can no longer be edited.`);
    const seg = p.thread[postIndex];
    if (!seg) throw new Error(`postIndex ${postIndex} is out of range; the thread has ${p.thread.length} post(s) (0-based).`);
    if (seg.mediaIds.length >= MAX_IMAGES_PER_POST) throw new ConflictError(`Post [${postIndex}] already has ${MAX_IMAGES_PER_POST} images, X's maximum.`);
    const media = createMedia({ ...(await fetchImage(url)), alt: alt ?? null });
    const thread = p.thread.map((s, i) => (i === postIndex ? { ...s, mediaIds: [...s.mediaIds, media.id] } : s));
    const updated = updatePost(postId, { thread });
    const res = postResult(`Attached image ${media.id} to post [${postIndex}].`, updated);
    return { ...res, structuredContent: { ...res.structuredContent, media } };
  },
);

// ---------- server ----------

function buildServer(): McpServer {
  const server = new McpServer({ name: "threadsmith", title: "Threadsmith", version: VERSION }, { instructions: INSTRUCTIONS });
  for (const t of tools) t.register(server);

  server.registerResource(
    "guide",
    "threadsmith://guide",
    { title: "How to write threads in Threadsmith", description: "Format, X's counting rules, costs, and what makes a thread work.", mimeType: "text/markdown" },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: threadGuide() }] }),
  );

  server.registerPrompt(
    "draft_thread",
    {
      title: "Draft a thread",
      description: "Draft an X thread about a topic in the person's voice, check it, and queue it after they approve.",
      argsSchema: { topic: z.string().describe("What the thread is about"), notes: z.string().optional().describe("Facts, links or an outline to use") },
    },
    ({ topic, notes }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Draft an X thread about: ${topic}
${notes ? `\nUse these notes (don't invent facts beyond them):\n<notes>\n${notes}\n</notes>\n` : ""}
Steps:
1. Call get_settings and match my voiceExamples, language and character limit.
2. Draft the thread following the guide below.
3. Check it with count_characters and shorten anything that doesn't fit.
4. Show me the thread and wait for my go-ahead.
5. Then save it with create_post, using schedule "next" unless I give a time, and tell me when it will go out.

${threadGuide()}`,
          },
        },
      ],
    }),
  );
  return server;
}

export const mcpRoutes = new Hono();

// Stateless server: nothing to stream server-to-client, so the optional GET stream is not offered.
mcpRoutes.get("/", (c) =>
  c.json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: POST JSON-RPC messages to /mcp." }, id: null }, 405, {
    Allow: "POST, DELETE",
  }),
);

mcpRoutes.on(["POST", "DELETE"], "/", async (c) => {
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    void server.close();
  }
});
