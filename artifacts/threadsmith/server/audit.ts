// Who did what, when: every state change with its actor (agent, the person, the scheduler). Recorded from the event
// bus, which runs inside the request or job that caused the change, so the actor is known there.
import type { AppEvent, AuditEntry } from "../shared/types.ts";
import { actorLabel, currentActor } from "./actor.ts";
import { db } from "./db.ts";
import { bus } from "./events.ts";

const first = (text: string | undefined, n = 80) => {
  const line = (text ?? "").split("\n")[0]!.trim();
  return line.length > n ? line.slice(0, n - 1) + "…" : line;
};

export function audit(action: string, postId: string | null, detail: string | null = null): void {
  db.prepare("INSERT INTO audit (at, actor, action, post_id, detail) VALUES (?, ?, ?, ?, ?)").run(new Date().toISOString(), actorLabel(), action, postId, detail);
}

function describe(e: AppEvent): [string | null, string | null] | null {
  switch (e.type) {
    case "post.deleted":
      return [e.id, null];
    case "publishing.paused":
      return [null, e.reason];
    case "publishing.resumed":
      return [null, null];
    case "post.updated":
      // The web UI autosaves while the person types: their edits aren't worth a line each.
      if (currentActor().via === "ui") return null;
      return [e.post.id, first(e.post.thread[0]?.text)];
    case "post.published":
      return [e.post.id, e.post.url ?? e.post.targets.map((t) => t.url).filter(Boolean).join(" ")];
    case "post.failed":
    case "post.due":
      return [e.post.id, e.post.error];
    case "post.changes_requested":
    case "post.rejected":
    case "post.approved":
      return [e.post.id, e.post.approval?.note ?? null];
    case "post.scheduled":
      return [e.post.id, e.post.scheduledAt];
    default:
      return [e.post.id, first(e.post.thread[0]?.text)];
  }
}

export function startAudit(): void {
  bus.on((e) => {
    try {
      const d = describe(e);
      if (d) audit(e.type, d[0], d[1] || null);
    } catch (err) {
      console.warn(`[audit] ${e.type}: ${(err as Error).message}`);
    }
  });
}

export function listAudit(opts: { limit?: number; postId?: string } = {}): AuditEntry[] {
  const rows = (
    opts.postId
      ? db.prepare("SELECT * FROM audit WHERE post_id = ? ORDER BY id DESC LIMIT ?").all(opts.postId, opts.limit ?? 100)
      : db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(opts.limit ?? 100)
  ) as { id: number; at: string; actor: string; action: string; post_id: string | null; detail: string | null }[];
  return rows.map((r) => ({ id: r.id, at: r.at, actor: r.actor, action: r.action, postId: r.post_id, detail: r.detail }));
}
