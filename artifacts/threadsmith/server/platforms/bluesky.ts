// Bluesky over AT Protocol XRPC, signed in with an app password (a fresh session per verify/publish).
// Checked 2026-10-29 against the canonical lexicons (docs.bsky.app now redirects to a JS-only reference):
// com.atproto.server.createSession {identifier, password} → {accessJwt, did, handle}; errors AuthFactorTokenRequired,
// AccountTakedown (github.com/bluesky-social/atproto lexicons/com/atproto); com.atproto.repo.uploadBlob (raw bytes) →
// {blob}; com.atproto.repo.createRecord {repo, collection, record} → {uri, cid}; app.bsky.feed.post reply {root, parent}
// strong refs; app.bsky.richtext.facet byteSlice = UTF-8 byte offsets, features #link/#tag/#mention;
// app.bsky.embed.images ≤4 images, image blob maxSize 2,000,000 bytes ("formerly limited to 1 MB"), alt required,
// aspectRatio {width, height} (github.com/bluesky-social/bsky lexicons/app/bsky). XRPC errors are {error, message}.
// Item ids are stored as "<at-uri>|<cid>" so a retry can rebuild the reply refs from ctx.posted alone.
import { getMedia, readMediaBytes } from "../repo.ts";
import { PlatformError, type Credentials, type PlatformAdapter } from "./types.ts";

const MAX_BLOB_BYTES = 2_000_000;
const DEFAULT_SERVICE = "https://bsky.social";
const APP_PASSWORDS = "bsky.app → Settings → Privacy and security → App passwords";

interface StrongRef {
  uri: string;
  cid: string;
}
interface Session {
  base: string;
  jwt: string;
  did: string;
  handle: string;
}

const serviceUrl = (c: Credentials) => {
  const s = (c.service?.trim() || DEFAULT_SERVICE).replace(/\/+$/, "");
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

function untilText(h: Headers): string {
  const reset = Number(h.get("ratelimit-reset"));
  if (!reset) return "in a few minutes";
  const minutes = Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000));
  return `after ${new Date(reset * 1000).toISOString().replace(/\.\d+Z$/, "Z")} (in ~${minutes} min)`;
}

function explain(nsid: string, status: number, headers: Headers, error: string, message: string): PlatformError {
  const detail = [error, message].filter(Boolean).join(": ") || `HTTP ${status}`;
  if (error === "AuthFactorTokenRequired") {
    return new PlatformError(`Bluesky asked for an email sign-in code (${detail}). Use an app password (${APP_PASSWORDS}), not your main password; app passwords skip that step.`, 401);
  }
  if (error === "AccountTakedown" || error === "AccountDeactivated") {
    return new PlatformError(`Bluesky says this account can't post (${detail}). Check it on bsky.app; Retry won't help until it is active again.`, 403, false);
  }
  if (nsid === "com.atproto.server.createSession" && (status === 401 || error === "AuthenticationRequired")) {
    return new PlatformError(`Bluesky rejected the handle or app password (${status}: ${detail}). Create a new app password at ${APP_PASSWORDS}, update the account's credentials, then Retry.`, 401);
  }
  if (status === 401 || error === "ExpiredToken" || error === "InvalidToken") {
    return new PlatformError(`Bluesky ended the session (${status}: ${detail}). Retry signs in again; if it keeps failing, re-check the app password.`, 401);
  }
  if (status === 429) return new PlatformError(`Bluesky rate limit reached (429: ${detail}). Retry ${untilText(headers)}.`, 429);
  if (status === 413 || error === "BlobTooLarge" || error === "PayloadTooLarge") {
    return new PlatformError(`Bluesky refused an image as too large (${status}: ${detail}). Use a smaller image (under ${MAX_BLOB_BYTES / 1_000_000} MB, or 1 MB on older PDSes), then Retry.`, 413);
  }
  if (status >= 500) return new PlatformError(`Bluesky error ${status} (${detail}). Usually temporary: Retry in a few minutes.`, status);
  if (status === 400) return new PlatformError(`Bluesky rejected the request (400: ${detail}). Fix the content (too long, bad image?) and Retry.`, 400);
  return new PlatformError(`Bluesky error ${status}: ${detail}`, status);
}

