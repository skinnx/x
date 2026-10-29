// LLM provider for the copilot: Claude through the official Anthropic SDK.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "../env.ts";

type Provider = { kind: "anthropic"; model: string } | { kind: "none"; reason: string };

function resolveProvider(): Provider {
  const claudeKey = env.ai.anthropicKey ?? process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (!claudeKey) {
    return { kind: "none", reason: "The AI copilot is off. Set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) in .env, then restart." };
  }
  return { kind: "anthropic", model: env.ai.model ?? "claude-opus-5-5" };
}

const provider = resolveProvider();

export function aiStatus(): { configured: boolean; provider: string | null; model: string | null } {
  return provider.kind === "none"
    ? { configured: false, provider: null, model: null }
    : { configured: true, provider: provider.kind, model: provider.model };
}

export type AiErrorCode = "ai_not_configured" | "ai_refused" | "ai_error";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function requireAi(): void {
  if (provider.kind === "none") throw new AiError("ai_not_configured", provider.reason);
}

export interface GenerateRequest<T> {
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  image?: { mime: string; data: Buffer };
}

/** One structured completion: system + prompt (+ optional image) → JSON validated against `schema`. */
export async function generate<T>(req: GenerateRequest<T>): Promise<T> {
  if (provider.kind === "none") throw new AiError("ai_not_configured", provider.reason);
  return viaAnthropic(provider.model, req);
}

// ---------- Claude (Anthropic SDK) ----------

let client: Anthropic | undefined;
let effortSupport: Promise<boolean> | undefined;

/**
 * Older models (e.g. claude-haiku-4-5, claude-sonnet-4-5) reject `effort`, so ask the Models API once.
 * If it can't answer, assume a current model, and ask again in 5 minutes (never, if the endpoint said 404).
 */
function supportsLowEffort(c: Anthropic, model: string): Promise<boolean> {
  effortSupport ??= c.models.retrieve(model, {}, { timeout: 10_000, maxRetries: 0 }).then(
    (m) => (m.capabilities?.effort ? m.capabilities.effort.supported && m.capabilities.effort.low.supported : true),
    (err) => {
      if (!(err instanceof Anthropic.NotFoundError)) setTimeout(() => (effortSupport = undefined), 300_000).unref();
      return true;
    },
  );
  return effortSupport;
}

async function viaAnthropic<T>(model: string, req: GenerateRequest<T>): Promise<T> {
  // One retry, not the SDK's two: a stalled upstream then fails in ~4 min, before HTTP clients (undici: 300 s) give up on us.
  client ??= new Anthropic({ timeout: 120_000, maxRetries: 1 }); // ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN from the environment
  const format = betaZodOutputFormat(req.schema);
  const effort = (await supportsLowEffort(client, model)) ? { effort: "low" as const } : {};
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (req.image) {
    const media_type = req.image.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    content.push({ type: "image", source: { type: "base64", media_type, data: req.image.data.toString("base64") } });
  }
  content.push({ type: "text", text: req.prompt });

  let msg: Anthropic.Beta.BetaMessage;
  try {
    msg = await client.beta.messages.create({
      model,
      max_tokens: 16_000, // thinking counts toward this; replies themselves are short
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      output_config: { ...effort, format },
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError("ai_error", "Anthropic rejected the API key; check ANTHROPIC_API_KEY.");
    if (err instanceof Anthropic.RateLimitError) throw new AiError("ai_error", "Anthropic rate limit reached; try again in a minute.");
    if (err instanceof Anthropic.APIError) throw new AiError("ai_error", `Anthropic API error${err.status ? ` ${err.status}` : ""}: ${err.message}`);
    throw err;
  }
  if (msg.stop_reason === "refusal") {
    const why = msg.stop_details?.explanation ?? msg.stop_details?.category;
    throw new AiError("ai_refused", `Claude declined this request${why ? ` (${why})` : ""}. Rephrase it or edit by hand.`);
  }
  if (msg.stop_reason === "max_tokens") throw new AiError("ai_error", "The reply was cut off; try a shorter input.");
  const text = msg.content.filter((b) => b.type === "text").at(-1)?.text;
  if (!text) throw new AiError("ai_error", "Claude returned no text.");
  try {
    return format.parse(text);
  } catch {
    throw new AiError("ai_error", "Claude returned output that doesn't match the expected format.");
  }
}
