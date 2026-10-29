// The built-in operator: Claude running unattended with Threadsmith's own MCP tools, following the owner's brief
// (operator.md). It runs on the configured schedule, when the person asks (UI "Run now", Telegram/Discord /run, API),
// and when the person requests changes on one of its posts. Everything it queues goes through the approval gate:
// it acts as an agent (actor agent:operator), so its posts wait for the person like any other agent's.
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { createRoute, z } from "@hono/zod-openapi";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z as zod } from "zod";
import type { OperatorRun, OperatorStatus } from "../shared/types.ts";
import { currentActor, requireOwner, runAs } from "./actor.ts";
import { aiStatus, createClaudeClient, modelSupportsEffort } from "./ai/provider.ts";
import { getConfig, localDateKey, nextLocalTime } from "./config.ts";
import { db } from "./db.ts";
import { ROOT } from "./env.ts";
import { bus } from "./events.ts";
import { createRouter } from "./http.ts";
import { agentTools, instructions } from "./mcp.ts";

const MAX_TOKENS = 16_000; // per response, thinking included; non-streaming stays well inside SDK timeouts

class OperatorError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 429,
  ) {
    super(message);
  }
}

// ---------- storage ----------

interface RunRow {
  id: string;
  trigger: string;
  task: string | null;
  status: OperatorRun["status"];
  started_at: string;
  finished_at: string | null;
  summary: string | null;
  error: string | null;
  tool_calls: number;
}

const toRun = (r: RunRow): OperatorRun => ({
  id: r.id,
  trigger: r.trigger,
  task: r.task,
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  summary: r.summary,
  error: r.error,
  toolCalls: r.tool_calls,
});

function getRun(id: string): OperatorRun | null {
  const row = db.prepare("SELECT * FROM operator_runs WHERE id = ?").get(id) as RunRow | undefined;
  return row ? toRun(row) : null;
}

export function listRuns(limit = 20): OperatorRun[] {
  const n = Math.max(1, Math.min(500, Math.floor(limit) || 20));
  return (db.prepare("SELECT * FROM operator_runs ORDER BY started_at DESC LIMIT ?").all(n) as unknown as RunRow[]).map(toRun);
}

function finishRun(id: string, fields: { status: "done" | "failed"; summary?: string | null; error?: string | null; toolCalls: number }): OperatorRun {
  db.prepare("UPDATE operator_runs SET status = ?, finished_at = ?, summary = ?, error = ?, tool_calls = ? WHERE id = ?").run(
    fields.status,
    new Date().toISOString(),
    fields.summary ?? null,
    fields.error ?? null,
    fields.toolCalls,
    id,
  );
  return getRun(id)!;
}

/** Runs started today (configured timezone). */
function runsToday(): number {
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const today = localDateKey();
  const rows = db.prepare("SELECT started_at FROM operator_runs WHERE started_at >= ?").all(since) as { started_at: string }[];
  return rows.filter((r) => localDateKey(Date.parse(r.started_at)) === today).length;
}

// ---------- status ----------

const briefFile = () => path.resolve(ROOT, getConfig().operator.briefPath);

/** Why the operator can't run at all right now, or null. */
function blocker(): string | null {
  if (!aiStatus().configured) return "No Claude API key: set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) in .env, then restart.";
  const brief = briefFile();
  if (!existsSync(brief)) {
    const name = getConfig().operator.briefPath;
    return `No brief: ${name} doesn't exist. Copy operator.example.md to ${name} and describe what the operator should do.`;
  }
  return null;
}

export function operatorStatus(): OperatorStatus {
  const { operator } = getConfig();
  const reason = blocker();
  const next = operator.enabled && !reason ? nextLocalTime(operator.days, operator.runAt) : null;
  return {
    configured: aiStatus().configured,
    enabled: operator.enabled,
    reason,
    model: aiStatus().model,
    running: current !== null,
    nextRunAt: next?.toISOString() ?? null,
    lastRun: listRuns(1)[0] ?? null,
  };
}

