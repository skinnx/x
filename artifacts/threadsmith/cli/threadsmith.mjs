#!/usr/bin/env node
// threadsmith — command-line client for a Threadsmith server (REST API). Plain ESM, zero dependencies, Node ≥ 20.
// For agents: every command takes --json; exit codes are 0 ok, 1 API or network error (or a publish that ended
// in failed), 2 usage error.
import { spawnSync } from "node:child_process";
import { fstatSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";

const BASE = (process.env.THREADSMITH_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const TOKEN = process.env.THREADSMITH_TOKEN;

const HELP = `threadsmith — draft, queue and publish X posts and threads on your Threadsmith server

Usage: threadsmith <command> [args] [--json]

Posts
  new [text] [--file f|-] [--at next|time] [--image [N:]path]... [--title t]
                              Create a draft (or schedule it with --at). Posts are separated by a line "---".
                              --image attaches to post N (default 1); repeat for more images.
  queue [--days 7]            Day-by-day timeline with scheduled posts and free slots
  list [--status s,s]         Posts, newest first (draft, scheduled, due, publishing, published, failed)
  show <id>                   One post in full, with per-post character counts
  edit <id> [text] [--file f|-] [--title t]
                              Replace the text (images stay with their post); with only --title, just rename
  schedule <id> <next|time>   Queue for the next free slot or a time
  unschedule <id>             Back to drafts
  publish <id>                Post to X now (needs X API keys on the server); exit 1 if X refused it
  retry <id>                  Retry a failed post or publish a due one; threads resume where they stopped
  copy <id> [--clipboard]     Print the thread (or copy it) to post by hand; only the posts not yet live
  posted <id> [--url u]       Mark as posted by hand
  rm <id>                     Delete
  slots [n]                   Next free posting slots
  count [text|--file f]       Count characters the way X does (no server needed; --max n to set the limit)

AI copilot (needs an AI provider on the server)
  ai threadify [text|--file f] [-i instructions]   Notes → thread (prints posts separated by ---)
  ai hooks [text|--file f] [--count 3]             Alternative opening posts
  ai fit [text|--file f] [--max n]                 Shorten posts that are over the limit
  ai rewrite "<instruction>" [text|--file f]       Rewrite following an instruction

Other
  health                      Server status: version, X mode, AI, timezone, limit
  help                        This help

Ids can be shortened to any unique prefix. Text can also come from stdin, e.g.
  threadsmith ai threadify --file notes.md | threadsmith new --at next

Times are shown in the server's timezone (threadsmith health), and a time you type is read there too unless it
has an offset: 2026-11-03T09:00 is 09:00 in that zone; 2026-11-03T09:00+07:00 or ...Z is exact.

Environment: THREADSMITH_URL (default http://127.0.0.1:3000), THREADSMITH_TOKEN (the server's AUTH_TOKEN).
Exit codes: 0 ok, 1 API or network error (or publish/retry ended in failed), 2 usage error.`;

class UsageError extends Error {}
class ApiError extends Error {}

// ---------- X's weighted character count (mirrors shared/thread.ts) ----------

const LIGHT = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
// A URL is ASCII/Latin/Cyrillic only (it ends before CJK text) and trailing punctuation is not part of it.
const URL_CHARS = "[\\w\\-.~!*';:=+,$/%#\\[\\]&|@?()\\u00C0-\\u024F\\u0400-\\u04FF\\u1E00-\\u1EFF]";
const URL_RE = new RegExp(
  `\\bhttps?:\\/\\/${URL_CHARS}+|\\b(?:[a-z0-9-]+\\.)+(?:com|net|org|io|ai|dev|app|co|me|xyz|vn|gg|so|sh|tv|ly|to|us|uk|de|fr|jp)\\b(?:\\/${URL_CHARS}*)?`,
  "gi",
);
const TRAILING_PUNCT = /[.,!?;:'")\]]+$/;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const segmenter = new Intl.Segmenter();

function plainWeight(text) {
  let total = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (EMOJI_RE.test(segment)) total += 2;
    else for (const ch of segment) total += LIGHT.some(([lo, hi]) => ch.codePointAt(0) >= lo && ch.codePointAt(0) <= hi) ? 1 : 2;
  }
  return total;
}

function weightedLength(raw) {
  const text = raw.normalize("NFC");
  let total = 0;
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING_PUNCT, "");
    total += plainWeight(text.slice(last, m.index)) + 23;
    last = m.index + url.length;
  }
  return total + plainWeight(text.slice(last));
}

