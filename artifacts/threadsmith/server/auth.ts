// Optional single shared token for VPS deployments. No users, no accounts.
import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { env } from "./env.ts";

export const AUTH_COOKIE = "threadsmith_token";

function same(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const LOOPBACK = ["localhost", "127.0.0.1", "[::1]"];

function allowedHosts(): Set<string> {
  const hosts = new Set([...LOOPBACK, ...env.allowedHosts]);
  if (env.host !== "0.0.0.0" && env.host !== "::") hosts.add(env.host.toLowerCase());
  if (env.publicUrl) hosts.add(new URL(env.publicUrl).hostname.toLowerCase());
  return hosts;
}

const hostname = (hostHeader: string) => hostHeader.toLowerCase().replace(/:\d+$/, "");

/**
 * Runs before everything else. Without AUTH_TOKEN the server trusts whoever can reach it, so it only answers
 * to known Host names (stops DNS-rebinding attacks from web pages). Writes carrying a foreign Origin are refused
 * either way (cross-site request forgery). Agents and CLIs send no Origin and are unaffected.
 */
export const guardRequest: MiddlewareHandler = async (c, next) => {
  const allowed = allowedHosts();
  const host = c.req.header("host") ?? "";
  if (!env.authToken && !allowed.has(hostname(host))) {
    return c.json({ error: "forbidden_host", message: `Host "${host}" is not allowed. Set PUBLIC_URL, ALLOWED_HOSTS or AUTH_TOKEN.` }, 403);
  }
  const origin = c.req.header("origin");
  if (origin && !["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    let originUrl: URL | undefined;
    try {
      originUrl = new URL(origin);
    } catch {
      // "null" or garbage: treat as foreign
    }
    if (!originUrl || (originUrl.host !== host && !allowed.has(originUrl.hostname.toLowerCase()))) {
      return c.json({ error: "forbidden_origin", message: `Cross-site request from ${origin} refused.` }, 403);
    }
  }
  return next();
};

/** Accepts `Authorization: Bearer <token>`, the `threadsmith_token` cookie (img/EventSource), or `?token=`. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!env.authToken) return next();
  const header = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = header ?? getCookie(c, AUTH_COOKIE) ?? c.req.query("token");
  if (supplied && same(supplied, env.authToken)) return next();
  return c.json({ error: "unauthorized", message: "Send Authorization: Bearer <AUTH_TOKEN>" }, 401);
};
