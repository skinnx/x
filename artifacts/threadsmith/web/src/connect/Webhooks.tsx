// Webhook manager: list, add (URL + events), send a test ping, delete. The signing secret is shown once.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Trash2, Webhook as WebhookIcon, Zap } from "lucide-react";
import { useState } from "react";
import { APP_EVENT_TYPES, type AppEventType } from "../../../shared/types.ts";
import { api, type Webhook } from "../api.ts";
import { toast, toastError } from "../components/Toasts.tsx";
import { timeAgo } from "../lib/time.ts";
import { cx } from "../lib/util.ts";
import { Card, Code } from "../components/Card.tsx";

export function Webhooks() {
  const qc = useQueryClient();
  const { data: hooks, isPending } = useQuery({ queryKey: ["webhooks"], queryFn: api.webhooks });
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<{ url: string; secret: string } | null>(null);

  return (
    <Card
      icon={<WebhookIcon size={16} />}
      title="Webhooks"
      badge="POST on every event"
      action={
        !adding && (
          <button onClick={() => setAdding(true)} className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-subtle">
            <Plus size={14} /> Add
          </button>
        )
      }
    >
      <p>
        Threadsmith POSTs <code className="font-mono text-xs">{"{ id, type, createdAt, data }"}</code> to your URL, signed with{" "}
        <code className="font-mono text-xs">X-Threadsmith-Signature: sha256=…</code> (HMAC of the raw body). Failed deliveries are retried twice (after 2 s and 10 s); 4xx answers other than 408 and 429 are not retried.
      </p>

      {secret && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-2 text-sm font-medium text-amber-950 dark:text-amber-100">Save this signing secret now. It won't be shown again.</p>
          <Code label={secret.url} value={secret.secret} />
          <button onClick={() => setSecret(null)} className="mt-2 text-xs font-medium text-amber-900 underline dark:text-amber-200">
            I saved it
          </button>
        </div>
      )}

      {adding && (
        <AddWebhook
          onCancel={() => setAdding(false)}
          onCreated={(w) => {
            setAdding(false);
            setSecret({ url: w.url, secret: w.secret });
            void qc.invalidateQueries({ queryKey: ["webhooks"] });
          }}
        />
      )}

      {isPending ? (
        <LoaderCircle size={16} className="animate-spin text-ink-3" />
      ) : hooks?.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {hooks.map((h) => (
            <HookRow key={h.id} hook={h} />
          ))}
        </ul>
      ) : (
        !adding && <p className="text-ink-3">No webhooks yet. Use one to ping Slack, Zapier, n8n or your own agent when a post is due or goes live.</p>
      )}
    </Card>
  );
}

function AddWebhook(p: { onCancel: () => void; onCreated: (w: Webhook & { secret: string }) => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<AppEventType>>(new Set(APP_EVENT_TYPES));
  const create = useMutation({
    mutationFn: () => api.createWebhook(url.trim(), events.size === APP_EVENT_TYPES.length ? undefined : [...events]),
    onSuccess: p.onCreated,
    onError: (e) => toastError("Couldn't add the webhook", e),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (url.trim() && events.size) create.mutate();
      }}
      className="space-y-3 rounded-xl border border-line bg-canvas p-3"
    >
      <input
        autoFocus
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/hooks/threadsmith"
        className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-line-strong"
      />
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="mb-1.5 text-xs font-medium text-ink-3">Events</legend>
        {APP_EVENT_TYPES.map((t) => {
          const on = events.has(t);
          return (
            <button
              type="button"
              key={t}
              aria-pressed={on}
              onClick={() =>
                setEvents((s) => {
                  const next = new Set(s);
                  if (on) next.delete(t);
                  else next.add(t);
                  return next;
                })
              }
              className={cx(
                "rounded-full border px-2.5 py-1 font-mono text-xs",
                on ? "border-ink bg-ink text-canvas" : "border-line text-ink-3 hover:border-line-strong",
              )}
            >
              {t}
            </button>
          );
        })}
      </fieldset>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={p.onCancel} className="h-8 rounded-lg px-3 text-sm hover:bg-subtle">
          Cancel
        </button>
        <button
          type="submit"
          disabled={!url.trim() || !events.size || create.isPending}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-medium text-canvas disabled:opacity-50"
        >
          {create.isPending && <LoaderCircle size={13} className="animate-spin" />} Add webhook
        </button>
      </div>
    </form>
  );
}

function HookRow({ hook }: { hook: Webhook }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const test = useMutation({
    mutationFn: () => api.testWebhook(hook.id),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["webhooks"] });
      toast(r.ok ? { title: `Ping delivered (HTTP ${r.status})`, tone: "success" } : { title: "Ping failed", description: r.error ?? undefined, tone: "error" });
    },
    onError: (e) => toastError("Couldn't send the test", e),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteWebhook(hook.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks"] }),
    onError: (e) => toastError("Couldn't delete", e),
  });
  const ok = hook.lastStatus !== null && hook.lastStatus < 300;
  const all = hook.events.length === APP_EVENT_TYPES.length;
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-ink">{hook.url}</p>
        <p className="mt-0.5 text-xs text-ink-3">
          {all ? "All events" : hook.events.join(", ")}
          {hook.lastAt && (
            <>
              {" · "}
              <span className={ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                {hook.lastError ?? `HTTP ${hook.lastStatus}`}
              </span>{" "}
              {timeAgo(hook.lastAt)}
            </>
          )}
        </p>
      </div>
      <button
        onClick={() => test.mutate()}
        disabled={test.isPending}
        className="flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-medium text-ink hover:bg-subtle"
      >
        {test.isPending ? <LoaderCircle size={12} className="animate-spin" /> : <Zap size={12} />} Test
      </button>
      <button
        onClick={() => (confirm ? remove.mutate() : setConfirm(true))}
        onBlur={() => setConfirm(false)}
        aria-label="Delete webhook"
        className={cx(
          "flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium",
          confirm ? "bg-red-600 text-white" : "text-ink-3 hover:bg-subtle hover:text-red-600",
        )}
      >
        <Trash2 size={13} /> {confirm && "Delete?"}
      </button>
    </li>
  );
}
