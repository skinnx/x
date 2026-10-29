// MCP server (Streamable HTTP, stateless: a fresh server + transport per request) mounted at /mcp.
// Tools call the domain service in-process, so every change emits the same events as the UI and REST.
import { readFileSync } from "node:fs";
import path from "node:path";
import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { Hono } from "hono";
import { z } from "zod";
import { countFor, itemsFor, PLATFORMS, TELEGRAM_CAPTION_LIMIT } from "../shared/platforms.ts";
import { hasUrl, splitThread, threadToText, weightedLength } from "../shared/thread.ts";
import { PLATFORM_IDS, POST_STATUSES, type Account, type PlatformId, type Post, type Segment } from "../shared/types.ts";
import { getAccount, listAccounts } from "./accounts.ts";
import { voiceExamples } from "./ai/copilot.ts";
import { threadGuide } from "./ai/guide.ts";
import { aiStatus } from "./ai/provider.ts";
import { buildQueue, getConfig, nextFreeSlots, parseWhen } from "./config.ts";
import { ROOT, xConfigured } from "./env.ts";
import { previewPost } from "./api.ts";
import { saveImageFromUrl } from "./media.ts";
import { limitFor } from "./publisher.ts";
import {
  BadInputError,
  ConflictError,
  attemptsFor,
  createPost,
  deleteMedia,
  deletePost,
  listPosts,
  markPublishedManually,
  requirePost,
  schedulePost,
  unschedulePost,
  updatePost,
  type SegmentInput,
  type TargetInput,
} from "./repo.ts";
import { publishNow, retryPost } from "./scheduler.ts";

const VERSION = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }).version;
const EDITABLE = ["draft", "scheduled", "due", "failed"];
const MAX_IMAGES_PER_POST = 4;

const INSTRUCTIONS = `Threadsmith is this person's self-hosted composer and scheduler for posts and threads on X, Bluesky, Mastodon, Threads, LinkedIn, Telegram and Discord.
Start with get_settings (timezone, X limit, X mode, connected accounts, their voice). A thread is text with a line containing only --- between posts.
Destinations: create_post/update_post take \`to\` (connected accounts by id, label, handle or platform name; list_accounts shows them) and optional per-account \`versions\`.
A post without destinations uses the legacy single-X mode (the X API keys in .env, or manual copy & post).
Check every draft with count_characters (pass the platform) or, once saved, preview_post, show the person the thread, and ask before scheduling, publishing or deleting.
schedule "next" uses the configured posting slots. In manual X mode nothing posts automatically: the person is notified at the scheduled time and copies the thread into X.
A "due" post is waiting for the person (manual mode, or it missed its time while Threadsmith was offline; see its error): publish it, export it, or reschedule it.
Connecting an account needs the person's secrets: they do it in the Threadsmith UI (or REST POST /api/accounts), never through you.
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

function counts(texts: string[], platform: PlatformId = "x", limit = getConfig().maxChars) {
  return texts.map((text, index) => {
    const chars = countFor(platform, text);
    return { index, chars, remaining: limit - chars, fits: chars <= limit && text.trim().length > 0, hasLink: hasUrl(text) };
  });
}

// ---------- destinations ----------

const describeAccount = (a: Account) => `${a.label} (${PLATFORMS[a.platform].name}${a.handle ? ` ${a.handle}` : ""}, id ${a.id})`;

/**
 * An account by id, id prefix, label, handle (with or without @) or platform name. Ambiguous or unknown references
 * are errors that list the choices, so a post never silently goes to the wrong account.
 */
function resolveAccount(ref: string, accounts: Account[]): Account {
  const r = ref.trim().toLowerCase();
  const exact = accounts.find((a) => a.id.toLowerCase() === r);
  if (exact) return exact;
  const strong = accounts.filter(
    (a) => a.label.toLowerCase() === r || (a.handle && a.handle.toLowerCase().replace(/^@/, "") === r.replace(/^@/, "")) || (r.length >= 4 && a.id.startsWith(r)),
  );
  if (strong.length === 1) return strong[0]!;
  const platform = PLATFORM_IDS.find((p) => p === r || PLATFORMS[p].name.toLowerCase() === r);
  const matches = strong.length ? strong : platform ? accounts.filter((a) => a.platform === platform) : [];
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new BadInputError(`"${ref}" matches ${matches.length} accounts; use one's id or label: ${matches.map(describeAccount).join("; ")}.`);
  }
  if (!accounts.length) {
    throw new BadInputError(
      `No accounts are connected, so "${ref}" can't be a destination. The person connects accounts in the Threadsmith UI (or POST /api/accounts); ` +
        "until then, omit `to` to use the legacy single-X mode.",
    );
  }
  throw new BadInputError(
    `No connected account matches "${ref}"${platform ? ` (no ${PLATFORMS[platform].name} account is connected)` : ""}. Connected: ${accounts.map(describeAccount).join("; ")}.`,
  );
}

