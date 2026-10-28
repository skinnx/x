// Single process: HTTP server + scheduler loop + event fan-out (webhooks, web push).
import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { getConfig } from "./config.ts";
import { env, publicUrl, VERSION, xConfigured } from "./env.ts";
import { startPush } from "./push.ts";
import { recoverInterrupted } from "./repo.ts";
import { startScheduler } from "./scheduler.ts";
import { startWebhooks } from "./webhooks.ts";

const config = getConfig();
const recovered = recoverInterrupted();
if (recovered) console.warn(`⚠ ${recovered} post(s) were mid-publish when the process stopped; marked failed for review.`);

startWebhooks();
startPush();
const stopScheduler = startScheduler();

const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host }, () => {
  console.log(`Threadsmith ${VERSION} → ${publicUrl()}`);
  console.log(`  timezone ${config.timezone} · publishing: ${xConfigured ? "X API v2" : "manual (notify + copy) — add X keys to .env to auto-post"}`);
  console.log(`  API docs ${publicUrl()}/docs · MCP ${publicUrl()}/mcp · agents ${publicUrl()}/llms.txt`);
  if (!env.authToken && env.host !== "127.0.0.1" && env.host !== "localhost") {
    console.warn("⚠ Listening beyond localhost without AUTH_TOKEN — anyone who can reach this port can post as you.");
  }
});

function shutdown() {
  stopScheduler();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