const splitThread = (text) =>
  text
    .split(/^\s*-{3,}\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
const joinThread = (parts) => parts.map((p) => p.trim()).join("\n\n---\n\n");

// ---------- plumbing ----------

let opt;
let positionals;
try {
  ({ values: opt, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      json: { type: "boolean" },
      file: { type: "string", short: "f" },
      at: { type: "string" },
      image: { type: "string", multiple: true },
      title: { type: "string" },
      days: { type: "string" },
      status: { type: "string" },
      clipboard: { type: "boolean", short: "c" },
      url: { type: "string" },
      count: { type: "string" },
      max: { type: "string" },
      instructions: { type: "string", short: "i" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (err) {
  fail(new UsageError(err.message));
}

async function api(method, path, body, form) {
  const headers = { accept: "application/json", "x-threadsmith-source": "cli" };
  if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res;
  try {
    res = await fetch(BASE + path, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  } catch (err) {
    if (err.cause?.code === "UND_ERR_HEADERS_TIMEOUT") {
      throw Object.assign(new ApiError(`Threadsmith at ${BASE} took too long to answer (no response after 5 minutes).`), { code: "timeout" });
    }
    throw Object.assign(new ApiError(`Can't reach Threadsmith at ${BASE} (${err.cause?.code ?? err.message}). Is the server running? Set THREADSMITH_URL.`), {
      code: "unreachable",
    });
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text.slice(0, 300) };
  }
  if (!res.ok) {
    const hint = res.status === 401 ? " (set THREADSMITH_TOKEN to the server's AUTH_TOKEN)" : "";
    throw Object.assign(new ApiError(`${data.message ?? res.statusText}${hint}`), { status: res.status, code: data.error });
  }
  return data;
}

function readFile(path, encoding) {
  try {
    return readFileSync(path === "-" ? 0 : path, encoding);
  } catch (err) {
    throw new UsageError(`Can't read ${path}: ${err.code ?? err.message}`);
  }
}

/** Text from --file, the remaining arguments, or piped stdin. */
function readText(args) {
  if (opt.file) return readFile(opt.file, "utf8");
  if (args.length) return args.join(" ");
  const stdin = fstatSync(0);
  if (stdin.isFIFO() || stdin.isFile()) return readFileSync(0, "utf8");
  throw new UsageError("Give the text as an argument, with --file <path> (- for stdin), or pipe it in.");
}

async function resolveId(ref) {
  if (!ref) throw new UsageError("Missing post id.");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return ref;
  const { posts } = await api("GET", "/api/posts?limit=1000");
  const hits = posts.filter((p) => p.id.startsWith(ref));
  if (hits.length === 1) return hits[0].id;
  throw new ApiError(hits.length ? `"${ref}" matches ${hits.length} posts; use more characters.` : `No post id starts with "${ref}".`);
}

const int = (v, name, fallback) => {
  if (v === undefined) return fallback;
  if (!/^\d+$/.test(v)) throw new UsageError(`${name} must be a whole number.`);
  return Number(v);
};
let serverConfigPromise;
/** GET /api/config (timezone, maxChars, configError), fetched once; null if the server can't be asked (`count` works offline). */
function serverConfig() {
  serverConfigPromise ??= fetch(`${BASE}/api/config`, {
    signal: AbortSignal.timeout(3000),
    headers: TOKEN ? { authorization: `Bearer ${TOKEN}` } : {},
  })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  return serverConfigPromise;
}

// Times are shown in the server's configured timezone, the zone it reads offset-less input in, so a time shown
// here can be typed back as-is. Falls back to this machine's zone (and says so) if the config can't be read.
let TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
async function useServerTimezone(tz) {
  TZ = tz ?? (await serverConfig())?.timezone ?? TZ;
}

const when = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "";
const whenTz = (iso) => `${when(iso)} ${TZ}`;
const hhmm = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const dayKey = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in TZ
const short = (id) => id.slice(0, 8);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const firstLine = (p) => clip((p.thread[0]?.text ?? "").split("\n")[0], 60);

async function maxChars() {
  if (opt.max) return int(opt.max, "--max");
  return (await serverConfig())?.maxChars ?? 280;
}

function emit(data, human) {
  if (opt.json) console.log(JSON.stringify(data, null, 2));
  else human(data);
}

function line(p) {
  return `${short(p.id)}  ${p.status.padEnd(10)} ${(when(p.scheduledAt) || "—").padEnd(22)} ${p.title ? `[${p.title}] ` : ""}${firstLine(p)}`;
}

function printPost(p, limit = 280) {
  console.log(`${p.id}  ${p.status}${p.scheduledAt ? `  ${whenTz(p.scheduledAt)}` : ""}${p.title ? `  [${p.title}]` : ""}`);
  p.thread.forEach((s, i) => {
    const n = weightedLength(s.text);
    console.log(`\n[${i + 1}] ${n}/${limit}${n > limit ? " OVER" : ""}${s.mediaIds.length ? `  images: ${s.mediaIds.length}` : ""}`);
    console.log(s.text.replace(/^/gm, "  "));
  });
  if (p.url) console.log(`\nurl: ${p.url}`);
  if (p.error) console.log(`\nerror: ${p.error}`);
}

function status(p) {
  const extra = p.status === "scheduled" ? ` for ${whenTz(p.scheduledAt)}` : p.url ? ` ${p.url}` : p.error ? ` — ${p.error}` : "";
  console.log(`${short(p.id)} ${p.status}${extra}`);
}

async function warnOver(post) {
  const limit = await maxChars();
  post.thread.forEach((s, i) => {
    const n = weightedLength(s.text);
    if (n > limit) console.error(`warning: post ${i + 1} is ${n}/${limit} characters; it will fail to publish until shortened`);
  });
}

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

async function upload(path) {
  const type = MIME[extname(path).toLowerCase()];
  if (!type) throw new UsageError(`${path}: use a .png, .jpg, .webp or .gif image.`);
  const form = new FormData();
  form.set("file", new Blob([readFile(path)], { type }), basename(path));
  return api("POST", "/api/media", undefined, form);
}

function copyToClipboard(text) {
  const tools =
    process.platform === "darwin"
      ? [["pbcopy"]]
      : process.platform === "win32"
        ? [["clip"]]
        : [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"], ["clip.exe"]];
  for (const [cmd, ...args] of tools) {
    const r = spawnSync(cmd, args, { input: text, stdio: ["pipe", "ignore", "ignore"] });
    if (!r.error && r.status === 0) return cmd;
  }
  return null;
}

// ---------- commands ----------

const commands = {
  async new(args) {
    const parts = splitThread(readText(args));
    if (!parts.length) throw new UsageError("The post is empty.");
    const media = parts.map(() => []);
    for (const spec of opt.image ?? []) {
      const m = /^(\d+):(.+)$/.exec(spec);
      const [n, path] = m ? [Number(m[1]), m[2]] : [1, spec];
      if (n < 1 || n > parts.length) throw new UsageError(`--image ${spec}: the thread has ${parts.length} post(s).`);
      media[n - 1].push((await upload(path)).id);
    }
    const post = await api("POST", "/api/posts", {
      thread: parts.map((text, i) => ({ text, mediaIds: media[i] })),
      title: opt.title,
      scheduledAt: opt.at,
    });
    if (!opt.json) await useServerTimezone();
    emit(post, (p) => console.log(`${p.scheduledAt ? `Scheduled ${short(p.id)} for ${whenTz(p.scheduledAt)}` : `Saved draft ${short(p.id)}`} (${p.thread.length} post${p.thread.length > 1 ? "s" : ""})`));
    await warnOver(post);
  },

  async queue() {
    const q = await api("GET", `/api/queue?days=${int(opt.days, "--days", 7)}`);
    await useServerTimezone(q.timezone);
    emit(q, () => {
      const days = q.days.filter((d) => d.items.length);
      if (!days.length) return console.log("Nothing scheduled and no free slots in this range.");
      console.log(`Times in ${TZ}`);
      for (const { date, items } of days) {
        console.log(new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }));
        for (const { at, post } of items.filter((i) => i.type === "post")) {
          // Overdue due/failed posts from earlier days are listed under today: show their own date.
          const time = dayKey(at) === date ? hhmm(at) : `${new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: TZ })} ${hhmm(at)}`;
          console.log(`  ${time}  ${post.status.padEnd(10)} ${short(post.id)}  ${firstLine(post)}`);
        }
        const free = items.filter((i) => i.type === "slot").map((i) => hhmm(i.at));
        if (free.length) console.log(`  free: ${free.join(", ")}`);
      }
    });
  },

  async list() {
    const qs = new URLSearchParams({ limit: "50" });
    if (opt.status) qs.set("status", opt.status);
    const data = await api("GET", `/api/posts?${qs}`);
    if (!opt.json) await useServerTimezone();
    emit(data, ({ posts }) => {
      if (posts.some((p) => p.scheduledAt)) console.log(`Times in ${TZ}`);
      console.log(posts.length ? posts.map(line).join("\n") : "No posts.");
    });
  },

  async show([ref]) {
    const post = await api("GET", `/api/posts/${await resolveId(ref)}`);
    if (!opt.json) await useServerTimezone();
    const limit = opt.json ? 0 : await maxChars();
    emit(post, (p) => printPost(p, limit));
  },

  async edit([ref, ...rest]) {
    const id = await resolveId(ref);
    // A title-only rename never reads stdin: in a `while read` loop or under xargs it holds other input, not the text.
    const text = opt.file || rest.length || opt.title === undefined ? readText(rest) : undefined;
    if (text !== undefined && !splitThread(text).length) throw new UsageError("The post is empty.");
    // `text` keeps each post's id and images by position (the server maps them).
    const post = await api("PATCH", `/api/posts/${id}`, { title: opt.title, text });
    emit(post, (p) => console.log(`Updated ${short(p.id)} (${p.thread.length} post${p.thread.length > 1 ? "s" : ""})`));
    await warnOver(post);
  },

  async schedule([ref, at]) {
    if (!at) throw new UsageError("Usage: threadsmith schedule <id> <next|time> (e.g. 2026-11-03T09:00, read in the server's timezone)");
    const post = await api("POST", `/api/posts/${await resolveId(ref)}/schedule`, { at });
    if (!opt.json) await useServerTimezone();
    emit(post, status);
  },
  async unschedule([ref]) {
    emit(await api("POST", `/api/posts/${await resolveId(ref)}/unschedule`), status);
  },
  async publish([ref]) {
    // X errors come back as a post with status failed (HTTP 200); report them through the exit code too.
    const post = await api("POST", `/api/posts/${await resolveId(ref)}/publish`);
    emit(post, status);
    if (post.status === "failed") process.exitCode = 1;
  },
  async retry([ref]) {
    const post = await api("POST", `/api/posts/${await resolveId(ref)}/retry`);
    emit(post, status);
    if (post.status === "failed") process.exitCode = 1;
  },
  async posted([ref]) {
    emit(await api("POST", `/api/posts/${await resolveId(ref)}/mark-published`, { url: opt.url }), status);
  },
  async rm([ref]) {
    const id = await resolveId(ref);
    emit(await api("DELETE", `/api/posts/${id}`), () => console.log(`Deleted ${short(id)}`));
  },

  async copy([ref]) {
    const data = await api("GET", `/api/posts/${await resolveId(ref)}/export`);
    // A thread that failed partway through an API publish: only the posts not yet live, as replies to the last live one.
    const live = data.alreadyLive ?? 0;
    const text = live ? data.remainingText : data.text;
    const count = live ? data.remainingPosts.length : data.posts.length;
    const copiedWith = opt.clipboard ? copyToClipboard(text) : null;
    emit({ ...data, copied: Boolean(copiedWith) }, () => {
      if (live) console.error(`${live} of ${data.posts.length} post(s) are already live on X. Post only the remaining ${count}, as replies to ${data.replyToUrl}`);
      if (copiedWith) console.log(`Copied ${count} post(s) to the clipboard (${copiedWith}).${live ? "" : `\nOpen X with the first post: ${data.intentUrl}`}`);
      else {
        if (opt.clipboard) console.error("No clipboard tool found (pbcopy, wl-copy, xclip, xsel, clip.exe); printing instead.");
        console.log(text);
      }
    });
  },

  async slots([n]) {
    const data = await api("GET", `/api/slots/next?count=${int(n, "n", 5)}`);
    if (!opt.json) await useServerTimezone();
    emit(data, ({ slots }) => console.log([`Times in ${TZ}`, ...slots.map(when)].join("\n")));
  },

  async count(args) {
    const limit = await maxChars();
    const posts = splitThread(readText(args)).map((text, i) => {
      const chars = weightedLength(text);
      return { post: i + 1, chars, remaining: limit - chars, fits: chars <= limit };
    });
    emit({ limit, allFit: posts.length > 0 && posts.every((p) => p.fits), posts }, () =>
      posts.forEach((p) => console.log(`[${p.post}] ${p.chars}/${limit}${p.fits ? "" : `  OVER by ${-p.remaining}`}`)),
    );
  },

  async ai([task, ...args]) {
    const tasks = {
      threadify: async () => {
        const data = await api("POST", "/api/ai/threadify", { text: readText(args), instructions: opt.instructions });
        emit(data, ({ posts }) => console.log(joinThread(posts)));
      },
      hooks: async () => {
        const data = await api("POST", "/api/ai/hooks", { text: readText(args), count: int(opt.count, "--count", 3) });
        emit(data, ({ variants }) => console.log(variants.map((v, i) => `${i + 1}. ${v}`).join("\n\n")));
      },
      fit: async () => {
        const data = await api("POST", "/api/ai/fit", { text: readText(args), maxChars: opt.max ? int(opt.max, "--max") : undefined });
        emit(data, ({ text }) => console.log(text));
      },
      rewrite: async () => {
        const [instruction, ...rest] = args;
        if (!instruction) throw new UsageError('Usage: threadsmith ai rewrite "<instruction>" [text|--file f]');
        const data = await api("POST", "/api/ai/rewrite", { instruction, text: readText(rest) });
        emit(data, ({ text }) => console.log(text));
      },
    };
    if (!tasks[task]) throw new UsageError("Usage: threadsmith ai threadify|hooks|fit|rewrite ...");
    await tasks[task]();
  },

  async health() {
    const h = await api("GET", "/api/health");
    const configError = (await serverConfig())?.configError ?? null;
    emit({ ...h, configError }, () =>
      console.log(
        [
          `Threadsmith ${h.version} at ${BASE}`,
          `X: ${h.x.mode === "api" ? "API (publishes automatically)" : "manual (notify + copy)"}`,
          `AI: ${h.ai.configured ? `${h.ai.provider} · ${h.ai.model}` : "off"}`,
          `Timezone: ${h.timezone} · limit ${h.maxChars} characters · auth ${h.auth.required ? "required" : "off"}`,
          ...(configError ? [`Config: the last edit was rejected, the previous config is still in use: ${configError}`] : []),
        ].join("\n"),
      ),
    );
  },

  help() {
    console.log(HELP);
  },
};

function fail(err) {
  const usage = err instanceof UsageError;
  if (opt?.json) console.error(JSON.stringify({ error: usage ? "usage" : (err.code ?? "error"), message: err.message, status: err.status }));
  else console.error(`error: ${err.message}${usage ? "\nRun `threadsmith help` for usage." : ""}`);
  process.exit(usage ? 2 : 1);
}

const [cmd, ...args] = positionals;
if (!cmd || opt.help) {
  console.log(HELP);
  process.exit(cmd || opt.help ? 0 : 2);
}
if (!Object.hasOwn(commands, cmd)) fail(new UsageError(`Unknown command "${cmd}".`));
try {
  await commands[cmd](args);
} catch (err) {
  fail(err);
}
