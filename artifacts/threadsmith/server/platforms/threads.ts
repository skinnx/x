// OWNER: platform agent. threads adapter (see ./types.ts and shared/platforms.ts).
import { PlatformError, type PlatformAdapter } from "./types.ts";

export const threads: PlatformAdapter = {
  async verify() {
    throw new PlatformError("threads is not implemented yet");
  },
  async publish() {
    throw new PlatformError("threads is not implemented yet");
  },
};
