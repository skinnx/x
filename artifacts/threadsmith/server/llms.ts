// /llms.txt (llmstxt.org index) and /llms-full.txt (the whole agent guide, with a route list generated
// from the live OpenAPI document) so any agent can learn to drive Threadsmith from one URL.
import { Hono } from "hono";
import { PLATFORMS } from "../shared/platforms.ts";
import { listAccounts } from "./accounts.ts";
import { threadGuide } from "./ai/guide.ts";
import { aiStatus } from "./ai/provider.ts";
import { getConfig } from "./config.ts";
import { env, xConfigured } from "./env.ts";
import { mcpCatalog } from "./mcp.ts";

export const llmsRoutes = new Hono();

const origin = (url: string) => env.publicUrl?.replace(/\/+$/, "") ?? new URL(url).origin;
const authLine = () =>
  env.authToken
    ? "Every /api, /mcp and /media request needs `Authorization: Bearer <AUTH_TOKEN>` (the token is in the server's .env)."
    : "This instance needs no token (it should only be reachable from this machine or a private network).";

llmsRoutes.get("/llms.txt", (c) => {
  const base = origin(c.req.url);
  return c.text(`# Threadsmith

> Self-hosted composer and scheduler for posts and threads on X, Bluesky, Mastodon, Threads, LinkedIn, Telegram and Discord. Draft once, give each platform its own version if needed, count characters the way each platform does, queue posts into time slots, and publish to every connected account (or, for X without accounts, by copy-paste when a notification fires). Everything the UI does is available to agents over REST, MCP, a CLI, webhooks and server-sent events.

Base URL: ${base}. ${authLine()}
Threads are one text with a line containing only \`---\` between posts (or an array of segments). Times are ISO-8601 date-times (without an offset they are read in ${getConfig().timezone}); \`"next"\` means the next free posting slot. X limit: ${getConfig().maxChars} weighted characters per post; other platforms: \`GET /api/platforms\`.
Destinations: a post's \`targets\` are connected accounts (\`GET /api/accounts\`), each optionally with its own version; a post without targets uses the legacy single-X mode (.env X keys, or manual copy & post). \`GET /api/posts/{id}/preview\` shows what each destination gets and whether it fits. Posting through X's API is paid per post; the other platforms are free.

## Docs
- [Full agent guide](${base}/llms-full.txt): conventions, workflows, every route and MCP tool, CLI usage and writing guidance in one file
- [API reference](${base}/docs): interactive reference for the REST API
- [OpenAPI 3.1 spec](${base}/openapi.json): machine-readable; each route says what it does and when to use it

## Agent interfaces
- [MCP endpoint](${base}/mcp): Streamable HTTP, stateless. Claude Code: \`claude mcp add --transport http threadsmith ${base}/mcp${env.authToken ? ' --header "Authorization: Bearer <AUTH_TOKEN>"' : ""}\`${env.authToken ? `. Clients that can't send headers (claude.ai / ChatGPT connectors) use ${base}/mcp?token=<AUTH_TOKEN> over HTTPS` : ""}
- [CLI](${base}/llms-full.txt): zero-dependency Node script \`cli/threadsmith.mjs\` (\`threadsmith new "text" --at next\`, \`threadsmith queue\`, \`--json\` everywhere); set THREADSMITH_URL and THREADSMITH_TOKEN
- [Health](${base}/api/health): version, X mode (api or manual), AI copilot status, timezone and limit
- [Accounts](${base}/api/accounts) and [platforms](${base}/api/platforms): where posts can go, each platform's limits, counting and cost

## Events
- [Webhooks](${base}/openapi.json): \`POST /api/webhooks {url, events?}\`; deliveries are signed with \`X-Threadsmith-Signature: sha256=<HMAC-SHA256 of the raw body>\`
- [Event stream](${base}/api/events): server-sent events for post.created, post.updated, post.scheduled, post.due, post.published, post.failed, post.deleted

## Optional
- [Writing guide](${base}/llms-full.txt): what makes a thread work, each platform's counting rules and limits, and X's per-post API costs
`);
});

