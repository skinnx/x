// In-process scheduler: every few seconds, claim due posts and publish them through the X API, or, without X keys,
// mark them `due` so the human is notified to copy & post by hand. Ticks never overlap; posts go out one by one.
import type { Post } from "../shared/types.ts";
import { getConfig } from "./config.ts";
import { xConfigured } from "./env.ts";
import { claimDuePosts, claimPost, ConflictError, markDue, markFailed, markPublished, requirePost } from "./repo.ts";
import { publishToX } from "./x.ts";

const manualModeMessage = (id: string) =>
  `Auto-posting is off because no X API keys are configured (manual mode). Copy the thread (Copy button, or GET /api/posts/${id}/export), ` +
  `post it on x.com, then mark it published (POST /api/posts/${id}/mark-published). To auto-post, put X_API_KEY, X_API_SECRET, ` +
  `X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET from an X app with "Read and write" permission in .env and restart ` +
  `(the X API is pay-per-use: about $0.015 per post, $0.20 per post with a link).`;

/** Publish a post already claimed as `publishing`; failures end up on the post, never thrown. */
async function publish(post: Post): Promise<Post> {
  let result: Awaited<ReturnType<typeof publishToX>>;
  try {
    result = await publishToX(post);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[publish] ${post.id} failed: ${message}`);
    return markFailed(post.id, message);
  }
  console.log(`[publish] ${post.id} live (${result.xPostIds.length} posts) → ${result.url}`);
  return markPublished(post.id, result);
}

function intervalMs(): number {
  try {
    return getConfig().schedulerIntervalSeconds * 1000;
  } catch {
    return 15_000;
  }
}

export function startScheduler(): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  const tick = async () => {
    try {
      for (const post of claimDuePosts()) {
        if (xConfigured) await publish(post);
        else {
          markDue(post.id);
          console.log(`[scheduler] ${post.id} is due; manual mode, notifying`);
        }
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
    if (!stopped) timer = setTimeout(tick, intervalMs());
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** "Publish now" from the UI/API/MCP. Resolves with the post as published or failed. */
export async function publishNow(id: string): Promise<Post> {
  requirePost(id);
  if (!xConfigured) throw new ConflictError(manualModeMessage(id));
  return publish(claimPost(id));
}

/** Retry a failed post (resuming after tweets already live) or re-notify a due one in manual mode. */
export async function retryPost(id: string): Promise<Post> {
  const post = requirePost(id);
  if (post.status !== "failed" && post.status !== "due") {
    throw new ConflictError(`Only failed or due posts can be retried; this one is ${post.status}.`);
  }
  if (!xConfigured) return markDue(id);
  return publish(claimPost(id));
}