async function xrpc<T>(
  base: string,
  nsid: string,
  opts: { jwt?: string; json?: unknown; bytes?: Uint8Array; mime?: string; query?: Record<string, string> } = {},
): Promise<T> {
  const post = opts.json !== undefined || opts.bytes !== undefined;
  const url = `${base}/xrpc/${nsid}${opts.query ? "?" + new URLSearchParams(opts.query) : ""}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: post ? "POST" : "GET",
      headers: {
        ...(opts.jwt ? { authorization: `Bearer ${opts.jwt}` } : {}),
        ...(opts.json !== undefined ? { "content-type": "application/json" } : opts.bytes ? { "content-type": opts.mime ?? "application/octet-stream" } : {}),
      },
      body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.bytes && new Uint8Array(opts.bytes),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    if ((err as Error).name === "TimeoutError") {
      throw new PlatformError(`Bluesky didn't answer ${nsid} within 60s; it may or may not have gone through, so check your profile before you Retry.`);
    }
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    throw new PlatformError(`Couldn't reach Bluesky at ${base} (${cause?.code ?? cause?.message ?? (err as Error).message}). Check the PDS URL and the server's internet connection, then Retry.`);
  }
  const raw = await res.text();
  let body: { error?: string; message?: string } | undefined;
  try {
    body = JSON.parse(raw);
  } catch {
    body = undefined;
  }
  if (!res.ok) throw explain(nsid, res.status, res.headers, body?.error ?? "", body?.message ?? raw.trim().slice(0, 200));
  if (!body) throw new PlatformError(`Bluesky answered ${nsid} with ${res.status} but no JSON: ${raw.slice(0, 200)}`, res.status);
  return body as T;
}

async function signIn(c: Credentials): Promise<Session> {
  if (!c.identifier || !c.appPassword) throw new PlatformError(`Bluesky needs the handle and an app password (${APP_PASSWORDS}).`, 401);
  const base = serviceUrl(c);
  const s = await xrpc<{ accessJwt: string; did: string; handle: string; active?: boolean; status?: string }>(base, "com.atproto.server.createSession", {
    json: { identifier: c.identifier.replace(/^@/, ""), password: c.appPassword },
  });
  if (s.active === false) {
    throw new PlatformError(`Bluesky says this account is ${s.status ?? "inactive"}. Check it on bsky.app; Retry won't help until it is active again.`, 403, false);
  }
  return { base, jwt: s.accessJwt, did: s.did, handle: s.handle };
}

const profileUrl = (s: Session) => `https://bsky.app/profile/${s.handle && s.handle !== "handle.invalid" ? s.handle : s.did}`;
const postUrl = (s: Session, ref: StrongRef) => `${profileUrl(s)}/post/${ref.uri.split("/").pop()}`;

const encodeRef = (r: StrongRef) => `${r.uri}|${r.cid}`;
function decodeRef(id: string): StrongRef {
  const [uri, cid] = id.split("|");
  if (!uri?.startsWith("at://") || !cid) {
    throw new PlatformError(`Can't continue this Bluesky thread: the saved id "${id}" isn't a post reference. Duplicate the post into a new draft to post it again.`, undefined, false);
  }
  return { uri, cid };
}

// ---------- rich text facets ----------

type Feature = { $type: "app.bsky.richtext.facet#link"; uri: string } | { $type: "app.bsky.richtext.facet#tag"; tag: string } | { $type: "app.bsky.richtext.facet#mention"; did: string };
export interface Facet {
  index: { byteStart: number; byteEnd: number };
  features: Feature[];
}

const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const slice = (text: string, start: number, end: number) => ({ byteStart: bytes(text.slice(0, start)), byteEnd: bytes(text.slice(0, end)) });

