// OWNER: platform agent. linkedin adapter (see ./types.ts and shared/platforms.ts).
import { PlatformError, type PlatformAdapter } from "./types.ts";

export const linkedin: PlatformAdapter = {
  async verify() {
    throw new PlatformError("linkedin is not implemented yet");
  },
  async publish() {
    throw new PlatformError("linkedin is not implemented yet");
  },
};
