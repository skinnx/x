// Copilot tasks: prompts written for the person's voice and each platform's counting rules, plus a post-generation
// pass that enforces the limit (one corrective round, then a trim at a sentence boundary).
import { z } from "zod";
import { countFor, PLATFORMS } from "../../shared/platforms.ts";
import { joinThread, splitThread, threadToText, weightedLength } from "../../shared/thread.ts";
import type { PlatformId } from "../../shared/types.ts";
import { getAccount } from "../accounts.ts";
import { getConfig } from "../config.ts";
import { limitFor } from "../publisher.ts";
import { BadInputError, getMedia, listPosts, readMediaBytes, requirePost } from "../repo.ts";
import { AiError, generate } from "./provider.ts";

const ALT_TEXT_MAX = 1000; // X's alt-text limit

/** The person's own posts from the config (the example config's placeholder entry is skipped). */
export function voiceExamples(): string[] {
  return getConfig()
    .voice.map((v) => v.trim())
    .filter((v) => v && !/^Paste \d/.test(v));
}

function systemPrompt(limit: number): string {
  const voice = voiceExamples();
  const examples = voice.length
    ? `\n\nPosts this person wrote. Match their tone, sentence length, formatting habits and formality, not their topics:\n${voice
        .map((v) => `<example>\n${v}\n</example>`)
        .join("\n")}`
    : "";
  return `You are the writing copilot inside Threadsmith, a tool one person uses to draft and schedule their own posts on X (formerly Twitter). You help them write; they review every word before anything is published.

How X counts characters (the limit here is ${limit} per post):
- Most Latin letters, digits, spaces and punctuation count 1.
- Chinese, Japanese and Korean characters count 2, and so does each emoji.
- Vietnamese letters from Unicode's Latin Extended Additional block, such as ạ, ả, ấ, ầ, ệ, ố, ở, ữ, count 2 (á, à, é, ó, ơ, ư, đ and the like count 1), so Vietnamese text fills a post sooner than it looks.
- Every link counts 23, however long it is.
A post over the limit cannot be published, so aim to land around 90% of it.

Writing for X:
- Write in the language of the person's text.
- Plain text only. X doesn't render Markdown, so no **bold**, headings or bullet syntax; use line breaks for rhythm.
- Keep their facts, numbers, names and links exactly. Never invent statistics, quotes, sources or links.
- No hashtags, "🧵" or "1/" numbering unless their text or examples use them.
- Sound like a person talking, not a press release: concrete beats abstract, specific beats hype, and filler openers like "In today's fast-paced world" or "Let's dive in" waste the reader's attention.${examples}`;
}

type Counter = (text: string) => number;
const over = (text: string, limit: number, count: Counter = weightedLength) => count(text) > limit;