/** Link, hashtag and mention facets with UTF-8 byte offsets; mentions only when the handle resolves to a DID. */
export async function detectFacets(text: string, resolve?: (handle: string) => Promise<string | null>): Promise<Facet[]> {
  const facets: Facet[] = [];
  for (const m of text.matchAll(/(^|[\s(])(https?:\/\/[^\s]+)/gi)) {
    let url = m[2];
    url = url.replace(/[.,;:!?'"]+$/, "");
    const unbalanced = (u: string) => u.endsWith(")") && u.split(")").length > u.split("(").length;
    while (unbalanced(url)) url = url.slice(0, -1).replace(/[.,;:!?'"]+$/, "");
    const start = m.index + m[1].length;
    facets.push({ index: slice(text, start, start + url.length), features: [{ $type: "app.bsky.richtext.facet#link", uri: url }] });
  }
  for (const m of text.matchAll(/(^|\s)([#＃])([^\s#＃]+)/gu)) {
    const tag = m[3].replace(/\p{P}+$/u, "");
    if (!tag || /^\d+$/.test(tag) || [...tag].length > 64) continue;
    const start = m.index + m[1].length;
    facets.push({ index: slice(text, start, start + m[2].length + tag.length), features: [{ $type: "app.bsky.richtext.facet#tag", tag }] });
  }
  if (resolve) {
    for (const m of text.matchAll(/(^|[\s(])@([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/g)) {
      const handle = m[2].replace(/\.+$/, "");
      if (!/\.[a-zA-Z][a-zA-Z0-9-]*$/.test(handle)) continue;
      const did = await resolve(handle.toLowerCase());
      if (!did) continue;
      const start = m.index + m[1].length;
      facets.push({ index: slice(text, start, start + 1 + handle.length), features: [{ $type: "app.bsky.richtext.facet#mention", did }] });
    }
  }
  return facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

// ---------- images ----------

/** Pixel size from the file header (png, jpeg, gif, webp); null if it can't be read cheaply. */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  try {
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b.length > 10 && b.toString("latin1", 0, 3) === "GIF") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (b.length > 30 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") {
      const kind = b.toString("latin1", 12, 16);
      if (kind === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (kind === "VP8L") {
        const v = b.readUInt32LE(21);
        return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) };
      }
      if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i + 9 < b.length; ) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch {
    // fall through
  }
  return null;
}

function mediaOrFail(id: string) {
  const m = getMedia(id);
  if (!m) throw new PlatformError(`Image ${id} no longer exists; remove it from the post and Retry.`);
  return m;
}

async function uploadImage(s: Session, mediaId: string) {
  const m = mediaOrFail(mediaId);
  const data = readMediaBytes(mediaId);
  const { blob } = await xrpc<{ blob: unknown }>(s.base, "com.atproto.repo.uploadBlob", { jwt: s.jwt, bytes: data, mime: m.mime });
  const size = imageSize(data);
  return { image: blob, alt: m.alt?.trim() ?? "", ...(size && size.width > 0 && size.height > 0 ? { aspectRatio: size } : {}) };
}

// ---------- adapter ----------

export const bluesky: PlatformAdapter = {
  async verify(c) {
    const s = await signIn(c);
    return { handle: `@${s.handle}`, profileUrl: profileUrl(s) };
  },

  async publish(ctx) {
    const refs = ctx.posted.map(decodeRef);
    const todo = ctx.items.slice(refs.length);
    // Size problems found before anything is posted, so they can't leave half a thread.
    for (const [i, item] of todo.entries()) {
      for (const id of item.mediaIds) {
        const m = mediaOrFail(id);
        if (m.size > MAX_BLOB_BYTES) {
          throw new PlatformError(
            `${m.filename} in post ${refs.length + i + 1} is ${(m.size / 1_000_000).toFixed(1)} MB; Bluesky accepts images up to ${MAX_BLOB_BYTES / 1_000_000} MB. Use a smaller or more compressed image (or give Bluesky its own version without it), then Retry.`,
            413,
          );
        }
      }
    }
    const s = await signIn(ctx.credentials);
    const resolve = async (handle: string) => {
      try {
        return (await xrpc<{ did: string }>(s.base, "com.atproto.identity.resolveHandle", { jwt: s.jwt, query: { handle } })).did ?? null;
      } catch {
        return null;
      }
    };
    const ids = [...ctx.posted];
    for (const item of todo) {
      const images = [];
      for (const id of item.mediaIds) images.push(await uploadImage(s, id));
      const facets = await detectFacets(item.text, resolve);
      const record = {
        $type: "app.bsky.feed.post",
        text: item.text,
        createdAt: new Date().toISOString(),
        ...(facets.length ? { facets } : {}),
        ...(images.length ? { embed: { $type: "app.bsky.embed.images", images } } : {}),
        ...(refs.length ? { reply: { root: refs[0], parent: refs[refs.length - 1] } } : {}),
      };
      const { uri, cid } = await xrpc<StrongRef>(s.base, "com.atproto.repo.createRecord", {
        jwt: s.jwt,
        json: { repo: s.did, collection: "app.bsky.feed.post", record },
      });
      refs.push({ uri, cid });
      ids.push(encodeRef({ uri, cid }));
      ctx.record([...ids]);
    }
    return { ids, url: refs.length ? postUrl(s, refs[0]) : null };
  },
};
