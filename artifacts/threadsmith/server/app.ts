// Composes every surface into one Hono app on one port: REST + OpenAPI, MCP, llms.txt, media, web UI.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { OpenAPIHono } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { aiRoutes } from "./ai/routes.ts";
import { apiRoutes, mediaFileRoutes } from "./api.ts";
import { requireAuth } from "./auth.ts";
import { ROOT } from "./env.ts";
import { errorResponse } from "./http.ts";
import { llmsRoutes } from "./llms.ts";
import { mcpRoutes } from "./mcp.ts";
import { pushRoutes } from "./push.ts";

const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string };
export const VERSION = pkg.version;

export const app = new OpenAPIHono();
app.onError(errorResponse);

app.use("/api/*", requireAuth);
app.use("/mcp", requireAuth);
app.use("/mcp/*", requireAuth);
app.use("/media/*", requireAuth);

app.route("/api", apiRoutes);
app.route("/api/push", pushRoutes);
app.route("/api/ai", aiRoutes);
app.route("/media", mediaFileRoutes);
app.route("/mcp", mcpRoutes);
app.route("/", llmsRoutes);

app.openAPIRegistry.registerComponent("securitySchemes", "bearer", { type: "http", scheme: "bearer" });
app.doc31("/openapi.json", (c) => ({
  openapi: "3.1.0",
  info: {
    title: "Threadsmith API",
    version: VERSION,
    description:
      "Compose, queue and publish X threads. Every UI action is available here, over MCP at /mcp, and via the `threadsmith` CLI. " +
      "Threads are arrays of segments, or one string with lines of `---` between posts. Send `Idempotency-Key` on POSTs you might retry.",
  },
  servers: [{ url: new URL(c.req.url).origin }],
  security: [{ bearer: [] }],
}));
app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "Threadsmith API" }));

// Built web UI (vite build → dist/web). In dev, Vite serves the UI on :5173 and proxies here.
const webDir = path.join(ROOT, "dist", "web");
if (existsSync(webDir)) {
  app.use("/*", serveStatic({ root: webDir }));
  app.get("*", (c) => c.html(readFileSync(path.join(webDir, "index.html"), "utf8")));
} else {
  app.get("/", (c) =>
    c.text("Threadsmith API is running. Build the UI with `pnpm build`, or run `pnpm dev` and open http://localhost:5173."),
  );
}
