// OWNER: platform agent. telegram adapter (see ./types.ts and shared/platforms.ts).
import { PlatformError, type PlatformAdapter } from "./types.ts";

export const telegram: PlatformAdapter = {
  async verify() {
    throw new PlatformError("telegram is not implemented yet");
  },
  async publish() {
    throw new PlatformError("telegram is not implemented yet");
  },
};