type VersionValue = string | string[] | null;

/** Segments for a destination's own version: ids and images carry over by position (extra images go on the last post). */
function versionSegments(value: string | string[], previous: Segment[] | null, shared: Segment[]): SegmentInput[] {
  const parts = Array.isArray(value) ? value : splitThread(value);
  if (!parts.some((p) => p.trim())) throw new BadInputError("A version needs some text.");
  const base = previous ?? shared;
  return parts.map((text, i) => ({
    id: previous?.[i]?.id,
    text,
    mediaIds: i === parts.length - 1 ? base.slice(i).flatMap((s) => s.mediaIds) : (base[i]?.mediaIds ?? []),
  }));
}

/** `to` and `versions` → the post's new target list; undefined when neither was given (destinations unchanged). */
function buildTargets(
  current: Post | undefined,
  to: string[] | undefined,
  versions: Record<string, VersionValue> | undefined,
  shared: Segment[],
): TargetInput[] | undefined {
  if (to === undefined && versions === undefined) return undefined;
  const accounts = listAccounts();
  const existing = current?.targets ?? [];
  const ids = to !== undefined ? to.map((r) => resolveAccount(r, accounts).id) : existing.map((t) => t.accountId);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) throw new BadInputError(`\`to\` names ${describeAccount(getAccount(dupes[0]!))} twice.`);
  const targets: TargetInput[] = ids.map((accountId) => ({ accountId, thread: existing.find((t) => t.accountId === accountId)?.thread ?? null }));
  for (const [ref, value] of Object.entries(versions ?? {})) {
    const account = resolveAccount(ref, accounts);
    const target = targets.find((t) => t.accountId === account.id);
    if (!target) throw new BadInputError(`versions: ${describeAccount(account)} is not a destination of this post; add it to \`to\`.`);
    const previous = existing.find((t) => t.accountId === account.id)?.thread ?? null;
    target.thread = value === null ? null : versionSegments(value, previous, shared);
  }
  return targets;
}