/** Last resort: cut at the last sentence end that fits, else at a word boundary with an ellipsis. */
export function trimToFit(text: string, limit: number, count: Counter = weightedLength): string {
  if (!over(text, limit, count)) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (count(chars.slice(0, mid).join("")) <= limit - 2) lo = mid; // 2 = room for "…"
    else hi = mid - 1;
  }
  const floor = Math.floor(lo * 0.5);
  for (let i = lo - 1; i >= floor; i--) {
    // CJK sentence ends are followed directly by the next sentence; Latin ones need a space ("3.5", "e.g." aren't ends).
    const end = /[。！？]/.test(chars[i]!) || (/[.!?…]/.test(chars[i]!) && (i + 1 >= chars.length || /\s/.test(chars[i + 1]!)));
    if (end) return chars.slice(0, i + 1).join("").trim();
  }
  for (let i = lo; i >= floor; i--) if (/\s/.test(chars[i] ?? "")) return chars.slice(0, i).join("").trimEnd() + "…";
  // No space to break at (e.g. CJK): cut at the limit, but before a link rather than through it.
  let cut = lo;
  for (const m of text.matchAll(/https?:\/\/[\w\-.~!*';:=+,$/%#[\]&|@?()]+/g)) {
    const start = [...text.slice(0, m.index)].length; // code points, like `chars`
    if (start > 0 && start < cut && start + m[0].length > cut) cut = start;
  }
  return chars.slice(0, cut).join("").trimEnd() + "…";
}

/** How a platform is written for and counted; X (the default) uses the original X-only prompts. */
interface Target {
  count: Counter;
  system: string;
  unit: string; // "X's limit of 280 weighted characters"
}

/** Shorten the posts that are over the limit (one model round), then trim whatever still doesn't fit. */
async function enforceLimit(posts: string[], limit: number, target?: Target): Promise<string[]> {
  const count = target?.count ?? weightedLength;
  const out = posts.map((p) => p.trim()).filter(Boolean);
  const overIdx = out.flatMap((p, i) => (over(p, limit, count) ? [i] : []));
  if (overIdx.length) {
    try {
      const fixed = await shorten(overIdx.map((i) => out[i]!), limit, target);
      overIdx.forEach((i, k) => fixed[k]?.trim() && (out[i] = fixed[k]!.trim()));
    } catch (err) {
      if (!(err instanceof AiError) || err.code === "ai_not_configured") throw err;
    }
  }
  return out.map((p) => trimToFit(p, limit, count));
}

async function shorten(posts: string[], limit: number, target?: Target): Promise<string[]> {
  const count = target?.count ?? weightedLength;
  const { posts: fixed } = await generate({
    system: target?.system ?? systemPrompt(limit),
    prompt: `These posts are over ${target?.unit ?? `X's limit of ${limit} weighted characters`} (current count in the tag). Rewrite each one so it fits, keeping its meaning, key specifics, voice and language. Cut filler, repetition and weaker clauses first; don't split a post in two.

${posts.map((p, i) => `<post index="${i + 1}" count="${count(p)}">\n${p}\n</post>`).join("\n")}

Return {"posts": [...]} with exactly ${posts.length} strings, in the same order.`,
    schema: z.object({ posts: z.array(z.string()) }),
  });
  return fixed;
}

/** Enforces the limit on each post of a `---` thread (or on a single post) and joins it back the same way. */
async function perThread(text: string, limit: number): Promise<string> {
  const parts = await enforceLimit(splitThread(text), limit);
  return parts.length > 1 ? joinThread(parts) : (parts[0] ?? "");
}

export async function threadify(input: { text: string; instructions?: string }): Promise<{ posts: string[] }> {
  const limit = getConfig().maxChars;
  const { posts } = await generate({
    system: systemPrompt(limit),
    prompt: `Turn the text below into an X thread.

- The first post is the hook. Most people only ever see that one in their timeline, so it has to work on its own and make them want the rest: lead with the most interesting concrete claim, result or tension in the text. Don't open with "A thread on…" or "Here's what I learned".
- Each following post carries one idea and still makes sense if someone lands on it alone.
- The last post lands the main takeaway. Add a call to action only if the text implies one.
- Use as many posts as the material needs and no more; a short text can be a single post.
- Each post must be at most ${limit} weighted characters.${input.instructions ? `\n\nThe author's instructions: ${input.instructions}` : ""}

<text>
${input.text}
</text>

Return {"posts": [...]}, one string per post in order, without numbering.`,
    schema: z.object({ posts: z.array(z.string()).min(1) }),
  });
  return { posts: await enforceLimit(posts, limit) };
}

export async function rewrite(input: { text: string; instruction: string }): Promise<{ text: string }> {
  const limit = getConfig().maxChars;
  const { text } = await generate({
    system: systemPrompt(limit),
    prompt: `Rewrite the text below following this instruction: ${input.instruction}

Keep whatever the instruction doesn't ask you to change. If the text is a thread (posts separated by lines containing only ---), return it in the same format. Every post must be at most ${limit} weighted characters.

<text>
${input.text}
</text>

Return {"text": "..."}.`,
    schema: z.object({ text: z.string() }),
  });
  return { text: await perThread(text, limit) };
}

export async function hooks(input: { text: string; count: number }): Promise<{ variants: string[] }> {
  const limit = getConfig().maxChars;
  const { variants } = await generate({
    system: systemPrompt(limit),
    prompt: `Write ${input.count} alternative opening posts (hooks) for the thread below. The opening post is the one people see in their timeline, and it decides whether they read on.

- Each variant is a complete first post that could replace the current one and stays true to what the thread delivers; no promises it doesn't keep.
- Take genuinely different angles, for example the most surprising result, a contrarian claim, a concrete moment, a specific number, or a sharp question.
- Each at most ${limit} weighted characters; shorter usually hits harder.

<thread>
${input.text}
</thread>

Return {"variants": [...]} with ${input.count} strings.`,
    schema: z.object({ variants: z.array(z.string()).min(1) }),
  });
  return { variants: (await enforceLimit(variants, limit)).slice(0, input.count) };
}

export async function fit(input: { text: string; maxChars?: number }): Promise<{ text: string }> {
  return { text: await perThread(input.text, input.maxChars ?? getConfig().maxChars) };
}

export async function altText(input: { mediaId: string }): Promise<{ alt: string }> {
  const data = readMediaBytes(input.mediaId); // 404 if unknown
  const mime = getMedia(input.mediaId)!.mime;
  const post = listPosts({ limit: 500 })
    .flatMap((p) => p.thread)
    .find((s) => s.mediaIds.includes(input.mediaId))?.text;
  const { alt } = await generate({
    system: systemPrompt(getConfig().maxChars),
    prompt: `Write alt text for this image, for people using screen readers on X.

- Describe what matters for understanding the post: the subject, what is happening, and any text, numbers or chart values that carry the point (quote short text verbatim).
- One to three sentences, never more than ${ALT_TEXT_MAX} characters.
- Don't start with "Image of" or "Picture of", and don't guess at things you can't see.
- ${post ? "Write in the language of the post it accompanies" : "Write in the language of any text in the image, otherwise English"}.${post ? `\n\nIt accompanies this post:\n<post>\n${post}\n</post>` : ""}

Return {"alt": "..."}.`,
    schema: z.object({ alt: z.string() }),
    image: { mime, data },
  });
  return { alt: alt.length > ALT_TEXT_MAX ? alt.slice(0, ALT_TEXT_MAX - 1).replace(/\s+\S*$/, "") + "…" : alt.trim() };
}

// ---------- adapting a thread for another platform ----------

const COUNTING: Record<PlatformId, string> = {
  x: "X weighs characters: most Latin letters, digits and punctuation count 1; CJK characters and each emoji count 2; Vietnamese letters from Unicode's Latin Extended Additional block (ạ, ả, ấ, ầ, ệ, ố, ở, ữ) count 2 while á, à, é, ó, ơ, ư, đ count 1; every link counts 23.",
  bluesky: "Bluesky counts graphemes (what a reader sees as one character: an emoji or a Vietnamese letter with its marks is 1). Links are NOT shortened: every character of a URL counts, so prefer short links.",
  mastodon: "Mastodon counts characters (Unicode code points); every link counts 23 however long it is.",
  threads: "Threads counts characters (Unicode code points); links count in full.",
  linkedin: "LinkedIn counts characters (Unicode code points); links count in full.",
  telegram: "Telegram counts characters (Unicode code points); a message with a photo has a 1024-character caption limit.",
  discord: "Discord counts characters (Unicode code points); links count in full.",
};

const CONVENTIONS: Record<PlatformId, string> = {
  x: "Plain text (no Markdown). The first post is the hook. No hashtags or 1/ numbering unless the source uses them.",
  bluesky: "Plain text (no Markdown). Conversational and direct, a thread of short posts like X. Hashtags are rare; keep the source's if any.",
  mastodon:
    "Plain text (no Markdown). Mastodon has no algorithmic feed: discovery runs on hashtags, so one to three relevant CamelCase hashtags at the end of the first post help (only for the topic the text is really about). A friendly, non-promotional tone works best.",
  threads: "Plain text (no Markdown). Casual and conversational. Threads allows one topic tag per post; use at most one, or none.",
  linkedin:
    "ONE post, not a thread. Plain text: LinkedIn doesn't render Markdown, so use short paragraphs separated by blank lines. Only the first two lines (about 210 characters) show before \"…see more\", so open with the hook. Professional but human; no hype. At most three hashtags, at the very end, and only if they add something.",
  telegram: "A channel message: plain text, short paragraphs separated by blank lines. Long-form is fine; split into several messages only when one is over the limit.",
  discord: "A message in a community channel: casual, plain text with short paragraphs. Split into several messages only when one is over the limit.",
};

/**
 * Rewrite a thread for one platform: its limit and counting, its conventions; LinkedIn (threadMode "single") gets one post.
 * Nothing is saved; the caller stores the result as that destination's version.
 */
export async function adapt(input: { text?: string; postId?: string; platform?: PlatformId; accountId?: string }): Promise<{ posts: string[] }> {
  const account = input.accountId ? getAccount(input.accountId) : undefined;
  if (account && input.platform && account.platform !== input.platform) {
    throw new BadInputError(`Account ${account.label} is on ${PLATFORMS[account.platform].name}, not ${PLATFORMS[input.platform].name}.`);
  }
  const platform = account?.platform ?? input.platform;
  if (!platform) throw new BadInputError("Give `platform` or `accountId`.");
  if ((input.text === undefined) === (input.postId === undefined)) throw new BadInputError("Give either `text` or `postId`.");
  const source = input.postId ? threadToText(requirePost(input.postId).thread) : input.text!;
  const info = PLATFORMS[platform];
  const limit = account ? limitFor(account) : platform === "x" ? getConfig().maxChars : info.maxChars;
  const single = info.threadMode === "single";
  const count = (t: string) => countFor(platform, t);
  const voice = voiceExamples();
  const system = `You are the writing copilot inside Threadsmith, a tool one person uses to draft and schedule their own posts. You adapt what they wrote for ${info.name}; they review every word before anything is published.

How ${info.name} counts (the limit here is ${limit} per ${single ? "post" : "item"}): ${COUNTING[platform]}
An item over the limit cannot be published, so aim to land around 90% of it at most.

Writing for ${info.name}: ${CONVENTIONS[platform]}
- Write in the language of the person's text. Don't translate.
- Keep their facts, numbers, names and links exactly. Never invent statistics, quotes, sources or links.
- Sound like a person talking, not a press release.${
    voice.length
      ? `\n\nPosts this person wrote. Match their tone, sentence length and formality, not their topics:\n${voice.map((v) => `<example>\n${v}\n</example>`).join("\n")}`
      : ""
  }`;
  const { posts } = await generate({
    system,
    prompt: `Adapt the text below for ${info.name}. It is ${source.includes("\n---") ? "a thread (posts separated by lines containing only ---)" : "a post"} written for another platform.

${
  single
    ? `Return exactly ONE post of at most ${limit} characters that carries the whole thread: merge the posts into flowing paragraphs, drop thread mechanics (numbering, "more below", 🧵).`
    : `Return the items in order, each at most ${limit} as ${info.name} counts it. Re-split freely: merge short posts when the limit is larger, split when it is smaller; use as few items as the material needs.`
}

<text>
${source}
</text>

Return {"posts": [...]}${single ? " with exactly one string" : ", one string per item, without numbering"}.`,
    schema: z.object({ posts: z.array(z.string()).min(1) }),
  });
  const shaped = single ? [posts.map((p) => p.trim()).filter(Boolean).join("\n\n")] : posts;
  const target: Target = { count, system, unit: `${info.name}'s limit of ${limit} characters as it counts them` };
  return { posts: await enforceLimit(shaped, limit, target) };
}
