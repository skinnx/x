// Copilot routes mounted at /api/ai: notes → thread, rewrite, alternative hooks, fit to the limit, alt text,
// adapt a thread for another platform.
import { createRoute, z } from "@hono/zod-openapi";
import { PLATFORM_IDS } from "../../shared/types.ts";
import { createRouter, errorResponse } from "../http.ts";
import * as copilot from "./copilot.ts";
import { AiError, type AiErrorCode, requireAi } from "./provider.ts";

const STATUS: Record<AiErrorCode, 409 | 422 | 502> = { ai_not_configured: 409, ai_refused: 422, ai_error: 502 };

const AiErrorSchema = z
  .object({ error: z.enum(["ai_not_configured", "ai_refused", "ai_error"]), message: z.string() })
  .openapi("AiError");
const errorResponses = {
  409: {
    description: "`ai_not_configured`: no AI provider is set up on this server (check `GET /api/health` → `ai.configured`). Write the text yourself instead.",
    content: { "application/json": { schema: AiErrorSchema } },
  },
  422: { description: "`ai_refused`: the model declined this request.", content: { "application/json": { schema: AiErrorSchema } } },
  502: {
    description: "`ai_error`: the AI provider failed or returned unusable output. Safe to retry once.",
    content: { "application/json": { schema: AiErrorSchema } },
  },
};

const route = <Req extends z.ZodObject, Res extends z.ZodObject>(path: string, summary: string, description: string, request: Req, response: Res) =>
  createRoute({
    method: "post",
    path,
    tags: ["AI"],
    summary,
    description,
    request: { body: { required: true, content: { "application/json": { schema: request } } } },
    responses: { 200: { description: "Result", content: { "application/json": { schema: response } } }, ...errorResponses },
  });

const Text = z.string().min(1).max(50_000);

export const aiRoutes = createRouter();

aiRoutes.onError((err, c) => (err instanceof AiError ? c.json({ error: err.code, message: err.message }, STATUS[err.code]) : errorResponse(err, c)));
aiRoutes.use("*", async (_c, next) => {
  requireAi();
  await next();
});

aiRoutes.openapi(
  route(
    "/threadify",
    "Turn notes or an article into a thread",
    "Splits and rewrites free text into X posts, each within the configured character limit (X's weighted count), in the author's voice and language. " +
      "Returns the posts only; nothing is saved. To keep it, `POST /api/posts` with `thread` or with the posts joined by `---` lines.",
    z.object({
      text: Text.describe("Notes, an outline or an article"),
      instructions: z.string().max(2000).optional().describe('Optional steer, e.g. "max 5 posts, casual tone"'),
    }),
    z.object({ posts: z.array(z.string()) }),
  ),
  async (c) => c.json(await copilot.threadify(c.req.valid("json")), 200),
);

aiRoutes.openapi(
  route(
    "/rewrite",
    "Rewrite text following an instruction",
    "Rewrites a post or a `---` thread (e.g. \"punchier\", \"translate to English\", \"more concrete\"). Thread format and the per-post limit are preserved. Nothing is saved.",
    z.object({ text: Text, instruction: z.string().min(1).max(2000) }),
    z.object({ text: z.string() }),
  ),
  async (c) => c.json(await copilot.rewrite(c.req.valid("json")), 200),
);

aiRoutes.openapi(
  route(
    "/hooks",
    "Suggest alternative opening posts",
    "Returns `count` alternative first posts (hooks) for a post or thread, each taking a different angle and fitting the limit. Use one to replace the first segment.",
    z.object({ text: Text.describe("The thread (or post) the hook opens"), count: z.number().int().min(1).max(5).default(3) }),
    z.object({ variants: z.array(z.string()) }),
  ),
  async (c) => c.json(await copilot.hooks(c.req.valid("json")), 200),
);

aiRoutes.openapi(
  route(
    "/fit",
    "Shorten text to fit the character limit",
    "Shortens each post that is over the limit (X's weighted count: CJK, emoji and Vietnamese letters such as ạ, ấ, ệ, ố, ữ count 2, links 23). " +
      "Posts that already fit are returned unchanged. `maxChars` overrides the configured limit, e.g. to leave room for a quote.",
    z.object({ text: Text, maxChars: z.number().int().min(20).max(25_000).optional() }),
    z.object({ text: z.string() }),
  ),
  async (c) => c.json(await copilot.fit(c.req.valid("json")), 200),
);

aiRoutes.openapi(
  route(
    "/alt-text",
    "Describe an uploaded image as alt text",
    "Writes screen-reader alt text (≤1000 characters, X's limit) for an image uploaded via `POST /api/media`, in the language of the post it is attached to. " +
      "Not saved automatically: store it with `PATCH /api/media/{id}` `{alt}`.",
    z.object({ mediaId: z.string().min(1) }),
    z.object({ alt: z.string() }),
  ),
  async (c) => c.json(await copilot.altText(c.req.valid("json")), 200),
);

aiRoutes.openapi(
  route(
    "/adapt",
    "Rewrite a thread for another platform",
    "Adapts a `---` thread (`text`) or a saved post's thread (`postId`) for one platform: its character limit and counting rules (the account's own limit when " +
      "`accountId` is given), and its conventions (Mastodon hashtags, LinkedIn's \"see more\" fold…). LinkedIn returns exactly one post; other platforms may get " +
      "fewer, longer items or more, shorter ones. Every item is guaranteed to fit. Nothing is saved: store the result as that destination's version, " +
      "`PATCH /api/posts/{id}` `{targets: [{accountId, thread: [{text}…]}]}`.",
    z
      .object({
        text: Text.optional().describe("The thread, posts separated by lines containing only ---"),
        postId: z.string().min(1).optional().describe("Or a saved post: its own thread is adapted"),
        platform: z.enum(PLATFORM_IDS).optional().describe("Target platform; may be omitted when accountId is given"),
        accountId: z.string().min(1).optional().describe("Use this connected account's limit (e.g. X Premium, a Mastodon instance's own)"),
      })
      .refine((b) => (b.text === undefined) !== (b.postId === undefined), "send either `text` or `postId`")
      .refine((b) => b.platform || b.accountId, "send `platform` or `accountId`"),
    z.object({ posts: z.array(z.string()) }),
  ),
  async (c) => c.json(await copilot.adapt(c.req.valid("json")), 200),
);
