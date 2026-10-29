// Connect: how agents (MCP, REST, CLI, webhooks) and you (reminders) plug into Threadsmith, plus live status.
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Bot, ExternalLink, FileText, Puzzle, Send, Terminal } from "lucide-react";
import type { Health } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { useControl } from "../lib/control.ts";
import { Card, Code } from "../components/Card.tsx";
import { useAccounts } from "../lib/platforms.tsx";
import { navigate } from "../lib/router.ts";
import { cx } from "../lib/util.ts";
import { Accounts } from "./Accounts.tsx";
import { Reminders } from "./Reminders.tsx";
import { Webhooks } from "./Webhooks.tsx";

export function ConnectView({ health }: { health: Health }) {
  const origin = location.origin;
  const mcpUrl = `${origin}/mcp`;
  const needsToken = health.auth.required;
  const authHeader = needsToken ? ` --header "Authorization: Bearer <AUTH_TOKEN>"` : "";
  const mcpJson = JSON.stringify(
    { mcpServers: { threadsmith: { type: "http", url: mcpUrl, ...(needsToken ? { headers: { Authorization: "Bearer <AUTH_TOKEN>" } } : {}) } } },
    null,
    2,
  );
  const cliEnv = `THREADSMITH_URL=${origin}${needsToken ? " THREADSMITH_TOKEN=<AUTH_TOKEN>" : ""}`;
  const isLocal = /^(localhost|127\.|\[::1\])/.test(location.hostname);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] space-y-8 px-4 pt-6 pb-24 sm:px-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Agents &amp; accounts</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-2">
            Threadsmith is where your agent publishes. Connect it below (MCP, REST or the CLI): it drafts, checks, schedules, publishes and reads how
            posts did. You connect the social accounts — the agent never sees their credentials — and approve what goes out.
          </p>
        </header>

        <StatusGrid health={health} />

        <Card icon={<Bot size={16} />} title="MCP server" badge="for Claude, Cursor, any MCP client">
          <p>
            Streamable HTTP endpoint with tools for drafts, the queue and publishing. Point any MCP client at it. Your agent writes the posts;
            what it queues waits for your approval in the Inbox and your approval chats.
          </p>
          <Code label="Endpoint" value={mcpUrl} />
          <Code label="Claude Code" value={`claude mcp add --transport http threadsmith ${mcpUrl}${authHeader}`} />
          <Code label="Generic MCP config (JSON)" value={mcpJson} />
          <p className="text-xs text-ink-3">
            {isLocal
              ? "claude.ai and ChatGPT connectors run in the cloud, so they need a public HTTPS URL (for example a tunnel or your VPS behind HTTPS). Local clients like Claude Code work with this address as is."
              : "claude.ai and ChatGPT connectors need this server reachable over public HTTPS."}
            {needsToken && " Replace <AUTH_TOKEN> with the AUTH_TOKEN from your .env."}
          </p>
          {needsToken && (
            <>
              <Code label="Connectors that can't send headers (claude.ai, ChatGPT)" value={`${mcpUrl}?token=<AUTH_TOKEN>`} />
              <p className="text-xs text-ink-3">
                Only over HTTPS. A token in a URL can end up in proxy or server logs, so prefer the header wherever a client supports it.
              </p>
            </>
          )}
        </Card>

        <Card icon={<FileText size={16} />} title="REST API & docs" badge="OpenAPI 3.1">
          <p>Every UI action is a REST call. Agents can read the spec or the plain-text guide and go.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <DocLink href="/docs" title="API reference" sub="/docs" />
            <DocLink href="/openapi.json" title="OpenAPI spec" sub="/openapi.json" />
            <DocLink href="/llms.txt" title="Guide for LLMs" sub="/llms.txt" />
          </div>
          <Code
            label="Queue a thread with curl"
            value={`curl -X POST ${origin}/api/posts \\
  -H "Content-Type: application/json"${needsToken ? ` \\\n  -H "Authorization: Bearer <AUTH_TOKEN>"` : ""} \\
  -d '{"text": "First post\\n---\\nSecond post", "scheduledAt": "next"}'`}
          />
        </Card>

        <Card icon={<Terminal size={16} />} title="Command line" badge="scripts & agents in a shell">
          <p>
            From the Threadsmith folder. Set <code className="font-mono text-xs">THREADSMITH_URL</code>
            {needsToken && (
              <>
                {" "}
                and <code className="font-mono text-xs">THREADSMITH_TOKEN</code>
              </>
            )}{" "}
            when the server isn't on the default address.
          </p>
          <Code
            label="Examples"
            value={`export ${cliEnv}
node cli/threadsmith.mjs queue
node cli/threadsmith.mjs new "First post
---
Second post" --at next
node cli/threadsmith.mjs copy <id> --clipboard
node cli/threadsmith.mjs help`}
          />
        </Card>

        <Accounts health={health} />
        <PluginsLink />

        <Webhooks />
        <Reminders />
        <Schedule />
      </div>
    </div>
  );
}

