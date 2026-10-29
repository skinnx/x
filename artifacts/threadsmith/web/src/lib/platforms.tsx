// Platform glyphs (inline SVG, no icon dependency) and the client side of per-platform limits and counters.
import { useQuery } from "@tanstack/react-query";
import { AtSign } from "lucide-react";
import { countFor, itemsFor, PLATFORMS, TELEGRAM_CAPTION_LIMIT } from "../../../shared/platforms.ts";
import type { Account, Health, PlatformId, Segment } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { cx } from "./util.ts";

const PATHS: Partial<Record<PlatformId, string>> = {
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  bluesky:
    "M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z",
  telegram:
    "M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z",
  // Simplified marks: a speech bubble with an "m" (Mastodon) and a controller-shaped face (Discord).
  mastodon:
    "M21.3 7.6c0-4.6-3-5.9-3-5.9C16.8 1 14.2.7 11.5.7h-.1c-2.7 0-5.3.3-6.8 1 0 0-3 1.3-3 5.9 0 5.4-.3 11.9 5 13.3 1.9.5 3.6.6 4.9.5 2.4-.1 3.7-.8 3.7-.8l-.1-1.7s-1.7.5-3.6.5c-1.9-.1-3.9-.2-4.2-2.5v-.6s1.9.5 4.2.6c1.4.1 2.8-.1 4.1-.2 2.6-.3 4.9-1.9 5.2-3.4.4-2.3.4-5.8.4-5.8zM17.8 13.4h-2.2V8.1c0-1.1-.5-1.7-1.4-1.7-1 0-1.6.7-1.6 2v2.9h-2.2V8.4c0-1.3-.5-2-1.6-2-.9 0-1.4.6-1.4 1.7v5.3H5.2V7.9c0-1.1.3-2 .8-2.6.6-.7 1.4-1 2.3-1 1.1 0 2 .4 2.5 1.3l.6.9.5-.9c.5-.9 1.4-1.3 2.5-1.3 1 0 1.8.3 2.3 1 .6.6.8 1.5.8 2.6z",
  discord:
    "M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18.2 18.2 0 0 0-5.5 0L8.6 3a19.5 19.5 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.7 19.7 0 0 0 6 3l1.3-2.1a12.7 12.7 0 0 1-2-1l.5-.4a14 14 0 0 0 12.1 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.6 19.6 0 0 0 6-3c.5-5.2-.9-9.7-3.5-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z",
};

/** Brand tint for a glyph; X and Threads are black/white marks, so they follow the text colour. */
const TINT: Record<PlatformId, string | null> = {
  x: null,
  threads: null,
  bluesky: "#1185fe",
  mastodon: "#6364ff",
  linkedin: "#0a66c2",
  telegram: "#26a5e4",
  discord: "#5865f2",
};

export function PlatformIcon({ platform, size = 14, tint = true, className }: { platform: PlatformId; size?: number; tint?: boolean; className?: string }) {
  const color = tint ? (TINT[platform] ?? undefined) : undefined;
  const path = PATHS[platform];
  if (!path) return <AtSign size={size} strokeWidth={2.4} className={cx("shrink-0", className)} aria-hidden />; // Threads' mark is an @-like swirl
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color ?? "currentColor"} className={cx("shrink-0", className)} aria-hidden>
      <path d={path} />
    </svg>
  );
}

/** Compact name for counters ("Bsky 290/300"). */
export const shortName = (p: PlatformId) => (p === "bluesky" ? "Bsky" : PLATFORMS[p].name);

/** Mirrors server/publisher.ts limitFor: the account's own override, else the platform default (X: the config limit). */
export function limitFor(account: Account, health: Health): number {
  if (account.maxChars) return account.maxChars;
  return account.platform === "x" ? health.maxChars : PLATFORMS[account.platform].maxChars;
}

export function useAccounts() {
  return useQuery({ queryKey: ["accounts"], queryFn: api.accounts, staleTime: 30_000 });
}

export interface Meter {
  key: string;
  label: string;
  platform: PlatformId;
  length: number;
  max: number;
}

/** One counter per distinct platform/limit among `accounts`, for a single post (platforms that thread or send messages). */
export function postMeters(text: string, images: number, accounts: Account[], health: Health): Meter[] {
  const out: Meter[] = [];
  for (const a of accounts) {
    if (PLATFORMS[a.platform].threadMode === "single") continue;
    const limit = limitFor(a, health);
    const max = a.platform === "telegram" && images > 0 ? Math.min(limit, TELEGRAM_CAPTION_LIMIT) : limit;
    if (out.some((m) => m.platform === a.platform && m.max === max)) continue;
    const twin = accounts.some((b) => b !== a && b.platform === a.platform && limitFor(b, health) !== limit);
    out.push({ key: a.id, label: twin ? a.label : shortName(a.platform), platform: a.platform, length: countFor(a.platform, text), max });
  }
  return out;
}

/** Counter for a platform that joins the thread into one post (LinkedIn). */
export function joinedMeter(thread: Segment[], account: Account, health: Health): Meter {
  const text = itemsFor(account.platform, thread)[0]?.text ?? "";
  return { key: account.id, label: PLATFORMS[account.platform].name, platform: account.platform, length: countFor(account.platform, text), max: limitFor(account, health) };
}

/** The meter closest to (or furthest over) its limit. */
export const strictest = (meters: Meter[]) => meters.reduce<Meter | null>((a, m) => (!a || m.length / m.max > a.length / a.max ? m : a), null);
