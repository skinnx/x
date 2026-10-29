// What each supported platform allows, and how it counts characters. Shared by the server (pre-flight checks),
// the web composer (live counters) and agents (GET /api/platforms).
import type { PlatformId } from "./types.ts";
import { weightedLength } from "./thread.ts";

/**
 * How a multi-post thread lands on the platform:
 * - "replies": each post replies to the previous one (X, Bluesky, Mastodon, Threads)
 * - "single": the posts are joined into one post, separated by blank lines (LinkedIn has no threads)
 * - "messages": consecutive messages in the channel (Telegram replies to the previous one, Discord just follows)
 */
export type ThreadMode = "replies" | "single" | "messages";

export interface CredentialField {
  key: string;
  label: string;
  secret: boolean;
  optional?: boolean;
  placeholder?: string;
  help?: string;
}

export interface PlatformInfo {
  id: PlatformId;
  name: string;
  maxChars: number;
  maxImages: number;
  /** Image types the platform accepts (all of PNG, JPEG, WebP, GIF when absent). */
  imageTypes?: string[];
  threadMode: ThreadMode;
  /** Cost or access note shown wherever the account is connected. */
  costNote: string;
  credentials: CredentialField[];
  /** Where to get the credentials, one line. */
  setup: string;
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter() : null;
const graphemes = (t: string) => (segmenter ? [...segmenter.segment(t)].length : [...t].length);
const URL_ANY = /\bhttps?:\/\/\S+/gi;

/** Character count the platform enforces. */
export function countFor(platform: PlatformId, text: string): number {
  switch (platform) {
    case "x":
      return weightedLength(text);
    case "bluesky":
      return graphemes(text.normalize("NFC")); // Bluesky limits graphemes; links count in full
    case "mastodon":
      return [...text.replace(URL_ANY, "x".repeat(23))].length; // Mastodon counts every URL as 23
    case "threads": {
      // Threads counts an emoji as its UTF-8 byte length, everything else per character.
      if (!segmenter) return [...text].length;
      let n = 0;
      for (const { segment } of segmenter.segment(text)) n += /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(segment) ? new TextEncoder().encode(segment).length : [...segment].length;
      return n;
    }
    default:
      return [...text].length;
  }
}

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  x: {
    id: "x",
    name: "X",
    maxChars: 280,
    maxImages: 4,
    threadMode: "replies",
    costNote: "Paid: X API pay-per-use, about $0.015 per post and $0.20 per post containing a link.",
    setup: 'developer.x.com → your app → Keys and tokens. Set app permissions to "Read and write" before generating the access token.',
    credentials: [
      { key: "apiKey", label: "API key", secret: false },
      { key: "apiSecret", label: "API key secret", secret: true },
      { key: "accessToken", label: "Access token", secret: false },
      { key: "accessTokenSecret", label: "Access token secret", secret: true },
    ],
  },
  bluesky: {
    id: "bluesky",
    name: "Bluesky",
    maxChars: 300,
    maxImages: 4,
    threadMode: "replies",
    costNote: "Free.",
    setup: "bsky.app → Settings → Privacy and security → App passwords → Add. Never use your main password.",
    credentials: [
      { key: "identifier", label: "Handle", secret: false, placeholder: "you.bsky.social" },
      { key: "appPassword", label: "App password", secret: true, placeholder: "xxxx-xxxx-xxxx-xxxx" },
      { key: "service", label: "PDS URL", secret: false, optional: true, placeholder: "https://bsky.social", help: "Only for self-hosted PDS." },
    ],
  },
  mastodon: {
    id: "mastodon",
    name: "Mastodon",
    maxChars: 500,
    maxImages: 4,
    threadMode: "replies",
    costNote: "Free.",
    setup: "Your instance → Preferences → Development → New application with scopes write:statuses and write:media → copy the access token.",
    credentials: [
      { key: "instanceUrl", label: "Instance URL", secret: false, placeholder: "https://mastodon.social" },
      { key: "accessToken", label: "Access token", secret: true },
    ],
  },
  threads: {
    id: "threads",
    name: "Threads",
    maxChars: 500,
    maxImages: 20,
    imageTypes: ["image/jpeg", "image/png"],
    threadMode: "replies",
    costNote:
      "Free, but needs a Meta developer app with threads_basic, threads_content_publish and threads_manage_replies (for threads). Images must be reachable at PUBLIC_URL over HTTPS.",
    setup: "developers.facebook.com → create an app with the Threads use case → generate a long-lived user access token with threads_basic, threads_content_publish and threads_manage_replies (valid 60 days; refresh it before it expires).",
    credentials: [{ key: "accessToken", label: "Long-lived access token", secret: true }],
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    maxChars: 3000,
    maxImages: 20,
    imageTypes: ["image/jpeg", "image/png", "image/gif"],
    threadMode: "single",
    costNote: "Free. Needs an app with the w_member_social scope (Share on LinkedIn product). Threads are joined into one post.",
    setup: "linkedin.com/developers → create an app → add “Share on LinkedIn” and “Sign In with LinkedIn using OpenID Connect” → generate an access token with openid, profile, w_member_social (valid 60 days).",
    credentials: [{ key: "accessToken", label: "Access token", secret: true }],
  },
  telegram: {
    id: "telegram",
    name: "Telegram",
    maxChars: 4096,
    maxImages: 10,
    threadMode: "messages",
    costNote: "Free.",
    setup: "Talk to @BotFather → /newbot → copy the token; add the bot as an admin of your channel or group. Chat id: @channelname or the numeric id.",
    credentials: [
      { key: "botToken", label: "Bot token", secret: true },
      { key: "chatId", label: "Chat id", secret: false, placeholder: "@mychannel or -100…" },
    ],
  },
  discord: {
    id: "discord",
    name: "Discord",
    maxChars: 2000,
    maxImages: 10,
    threadMode: "messages",
    costNote: "Free.",
    setup: "Server settings → Integrations → Webhooks → New webhook → choose the channel → Copy webhook URL.",
    credentials: [{ key: "webhookUrl", label: "Webhook URL", secret: true, placeholder: "https://discord.com/api/webhooks/…" }],
  },
};

/** Telegram limits a photo caption to 1024 characters (a text message to 4096). */
export const TELEGRAM_CAPTION_LIMIT = 1024;

/** The text items a thread becomes on a platform (LinkedIn joins them into one). */
export function itemsFor(platform: PlatformId, thread: { text: string; mediaIds: string[] }[]) {
  if (PLATFORMS[platform].threadMode !== "single" || thread.length <= 1) return thread;
  return [{ text: thread.map((s) => s.text.trim()).filter(Boolean).join("\n\n"), mediaIds: thread.flatMap((s) => s.mediaIds) }];
}
