// Registry: platform id → adapter.
import type { PlatformId } from "../../shared/types.ts";
import { bluesky } from "./bluesky.ts";
import { discord } from "./discord.ts";
import { linkedin } from "./linkedin.ts";
import { mastodon } from "./mastodon.ts";
import { telegram } from "./telegram.ts";
import { threads } from "./threads.ts";
import type { PlatformAdapter } from "./types.ts";
import { x } from "./x.ts";

export const ADAPTERS: Record<PlatformId, PlatformAdapter> = { x, bluesky, mastodon, threads, linkedin, telegram, discord };
