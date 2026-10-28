// threadsmith.config.json: timezone, posting slots, char limit. Re-read when the file changes — no restart needed.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { TZDate } from "@date-fns/tz";
import { z } from "zod";
import type { Post, Queue, QueueDay, QueueItem } from "../shared/types.ts";
import { env } from "./env.ts";
import { BadInputError, ConflictError, listPosts } from "./repo.ts";

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const FULL_DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM (24h)");

const days = z.string().refine((d) => parseDays(d) !== null, 'use e.g. "mon-fri", "sat,sun", "daily", "weekdays" or "weekends"');
const SlotRule = z.union([
  z.object({ days, times: z.array(hhmm).min(1) }),
  z
    .object({ days, from: hhmm, to: hhmm, everyMinutes: z.number().int().min(5) })
    .refine((r) => r.from <= r.to, '"from" must not be later than "to" (ranges can\'t cross midnight; split them into two rules)'),
]);

const ConfigSchema = z.object({
  timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  /** 280 for standard X accounts; Premium accounts can post up to 25,000. */
  maxChars: z.number().int().positive().default(280),
  slots: z.array(SlotRule).default([{ days: "mon-fri", times: ["09:00", "12:30", "16:00"] }]),
  schedulerIntervalSeconds: z.number().int().min(5).default(15),
  /**
   * A scheduled post found more than this many minutes late (the server was off at its time) is not posted
   * unattended; it becomes "due" so you decide. 0 = always post late posts.
   */
  lateGraceMinutes: z.number().int().min(0).default(60),
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
  lateGraceMinutes: 60,
  voice: [],
};

let cache: { mtimeMs: number; config: Config } | undefined;

/** Last config problem seen while hot-reloading (null when the file is valid); surfaced by GET /api/config. */
export let configError: string | null = null;

function loadConfig(): Config {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(env.configPath, "utf8"));
  } catch (err) {
    throw new Error(`Invalid JSON in ${env.configPath}: ${(err as Error).message}`);
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid ${env.configPath}: ${z.prettifyError(parsed.error)}`);
  try {
    new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
  } catch {
    throw new Error(`Unknown timezone "${parsed.data.timezone}" in ${env.configPath}`);
  }
  return parsed.data;
}

/**
 * Current config, re-read when the file changes. A broken edit while running keeps the last good config
 * (and logs once) instead of taking the app down; at startup a broken file is fatal.
 */
export function getConfig(): Config {
  if (!existsSync(env.configPath)) writeFileSync(env.configPath, JSON.stringify(DEFAULT_FILE, null, 2) + "\n");
  const { mtimeMs } = statSync(env.configPath);
  if (cache?.mtimeMs === mtimeMs) return cache.config;
  try {
    cache = { mtimeMs, config: loadConfig() };
    configError = null;
  } catch (err) {
    if (!cache) throw err;
    configError = (err as Error).message;
    console.error(`${configError} — keeping the previous config until the file is fixed`);
    cache = { mtimeMs, config: cache.config };
  }
  return cache.config;
}

/** "mon-fri", "fri-mon", "sat,sun", "daily", "weekdays", "weekends" → JS day numbers (0 = Sunday); null if unparseable. */
function parseDays(spec: string): Set<number> | null {
  const out = new Set<number>();
  const day = (d: string) => (d.length >= 3 ? FULL_DAY_NAMES.findIndex((n) => n.startsWith(d)) : -1);
  for (const part of spec.toLowerCase().split(",").map((s) => s.trim())) {
    if (part === "daily" || part === "*") DAY_NAMES.forEach((_, i) => out.add(i));
    else if (part === "weekdays") [1, 2, 3, 4, 5].forEach((d) => out.add(d));
    else if (part === "weekends") [0, 6].forEach((d) => out.add(d));
    else if (part.includes("-")) {
      const [a, b, extra] = part.split("-").map((d) => day(d.trim()));
      if (a === undefined || b === undefined || extra !== undefined || a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
    } else {
      const d = day(part);
      if (d < 0) return null;
      out.add(d);
    }
  }
  return out.size ? out : null;
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Slot times (minutes after local midnight) for a weekday. */
function slotMinutesFor(day: number, config: Config): number[] {
  const mins = new Set<number>();
  for (const rule of config.slots) {
    if (!parseDays(rule.days)?.has(day)) continue;
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
  // On a spring-forward day, wall times in the skipped hour land on the same instant as a later slot: keep one.
  const seen = new Set<number>();
  return slotMinutesFor(day.weekday, config)
    .map((min) => new TZDate(day.y, day.m, day.d, Math.floor(min / 60), min % 60, config.timezone).getTime())
    .filter((ms) => !seen.has(ms) && seen.add(ms))
    .map((ms) => new Date(ms));
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

const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Parse an ISO-8601 date-time into a UTC ISO string. With "Z" or an offset it is an instant; without one it is
 * a wall-clock time in the configured timezone. Date-only and free-form strings are rejected (they are ambiguous).
 */
export function parseInstant(input: string): string {
  const m = DATE_TIME.exec(input.trim());
  if (!m) throw new BadInputError(`"${input}" is not an ISO-8601 date-time (e.g. 2026-11-02T09:00, 2026-11-02T09:00:00+07:00 or …Z)`);
  if (m[7]) {
    const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((n) => Number(n ?? 0)) as [number, number, number, number, number, number];
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate() || h > 23 || mi > 59 || sec > 59) {
      throw new BadInputError(`"${input}" is not a real date-time`);
    }
    const t = new Date(input.trim().replace(" ", "T"));
    if (Number.isNaN(t.getTime())) throw new BadInputError(`"${input}" is not a valid date-time`);
    return t.toISOString();
  }
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((n) => Number(n ?? 0)) as [number, number, number, number, number, number];
  // Reject impossible values (2026-11-31, 25:00, :75) instead of letting Date roll them into another day.
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth || h > 23 || mi > 59 || sec > 59) {
    throw new BadInputError(`"${input}" is not a real date-time`);
  }
  return new Date(new TZDate(y, mo - 1, d, h, mi, sec, getConfig().timezone).getTime()).toISOString();
}

/** Resolve "next" or a date-time (see parseInstant) into a UTC ISO string. */
export function resolveWhen(at: string): string {
  return at === "next" ? nextFreeSlots(1)[0]!.toISOString() : parseInstant(at);
}

/** Format an instant in the configured timezone, for messages people read. */
export function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: getConfig().timezone }).format(new Date(iso)) + ` (${getConfig().timezone})`;
}

/**
 * The one place every surface (REST, MCP, CLI via REST, UI via REST) turns a requested publish time into an
 * instant: "next" free slot, or a future date-time. Up to a minute in the past is tolerated for clock skew.
 */
export function parseWhen(at: string): string {
  let iso: string;
  try {
    iso = resolveWhen(at);
  } catch (err) {
    if (err instanceof BadInputError) throw err;
    throw new ConflictError((err as Error).message); // no free slot left in the horizon
  }
  if (Date.parse(iso) < Date.now() - 60_000) {
    throw new BadInputError(`${formatLocal(iso)} is in the past. Pick a future time, use "next", or publish it now.`);
  }
  return iso;
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
