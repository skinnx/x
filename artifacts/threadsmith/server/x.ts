// X API v2 client: OAuth 1.0a user-context signing (HMAC-SHA1 via node:crypto), image upload, thread publishing.
// Publishing resumes: segments already in post.xPostIds are skipped, and every new tweet id is saved before the
// next call, so a failure or crash mid-thread never posts the same tweet twice. Content problems X would reject
// (length, empty, too many images) are caught before the first tweet, so they can't leave a half-posted thread.
import { createHmac, randomBytes } from "node:crypto";
import { weightedLength } from "../shared/thread.ts";
import type { Post } from "../shared/types.ts";
import { getConfig } from "./config.ts";
import { env } from "./env.ts";
import { getMedia, readMediaBytes, recordPostedTweets, setXMediaId } from "./repo.ts";

const apiBase = () => (process.env.X_API_BASE ?? "https://api.x.com").replace(/\/+$/, "");

export class XApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** false when retrying the same thread can't help (e.g. the tweet it replies to is gone). */
    readonly resumable = true,
  ) {
    super(message);
  }
}

// ---------- OAuth 1.0a ----------

/** RFC 3986 percent-encoding (encodeURIComponent leaves !'()* alone). */
export const percentEncode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface OAuthCredentials {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * `Authorization: OAuth …` for one request. The signature covers the oauth_* params, the URL's query params and
 * any form-encoded body fields; JSON bodies are not signed.
 */
export function oauthHeader(
  method: string,
  url: string,
  creds: OAuthCredentials,
  opts: { form?: Record<string, string>; nonce?: string; timestamp?: string } = {},
): string {
  const u = new URL(url);
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: opts.nonce ?? randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: opts.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.token,
    oauth_version: "1.0",
  };
  const params = [...Object.entries(oauth), ...u.searchParams, ...Object.entries(opts.form ?? {})]
    .map(([k, v]) => [percentEncode(k), percentEncode(v)] as const)
    .sort(([ak, av], [bk, bv]) => cmp(ak, bk) || cmp(av, bv))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const baseString = [method.toUpperCase(), percentEncode(`${u.protocol}//${u.host}${u.pathname}`), percentEncode(params)].join("&");
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret)}`;
  oauth.oauth_signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  return "OAuth " + Object.entries(oauth).map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`).join(", ");
}

function credentials(): OAuthCredentials {
  const { apiKey, apiSecret, accessToken, accessSecret } = env.x;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new XApiError("X API keys are missing: set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET in .env and restart.");
  }
  return { consumerKey: apiKey, consumerSecret: apiSecret, token: accessToken, tokenSecret: accessSecret };
}

// ---------- requests & errors ----------

interface XProblem {
  title?: string;
  detail?: string;
  type?: string;
  errors?: { message?: string; detail?: string }[];
}

function problemText(p: XProblem | undefined): string | undefined {
  if (!p || typeof p !== "object") return undefined;
  const parts = [p.detail, ...(p.errors ?? []).map((e) => e.detail ?? e.message)].filter((s): s is string => Boolean(s));
  return [...new Set(parts)].join("; ") || p.title;
}

function resetHint(h: Headers): string {
  // POST /2/tweets also has 24-hour per-user and per-app caps; name whichever window is exhausted.
  for (const prefix of ["x-user-limit-24hour", "x-app-limit-24hour", "x-rate-limit"]) {
    const reset = Number(h.get(`${prefix}-reset`));
    if (reset && h.get(`${prefix}-remaining`) === "0") return untilText(reset);
  }
  const reset = Number(h.get("x-rate-limit-reset"));
  return reset ? untilText(reset) : "in a few minutes";
}

function untilText(epochSeconds: number): string {
  const at = new Date(epochSeconds * 1000);
  const minutes = Math.max(1, Math.ceil((at.getTime() - Date.now()) / 60_000));
  return `after ${at.toISOString().replace(/\.\d+Z$/, "Z")} (in ~${minutes} min)`;
}

/** X's 403 when the tweet being replied to was deleted or is hidden: the thread can't be continued under it. */
const REPLY_TARGET_GONE = /deleted|not visible/i;

