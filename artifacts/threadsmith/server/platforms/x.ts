// X as a connected account (its own OAuth 1.0a keys), on top of the same client the .env mode uses.
import { getConfig } from "../config.ts";
import { publishThreadToX, verifyX, XApiError, type OAuthCredentials } from "../x.ts";
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
};
