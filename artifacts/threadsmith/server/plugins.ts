// Plugin loader and registry. Platforms and approval channels exist only as plugins: the built-in ones in plugins/,
// extra ones from <DATA_DIR>/plugins/ and threadsmith.config.json → plugins.load. Each plugin directory has a
// package.json with a "threadsmith" key ({ apiVersion, entry? }) and an entry module whose default export receives
// the ThreadsmithAPI (see server/plugin-api.ts). A plugin that fails to load is skipped and reported (GET /api/plugins);
// it never takes the server down.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Account } from "../shared/types.ts";
import { getConfig } from "./config.ts";
import { db, kv } from "./db.ts";
import { env, publicUrl, ROOT } from "./env.ts";
import { bus } from "./events.ts";
import { signedMediaUrl } from "./media.ts";
import {
  PLUGIN_API_VERSION,
  type ChannelDefinition,
  type PlatformDefinition,
  type PlatformInfo,
  type PluginFactory,
  type ThreadsmithAPI,
} from "./plugin-api.ts";
import { getMedia, NotFoundError, readMediaBytes } from "./repo.ts";

/** Thrown by platforms (ts.PlatformError): a message the person can act on, and whether Retry may resume. */
export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly resumable = true,
  ) {
    super(message);
  }
}

export interface PluginRecord {
  name: string;
  version: string;
  description: string | null;
  source: "built-in" | "data" | "config";
  dir: string;
  platforms: string[];
  channels: string[];
  /** Why it isn't loaded (bad manifest, wrong apiVersion, its factory threw…); null when it is. */
  error: string | null;
  disabled: boolean;
}

const plugins: PluginRecord[] = [];
const platforms = new Map<string, PlatformDefinition>();
const channels = new Map<string, ChannelDefinition>();

const ID = /^[a-z][a-z0-9-]{0,31}$/;

const Manifest = z.object({
  name: z.string().min(1),
  version: z.string().default("0.0.0"),
  description: z.string().optional(),
  threadsmith: z.object({ apiVersion: z.number().int(), entry: z.string().optional() }),
});

// ---------- registry (what the rest of the server uses) ----------

/** A loaded platform, or a clear error naming what's missing (e.g. an account whose plugin was removed). */
export function platform(id: string): PlatformDefinition {
  const p = platforms.get(id);
  if (!p) throw new NotFoundError(`No plugin provides the platform "${id}". Loaded: ${[...platforms.keys()].join(", ") || "none"}.`);
  return p;
}

export const hasPlatform = (id: string) => platforms.has(id);
export const listPlatforms = (): PlatformDefinition[] => [...platforms.values()];
export const listChannels = (): ChannelDefinition[] => [...channels.values()];
export const listPlugins = (): PluginRecord[] => plugins.map((p) => ({ ...p }));

/** A platform's display name, falling back to its id when its plugin isn't loaded (history stays readable). */
export const platformName = (id: string) => platforms.get(id)?.name ?? id;

/** How a platform threads; "replies" when its plugin isn't loaded (it can't publish then anyway). */
export const threadModeOf = (id: string) => platforms.get(id)?.threadMode ?? "replies";

/** The serializable part of a platform: what GET /api/platforms returns. */
export function platformInfo(p: PlatformDefinition): PlatformInfo & { hasMetrics: boolean } {
  return {
    id: p.id,
    name: p.name,
    maxChars: p.maxChars,
    ...(p.maxCharsWithMedia ? { maxCharsWithMedia: p.maxCharsWithMedia } : {}),
    maxImages: p.maxImages,
    ...(p.imageTypes ? { imageTypes: p.imageTypes } : {}),
    ...(p.maxImageBytes ? { maxImageBytes: p.maxImageBytes } : {}),
    threadMode: p.threadMode,
    counting: p.counting,
    costNote: p.costNote,
    setup: p.setup,
    credentials: p.credentials,
    ...(p.metricsNote ? { metricsNote: p.metricsNote } : {}),
    ...(p.metricsPaid ? { metricsPaid: true } : {}),
    ...(p.brand ? { brand: p.brand } : {}),
    hasMetrics: typeof p.metrics === "function",
  };
}

/** The text items a thread becomes on a platform (threadMode "single" joins them into one). */
export function itemsFor(p: Pick<PlatformInfo, "threadMode">, thread: { text: string; mediaIds: string[] }[]) {
  if (p.threadMode !== "single" || thread.length <= 1) return thread;
  return [{ text: thread.map((s) => s.text.trim()).filter(Boolean).join("\n\n"), mediaIds: thread.flatMap((s) => s.mediaIds) }];
}

// ---------- loading ----------