/** Turn an X error response into a sentence that says what happened and what to do. */
function explain(status: number, headers: Headers, body: XProblem | undefined, raw: string): string {
  const detail = problemText(body) ?? (raw.trim().slice(0, 200) || `HTTP ${status}`);
  const haystack = `${body?.type ?? ""} ${detail}`;
  if (status === 401) {
    return `X rejected the API credentials (401: ${detail}). Check X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET in .env (regenerate them in the X Developer Console if revoked) and that this server's clock is correct, then restart and Retry.`;
  }
  if (status === 402 || /credit|payment|billing|usage-capped/i.test(haystack)) {
    return `Your X API account is out of credits or hit its spending cap (${status}: ${detail}). The X API is pay-per-use (about $0.015 per post, $0.20 per post with a link): top up credits in the X Developer Console, then Retry.`;
  }
  if (status === 429) return `X rate limit reached (429: ${detail}). Retry ${resetHint(headers)}.`;
  if (status === 403 && /duplicate/i.test(detail)) {
    return (
      `X refused a duplicate post (403: ${detail}). If an earlier attempt timed out or was interrupted, this post is probably already live: ` +
      `check your profile, and if it is there, post the rest of the thread by hand as replies to it and mark this post published. Otherwise change its text and Retry.`
    );
  }
  if (status === 403 && REPLY_TARGET_GONE.test(detail)) {
    return (
      `X refused the reply (403: ${detail}): the post this thread continues from was deleted or is no longer visible, so Retry can't continue it. ` +
      `Duplicate it into a new draft to post it again, or mark it published if you finished it by hand.`
    );
  }
  if (status === 403 && /client-forbidden|client-not-enrolled|enrol/i.test(haystack)) {
    return `Your X developer app can't use the posting API (403: ${detail}). In the X Developer Console, check the app belongs to a project with API access and has credits, then Retry.`;
  }
  if (status === 403 && /oauth1|permission|not permitted/i.test(haystack)) {
    return `X refused to post (403: ${detail}). The app's permissions must be "Read and write": set it under User authentication settings in the X Developer Console, then regenerate the Access Token and Secret (tokens keep the permissions they were created with), update .env, restart and Retry.`;
  }
  if (status === 403) {
    return `X refused to post (403: ${detail}). Check the post and the account on x.com (reply restrictions, a locked or limited account), then Retry.`;
  }
  if (status === 400) return `X rejected the post (400: ${detail}). Fix the content (too long, empty, bad image?) and Retry.`;
  if (status >= 500) return `X API error ${status} (${detail}). Usually temporary: Retry in a few minutes.`;
  return `X API error ${status}: ${detail}`;
}

async function xRequest<T extends { data: unknown }>(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string>; json?: unknown } = {},
  creds: OAuthCredentials = credentials(),
): Promise<T> {
  const query = opts.query ? "?" + Object.entries(opts.query).map(([k, v]) => `${percentEncode(k)}=${percentEncode(v)}`).join("&") : "";
  const url = apiBase() + path + query;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: oauthHeader(method, url, creds),
        ...(opts.json === undefined ? {} : { "content-type": "application/json" }),
      },
      body: opts.json === undefined ? undefined : JSON.stringify(opts.json),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if (err instanceof XApiError) throw err;
    if ((err as Error).name === "TimeoutError") {
      throw new XApiError(`X didn't answer ${method} ${path} within 60s; it may or may not have gone through, so check your profile before you Retry.`);
    }
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new XApiError(
      `Couldn't reach the X API at ${apiBase()} (${cause?.code ?? cause?.message ?? (err as Error).message}). Check the server's internet connection, then Retry.`,
    );
  }
  const raw = await res.text();
  let body: (XProblem & { data?: unknown }) | undefined;
  try {
    body = JSON.parse(raw);
  } catch {
    body = undefined;
  }
  if (!res.ok) {
    throw new XApiError(explain(res.status, res.headers, body, raw), res.status, !(res.status === 403 && REPLY_TARGET_GONE.test(raw)));
  }
  if (!body?.data) throw new XApiError(`X answered ${res.status} without data: ${problemText(body) ?? raw.slice(0, 200)}`, res.status);
  return body as T;
}

// ---------- media ----------

