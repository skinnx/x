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

/** Accepts `Authorization: Bearer <token>`, the `threadsmith_token` cookie (img/EventSource), or `?token=`. */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!env.authToken) return next();
  const header = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const supplied = header ?? getCookie(c, AUTH_COOKIE) ?? c.req.query("token");
  if (supplied && same(supplied, env.authToken)) return next();
  return c.json({ error: "unauthorized", message: "Send Authorization: Bearer <AUTH_TOKEN>" }, 401);
};
