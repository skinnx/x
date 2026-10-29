// OWNER: platform agent. bluesky adapter (see ./types.ts and shared/platforms.ts).
import { PlatformError, type PlatformAdapter } from "./types.ts";

export const bluesky: PlatformAdapter = {
  async verify() {
    throw new PlatformError("bluesky is not implemented yet");
  },
  async publish() {
    throw new PlatformError("bluesky is not implemented yet");
  },
};
