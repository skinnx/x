// Copilot tasks: prompts written for the person's voice and X's counting rules, plus a post-generation
// pass that enforces the limit (one corrective round, then a trim at a sentence boundary).
import { z } from "zod";
import { joinThread, splitThread, weightedLength } from "../../shared/thread.ts";
import { getConfig } from "../config.ts";
import { getMedia, listPosts, readMediaBytes } from "../repo.ts";
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
- Vietnamese letters with a tone mark built in, such as ạ, ả, ấ, ầ, ệ, ố, ở, ữ, count 2, so Vietnamese text fills a post sooner than it looks.
- Every link counts 23, however long it is.
A post over the limit cannot be published, so aim to land around 90% of it.

Writing for X:
- Write in the language of the person's text.
- Plain text only. X doesn't render Markdown, so no **bold**, headings or bullet syntax; use line breaks for rhythm.
- Keep their facts, numbers, names and links exactly. Never invent statistics, quotes, sources or links.
- No hashtags, "🧵" or "1/" numbering unless their text or examples use them.
- Sound like a person talking, not a press release: concrete beats abstract, specific beats hype, and filler openers like "In today's fast-paced world" or "Let's dive in" waste the reader's attention.${examples}`;
}

const over = (text: string, limit: number) => weightedLength(text) > limit;

/** Last resort: cut at the last sentence end that fits, else at a word boundary with an ellipsis. */
export function trimToFit(text: string, limit: number): string {
  if (!over(text, limit)) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (weightedLength(chars.slice(0, mid).join("")) <= limit - 2) lo = mid; // 2 = room for "…"
    else hi = mid - 1;
  }
  const floor = Math.floor(lo * 0.5);
  for (let i = lo - 1; i >= floor; i--) {
    if (/[.!?…。！？]/.test(chars[i]!) && (i + 1 >= chars.length || /\s/.test(chars[i + 1]!))) return chars.slice(0, i + 1).join("").trim();
  }
  for (let i = lo; i >= floor; i--) if (/\s/.test(chars[i] ?? "")) return chars.slice(0, i).join("").trimEnd() + "…";
  return chars.slice(0, lo).join("").trimEnd() + "…";
}

/** Shorten the posts that are over the limit (one model round), then trim whatever still doesn't fit. */
async function enforceLimit(posts: string[], limit: number): Promise<string[]> {
  const out = posts.map((p) => p.trim()).filter(Boolean);
  const overIdx = out.flatMap((p, i) => (over(p, limit) ? [i] : []));
  if (overIdx.length) {
    try {
      const fixed = await shorten(overIdx.map((i) => out[i]!), limit);
      overIdx.forEach((i, k) => fixed[k]?.trim() && (out[i] = fixed[k]!.trim()));
    } catch (err) {
      if (!(err instanceof AiError) || err.code === "ai_not_configured") throw err;
    }
  }
  return out.map((p) => trimToFit(p, limit));
}

async function shorten(posts: string[], limit: number): Promise<string[]> {
  const { posts: fixed } = await generate({
    system: systemPrompt(limit),
    prompt: `These posts are over X's limit of ${limit} weighted characters (current count in the tag). Rewrite each one so it fits, keeping its meaning, key specifics, voice and language. Cut filler, repetition and weaker clauses first; don't split a post in two.

${posts.map((p, i) => `<post index="${i + 1}" count="${weightedLength(p)}">\n${p}\n</post>`).join("\n")}

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
