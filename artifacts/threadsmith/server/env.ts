// Environment (.env) — secrets and process settings. Scheduling rules live in threadsmith.config.json.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const VERSION = (JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }).version;

const envFile = path.join(ROOT, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const str = (k: string) => {
  const v = process.env[k]?.trim();
  return v ? v : undefined;
};

export const env = {
  port: Number(str("PORT") ?? 3000),
  host: str("HOST") ?? "127.0.0.1",
  production: process.env.NODE_ENV === "production",
  dataDir: path.resolve(ROOT, str("DATA_DIR") ?? "data"),
  configPath: path.resolve(ROOT, str("CONFIG_PATH") ?? "threadsmith.config.json"),
  /** Public base URL, used in links sent to webhooks/agents/notifications. */
  publicUrl: str("PUBLIC_URL"),
  /** When set, every /api, /mcp and /media request needs `Authorization: Bearer <token>`. */
  authToken: str("AUTH_TOKEN"),
  /** Extra hostnames accepted in the Host header when no AUTH_TOKEN is set (comma-separated). */
  allowedHosts: (str("ALLOWED_HOSTS") ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),

  x: {
    apiKey: str("X_API_KEY"),
    apiSecret: str("X_API_SECRET"),
    accessToken: str("X_ACCESS_TOKEN"),
    accessSecret: str("X_ACCESS_TOKEN_SECRET"),
  },

  ai: {
    /** "anthropic" (default when ANTHROPIC_API_KEY is set) or "openai-compatible" (Ollama, LM Studio, OpenRouter, vLLM…) */
    provider: str("AI_PROVIDER"),
    model: str("AI_MODEL"),
    anthropicKey: str("ANTHROPIC_API_KEY"),
    baseUrl: str("AI_BASE_URL"),
    apiKey: str("AI_API_KEY"),
  },

  vapidSubject: str("VAPID_SUBJECT") ?? "mailto:threadsmith@localhost",
};

if (env.publicUrl) {
  let ok = false;
  try {
    ok = /^https?:$/.test(new URL(env.publicUrl).protocol);
  } catch {
    // reported below
  }
  if (!ok) throw new Error(`PUBLIC_URL must be a full http(s) URL such as https://threads.example.com (got "${env.publicUrl}")`);
  env.publicUrl = env.publicUrl.replace(/\/+$/, "");
}

export const xConfigured = Boolean(env.x.apiKey && env.x.apiSecret && env.x.accessToken && env.x.accessSecret);

export function publicUrl(): string {
  return env.publicUrl ?? `http://${env.host === "0.0.0.0" ? "localhost" : env.host}:${env.port}`;
}
