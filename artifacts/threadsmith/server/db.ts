// SQLite via Node's built-in node:sqlite — no native build step, one file on disk.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env.ts";

mkdirSync(path.join(env.dataDir, "media"), { recursive: true });

export const db = new DatabaseSync(path.join(env.dataDir, "threadsmith.db"));
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

// Append-only list; index + 1 is the schema version stored in PRAGMA user_version.
const MIGRATIONS = [
  `
  CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    title TEXT,
    status TEXT NOT NULL,
    thread TEXT NOT NULL,
    scheduled_at TEXT,
    published_at TEXT,
    error TEXT,
    x_post_ids TEXT NOT NULL DEFAULT '[]',
    url TEXT,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX posts_status_time ON posts(status, scheduled_at);

  CREATE TABLE media (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    alt TEXT,
    path TEXT NOT NULL,
    x_media_id TEXT,
    x_media_expires_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    at TEXT NOT NULL,
    ok INTEGER NOT NULL,
    detail TEXT
  );

  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE idempotency (key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL);

  CREATE TABLE webhooks (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_status INTEGER,
    last_error TEXT,
    last_at TEXT
  );

  CREATE TABLE push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    keys TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    label TEXT NOT NULL,
    handle TEXT,
    profile_url TEXT,
    max_chars INTEGER,
    credentials TEXT NOT NULL,
    last_error TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE post_targets (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    thread TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    external_ids TEXT NOT NULL DEFAULT '[]',
    url TEXT,
    error TEXT,
    published_at TEXT,
    PRIMARY KEY (post_id, account_id)
  );
  CREATE INDEX post_targets_account ON post_targets(account_id);
  `,
];

const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
for (let v = current; v < MIGRATIONS.length; v++) {
  db.exec("BEGIN");
  try {
    db.exec(MIGRATIONS[v]!);
    db.exec(`PRAGMA user_version = ${v + 1}`);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const kv = {
  get<T>(key: string): T | undefined {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  },
  set(key: string, value: unknown) {
    db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
      key,
      JSON.stringify(value),
    );
  },
};
