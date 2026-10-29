// Publishing a post to its connected accounts. Each destination is checked up front, then posted independently and
// resumably: a failure on one platform doesn't stop the others, and Retry only redoes what didn't go out.
import { countFor, itemsFor, PLATFORMS, TELEGRAM_CAPTION_LIMIT } from "../shared/platforms.ts";
import type { Account, Post, PostTarget } from "../shared/types.ts";
import { accountCredentials, getAccount, setAccountError } from "./accounts.ts";
import { getConfig } from "./config.ts";
import { ADAPTERS } from "./platforms/index.ts";
import { PlatformError, type PublishItem } from "./platforms/types.ts";
import { getMedia, markFailed, markPublished, markTargetFailed, markTargetPublished, recordTargetProgress, requirePost } from "./repo.ts";

export function limitFor(account: Account): number {
  if (account.maxChars) return account.maxChars;
  return account.platform === "x" ? getConfig().maxChars : PLATFORMS[account.platform].maxChars;
}

/** Everything that would make the platform reject an item, found before anything is posted. */
export function preflight(account: Account, items: PublishItem[]): string | null {
  const info = PLATFORMS[account.platform];
  const limit = limitFor(account);
  for (const [i, item] of items.entries()) {
    const n = items.length > 1 ? `Post ${i + 1}` : "The post";
    if (!item.text.trim() && !item.mediaIds.length) return `${n} is empty; add text or remove it.`;
    const captionLimit = account.platform === "telegram" && item.mediaIds.length ? TELEGRAM_CAPTION_LIMIT : limit;
    const length = countFor(account.platform, item.text);
    if (length > captionLimit) {
      return `${n} is ${length}/${captionLimit} characters on ${info.name}${captionLimit !== limit ? " (photo captions are limited)" : ""}; shorten it or give ${info.name} its own version.`;
    }
    if (item.mediaIds.length > info.maxImages) return `${n} has ${item.mediaIds.length} images; ${info.name} allows at most ${info.maxImages}.`;
    if (info.maxImageBytes) {
      const big = item.mediaIds.map(getMedia).find((m) => m && m.size > info.maxImageBytes!);
      if (big) return `${n}: ${big.filename} is ${(big.size / 1e6).toFixed(1)} MB; ${info.name} accepts images up to ${info.maxImageBytes / 1e6} MB.`;
    }
    if (info.imageTypes) {
      const bad = item.mediaIds.map(getMedia).find((m) => m && !info.imageTypes!.includes(m.mime));
      if (bad) return `${n}: ${info.name} doesn't accept ${bad.mime.replace("image/", "").toUpperCase()} images (${bad.filename}); use ${info.imageTypes.map((t) => t.replace("image/", "").toUpperCase()).join(" or ")}.`;
    }
  }
  return null;
}

async function publishTarget(post: Post, target: PostTarget): Promise<string | null> {
  const name = PLATFORMS[target.platform].name;
  let account: Account;
  try {
    account = getAccount(target.accountId);
  } catch {
    return `${name}: the account was removed.`;
  }
  const items = itemsFor(target.platform, target.thread ?? post.thread);
  const problem = preflight(account, items.slice(target.externalIds.length));
  if (problem) {
    markTargetFailed(post.id, account.id, `${problem} Nothing more was posted there.`);
    return `${account.label}: ${problem}`;
  }
  try {
    const result = await ADAPTERS[account.platform].publish({
      postId: post.id,
      account,
      credentials: accountCredentials(account.id),
      items,
      posted: target.externalIds,
      record: (ids) => recordTargetProgress(post.id, account.id, ids),
    });
    markTargetPublished(post.id, account.id, { externalIds: result.ids, url: result.url });
    setAccountError(account.id, null);
    console.log(`[publish] ${post.id} → ${account.label}: ${result.url ?? "ok"}`);
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const done = requirePost(post.id).targets.find((t) => t.accountId === account.id)?.externalIds.length ?? 0;
    const resumable = !(err instanceof PlatformError) || err.resumable;
    const progress =
      done && done < items.length
        ? ` ${done} of ${items.length} are live on ${name}${resumable ? "; Retry continues after them" : ""}.`
        : "";
    markTargetFailed(post.id, account.id, message + progress);
    if (err instanceof PlatformError && (err.status === 401 || err.status === 403)) setAccountError(account.id, message);
    console.error(`[publish] ${post.id} → ${account.label} failed: ${message}`);
    return `${account.label}: ${message}${progress}`;
  }
}

/** Publish a claimed (`publishing`) post to every destination not yet published; never throws. */
export async function publishTargets(post: Post): Promise<Post> {
  const problems: string[] = [];
  for (const target of post.targets) {
    if (target.status === "published") continue;
    const problem = await publishTarget(post, target);
    if (problem) problems.push(problem);
  }
  const after = requirePost(post.id);
  const first = after.targets.find((t) => t.url)?.url ?? null;
  if (!problems.length) return markPublished(post.id, { url: first });
  const ok = after.targets.filter((t) => t.status === "published").length;
  return markFailed(post.id, `${ok} of ${after.targets.length} destinations published. ${problems.join(" · ")}`);
}