// ---------- queue: one run at a time, later requests coalesce into one follow-up run ----------

interface Pending {
  id: string;
  triggers: string[];
  tasks: string[];
  requestedAt: string;
}

let current: Pending | null = null;
let queued: Pending | null = null;

const triggerOf = (p: Pending) => [...new Set(p.triggers)].join("+");
const taskOf = (p: Pending) => (p.tasks.length ? p.tasks.join("\n\n") : null);
const pendingView = (p: Pending): OperatorRun => ({
  id: p.id,
  trigger: triggerOf(p),
  task: taskOf(p),
  status: "running",
  startedAt: p.requestedAt,
  finishedAt: null,
  summary: null,
  error: null,
  toolCalls: 0,
});

/** Start a run now (or queue it behind the one in progress). Resolves once it is accepted, not when it ends. */
export async function requestRun(trigger: string, task?: string): Promise<OperatorRun> {
  const reason = blocker();
  if (reason) throw new OperatorError(`The operator can't run: ${reason}`, 400);
  const t = task?.trim() || undefined;

  if (current) {
    if (queued) {
      // Coalesce: one follow-up run handles every request that arrived meanwhile.
      queued.triggers.push(trigger);
      if (t && !queued.tasks.includes(t)) queued.tasks.push(t);
      return pendingView(queued);
    }
    checkDailyLimit(1);
    queued = { id: randomUUID(), triggers: [trigger], tasks: t ? [t] : [], requestedAt: new Date().toISOString() };
    return pendingView(queued);
  }
  checkDailyLimit(0);
  const p: Pending = { id: randomUUID(), triggers: [trigger], tasks: t ? [t] : [], requestedAt: new Date().toISOString() };
  const run = start(p);
  void drain(p);
  return run;
}

function checkDailyLimit(alsoPending: number): void {
  const max = getConfig().operator.maxRunsPerDay;
  if (runsToday() + alsoPending >= max) {
    throw new OperatorError(`The operator already ran ${max} times today (operator.maxRunsPerDay in threadsmith.config.json). Try again tomorrow or raise the limit.`, 429);
  }
}

function start(p: Pending): OperatorRun {
  current = p;
  db.prepare("INSERT INTO operator_runs (id, trigger, task, status, started_at, tool_calls) VALUES (?, ?, ?, 'running', ?, 0)").run(
    p.id,
    triggerOf(p),
    taskOf(p),
    new Date().toISOString(),
  );
  return getRun(p.id)!;
}

async function drain(first: Pending): Promise<void> {
  let p: Pending | null = first;
  while (p) {
    await execute(p);
    current = null;
    p = queued;
    queued = null;
    if (p) {
      const reason = blocker();
      if (reason) {
        console.warn(`[operator] dropped queued run: ${reason}`);
        p = null;
      } else start(p);
    }
  }
}

async function execute(p: Pending): Promise<void> {
  const trigger = triggerOf(p);
  let toolCalls = 0;
  let run: OperatorRun;
  try {
    const result = await runAs({ kind: "agent", via: "operator" }, () => agentLoop(taskOf(p), trigger, (n) => (toolCalls = n)));
    run = finishRun(p.id, { status: "done", summary: result, toolCalls });
  } catch (err) {
    const message = errorText(err);
    console.warn(`[operator] run ${p.id} failed: ${message}`);
    run = finishRun(p.id, { status: "failed", error: message, toolCalls });
  }
  await report(run);
}

async function report(run: OperatorRun): Promise<void> {
  const text =
    run.status === "done"
      ? `🤖 Operator run (${run.trigger}): ${run.summary ?? "done."}`
      : `🤖 Operator run (${run.trigger}) failed: ${run.error ?? "unknown error"}`;
  try {
    // Lazy: notify/hub.ts imports this module (requestRun for /run).
    const { alert } = await import("./notify/hub.ts");
    alert(text);
  } catch (err) {
    console.warn(`[operator] couldn't notify: ${(err as Error).message}`);
  }
}