function StatusGrid({ health }: { health: Health }) {
  const { data: accounts } = useAccounts();
  const { data: control } = useControl();
  const n = accounts?.length ?? 0;
  const chats = control?.channels.filter((c) => c.configured).map((c) => c.name || c.id) ?? [];
  const items = [
    n
      ? {
          label: "Publishing",
          ok: true,
          value: `${n} account${n === 1 ? "" : "s"} connected`,
          note: `Posts with destinations publish to them at their slot time. Posts without destinations go to X ${
            health.x.mode === "api" ? "with the API keys in .env" : "by copy & post: you get a reminder and a one-click copy"
          }.`,
        }
      : {
          label: "Posting to X",
          ok: health.x.mode === "api",
          value: health.x.mode === "api" ? "Automatic via X API" : "Manual mode",
          note:
            health.x.mode === "api"
              ? "Queued threads are posted at their slot time."
              : "At slot time you get a reminder and a one-click copy. Connect an account below, or add X API keys to .env, to auto-post.",
        },
    {
      label: "Approvals",
      ok: control?.approval.require !== "never",
      value: !control ? "…" : control.approval.require === "never" ? "Agents publish without asking" : "Agent posts wait for you",
      note: chats.length
        ? `Decide in the Inbox or in ${chats.join(" and ")}.`
        : "Decide in the Inbox. Set up an approval chat (Telegram, Discord or another plugin) to decide from your phone.",
    },
    {
      label: "Access",
      ok: true,
      value: health.auth.required ? "Token required" : "Open (no token)",
      note: health.auth.required
        ? "Agents send Authorization: Bearer <AUTH_TOKEN>."
        : "Fine on 127.0.0.1. Set AUTH_TOKEN before exposing the port.",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs font-medium text-ink-3">{i.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
            <span className={cx("size-2 shrink-0 rounded-full", i.ok ? "bg-emerald-500" : "bg-amber-500")} />
            <span className="truncate">{i.value}</span>
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{i.note}</p>
        </div>
      ))}
    </div>
  );
}

/** Plugins have their own page now; this keeps them discoverable from here. */
function PluginsLink() {
  return (
    <button
      onClick={() => navigate("/plugins")}
      className="group flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm text-ink-2 hover:border-line-strong hover:text-ink"
    >
      <Puzzle size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        Every platform and approval chat is a plugin. <span className="font-medium text-ink">Install, update or switch them off in Plugins</span>
      </span>
      <ArrowRight size={14} className="shrink-0 text-ink-3 group-hover:text-ink" />
    </button>
  );
}

function DocLink(p: { href: string; title: string; sub: string }) {
  return (
    <a
      href={p.href}
      target="_blank"
      rel="noopener"
      className="group flex items-center justify-between rounded-xl border border-line bg-canvas px-3 py-2.5 hover:border-line-strong"
    >
      <span>
        <span className="block font-medium text-ink">{p.title}</span>
        <span className="font-mono text-xs text-ink-3">{p.sub}</span>
      </span>
      <ExternalLink size={14} className="text-ink-3 group-hover:text-ink" />
    </a>
  );
}

function Schedule() {
  const { data: config } = useQuery({ queryKey: ["config"], queryFn: api.config });
  if (!config) return null;
  return (
    <Card icon={<Send size={16} />} title="Posting schedule" badge="threadsmith.config.json">
      <p>
        Slots, timezone and the character limit live in <code className="font-mono text-xs">threadsmith.config.json</code>. Edit the file; changes
        apply without a restart.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-ink-3">Timezone</dt>
        <dd className="text-ink">{config.timezone}</dd>
        <dt className="text-ink-3">Max characters</dt>
        <dd className="text-ink">{config.maxChars}</dd>
        <dt className="text-ink-3">Slots</dt>
        <dd className="space-y-0.5 text-ink">
          {config.slots.map((s, i) => (
            <div key={i}>
              <span className="font-medium">{s.days}</span>{" "}
              <span className="text-ink-2">{"times" in s ? s.times.join(", ") : `${s.from}–${s.to} every ${s.everyMinutes} min`}</span>
            </div>
          ))}
        </dd>
        <dt className="text-ink-3">Voice samples</dt>
        <dd className="text-ink">{config.voiceCount || "None yet"}</dd>
      </dl>
    </Card>
  );
}
