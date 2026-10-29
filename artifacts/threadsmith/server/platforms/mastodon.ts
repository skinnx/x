// OWNER: platform agent. mastodon adapter (see ./types.ts and shared/platforms.ts).
import { PlatformError, type PlatformAdapter } from "./types.ts";

export const mastodon: PlatformAdapter = {
  async verify() {
    throw new PlatformError("mastodon is not implemented yet");
  },
  async publish() {
    throw new PlatformError("mastodon is not implemented yet");
  },
};