function errorText(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic rejected the API key; check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.RateLimitError) return "Anthropic rate limit reached; the run stopped. Try again later.";
  if (err instanceof Anthropic.APIError) return `Anthropic API error${err.status ? ` ${err.status}` : ""}: ${err.message}`;
  return (err as Error)?.message ?? String(err);
}

// ---------- the agent loop ----------

type Tool = ReturnType<typeof agentTools>[number];

function operatorRules(toolNames: Set<string>): string {
  const reviews = toolNames.has("list_reviews")
    ? "list_reviews shows posts the person sent back (approval.state changes_requested, their note in approval.note)."
    : "list_posts shows each post's approval: state changes_requested means the person sent it back, with their feedback in approval.note.";
  return `# You are the operator
You run unattended on a schedule for this person, with the tools above, following their brief below. Nobody reads your messages while you work and nobody will answer questions: never ask, decide and act.
Wherever the instructions above say to ask the person, decide yourself instead. What you schedule or publish waits for the person's approval (web UI, Telegram, Discord) unless get_settings says approval is off, in which case it goes out as is. Either way, only queue complete, checked work: check every post with count_characters (with the platform) before saving and preview_post after, and fix anything that doesn't fit.
How to work:
1. Start with get_settings, then read what is already planned and how things did: list_queue, list_posts, list_metrics / get_metrics. Don't duplicate a topic, angle or post that is already queued or recently published.
2. Respond to feedback first: ${reviews} Revise those posts with update_post (it asks the person again) following the note, or delete the post if the note says they don't want it.
3. Then do what the brief asks for this run, e.g. fill the configured posting slots it covers (schedule "next" or a specific slot from next_free_slots), within its cadence. Doing nothing is fine when the queue already covers it.
4. Never delete, unschedule or change anything that is published, publishing, or that the person made themselves (source other than "operator"); never publish_now unless the brief explicitly says to.
5. Stay within the tool budget you are given; prefer fewer, well-made posts over many.
End with a summary for the person in 2–5 plain sentences: what you did (post ids and titles or first words, when they're scheduled), what you revised, and why. No headings, no lists.`;
}

function systemPrompt(toolNames: Set<string>): string {
  const brief = readFileSync(briefFile(), "utf8").trim();
  return `${instructions()}\n\n${operatorRules(toolNames)}\n\n# The person's brief (${getConfig().operator.briefPath}): their standing instructions\n${brief}`;
}

function toolDefinitions(tools: Tool[]): Anthropic.Beta.BetaTool[] {
  return tools.map((t) => {
    const { $schema: _drop, ...schema } = zod.toJSONSchema(zod.object(t.input), { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    return { name: t.name, description: t.description, input_schema: { ...schema, type: "object" } as Anthropic.Beta.BetaTool.InputSchema };
  });
}

function toResultContent(r: CallToolResult): Anthropic.Beta.BetaToolResultBlockParam["content"] {
  const out: Exclude<Anthropic.Beta.BetaToolResultBlockParam["content"], string | undefined> = [];
  for (const c of r.content ?? []) {
    if (c.type === "text") out.push({ type: "text", text: c.text || "(empty)" });
    else if (c.type === "image" && ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(c.mimeType)) {
      out.push({ type: "image", source: { type: "base64", media_type: c.mimeType as "image/png", data: c.data } });
    } else out.push({ type: "text", text: JSON.stringify(c) });
  }
  if (!out.length && r.structuredContent) out.push({ type: "text", text: JSON.stringify(r.structuredContent) });
  return out.length ? out : [{ type: "text", text: r.isError ? "Error" : "OK" }];
}

function localNow(): string {
  const tz = getConfig().timezone;
  const when = new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "full", timeStyle: "short", hourCycle: "h23" }).format(new Date());
  return `${when} (${tz})`;
}