interface UploadData {
  id: string;
  expires_after_secs?: number;
  processing_info?: { state: string; check_after_secs?: number; error?: { message?: string } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Upload one stored image (or reuse X's media id from an earlier attempt) and return the X media id. The cached id
 * belongs to the .env account, so connected X accounts (`cache` false) always upload.
 */
async function uploadMedia(mediaId: string, creds: OAuthCredentials, cache: boolean): Promise<string> {
  const m = getMedia(mediaId);
  if (!m) throw new XApiError(`Image ${mediaId} no longer exists; remove it from the post and Retry.`);
  if (cache && m.xMediaId && m.xMediaExpiresAt && Date.parse(m.xMediaExpiresAt) > Date.now() + 10 * 60_000) return m.xMediaId;

  let { data } = await xRequest<{ data: UploadData }>(
    "POST",
    "/2/media/upload",
    { json: { media: readMediaBytes(mediaId).toString("base64"), media_category: "tweet_image" } },
    creds,
  );
  for (let polls = 0; data.processing_info && ["pending", "in_progress"].includes(data.processing_info.state); polls++) {
    if (polls >= 30) throw new XApiError(`X is still processing ${m.filename}; Retry in a minute.`);
    await sleep((data.processing_info.check_after_secs ?? 2) * 1000);
    ({ data } = await xRequest<{ data: UploadData }>("GET", "/2/media/upload", { query: { command: "STATUS", media_id: data.id } }, creds));
  }
  if (data.processing_info?.state === "failed") {
    throw new XApiError(`X couldn't process ${m.filename}: ${data.processing_info.error?.message ?? "unknown error"}. Try another image.`);
  }
  // Cache the X media id only once its alt text is set; otherwise the next attempt uploads again and retries the alt.
  let altSet = true;
  if (m.alt?.trim()) {
    try {
      await xRequest("POST", "/2/media/metadata", { json: { id: data.id, metadata: { alt_text: { text: m.alt.slice(0, 1000) } } } }, creds);
    } catch (err) {
      altSet = false;
      console.warn(`[x] alt text for ${m.filename} not set (posting without it): ${(err as Error).message}`);
    }
  }
  if (altSet && cache) setXMediaId(mediaId, data.id, new Date(Date.now() + (data.expires_after_secs ?? 86_400) * 1000).toISOString());
  return data.id;
}

// ---------- publishing ----------

/** Post the thread in order, each tweet replying to the previous one. Resumes after `post.xPostIds`. */
export async function publishToX(post: Post): Promise<{ xPostIds: string[]; url: string }> {
  const { ids, url } = await publishThreadToX({
    creds: credentials(),
    items: post.thread,
    posted: post.xPostIds,
    record: (ids) => recordPostedTweets(post.id, ids),
    maxChars: getConfig().maxChars,
    cacheMedia: true,
  });
  return { xPostIds: ids, url };
}

/** Who the credentials belong to (GET /2/users/me; billed as one owned read, about $0.001). */
export async function verifyX(creds: OAuthCredentials): Promise<{ handle: string; profileUrl: string }> {
  const { data } = await xRequest<{ data: { username: string } }>("GET", "/2/users/me", {}, creds);
  return { handle: `@${data.username}`, profileUrl: `https://x.com/${data.username}` };
}

export async function publishThreadToX(opts: {
  creds: OAuthCredentials;
  items: { text: string; mediaIds: string[] }[];
  posted: string[];
  record: (ids: string[]) => void;
  maxChars: number;
  cacheMedia: boolean;
}): Promise<{ ids: string[]; url: string }> {
  const { creds } = opts;
  const ids = [...opts.posted];
  const total = opts.items.length;
  try {
    const pending = opts.items.slice(ids.length);
    const { maxChars } = opts;
    pending.forEach((s, i) => {
      const n = ids.length + i + 1;
      const length = weightedLength(s.text);
      if (!s.text.trim() && !s.mediaIds.length) throw new XApiError(`Post ${n} is empty; add text or remove it.`);
      if (length > maxChars) throw new XApiError(`Post ${n} is ${length}/${maxChars} characters; shorten it, then Retry.`);
      if (s.mediaIds.length > 4) throw new XApiError(`Post ${n} has ${s.mediaIds.length} images; X allows at most 4.`);
    });
    // Upload every remaining image before the first tweet so a bad image can't leave the thread half-posted.
    const media: string[][] = [];
    for (const s of pending) {
      const xIds: string[] = [];
      for (const id of s.mediaIds) xIds.push(await uploadMedia(id, creds, opts.cacheMedia));
      media.push(xIds);
    }
    for (const [i, s] of pending.entries()) {
      const replyTo = ids.at(-1);
      const { data } = await xRequest<{ data: { id: string } }>(
        "POST",
        "/2/tweets",
        {
          json: {
            ...(s.text.trim() ? { text: s.text } : {}),
            ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}),
            ...(media[i]!.length ? { media: { media_ids: media[i] } } : {}),
          },
        },
        creds,
      );
      ids.push(data.id);
      opts.record(ids);
    }
  } catch (err) {
    const resumable = !(err instanceof XApiError) || err.resumable;
    const progress = !ids.length
      ? `Nothing was posted (0 of ${total}).`
      : resumable
        ? `${ids.length} of ${total} posts are live on X; Retry continues with post ${ids.length + 1} without re-posting them.`
        : `${ids.length} of ${total} posts are live on X.`;
    throw new XApiError(`${(err as Error).message} ${progress}`, err instanceof XApiError ? err.status : undefined, resumable);
  }
  return { ids, url: `https://x.com/i/status/${ids[0]}` };
}
