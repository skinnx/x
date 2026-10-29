// Telegram approval chat via the Bot API with long polling (getUpdates), so it works on localhost with no public URL.
// Approval cards carry inline buttons (callback_query); "Request changes" asks for the note with a ForceReply prompt,
// and a plain reply to a card works too. Commands: /pending /status /pause [reason] /resume /run [task].
// Bot API reference: https://core.telegram.org/bots/api (getUpdates, sendMessage, editMessageText, answerCallbackQuery).
// TELEGRAM_API_BASE overrides https://api.telegram.org (tests, local Bot API server).
import { kv } from "../db.ts";
import { env } from "../env.ts";
import type { Action, ApprovalChannel, Button, ChannelHandlers, Command } from "./types.ts";

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}
interface TgMessage {
  message_id: number;
  chat: { id: number; username?: string };
  from?: TgUser;
  text?: string;
  reply_to_message?: { message_id: number };
}
interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: TgMessage };
}

const apiBase = () => (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OFFSET_KEY = "telegram.approval.offset";

const CODES: Record<string, Action> = { a: "approve", r: "reject", c: "changes", p: "pause", u: "resume" };
const codeOf = (a: Action) => Object.entries(CODES).find(([, v]) => v === a)![0];
const COMMANDS: Command[] = ["pending", "status", "pause", "resume", "run"];

let connected = false;
let lastError: string | null = null;
let abort: AbortController | null = null;
/** ForceReply prompts ("what should change?") → the post they are about. */
const prompts = new Map<string, string>();

async function call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBase()}/bot${env.telegram.botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
  if (!data.ok) {
    const code = data.error_code ?? res.status;
    if (code === 401 || code === 404) throw new Error("Telegram rejected TELEGRAM_APPROVAL_BOT_TOKEN; copy it again from @BotFather.");
    if (code === 409) throw new Error("Another program reads this bot's updates (a webhook or a second Threadsmith). Use a bot only for approvals.");
    throw new Error(`Telegram ${method}: ${data.description ?? `HTTP ${res.status}`}`);
  }
  return data.result as T;
}

const keyboard = (buttons?: Button[]) =>
  buttons?.length ? { inline_keyboard: [buttons.map((b) => ({ text: b.label, callback_data: `${codeOf(b.action)}:${b.postId ?? ""}` }))] } : undefined;

const refOf = (m: { chat: { id: number }; message_id: number }) => `${m.chat.id}:${m.message_id}`;
const who = (u?: TgUser) => `telegram:${u?.username ? `@${u.username}` : (u?.id ?? "unknown")}`;

/** Only the configured chat, and (if listed) only the listed people, can decide. */
function allowed(chat: { id: number; username?: string }, from?: TgUser): boolean {
  const target = env.telegram.chatId!;
  const sameChat = String(chat.id) === target || (chat.username && `@${chat.username}`.toLowerCase() === target.toLowerCase());
  if (!sameChat) return false;
  return !env.telegram.approverIds.length || (from !== undefined && env.telegram.approverIds.includes(String(from.id)));
}

async function reply(chatId: number | string, text: string, extra: Record<string, unknown> = {}): Promise<TgMessage> {
  return call<TgMessage>("sendMessage", { chat_id: chatId, text: text.slice(0, 4096), link_preview_options: { is_disabled: true }, ...extra });
}

