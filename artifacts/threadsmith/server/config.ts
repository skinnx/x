// threadsmith.config.json: timezone, posting slots, char limit. Re-read when the file changes — no restart needed.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import type { Post, Queue, QueueDay, QueueItem } from "../shared/types.ts";
import { env } from "./env.ts";
import { listPosts } from "./repo.ts";

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM (24h)");

const SlotRule = z.union([
  z.object({ days: z.string(), times: z.array(hhmm).min(1) }),
  z.object({ days: z.string(), from: hhmm, to: hhmm, everyMinutes: z.number().int().min(5) }),
]);

const ConfigSchema = z.object({
  timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  /** 280 for standard X accounts; Premium accounts can post up to 25,000. */
  maxChars: z.number().int().positive().default(280),
  slots: z.array(SlotRule).default([{ days: "mon-fri", times: ["09:00", "12:30", "16:00"] }]),
  schedulerIntervalSeconds: z.number().int().min(5).default(15),
  /** A few of your own past posts; the AI copilot imitates their voice. */
  voice: z.array(z.string()).default([]),
});
export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_FILE = {
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  maxChars: 280,
  slots: [
    { days: "mon-fri", times: ["09:00", "12:30", "16:00"] },
    { days: "sat,sun", times: ["10:00"] },
  ],
  schedulerIntervalSeconds: 15,
  voice: [],
};

let cache: { mtimeMs: number; config: Config } | undefined;

export function getConfig(): Config {
  if (!existsSync(env.configPath)) writeFileSync(env.configPath, JSON.stringify(DEFAULT_FILE, null, 2) + "\n");
  const { mtimeMs } = statSync(env.configPath);
  if (cache?.mtimeMs === mtimeMs) return cache.config;
  const parsed = ConfigSchema.safeParse(JSON.parse(readFileSync(env.configPath, "utf8")));
  if (!parsed.success) {
    const msg = `Invalid ${env.configPath}: ${z.prettifyError(parsed.error)}`;
    if (cache) {
      console.error(msg + " — keeping previous config");
      return cache.config;
    }
    throw new Error(msg);
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
  } catch {
    throw new Error(`Unknown timezone "${parsed.data.timezone}" in ${env.configPath}`);
  }
  cache = { mtimeMs, config: parsed.data };
  return parsed.data;
}