llmsRoutes.get("/llms-full.txt", async (c) => {
  const { app, VERSION } = await import("./app.ts"); // lazy: app.ts imports this module
  const base = origin(c.req.url);
  const config = getConfig();
  const ai = aiStatus();
  const accounts = listAccounts();
  const doc = app.getOpenAPI31Document({ openapi: "3.1.0", info: { title: "Threadsmith API", version: VERSION } });

  const routes: string[] = [];
  for (const [p, item] of Object.entries(doc.paths ?? {})) {
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      const op = item?.[method];
      if (op) routes.push(`- \`${method.toUpperCase()} ${p}\` — ${op.summary ?? op.description?.split(". ")[0] ?? ""}`);
    }
  }

  return c.text(`# Threadsmith — full guide for agents

> Self-hosted composer and scheduler for posts and threads on X, Bluesky, Mastodon, Threads, LinkedIn, Telegram and Discord.
> Single process, SQLite, no user accounts; connected social accounts' credentials are stored encrypted and never returned.
> Every UI capability is reachable over REST (+ OpenAPI), MCP, the CLI, webhooks and server-sent events.

## This instance
- URL: ${base} (version ${VERSION})
- Connected accounts: ${
    accounts.length
      ? accounts.map((a) => `${a.label} (${PLATFORMS[a.platform].name}${a.handle ? ` ${a.handle}` : ""}, id ${a.id}${a.lastError ? `, ERROR: ${a.lastError}` : ""})`).join("; ")
      : "none yet (posts use the legacy single-X mode until the person connects accounts in the UI)"
  }
- X mode for posts without destinations: ${xConfigured ? "api — scheduled posts publish automatically through the X API" : "manual — no X API keys; at the scheduled time the person is notified and copies the thread into X, then marks it published"}
- AI copilot: ${ai.configured ? `${ai.provider} (${ai.model}) at /api/ai/*` : "off (/api/ai/* answers 409 ai_not_configured)"}
- Timezone: ${config.timezone}; X limit: ${config.maxChars} weighted characters per post (other platforms below)
- Auth: ${authLine()}

## Conventions
- Thread format: one string with a line containing only \`---\` between posts, or \`thread: [{text, mediaIds?}]\`. A single post is a thread of one.
- Destinations: \`targets: [{accountId, thread?}]\` on POST/PATCH /api/posts. \`thread\` is that account's own version (null = the post's thread;
  omitted on PATCH = keep the current one). \`targets: []\` or none = legacy single-X mode. Each target has its own \`status\`, \`externalIds\`
  (items live there), \`url\` and \`error\`; the post is \`published\` when all are, \`failed\` when any failed (retry resumes only those).
  LinkedIn joins a thread into one post; Telegram and Discord send consecutive messages; the others post a reply chain.
- Accounts: \`GET /api/accounts\`; connecting (\`POST /api/accounts {platform, credentials, label?, maxChars?}\`, verified first, 400 with the
  platform's reason) needs the person's secrets, so leave it to them. \`POST /api/accounts/{id}/check\` re-verifies; \`DELETE\` is refused (409)
  while unfinished posts still target the account.
- Counting: X's weighted count. Most Latin text counts 1 per character; CJK and emoji count 2; Vietnamese letters from Unicode's
  Latin Extended Additional block (ạ, ả, ấ, ệ, ố, ở, ữ…) count 2, while á, à, ã, é, ó, ơ, ư, đ and the like count 1; every URL counts 23.
  Other platforms count their own way (table in the guide below); the same Vietnamese post can fit Bluesky and be over on X.
- Statuses: draft → scheduled → publishing → published, or failed (see \`error\`; retry resumes a thread without duplicates).
  \`due\` means the post waits for the person: in manual mode every scheduled post becomes due at its time and is posted by hand${
    config.lateGraceMinutes > 0
      ? `; in api mode a post that missed its time by more than ${config.lateGraceMinutes} minutes (the server was down) becomes due instead of going out late, with \`error\` saying why`
      : ""
  }.
  With X API keys, \`POST /api/posts/{id}/publish\` or \`/retry\` on a due post publishes it.
- Partly published threads: if publishing fails mid-thread, the first \`xPostIds.length\` posts are live on X and locked;
  a PATCH that changes, removes or reorders them answers 409. Edit only the posts after them, then retry.
- Times: ISO-8601 date-times. With \`Z\` or an offset (\`2026-11-03T09:00:00+07:00\`) they are exact; without one (\`2026-11-03T09:00\`) they are read in ${config.timezone}.
  Date-only and free-form values and times in the past answer 400. \`"next"\` = next free slot from threadsmith.config.json.
- Retries: every POST under /api accepts \`Idempotency-Key: <uuid>\`. Repeating a request with the same key on the same path
  replays the first response (status and JSON body) with the header \`Idempotent-Replayed: true\` instead of acting twice.
- Attribution: send \`X-Threadsmith-Source: ai\` (or \`cli\`) on writes so the UI shows where a post came from.
- Errors: JSON \`{error, message}\` with 400 (invalid input), 401 (token), 404, 409 (wrong state, e.g. editing a published post), 500.

## Recommended workflow
1. \`GET /api/health\` (mode, limit, timezone) and \`GET /api/config\` (slots, voice examples count).
2. Pick destinations: \`GET /api/accounts\` (ask the person which ones if unclear).
3. Draft in the person's voice and language; check counts per platform (MCP \`count_characters {platform}\`, CLI \`threadsmith count --platform p\`).
   Where one thread can't suit every destination, write versions (or \`POST /api/ai/adapt {postId|text, platform|accountId}\` when AI is on).
4. Show the draft to the person. Only after approval: \`POST /api/posts {text, targets, scheduledAt: "next" | ISO}\`, then
   \`GET /api/posts/{id}/preview\` and fix every \`problem\`.
5. Report the scheduled time in their timezone. \`GET /api/queue?days=7\` shows the timeline with free slots.
6. Manual mode (posts without destinations): \`GET /api/posts/{id}/export\` gives text + an X intent URL; after posting, \`POST /api/posts/{id}/mark-published {url?}\`.
   If \`alreadyLive\` > 0 (a thread that failed partway through an API publish), post only \`remainingText\` / \`remainingPosts\`, as replies under \`replyToUrl\`.
7. Images: \`POST /api/media\` (multipart \`file\`, \`alt\`) or \`POST /api/media/from-url {url, alt}\`, then put the media id in a segment's \`mediaIds\`
   (per-platform maximum and accepted types in the table below).
Publishing now and deleting are irreversible; only do them when the person asks.
8. Data, not dashboards: \`GET /api/metrics\` (recent published posts with per-destination totals) and \`GET /api/posts/{id}/metrics?refresh=true\`
   (Bluesky, Mastodon, Threads free; X billed, only with \`paid=true\`). Threadsmith has no analytics views, best-time engine, auto-plug rules or
   evergreen recycler on purpose: analyse the numbers yourself, and act with \`POST /api/posts/{id}/append\` (continue a published thread: a follow-up
   or plug, replying to the last live post on each destination) or a new post. Ask the person before publishing.

## REST routes (from ${base}/openapi.json)
${routes.join("\n") || "- (no routes registered)"}

## MCP
Endpoint: ${base}/mcp (Streamable HTTP, stateless, JSON responses). Claude Code: \`claude mcp add --transport http threadsmith ${base}/mcp${env.authToken ? ' --header "Authorization: Bearer <AUTH_TOKEN>"' : ""}\`.
Resource \`threadsmith://guide\` holds the writing guide; prompt \`draft_thread {topic, notes?}\` walks through drafting and queueing.
There are no AI copilot tools over MCP: you write the text yourself (the copilot is REST-only, at /api/ai/*). Tool errors come back as \`isError\` results with the same messages REST gives.
There is deliberately no tool to connect accounts (it needs the person's secrets); \`list_accounts\` shows what is connected.
${mcpCatalog()
  .map((t) => `- \`${t.name}\` — ${t.description}`)
  .join("\n")}

## CLI
\`node cli/threadsmith.mjs <command>\` (or \`threadsmith\` when linked). Env: THREADSMITH_URL (default http://127.0.0.1:3000), THREADSMITH_TOKEN.
Every command accepts \`--json\` for machine-readable output. Exit codes: 0 ok, 1 API error, 2 usage error.
- \`new [text] [--file f|-] [--at next|ISO] [--to ref,ref] [--version ref=file]... [--image [N:]path]... [--title t]\` — create a draft or scheduled post (stdin works too)
- \`queue [--days n]\`, \`list [--status s,s]\`, \`show <id>\` (with per-destination status), \`preview <id>\`, \`slots [n]\`
- \`edit <id> [text|--file f] [--to ref,ref|none] [--version ref=file|ref=none]...\`, \`schedule <id> <next|ISO>\`, \`unschedule <id>\`, \`rm <id>\`
- \`publish <id>\`, \`retry <id>\`, \`copy <id> [--clipboard]\`, \`posted <id> [--url u]\`
- \`accounts\` (\`accounts check <ref>\`), \`platforms\`
- \`count [text|--file f] [--platform p] [--max n]\` — local count per post the way that platform counts (default X)
- \`ai threadify|hooks|fit|rewrite|adapt ...\`, \`health\`, \`help\`
Account refs (\`--to\`, \`--version\`): id or id prefix, label, handle, or platform name when only one account of it is connected.
Ids can be shortened to any unique prefix.

## Webhooks and events
- \`POST /api/webhooks {url, events?}\` returns a \`secret\` once. Each delivery is \`POST {id, type, createdAt, data}\` with headers
  \`X-Threadsmith-Event\` and \`X-Threadsmith-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with the secret>\`; 3 attempts with backoff.
  Verify in Node: \`crypto.createHmac("sha256", secret).update(rawBody).digest("hex")\` and compare with timingSafeEqual.
- \`GET /api/events\` streams the same events as server-sent events (event name = type, data = JSON).
- Event types: post.created, post.updated, post.scheduled, post.due, post.published, post.failed, post.deleted.

${threadGuide().replace(/^(#+) /gm, "#$1 ")}`);
});
