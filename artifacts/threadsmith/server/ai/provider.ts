// Claude for the operator, through the official Anthropic SDK: which model, whether a key is set, model capabilities.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.ts";

type Provider = { kind: "anthropic"; model: string } | { kind: "none"; reason: string };

function resolveProvider(): Provider {
  const claudeKey = env.ai.anthropicKey ?? process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  if (!claudeKey) {
    return { kind: "none", reason: "No Claude API key: set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) in .env, then restart." };
  }
  return { kind: "anthropic", model: env.ai.model ?? "claude-opus-5-5" };
}

const provider = resolveProvider();

export function aiStatus(): { configured: boolean; provider: string | null; model: string | null } {
  return provider.kind === "none"
    ? { configured: false, provider: null, model: null }
    : { configured: true, provider: provider.kind, model: provider.model };
}

export class AiError extends Error {
  constructor(
    readonly code: "ai_not_configured" | "ai_error",
    message: string,
  ) {
    super(message);
  }
}

// ---------- Claude (Anthropic SDK) ----------

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

/** A Claude client for other features (the operator), credentials from the environment. Throws AiError without a key. */
export function createClaudeClient(options: ConstructorParameters<typeof Anthropic>[0] = {}): Anthropic {
  if (provider.kind === "none") throw new AiError("ai_not_configured", provider.reason);
  return new Anthropic(options);
}

/** Whether the configured model accepts `output_config.effort` (asked once via the Models API). */
export function modelSupportsEffort(c: Anthropic): Promise<boolean> {
  if (provider.kind === "none") return Promise.resolve(false);
  return supportsLowEffort(c, provider.model);
}
