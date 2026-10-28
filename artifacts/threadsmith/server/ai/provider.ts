// LLM providers for the copilot: Claude through the official Anthropic SDK (default when a key is set),
// or any OpenAI-compatible /chat/completions endpoint for local or non-Claude models (Ollama, LM Studio, vLLM…).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { env } from "../env.ts";

type Provider =
  | { kind: "anthropic"; model: string }
  | { kind: "openai-compatible"; model: string; baseUrl: string; apiKey?: string }
  | { kind: "none"; reason: string };

function resolveProvider(): Provider {
  const name = env.ai.provider?.toLowerCase();
  const claudeKey = env.ai.anthropicKey ?? process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (name === "openai-compatible" || name === "openai" || (!name && !claudeKey && env.ai.baseUrl)) {
    const { baseUrl, model } = env.ai;
    if (!baseUrl || !model) {
      return { kind: "none", reason: "AI_PROVIDER=openai-compatible needs AI_BASE_URL and AI_MODEL (Ollama: http://localhost:11434/v1 and e.g. llama3.3)." };
    }
    // Claude is only ever called through the official SDK.
    if (/claude/i.test(model) || /anthropic\.com/i.test(baseUrl)) {
      return { kind: "none", reason: "For Claude models set ANTHROPIC_API_KEY (and optionally AI_MODEL) instead of AI_PROVIDER=openai-compatible." };
    }
    return { kind: "openai-compatible", model, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey: env.ai.apiKey };
  }
  if (name && name !== "anthropic" && name !== "claude") {
    return { kind: "none", reason: `Unknown AI_PROVIDER "${env.ai.provider}". Use "anthropic" or "openai-compatible".` };
  }
  if (!claudeKey) {
    return {
      kind: "none",
      reason:
        "The AI copilot is off. Set ANTHROPIC_API_KEY for Claude, or AI_PROVIDER=openai-compatible with AI_BASE_URL and AI_MODEL for a local model such as Ollama, then restart.",
    };
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
  return provider.kind === "anthropic" ? viaAnthropic(provider.model, req) : viaOpenAICompatible(provider, req);
}

// ---------- Claude (Anthropic SDK) ----------

let client: Anthropic | undefined;

async function viaAnthropic<T>(model: string, req: GenerateRequest<T>): Promise<T> {
  client ??= new Anthropic({ timeout: 120_000 }); // ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN from the environment
  const format = betaZodOutputFormat(req.schema);
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
      output_config: { effort: "low", format },
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

// ---------- OpenAI-compatible endpoints (never used for Claude) ----------

async function viaOpenAICompatible<T>(p: Extract<Provider, { kind: "openai-compatible" }>, req: GenerateRequest<T>): Promise<T> {
  const schema = z.toJSONSchema(req.schema);
  const user = req.image
    ? [
        { type: "text", text: req.prompt },
        { type: "image_url", image_url: { url: `data:${req.image.mime};base64,${req.image.data.toString("base64")}` } },
      ]
    : req.prompt;
  const body = {
    model: p.model,
    messages: [
      { role: "system", content: `${req.system}\n\nReply with only a JSON object matching this JSON schema:\n${JSON.stringify(schema)}` },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: { name: "result", schema, strict: true } },
  };
  const post = (payload: object) =>
    fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(p.apiKey ? { authorization: `Bearer ${p.apiKey}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    });

  let res: Response;
  try {
    res = await post(body);
    // Some servers don't support json_schema response formats; the prompt alone usually suffices.
    if (res.status === 400) res = await post({ ...body, response_format: undefined });
  } catch (err) {
    throw new AiError("ai_error", `Could not reach ${p.baseUrl}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new AiError("ai_error", `${p.baseUrl} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
  const raw = (data.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const parsed = (() => {
    try {
      return req.schema.safeParse(JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
    } catch {
      return undefined;
    }
  })();
  if (!parsed?.success) throw new AiError("ai_error", `${p.model} returned output that doesn't match the expected format.`);
  return parsed.data;
}
