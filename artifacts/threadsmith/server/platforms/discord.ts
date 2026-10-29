// OWNER: platform agent. discord adapter (see ./types.ts and shared/platforms.ts).
import { PlatformError, type PlatformAdapter } from "./types.ts";

export const discord: PlatformAdapter = {
  async verify() {
    throw new PlatformError("discord is not implemented yet");
  },
  async publish() {
    throw new PlatformError("discord is not implemented yet");
  },
};