function apiFor(record: PluginRecord): ThreadsmithAPI {
  const prefix = `[${record.name}]`;
  const storeKey = (key: string) => `plugin:${record.name}:${key}`;
  return {
    apiVersion: PLUGIN_API_VERSION,
    plugin: { name: record.name, version: record.version, dir: record.dir },
    registerPlatform(def) {
      if (!ID.test(def.id)) throw new Error(`platform id "${def.id}" must be lowercase letters, digits or dashes`);
      if (platforms.has(def.id)) throw new Error(`platform "${def.id}" is already provided by another plugin`);
      for (const fn of ["verify", "publish"] as const) if (typeof def[fn] !== "function") throw new Error(`platform "${def.id}" has no ${fn}()`);
      platforms.set(def.id, def);
      record.platforms.push(def.id);
    },
    registerChannel(def) {
      if (!ID.test(def.id)) throw new Error(`channel id "${def.id}" must be lowercase letters, digits or dashes`);
      if (channels.has(def.id)) throw new Error(`channel "${def.id}" is already provided by another plugin`);
      channels.set(def.id, def);
      record.channels.push(def.id);
    },
    on: (listener) => bus.on(listener),
    env: (name) => process.env[name]?.trim() || undefined,
    settings: () => (getConfig().plugins.settings[record.name] as Record<string, unknown> | undefined) ?? {},
    host: () => ({ timezone: getConfig().timezone, maxChars: getConfig().maxChars, publicUrl: publicUrl(), publicUrlIsSet: Boolean(env.publicUrl) }),
    store: { get: (key) => kv.get(storeKey(key)), set: (key, value) => kv.set(storeKey(key), value) },
    media: {
      get: (id) => {
        const m = getMedia(id);
        return m ? { id: m.id, filename: m.filename, mime: m.mime, size: m.size, alt: m.alt } : undefined;
      },
      read: readMediaBytes,
      publicUrl: (id) => signedMediaUrl(id),
    },
    log: {
      info: (m) => console.log(prefix, m),
      warn: (m) => console.warn(prefix, m),
      error: (m) => console.error(prefix, m),
    },
    PlatformError,
  };
}

/** Plugin directories one level below `dir` (each with a package.json), sorted for a stable load order. */
function pluginDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith("."))
    .map((n) => path.join(dir, n))
    .filter((d) => statSync(d).isDirectory() && existsSync(path.join(d, "package.json")))
    .sort();
}

/** A config entry: a path (relative to the config file) or an installed package name. */
function resolveEntry(spec: string): string {
  if (spec.startsWith(".") || path.isAbsolute(spec)) return path.resolve(path.dirname(env.configPath), spec);
  const pkg = createRequire(path.join(ROOT, "package.json")).resolve(`${spec}/package.json`);
  return path.dirname(pkg);
}

async function loadOne(dir: string, source: PluginRecord["source"], disabled: Set<string>): Promise<void> {
  const record: PluginRecord = { name: path.basename(dir), version: "0.0.0", description: null, source, dir, platforms: [], channels: [], error: null, disabled: false };
  plugins.push(record);
  try {
    const manifest = Manifest.parse(JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")));
    Object.assign(record, { name: manifest.name, version: manifest.version, description: manifest.description ?? null });
    if (plugins.some((p) => p !== record && p.name === record.name)) throw new Error(`a plugin named ${record.name} is already loaded`);
    if (disabled.has(record.name)) {
      record.disabled = true;
      return;
    }
    if (manifest.threadsmith.apiVersion !== PLUGIN_API_VERSION) {
      throw new Error(`written for plugin API ${manifest.threadsmith.apiVersion}; this Threadsmith provides ${PLUGIN_API_VERSION}`);
    }
    const entry = path.resolve(dir, manifest.threadsmith.entry ?? (existsSync(path.join(dir, "index.ts")) ? "index.ts" : "index.js"));
    const mod = (await import(pathToFileURL(entry).href)) as { default?: PluginFactory };
    if (typeof mod.default !== "function") throw new Error(`${path.relative(dir, entry)} has no default export function`);
    const before = { platforms: [...platforms.keys()], channels: [...channels.keys()] };
    try {
      await mod.default(apiFor(record));
    } catch (err) {
      // Half-registered plugins are taken out again: all or nothing.
      for (const id of record.platforms) if (!before.platforms.includes(id)) platforms.delete(id);
      for (const id of record.channels) if (!before.channels.includes(id)) channels.delete(id);
      record.platforms = [];
      record.channels = [];
      throw err;
    }
    // A platform or channel can be switched off on its own by id.
    for (const id of record.platforms) if (disabled.has(id)) platforms.delete(id);
    for (const id of record.channels) if (disabled.has(id)) channels.delete(id);
  } catch (err) {
    record.error = err instanceof z.ZodError ? `package.json: ${z.prettifyError(err)}` : (err as Error).message;
    console.warn(`⚠ plugin ${record.name} not loaded: ${record.error}`);
  }
}

let loaded = false;

/** Load every plugin once, at startup, before the server takes requests. */
export async function loadPlugins(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const { load, disable } = getConfig().plugins;
  const disabled = new Set(disable);
  for (const dir of pluginDirs(path.join(ROOT, "plugins"))) await loadOne(dir, "built-in", disabled);
  for (const dir of pluginDirs(path.join(env.dataDir, "plugins"))) await loadOne(dir, "data", disabled);
  for (const spec of load) {
    let dir: string;
    try {
      dir = resolveEntry(spec);
    } catch (err) {
      plugins.push({ name: spec, version: "", description: null, source: "config", dir: "", platforms: [], channels: [], error: `can't find it: ${(err as Error).message}`, disabled: false });
      console.warn(`⚠ plugin ${spec} not found`);
      continue;
    }
    await loadOne(dir, "config", disabled);
  }
  // Accounts whose platform no plugin provides can't publish; say so where the person looks.
  for (const row of db.prepare("SELECT id, platform FROM accounts WHERE removed_at IS NULL").all() as Pick<Account, "id" | "platform">[]) {
    if (!platforms.has(row.platform)) {
      db.prepare("UPDATE accounts SET last_error = ? WHERE id = ?").run(`No loaded plugin provides "${row.platform}"; posts to this account will fail until it is installed or enabled.`, row.id);
    }
  }
}