function destinationsView(p: Post) {
  if (!p.targets.length) return [];
  const preview = previewPost(p).targets;
  return p.targets.map((t, i) => {
    const pv = preview[i]!;
    return {
      accountId: t.accountId,
      account: pv.label,
      platform: t.platform,
      status: t.status,
      ownVersion: Boolean(t.thread),
      limit: pv.limit,
      items: pv.items.map((it, k) => ({ index: k, text: t.thread || PLATFORMS[t.platform].threadMode === "single" ? it.text : undefined, chars: it.count, fits: it.fits })),
      live: t.externalIds.length,
      url: t.url,
      error: t.error,
      problem: pv.problem,
    };
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
    mode: p.targets.length ? "accounts" : xConfigured ? "legacy-x-api" : "legacy-x-manual",
    destinations: destinationsView(p),
    url: p.url,
    error: p.error,
    xPostIds: p.xPostIds,
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
    destinations: p.targets.length
      ? p.targets.map((t) => {
          const label = accountLabel(t.accountId);
          const name = PLATFORMS[t.platform].name;
          return `${label.toLowerCase().includes(name.toLowerCase()) ? label : `${label} (${name})`}: ${t.status}`;
        })
      : [`X (legacy ${xConfigured ? "API" : "manual"} mode)`],
    url: p.url,
    error: p.error,
  };
}

function accountLabel(id: string): string {
  try {
    return getAccount(id).label;
  } catch {
    return id;
  }
}

/** Problems an agent should fix or mention after saving. */
function warnings(p: Post): string[] {
  if (p.targets.length) {
    if (p.status === "published") return [];
    return previewPost(p).targets.flatMap((t) => (t.problem ? [`${t.label}: ${t.problem}`] : []));
  }
  const out = counts(p.thread.map((s) => s.text))
    .filter((c) => !c.fits)
    .map((c) => (c.chars === 0 ? `Post [${c.index}] is empty.` : `Post [${c.index}] is ${c.chars}/${getConfig().maxChars} characters; shorten it.`));
  if (p.status !== "published" && listAccounts().length) {
    out.push("No destinations: this post uses the legacy single-X mode. Pass `to` (see list_accounts) to send it to connected accounts.");
  }
  if (p.status === "scheduled" && !xConfigured) out.push("Manual X mode: at that time the person is notified to copy the thread and post it by hand.");
  const live = p.xPostIds.length;
  if (live && EDITABLE.includes(p.status)) {
    out.push(`Post${live > 1 ? `s [0]–[${live - 1}] are` : " [0] is"} already live on X and can't be changed; edit only the posts after, then retry_post.`);
  }
  return out;
}

const postResult = (summary: string, p: Post) => {
  const warn = warnings(p);
  return result(warn.length ? `${summary}\nNote: ${warn.join(" ")}` : summary, { post: view(p), warnings: warn });
};

function result(summary: string, data: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: `${summary}\n${JSON.stringify(data)}` }], structuredContent: data };
}

/** Same parser as REST: "next" or an ISO-8601 date-time (offset-less = configured timezone) → future UTC instant. */
const toInstant = (at: string) => parseWhen(at.trim());

/** `text` with --- separators or `posts`; existing segments keep their ids and images by position. */
function toThread(args: { text?: string; posts?: string[] }, existing: Segment[] = []) {
  const parts = args.posts ?? (args.text !== undefined ? splitThread(args.text) : undefined);
  return parts?.map((text, i) => ({ id: existing[i]?.id, text, mediaIds: existing[i]?.mediaIds ?? [] }));
}