async function handle(update: TgUpdate, h: ChannelHandlers): Promise<void> {
  const cb = update.callback_query;
  if (cb) {
    if (!cb.message || !allowed(cb.message.chat, cb.from)) {
      await call("answerCallbackQuery", { callback_query_id: cb.id, text: "You can't decide here." });
      return;
    }
    const [code, postId] = (cb.data ?? "").split(":");
    const action = CODES[code ?? ""];
    if (!action) return;
    if (action === "changes") {
      await call("answerCallbackQuery", { callback_query_id: cb.id });
      const prompt = await reply(cb.message.chat.id, "✏️ What should change? Reply to this message; the agent gets your words as they are.", {
        reply_markup: { force_reply: true, input_field_placeholder: "e.g. shorter, no hashtags, mention the launch date" },
        reply_parameters: { message_id: cb.message.message_id, allow_sending_without_reply: true },
      });
      prompts.set(refOf(prompt), postId!);
      return;
    }
    const text = await h.act(who(cb.from), action, postId || null).catch((err: Error) => `⚠ ${err.message}`);
    await call("answerCallbackQuery", { callback_query_id: cb.id, text: text.slice(0, 200) });
    return;
  }
  const msg = update.message;
  if (!msg?.text || !allowed(msg.chat, msg.from)) return;
  if (msg.reply_to_message) {
    const ref = `${msg.chat.id}:${msg.reply_to_message.message_id}`;
    const postId = prompts.get(ref) ?? h.postForRef(ref);
    if (postId && !msg.text.startsWith("/")) {
      prompts.delete(ref);
      const text = await h.act(who(msg.from), "changes", postId, msg.text).catch((err: Error) => `⚠ ${err.message}`);
      await reply(msg.chat.id, text, { reply_parameters: { message_id: msg.message_id } });
      return;
    }
  }
  const m = /^\/([a-z]+)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(msg.text.trim());
  if (!m) return;
  const name = m[1]!.toLowerCase();
  const command = COMMANDS.find((c) => c === name);
  const text = command
    ? await h.command(who(msg.from), command, m[2]).catch((err: Error) => `⚠ ${err.message}`)
    : "Commands: /pending (what waits for you), /status (digest now), /pause [reason], /resume, /run [task for the operator].\n" +
      "Approval requests arrive here with buttons; to ask for changes, press ✏️ or reply to the request.";
  await reply(msg.chat.id, text);
}

async function poll(h: ChannelHandlers, signal: AbortSignal): Promise<void> {
  let backoff = 2_000;
  let offset = kv.get<number>(OFFSET_KEY) ?? 0;
  while (!signal.aborted) {
    try {
      const updates = await call<TgUpdate[]>(
        "getUpdates",
        { offset, timeout: 50, allowed_updates: ["message", "callback_query"] },
        AbortSignal.any([signal, AbortSignal.timeout(65_000)]),
      );
      connected = true;
      lastError = null;
      backoff = 2_000;
      for (const u of updates) {
        offset = u.update_id + 1;
        kv.set(OFFSET_KEY, offset); // before handling: a crash mid-update must not replay a decision
        await handle(u, h).catch((err) => console.warn(`[telegram] update ${u.update_id}: ${(err as Error).message}`));
      }
    } catch (err) {
      if (signal.aborted) return;
      connected = false;
      lastError = (err as Error).message;
      console.warn(`[telegram] ${lastError} (retrying in ${backoff / 1000} s)`);
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}

export const telegramChannel: ApprovalChannel = {
  id: "telegram",
  maxLength: 4096,
  status: () => ({ id: "telegram", configured: Boolean(env.telegram.botToken && env.telegram.chatId), connected, error: lastError }),
  start(h) {
    abort = new AbortController();
    void call("setMyCommands", {
      commands: [
        { command: "pending", description: "What is waiting for you" },
        { command: "status", description: "Digest now" },
        { command: "pause", description: "Stop all publishing" },
        { command: "resume", description: "Restart publishing" },
        { command: "run", description: "Run the operator now" },
      ],
    }).catch(() => undefined);
    void poll(h, abort.signal);
  },
  stop() {
    abort?.abort();
    connected = false;
  },
  async send(message) {
    try {
      const sent = await reply(env.telegram.chatId!, message.text, { reply_markup: keyboard(message.buttons) });
      return refOf(sent);
    } catch (err) {
      lastError = (err as Error).message;
      console.warn(`[telegram] send: ${lastError}`);
      return null;
    }
  },
  async finalize(ref, text) {
    const [chatId, messageId] = ref.split(":");
    try {
      await call("editMessageText", { chat_id: chatId, message_id: Number(messageId), text: text.slice(0, 4096), link_preview_options: { is_disabled: true } });
    } catch (err) {
      console.warn(`[telegram] finalize: ${(err as Error).message}`);
    }
  },
};
