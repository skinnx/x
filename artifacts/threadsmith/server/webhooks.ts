// Outbound webhooks: every bus event is POSTed, HMAC-signed, to each subscribed URL. Failures never reach the bus.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { APP_EVENT_TYPES, type AppEventType } from "../shared/types.ts";
import { db } from "./db.ts";
import { bus } from "./events.ts";
import { NotFoundError } from "./repo.ts";

export interface Webhook {
  id: string;
  url: string;
  events: AppEventType[];
  createdAt: string;
  lastStatus: number | null;
  lastError: string | null;
  lastAt: string | null;
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null; // HTTP status of the last attempt; null when the request never got a response
  error: string | null;
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  events: string;
  created_at: string;
  last_status: number | null;
  last_error: string | null;
  last_at: string | null;
}

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [2_000, 10_000]; // 3 attempts in total

const toWebhook = (r: WebhookRow): Webhook => ({
  id: r.id,
  url: r.url,
  events: JSON.parse(r.events),
  createdAt: r.created_at,
  lastStatus: r.last_status,
  lastError: r.last_error,
  lastAt: r.last_at,
});

const rows = () => db.prepare("SELECT * FROM webhooks ORDER BY created_at").all() as unknown as WebhookRow[];

function requireRow(id: string): WebhookRow {
  const row = db.prepare("SELECT * FROM webhooks WHERE id = ?").get(id) as WebhookRow | undefined;
  if (!row) throw new NotFoundError(`Webhook ${id} not found`);
  return row;
}

export function listWebhooks(): Webhook[] {
  return rows().map(toWebhook);
}

/** The secret is returned only here; receivers use it to verify `X-Threadsmith-Signature`. */
export function createWebhook(input: { url: string; events?: AppEventType[] }): Webhook & { secret: string } {
  const id = randomUUID();
  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const events = input.events?.length ? [...new Set(input.events)] : APP_EVENT_TYPES;
  db.prepare("INSERT INTO webhooks (id, url, secret, events, created_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    input.url,
    secret,
    JSON.stringify(events),
    new Date().toISOString(),
  );
  return { ...toWebhook(requireRow(id)), secret };
}

export function deleteWebhook(id: string): void {
  requireRow(id);
  db.prepare("DELETE FROM webhooks WHERE id = ?").run(id);
}

/** Sends one `ping` delivery (no retries) and reports how the endpoint answered. */
export function testWebhook(id: string): Promise<DeliveryResult> {
  return deliver(requireRow(id), "ping", { webhookId: id, message: "Threadsmith webhook test" }, 1);
}

const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

async function attempt(url: string, body: string, headers: Record<string, string>): Promise<DeliveryResult> {
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = res.ok ? "" : (await res.text().catch(() => "")).trim().slice(0, 200);
    await res.body?.cancel().catch(() => {});
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}${text ? `: ${text}` : ""}` };
  } catch (err) {
    const e = err as Error & { cause?: Error };
    const error = e.name === "TimeoutError" ? `no response within ${TIMEOUT_MS / 1000}s` : (e.cause?.message ?? e.message);
    return { ok: false, status: null, error };
  }
}

async function deliver(hook: WebhookRow, type: string, data: unknown, maxAttempts = 1 + RETRY_DELAYS_MS.length): Promise<DeliveryResult> {
  const id = randomUUID();
  const body = JSON.stringify({ id, type, createdAt: new Date().toISOString(), data });
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "Threadsmith-Webhooks",
    "X-Threadsmith-Event": type,
    "X-Threadsmith-Delivery": id,
    "X-Threadsmith-Signature": sign(hook.secret, body),
  };
  for (let n = 1; ; n++) {
    const result = await attempt(hook.url, body, headers);
    db.prepare("UPDATE webhooks SET last_status = ?, last_error = ?, last_at = ? WHERE id = ?").run(
      result.status,
      result.error,
      new Date().toISOString(),
      hook.id,
    );
    // Other 4xx answers (bad URL, auth) won't fix themselves within seconds.
    const retryable = result.status === null || result.status >= 500 || result.status === 408 || result.status === 429;
    if (result.ok || !retryable || n >= maxAttempts) return result;
    await sleep(RETRY_DELAYS_MS[n - 1]);
  }
}

let started = false;

export function startWebhooks(): void {
  if (started) return;
  started = true;
  bus.on((event) => {
    try {
      const { type, ...data } = event;
      for (const hook of rows()) {
        if (!(JSON.parse(hook.events) as string[]).includes(type)) continue;
        deliver(hook, type, data).catch((err) => console.error(`webhook ${hook.url}:`, err));
      }
    } catch (err) {
      console.error("webhooks:", err);
    }
  });
}