/** The post as it is now, checked that one more image can go on post [postIndex]. */
function imageTarget(postId: string, postIndex: number): Post {
  const p = requirePost(postId);
  if (!EDITABLE.includes(p.status)) throw new ConflictError(`Post is ${p.status} and can no longer be edited.`);
  const seg = p.thread[postIndex];
  if (!seg) throw new BadInputError(`postIndex ${postIndex} is out of range; the thread has ${p.thread.length} post(s) (0-based).`);
  if (postIndex < p.xPostIds.length) throw new ConflictError(`Post [${postIndex}] is already live on X and can't be changed.`);
  const max = p.targets.length ? Math.max(...p.targets.map((t) => PLATFORMS[t.platform].maxImages)) : MAX_IMAGES_PER_POST;
  if (seg.mediaIds.length >= max) throw new ConflictError(`Post [${postIndex}] already has ${max} images, the most any of its destinations allows.`);
  return p;
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
const to = z
  .array(z.string().min(1))
  .optional()
  .describe(
    "Destinations: connected accounts, each by id, label, handle (@you, you.bsky.social) or platform name (\"bluesky\", \"LinkedIn\": only when exactly one account " +
      "of that platform is connected). Ambiguous or unknown references are refused with the list of choices. Omit to use the legacy single-X mode " +
      "(the .env X API keys, or manual copy & post); [] on update_post goes back to it.",
  );
const versions = z
  .record(z.string(), z.union([z.string(), z.array(z.string()).min(1), z.null()]))
  .optional()
  .describe(
    "Per-destination versions, keyed by the same kind of reference as `to`: a text with --- separators or an array of posts that this account publishes " +
      "instead of the main thread (e.g. a shorter X thread, one long LinkedIn post); null removes a version. Every key must be a destination. " +
      "Images carry over by position. Use count_characters with that platform first.",
  );
const when = z
  .string()
  .describe(
    '"next" for the next free posting slot, or a future ISO-8601 date-time: 2026-11-03T09:00 is read in the configured timezone, ' +
      "2026-11-03T09:00:00+07:00 or …Z is exact. Dates without a time are rejected.",
  );

tool(
  "get_settings",
  {
    title: "Get settings",
    description:
      "Read this instance's settings before drafting or scheduling: timezone and current local time, the per-post character limit (maxChars), " +
      'posting slots, X mode for posts without destinations ("api" = Threadsmith publishes automatically through the .env X keys at the scheduled time; ' +
      '"manual" = no X API keys, the person is notified and copies the thread into X by hand), the connected accounts posts can go to (`to` in create_post), ' +
      "whether the built-in AI copilot is on (it serves the Threadsmith UI and REST; there are no copilot " +
      "tools here, you write the text), and voiceExamples: the person's own past posts. " +
      "Match their voice and language when you write for them.",
    input: {},
    annotations: READ,
  },
  () => {
    const c = getConfig();
    const now = new Date().toISOString();
    const accounts = listAccounts().map((a) => ({ id: a.id, platform: a.platform, label: a.label, handle: a.handle, limit: limitFor(a), lastError: a.lastError }));
    return result(
      `Timezone ${c.timezone}, X limit ${c.maxChars} characters per post, X mode ${xConfigured ? "api" : "manual"} (posts without destinations), ` +
        `${accounts.length} connected account(s)${accounts.length ? `: ${accounts.map((a) => `${a.label} (${PLATFORMS[a.platform].name})`).join(", ")}` : ""}.`,
      {
      timezone: c.timezone,
      now,
      nowLocal: local(now),
      maxChars: c.maxChars,
      slots: c.slots,
      xMode: xConfigured ? "api" : "manual",
      accounts,
      ai: aiStatus(),
      voiceExamples: voiceExamples(),
      },
    );
  },
);

tool(
  "list_platforms",
  {
    title: "List platforms",
    description:
      "Every platform Threadsmith can post to, with its default per-post character limit, how it counts (X weighted; Bluesky graphemes with links in full; " +
      "Mastodon links 23; Threads emoji = their UTF-8 bytes, usually 4; others code points), images per post and accepted image types, threadMode (replies = a reply chain; single = LinkedIn joins the thread into one post; " +
      "messages = consecutive messages on Telegram/Discord) and the cost note (X's API is paid per post; the others are free). " +
      "Connecting an account needs the person's secrets, so it is done by the person in the Threadsmith UI (or REST POST /api/accounts), not through these tools.",
    input: {},
    annotations: READ,
  },
  () => {
    const accounts = listAccounts();
    const platforms = Object.values(PLATFORMS).map(({ credentials: _c, ...p }) => ({ ...p, connected: accounts.filter((a) => a.platform === p.id).length }));
    return result(platforms.map((p) => `${p.name}: ${p.maxChars} chars, ${p.threadMode}${p.connected ? `, ${p.connected} connected` : ""}`).join("; "), { platforms });
  },
);

tool(
  "list_accounts",
  {
    title: "List connected accounts",
    description:
      "The connected accounts a post can go to: id, platform, label, handle, effective character limit and lastError (set when the latest check or publish was " +
      "refused, e.g. an expired token: tell the person to reconnect it in the UI). Pass ids, labels, handles or platform names as `to` in create_post / update_post. " +
      "There is no tool to connect accounts: that needs the person's secrets, so they do it in the Threadsmith UI.",
    input: {},
    annotations: READ,
  },
  () => {
    const accounts = listAccounts().map((a) => ({ ...a, limit: limitFor(a), threadMode: PLATFORMS[a.platform].threadMode }));
    return result(
      accounts.length
        ? accounts.map((a) => `${describeAccount(a)}${a.lastError ? ` — ERROR: ${a.lastError}` : ""}`).join("; ")
        : "No accounts connected; posts use the legacy single-X mode. The person can connect accounts in the Threadsmith UI.",
      { accounts },
    );
  },
);

tool(
  "count_characters",
  {
    title: "Count characters",
    description:
      "Count each post of a draft the way a platform does, against its limit. Default X (weighted: CJK characters and emoji count 2; Vietnamese letters from Unicode's " +
      "Latin Extended Additional block such as ạ ấ ệ ố ữ count 2, while á à é ó ơ ư đ count 1; every link counts 23; limit = this instance's maxChars). " +
      "`platform` bluesky counts graphemes (300; links count in full), mastodon code points with links as 23 (500), threads 500 (each emoji counts its UTF-8 bytes, usually 4), linkedin 3000 (the thread is " +
      "joined into ONE post, so the joined count is what matters), telegram 4096 (1024 for a photo caption), discord 2000. `account` uses that connected account's " +
      "own limit (e.g. X Premium). Pass `text` (posts separated by a line containing only ---) or `posts`. " +
      "Use it on every draft and every per-destination version before create_post or update_post, and shorten any post where fits is false. " +
      "hasLink marks posts containing a URL: on X those cost more through the API and usually get less reach.",
    input: {
      ...threadArgs,
      platform: z.enum(PLATFORM_IDS).optional().describe("Count as this platform does (default x)"),
      account: z.string().optional().describe("A connected account (id, label, handle or platform name): its platform and its own limit"),
    },
    annotations: { ...READ, idempotentHint: true },
  },
  (args) => {
    const parts = toThread(args)?.map((s) => s.text);
    if (!parts) throw new Error("Give `text` or `posts`.");
    const account = args.account ? resolveAccount(args.account, listAccounts()) : undefined;
    if (account && args.platform && account.platform !== args.platform) {
      throw new BadInputError(`${describeAccount(account)} is not a ${PLATFORMS[args.platform].name} account.`);
    }
    const platform = account?.platform ?? args.platform ?? "x";
    const limit = account ? limitFor(account) : platform === "x" ? getConfig().maxChars : PLATFORMS[platform].maxChars;
    const single = PLATFORMS[platform].threadMode === "single" && parts.length > 1;
    const items = single ? itemsFor(platform, parts.map((text) => ({ text, mediaIds: [] }))).map((i) => i.text) : parts;
    const posts = counts(items, platform, limit);
    const allFit = posts.length > 0 && posts.every((p) => p.fits);
    const name = PLATFORMS[platform].name;
    return result(
      `${single ? `${name} joins the ${parts.length} posts into one: ` : ""}${posts.length} item(s) on ${name}, limit ${limit}: ` +
        `${posts.map((p) => `[${p.index}] ${p.chars}${p.fits ? "" : " OVER"}`).join(", ")}${allFit ? " — all fit." : ""}` +
        (platform === "telegram" ? ` Items with a photo are limited to ${TELEGRAM_CAPTION_LIMIT}.` : ""),
      { platform, limit, joined: single, allFit, posts },
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
      "Due posts are waiting for the person (manual mode, or they missed their time while Threadsmith was offline).",
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
      "due (waiting for the person: manual mode, or it missed its time while Threadsmith was offline — see error), published, " +
      "failed (see error, then retry_post). " +
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
      "Get one post: every post of the thread with its X character count and attached image ids, title, status, schedule (UTC and local), " +
      "its destinations (per account: status, own version or not, per-item counts the platform's way, live items, URL, error, and `problem` = what would stop it), " +
      "mode (accounts, or legacy-x-api / legacy-x-manual for a post without destinations), the URL once published, the last error, and the log of publish attempts.",
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
      "`to` picks the destinations among the connected accounts (list_accounts), e.g. [\"bluesky\", \"@me\", \"Work LinkedIn\"]; each gets the same thread unless " +
      "`versions` gives it its own (e.g. {\"linkedin\": \"one longer post\"}). How a thread lands depends on the platform: X, Bluesky, Mastodon and Threads " +
      "post a reply chain; LinkedIn joins the posts into ONE post (blank lines between them, 3000 characters); Telegram and Discord send consecutive messages. " +
      "Without `to` the post uses the legacy single-X mode: the X API keys in .env, or manual copy & post. " +
      "Without `schedule` it is saved as a draft the person can review in the Threadsmith UI. " +
      'schedule "next" puts it in the next free posting slot from the configured schedule; an ISO-8601 time schedules it exactly. ' +
      "Run count_characters (with each destination's platform) first, show the person the thread, and check the result's warnings or preview_post before scheduling. " +
      "In manual X mode nothing is posted automatically: at the scheduled time the person is notified and copies the thread into X.",
    input: {
      ...threadArgs,
      title: z.string().max(200).optional().describe("Private label shown in the queue; never posted"),
      to,
      versions,
      schedule: when.optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  ({ text, posts, title, to, versions, schedule }) => {
    const thread = toThread({ text, posts });
    if (!thread?.some((s) => s.text.trim())) throw new Error("Give the post text as `text` or `posts`.");
    const shared = thread.map((s) => ({ id: "", text: s.text, mediaIds: s.mediaIds }));
    const targets = buildTargets(undefined, to ?? (versions ? [] : undefined), versions, shared);
    const p = createPost({ thread, title: title ?? null, targets, scheduledAt: schedule ? toInstant(schedule) : null, source: "mcp" });
    return postResult(p.scheduledAt ? `Scheduled for ${local(p.scheduledAt)} (${getConfig().timezone}).` : "Saved as a draft.", p);
  },
);

tool(
  "update_post",
  {
    title: "Edit a post",
    description:
      "Change the text, title, destinations or per-destination versions of a draft, scheduled, due or failed post; published posts can't be edited. " +
      "Give the whole new thread as `text` (--- separators) or `posts`; images stay attached to the post at the same position. " +
      "`to` replaces the destination list (accounts kept keep their versions; [] = back to the legacy single-X mode); omit it to keep the destinations. " +
      "`versions` sets or (null) removes per-destination versions. LinkedIn joins whatever thread it gets into one post. " +
      "If a thread failed partway through publishing, the posts already live somewhere (xPostIds, or a destination's live items) can't be changed, removed or " +
      "reordered, and a partly published destination can't be removed: edit only the posts after them, then retry_post. The schedule is unchanged. " +
      "Check counts with count_characters first.",
    input: { id, ...threadArgs, title: z.string().max(200).nullable().optional(), to, versions },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  ({ id, text, posts, title, to, versions }) => {
    const current = requirePost(id);
    const thread = toThread({ text, posts }, current.thread);
    if (!thread && title === undefined && to === undefined && versions === undefined) {
      throw new Error("Nothing to change: give `text`, `posts`, `title`, `to` or `versions`.");
    }
    const shared = thread ? thread.map((s) => ({ id: s.id ?? "", text: s.text, mediaIds: s.mediaIds })) : current.thread;
    const targets = buildTargets(current, to, versions, shared);
    return postResult("Updated.", updatePost(id, { thread, title, targets }));
  },
);

tool(
  "preview_post",
  {
    title: "Preview per destination",
    description:
      "Show exactly what each destination of a saved post will publish: its items (its own version or the main thread; LinkedIn's joined single post), " +
      "each counted the way that platform counts against the account's limit, and `problem`: what would make publishing there fail before anything is posted " +
      "(null = ready). A post without destinations shows one entry for the legacy single-X mode. Use it before schedule_post or publish_now.",
    input: { id },
    annotations: READ,
  },
  ({ id }) => {
    const { targets } = previewPost(requirePost(id));
    const summary = targets
      .map((t) => `${t.label} (${PLATFORMS[t.platform].name}, limit ${t.limit}): ${t.items.map((i) => `${i.count}${i.fits ? "" : " OVER"}`).join(", ")}${t.problem ? ` — ${t.problem}` : " — ready"}`)
      .join("\n");
    return result(summary, { targets, ready: targets.every((t) => !t.problem) });
  },
);

tool(
  "schedule_post",
  {
    title: "Schedule a post",
    description:
      'Schedule or reschedule a post. at: "next" for the next free slot from the configured posting schedule, or a future ISO-8601 date-time. ' +
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
      "Publish a draft, scheduled, due or failed post or thread right now to every destination not yet published, ignoring its schedule. " +
      "Public and irreversible (and billed per post on X's API; the other platforms are free): only when the person explicitly asks. " +
      "Each destination succeeds or fails on its own; a failed one is listed in `error` and in its destination entry. " +
      "A post without destinations uses the legacy single-X mode: in manual X mode (no API keys) this fails; use export_thread instead, let the person post it, then mark_published.",
    input: { id },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ id }) => {
    if (!xConfigured && !requirePost(id).targets.length) {
      throw new ConflictError("X API keys aren't configured (manual mode). Use export_thread, have the person post it on X, then call mark_published.");
    }
    const p = await publishNow(id);
    return postResult(p.status === "published" ? `Published: ${p.url ?? "(no URL)"}` : `Status: ${p.status}${p.error ? ` — ${p.error}` : ""}`, p);
  },
);

tool(
  "retry_post",
  {
    title: "Retry a failed or due post",
    description:
      "Publish a failed or due post again, to the destinations that aren't published yet. Each thread resumes after the last item that went out there, so nothing is duplicated. " +
      "Read the errors with get_post first and fix the cause (text over a limit: edit the post or that destination's version; an expired token: the person reconnects " +
      "the account in the UI; a deleted image) before retrying. For a post without destinations in manual X mode it only re-sends the copy & post notification.",
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
      "Record that the person posted this on X themselves (manual mode, or after copying it). Pass the URL of the first post if known. " +
      "Moves it to published. Refused while Threadsmith is publishing it through the X API; an already published post is left unchanged.",
    input: { id, url: z.url({ protocol: /^https?$/ }).optional().describe("Link to the first post on X (http or https)") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ({ id, url }) => {
    const wasPublished = requirePost(id).status === "published";
    const p = markPublishedManually(id, url);
    return postResult(wasPublished ? "Already published; nothing changed." : "Marked as published.", p);
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
      "Get a post's main thread ready to publish by hand on X (legacy single-X/manual mode; per-destination versions are in get_post): the full text (posts separated by ---), the individual posts, and an X intent URL that opens " +
      "the X composer with the first post filled in. X's intent link can't create a thread, so the person adds the remaining posts as replies. " +
      "If the thread failed partway through an API publish, alreadyLive > 0: then only remainingText / remainingPosts still need posting, " +
      "as replies under replyToUrl. Use in manual mode or whenever the person wants to post it themselves; afterwards call mark_published.",
    input: { id },
    annotations: READ,
  },
  ({ id }) => {
    const p = requirePost(id);
    const posts = p.thread.map((s) => s.text);
    const intentUrl = `https://x.com/intent/post?text=${encodeURIComponent(posts[0] ?? "")}`;
    const alreadyLive = Math.min(p.xPostIds.length, posts.length);
    const remaining = p.thread.slice(alreadyLive);
    const replyToUrl = alreadyLive ? `https://x.com/i/status/${p.xPostIds[alreadyLive - 1]}` : null;
    return result(
      p.status === "published"
        ? `Already published${p.url ? ` at ${p.url}` : ""}; ${posts.length} post(s) below for reference.`
        : alreadyLive
          ? `${alreadyLive} of ${posts.length} post(s) are already live on X; ${remaining.length} remaining post(s) to add as replies under ${replyToUrl}.`
          : `${posts.length} post(s) ready to copy.`,
      {
        text: threadToText(p.thread),
        posts,
        intentUrl,
        alreadyLive,
        remainingText: threadToText(remaining),
        remainingPosts: remaining.map((s) => s.text),
        replyToUrl,
      },
    );
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
      url: z.url({ protocol: /^https?$/ }),
      alt: z.string().max(1000).optional().describe("Alt text (X allows up to 1000 characters)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async ({ postId, postIndex, url, alt }) => {
    imageTarget(postId, postIndex); // fail fast before downloading
    const media = await saveImageFromUrl(url, alt ?? null); // same streaming 5 MB cap and byte sniffing as REST
    let updated: Post;
    try {
      // Re-read after the download so edits saved meanwhile are kept; no await between this read and the write.
      const p = imageTarget(postId, postIndex);
      updated = updatePost(postId, { thread: p.thread.map((s, i) => (i === postIndex ? { ...s, mediaIds: [...s.mediaIds, media.id] } : s)) });
    } catch (err) {
      deleteMedia(media.id);
      throw err;
    }
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
