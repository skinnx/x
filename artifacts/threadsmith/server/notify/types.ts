// Approval channels (Telegram, Discord): chats where the person gets approval requests, alerts and the daily digest,
// and decides with buttons or a reply. A channel only moves messages; every decision goes through the hub.
import type { ChannelStatus } from "../../shared/types.ts";

export type Action = "approve" | "reject" | "changes" | "pause" | "resume";

export interface Button {
  label: string;
  action: Action;
  postId?: string;
}

export interface ChannelMessage {
  /** Plain text (no markup), already cut to the channel's maxLength. */
  text: string;
  buttons?: Button[];
}

export type Command = "pending" | "status" | "pause" | "resume" | "run";

export interface ChannelHandlers {
  /**
   * A person pressed a button or answered a "what should change?" prompt. The channel has already checked they may
   * decide. `who` names them for the audit log, e.g. "telegram:@alice". Returns a short confirmation to show them.
   */
  act(who: string, action: Action, postId: string | null, note?: string): Promise<string>;
  /** A text command (/pending, /status, /pause [reason], /resume, /run [task]). Returns the reply text. */
  command(who: string, command: Command, arg?: string): Promise<string>;
  /** The post an approval message (by the ref send() returned) is about, for replies to it. */
  postForRef(ref: string): string | null;
}

export interface ApprovalChannel {
  id: ChannelStatus["id"];
  /** Longest text one message can carry. */
  maxLength: number;
  status(): ChannelStatus;
  /** Start receiving (long polling, gateway). Only called when configured. */
  start(handlers: ChannelHandlers): void;
  stop(): void;
  /** Send a message; resolves with a ref for finalize(), or null if it couldn't be sent (logged, never thrown). */
  send(message: ChannelMessage): Promise<string | null>;
  /**
   * Replace a sent message's text (≤ maxLength) and remove its buttons: the request was decided, withdrawn or
   * superseded. Never throws (log instead).
   */
  finalize(ref: string, text: string): Promise<void>;
}