async function agentLoop(task: string | null, trigger: string, onToolCalls: (n: number) => void): Promise<string> {
  const { maxToolCalls } = getConfig().operator;
  const model = aiStatus().model!;
  // Long agentic turns: generous timeout, one retry (the SDK retries 429/5xx/connection errors).
  const client = createClaudeClient({ timeout: 300_000, maxRetries: 2 });
  const effort = (await modelSupportsEffort(client)) ? { output_config: { effort: "high" as const } } : {};

  const tools = agentTools();
  const byName = new Map(tools.map((t) => [t.name, t]));
  const defs = toolDefinitions(tools);
  // Stable prefix (tools → system) cached; the volatile date and task live in the first user message.
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: systemPrompt(new Set(byName.keys())), cache_control: { type: "ephemeral" } }];

  const kickoff =
    `Now: ${localNow()}. Trigger: ${trigger}. Tool budget: ${maxToolCalls} tool calls.\n` +
    (task ? `Task for this run: ${task}\n(Also handle any other posts sent back for changes, but don't start unrelated work.)` : "Do your scheduled work according to the brief.");
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: kickoff }];

  let calls = 0;
  let outOfBudget = false;
  for (let turn = 0; turn < maxToolCalls + 10; turn++) {
    const msg = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" }, // auto-cache the growing conversation too
      system,
      tools: defs,
      ...(outOfBudget ? { tool_choice: { type: "none" as const } } : {}),
      ...effort,
      messages,
    });

    if (msg.stop_reason === "refusal") {
      const why = msg.stop_details?.explanation ?? msg.stop_details?.category;
      throw new Error(`Claude declined to continue${why ? ` (${why})` : ""}. Check the brief.`);
    }
    messages.push({ role: "assistant", content: msg.content });
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text.trim())
      .filter(Boolean)
      .join("\n\n");

    if (msg.stop_reason === "pause_turn") continue;
    if (msg.stop_reason === "max_tokens") throw new Error("Claude's reply was cut off (max_tokens); the run stopped.");
    const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (msg.stop_reason !== "tool_use" || !uses.length) {
      if (!text) throw new Error("The run ended without a summary.");
      return text;
    }

    const results: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const use of uses) {
      const tool = byName.get(use.name);
      if (calls >= maxToolCalls) {
        results.push({ type: "tool_result", tool_use_id: use.id, is_error: true, content: "Tool budget used up; this call was not run." });
        continue;
      }
      calls++;
      onToolCalls(calls);
      const r: CallToolResult = tool
        ? await tool.run(use.input)
        : { isError: true, content: [{ type: "text", text: `Unknown tool ${use.name}` }] };
      results.push({ type: "tool_result", tool_use_id: use.id, is_error: r.isError ? true : undefined, content: toResultContent(r) });
    }
    if (calls >= maxToolCalls) {
      outOfBudget = true;
      results.push({ type: "text", text: `You have used all ${maxToolCalls} tool calls for this run. Stop now and write your summary for the person.` });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("The run didn't finish within its turn limit.");
}

// ---------- triggers ----------

export function startOperator(): () => void {
  const stale = db
    .prepare("UPDATE operator_runs SET status = 'failed', finished_at = ?, error = ? WHERE status = 'running'")
    .run(new Date().toISOString(), "Threadsmith restarted while this run was in progress.");
  if (stale.changes) console.warn(`[operator] marked ${stale.changes} interrupted run(s) as failed`);

  let lastTick = new Date();
  const timer = setInterval(() => {
    const now = new Date();
    const since = lastTick;
    lastTick = now;
    const { operator } = getConfig();
    if (!operator.enabled) return;
    const due = nextLocalTime(operator.days, operator.runAt, since);
    if (!due || due > now) return;
    const reason = blocker();
    if (reason) return void console.warn(`[operator] scheduled run skipped: ${reason}`);
    requestRun("schedule").catch((err) => console.warn(`[operator] scheduled run not started: ${(err as Error).message}`));
  }, 60_000);
  timer.unref();

  const off = bus.on((e) => {
    if (e.type !== "post.changes_requested" || e.post.source !== "operator") return;
    const note = e.post.approval?.note?.trim() || "(no note)";
    const task = `The person asked for changes on post ${e.post.id}: ${note}. Revise it with update_post (which asks them again), or delete it if they no longer want it.`;
    requestRun("changes_requested", task).catch(async (err) => {
      console.warn(`[operator] couldn't start a revision run: ${(err as Error).message}`);
      const { alert } = await import("./notify/hub.ts");
      alert(`🤖 The operator couldn't revise post ${e.post.id}: ${(err as Error).message}`);
    });
  });

  return () => {
    clearInterval(timer);
    off();
  };
}