/** "mon-fri", "sat,sun", "daily", "weekdays", "weekends" → set of JS day numbers (0 = Sunday). */
function parseDays(spec: string): Set<number> {
  const out = new Set<number>();
  for (const part of spec.toLowerCase().split(",").map((s) => s.trim())) {
    if (part === "daily" || part === "*") DAY_NAMES.forEach((_, i) => out.add(i));
    else if (part === "weekdays") [1, 2, 3, 4, 5].forEach((d) => out.add(d));
    else if (part === "weekends") [0, 6].forEach((d) => out.add(d));
    else if (part.includes("-")) {
      const [a, b] = part.split("-").map((d) => DAY_NAMES.indexOf(d.slice(0, 3) as (typeof DAY_NAMES)[number]));
      if (a! < 0 || b! < 0) continue;
      for (let d = a!; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
    } else {
      const d = DAY_NAMES.indexOf(part.slice(0, 3) as (typeof DAY_NAMES)[number]);
      if (d >= 0) out.add(d);
    }
  }
  return out;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Slot times (minutes after local midnight) for a weekday. */
function slotMinutesFor(day: number, config: Config): number[] {
  const mins = new Set<number>();
  for (const rule of config.slots) {
    if (!parseDays(rule.days).has(day)) continue;
    if ("times" in rule) rule.times.forEach((t) => mins.add(toMinutes(t)));
    else for (let m = toMinutes(rule.from); m <= toMinutes(rule.to); m += rule.everyMinutes) mins.add(m);
  }
  return [...mins].sort((a, b) => a - b);
}

interface LocalDay {
  y: number;
  m: number;
  d: number;
  weekday: number;
  key: string;
}

function localDay(ms: number, tz: string, offsetDays = 0): LocalDay {
  const base = new TZDate(ms, tz);
  const t = new TZDate(base.getFullYear(), base.getMonth(), base.getDate() + offsetDays, 12, 0, tz);
  const y = t.getFullYear();
  const m = t.getMonth();
  const d = t.getDate();
  return { y, m, d, weekday: t.getDay(), key: `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

function slotInstants(day: LocalDay, config: Config): Date[] {
  return slotMinutesFor(day.weekday, config).map(
    (min) => new Date(new TZDate(day.y, day.m, day.d, Math.floor(min / 60), min % 60, config.timezone).getTime()),
  );
}

const minuteKey = (iso: string | Date) => new Date(iso).toISOString().slice(0, 16);
const OCCUPYING = ["scheduled", "publishing", "due", "published", "failed"] as const;

function occupiedMinutes(from: Date, to: Date): Set<string> {
  return new Set(
    listPosts({ status: [...OCCUPYING], from: from.toISOString(), to: to.toISOString(), limit: 5000 })
      .filter((p) => p.scheduledAt)
      .map((p) => minuteKey(p.scheduledAt!)),
  );
}

/** Next `count` free slots strictly after `after` (default: now + 1 minute). */
export function nextFreeSlots(count = 1, after = new Date(Date.now() + 60_000), horizonDays = 120): Date[] {
  const config = getConfig();
  const horizon = new Date(after.getTime() + horizonDays * 86_400_000);
  const taken = occupiedMinutes(after, horizon);
  const out: Date[] = [];
  for (let i = 0; i <= horizonDays && out.length < count; i++) {
    for (const at of slotInstants(localDay(after.getTime(), config.timezone, i), config)) {
      if (at <= after || taken.has(minuteKey(at))) continue;
      out.push(at);
      if (out.length >= count) break;
    }
  }
  if (!out.length) throw new Error("No free slot in the next 120 days — add slots in threadsmith.config.json");
  return out;
}

const LOCAL_ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/;

/** Resolve "next", an ISO instant, or an offset-less local time (read in the configured timezone). */
export function resolveWhen(at: string): string {
  if (at === "next") return nextFreeSlots(1)[0]!.toISOString();
  const local = LOCAL_ISO.exec(at);
  if (local) {
    const [y, mo, d, h, mi, s] = local.slice(1).map((n) => Number(n ?? 0));
    return new Date(new TZDate(y!, mo! - 1, d!, h!, mi!, s!, getConfig().timezone).getTime()).toISOString();
  }
  return new Date(at).toISOString();
}

/** Day-grouped timeline: scheduled/published posts plus open slots, starting today in the configured timezone. */
export function buildQueue(days = 14): Queue {
  const config = getConfig();
  const nowMs = Date.now();
  const first = localDay(nowMs, config.timezone, 0);
  const start = new Date(new TZDate(first.y, first.m, first.d, 0, 0, config.timezone).getTime());
  const last = localDay(nowMs, config.timezone, days);
  const end = new Date(new TZDate(last.y, last.m, last.d, 0, 0, config.timezone).getTime());

  const posts = listPosts({ status: [...OCCUPYING], from: start.toISOString(), to: end.toISOString(), limit: 5000 });
  // Overdue manual posts and failures from before today stay visible on today's card.
  const stale = listPosts({ status: ["due", "failed"], to: start.toISOString(), limit: 200 });

  const byDay = new Map<string, QueueItem[]>();
  const dayKey = (iso: string) => localDay(new Date(iso).getTime(), config.timezone).key;
  const push = (key: string, item: QueueItem) => byDay.set(key, [...(byDay.get(key) ?? []), item]);

  const taken = new Set<string>();
  for (const p of posts as Post[]) {
    push(dayKey(p.scheduledAt!), { type: "post", at: p.scheduledAt!, post: p });
    taken.add(minuteKey(p.scheduledAt!));
  }
  for (const p of stale) push(first.key, { type: "post", at: p.scheduledAt!, post: p });

  const out: QueueDay[] = [];
  for (let i = 0; i < days; i++) {
    const day = localDay(nowMs, config.timezone, i);
    for (const at of slotInstants(day, config)) {
      if (at.getTime() > nowMs && !taken.has(minuteKey(at))) push(day.key, { type: "slot", at: at.toISOString() });
    }
    const items = (byDay.get(day.key) ?? []).sort((a, b) => a.at.localeCompare(b.at));
    out.push({ date: day.key, items });
  }
  return { timezone: config.timezone, days: out };
}
