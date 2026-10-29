// The contract every platform adapter implements. Adapters only talk to their platform; validation, progress
// tracking and status bookkeeping live in server/publisher.ts.
import type { Account, ItemMetrics } from "../../shared/types.ts";

export type Credentials = Record<string, string>;

export interface PublishItem {
  text: string;
  mediaIds: string[];
}

export interface PublishContext {
  /** The Threadsmith post being published (stable across retries; useful for idempotency keys). */
  postId: string;
  account: Account;
  credentials: Credentials;
  /** What to post, already shaped for the platform (e.g. LinkedIn: one joined item). */
  items: PublishItem[];
  /** Platform ids of items already posted by an earlier attempt, in order: skip them and continue after the last. */
  posted: string[];
  /** Call after every successful item with all ids so far; it is saved at once so a crash never re-posts. */
  record(ids: string[]): void;
}

export interface PublishResult {
  ids: string[];
  /** Public link to the first item. */
  url: string | null;
}

/**
 * Error with a message the user can act on. `resumable` = Retry can continue after the items already posted
 * (false when, say, the post being replied to was deleted).
 */
export class PlatformError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly resumable = true,
  ) {
    super(message);
  }
}

export interface MetricsContext {
  account: Account;
  credentials: Credentials;
  /** Ids of the posted items, as publish() returned them. */
  externalIds: string[];
}

export interface PlatformAdapter {
  /** Check the credentials with a cheap authenticated call; return who they belong to. Throw PlatformError if not. */
  verify(credentials: Credentials): Promise<{ handle: string; profileUrl: string | null }>;
  /** Post `items` in order (threading per the platform's threadMode), resuming after `posted`. */
  publish(ctx: PublishContext): Promise<PublishResult>;
  /**
   * Public engagement of posted items, one entry per id (omit metrics the platform doesn't expose). Optional: absent
   * when the platform has no read API for it. Must be read-only and cheap; say in `costNote` if reads are billed.
   */
  metrics?(ctx: MetricsContext): Promise<ItemMetrics[]>;
  /** One line for agents/UI when metrics cost money or need an extra permission (e.g. X reads are billed). */
  metricsNote?: string;
}