// ---------- REST: /api/operator ----------

const json = <T extends z.ZodType>(schema: T, description: string) => ({ description, content: { "application/json": { schema } } });
const Err = z.object({ error: z.string(), message: z.string() });
const tags = ["Operator"];

const RunSchema = z
  .object({
    id: z.string(),
    trigger: z.string().openapi({ description: '"schedule", "ui", "api", "changes_requested", "chat:telegram:@name"…; "a+b" when requests were coalesced.' }),
    task: z.string().nullable(),
    status: z.enum(["running", "done", "failed"]),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime().nullable(),
    summary: z.string().nullable().openapi({ description: "The operator's own summary for the person (also sent to the approval chats)." }),
    error: z.string().nullable(),
    toolCalls: z.number().int(),
  })
  .openapi("OperatorRun");
const StatusSchema = z
  .object({
    configured: z.boolean().openapi({ description: "A Claude API key is set." }),
    enabled: z.boolean().openapi({ description: "Scheduled runs are on (operator.enabled in threadsmith.config.json)." }),
    reason: z.string().nullable().openapi({ description: "Why the operator can't run (no key, no brief), or null." }),
    model: z.string().nullable(),
    running: z.boolean(),
    nextRunAt: z.iso.datetime().nullable(),
    lastRun: RunSchema.nullable(),
  })
  .openapi("OperatorStatus");

export const operatorRoutes = createRouter();

operatorRoutes.openapi(
  createRoute({
    method: "get",
    path: "/status",
    tags,
    operationId: "getOperatorStatus",
    summary: "Operator state",
    description: "Whether the operator can run, its model, whether a run is in progress, the next scheduled run and the last run.",
    responses: { 200: json(StatusSchema, "Current state.") },
  }),
  (c) => c.json(operatorStatus(), 200),
);

operatorRoutes.openapi(
  createRoute({
    method: "get",
    path: "/runs",
    tags,
    operationId: "listOperatorRuns",
    summary: "Recent operator runs",
    description: "Newest first, with each run's trigger, task, tool-call count and summary or error.",
    request: { query: z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }) },
    responses: { 200: json(z.object({ runs: z.array(RunSchema) }), "Runs.") },
  }),
  (c) => c.json({ runs: listRuns(c.req.valid("query").limit ?? 20) }, 200),
);

operatorRoutes.openapi(
  createRoute({
    method: "post",
    path: "/run",
    tags,
    operationId: "runOperator",
    summary: "Run the operator now",
    description:
      "Starts a run (or queues one behind the run in progress; requests that arrive meanwhile share one follow-up run). Returns as soon as it is " +
      "accepted; the summary goes to the approval chats and GET /runs. Everything it queues still waits for approval. Only the person (owner).",
    request: {
      body: {
        required: false,
        content: {
          "application/json": {
            schema: z.object({ task: z.string().max(4000).optional().openapi({ description: "What to do this time; omit for the brief's regular work." }) }),
          },
        },
      },
    },
    responses: {
      202: json(RunSchema, "Accepted."),
      400: json(Err, "The operator can't run (no API key or no brief)."),
      403: json(Err, "Only the person (owner) can start the operator."),
      429: json(Err, "operator.maxRunsPerDay reached."),
    },
  }),
  async (c) => {
    requireOwner("start the operator");
    const { task } = (await c.req.json().catch(() => ({}))) as { task?: string };
    const run = await requestRun(currentActor().via, typeof task === "string" ? task : undefined);
    return c.json(run, 202);
  },
);
