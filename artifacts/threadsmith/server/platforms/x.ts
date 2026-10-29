// X as a connected account (its own OAuth 1.0a keys), on top of the same client the .env mode uses.
// Metrics: GET /2/tweets public_metrics via readPostMetrics (server/x.ts has the doc links). Reads are billed.
import { getConfig } from "../config.ts";
import type { ItemMetrics } from "../../shared/types.ts";
import { publishThreadToX, readPostMetrics, verifyX, XApiError, type OAuthCredentials } from "../x.ts";
import { PlatformError, type Credentials, type PlatformAdapter } from "./types.ts";

function oauth(c: Credentials): OAuthCredentials {
  return { consumerKey: c.apiKey ?? "", consumerSecret: c.apiSecret ?? "", token: c.accessToken ?? "", tokenSecret: c.accessTokenSecret ?? "" };
}

const wrap = (err: unknown) =>
  err instanceof XApiError ? new PlatformError(err.message, err.status, err.resumable) : err;

export const x: PlatformAdapter = {
  async verify(c) {
    try {
      return await verifyX(oauth(c));
    } catch (err) {
      throw wrap(err);
    }
  },
  async publish(ctx) {
    try {
      return await publishThreadToX({
        creds: oauth(ctx.credentials),
        items: ctx.items,
        posted: ctx.posted,
        record: ctx.record,
        maxChars: ctx.account.maxChars ?? getConfig().maxChars,
        cacheMedia: false,
      });
    } catch (err) {
      throw wrap(err);
    }
  },

  metricsNote:
    "X bills every read: about $0.005 per post (each post counted once per UTC day), so a 10-post thread costs about $0.05 per refresh. Only fetch when asked.",

  async metrics(ctx) {
    let found: Awaited<ReturnType<typeof readPostMetrics>>;
    try {
      found = await readPostMetrics(oauth(ctx.credentials), ctx.externalIds);
    } catch (err) {
      throw wrap(err);
    }
    return ctx.externalIds.map((id) => {
      const p = found.get(id);
      const m: ItemMetrics = { id };
      if (!p) return m; // deleted, protected or not a post id
      if (typeof p.like_count === "number") m.likes = p.like_count;
      const reposts = p.retweet_count ?? p.repost_count;
      if (typeof reposts === "number") m.reposts = reposts;
      if (typeof p.reply_count === "number") m.replies = p.reply_count;
      if (typeof p.quote_count === "number") m.quotes = p.quote_count;
      if (typeof p.impression_count === "number") m.views = p.impression_count;
      if (typeof p.bookmark_count === "number") m.bookmarks = p.bookmark_count;
      return m;
    });
  },
};
