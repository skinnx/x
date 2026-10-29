// Mastodon as a Threadsmith platform. The REST client (and the API doc references) is in api.ts.
import type { ThreadsmithAPI } from "threadsmith/plugin";
import { createMastodon } from "./api.ts";

export default function (ts: ThreadsmithAPI) {
  ts.registerPlatform({
    id: "mastodon",
    name: "Mastodon",
    maxChars: 500,
    maxImages: 4,
    threadMode: "replies",
    counting: { method: "codepoints", urlLength: 23 }, // every URL counts as 23
    costNote: "Free.",
    setup: "Your instance → Preferences → Development → New application with scopes profile, write:statuses and write:media → copy the access token.",
    credentials: [
      { key: "instanceUrl", label: "Instance URL", secret: false, placeholder: "https://mastodon.social" },
      { key: "accessToken", label: "Access token", secret: true },
    ],
    metricsNote: "Public posts are read without extra scopes; instances that require sign-in for reads need the token to have read:statuses.",
    brand: { color: "#6364FF" },
    ...createMastodon(ts),
  });
}
