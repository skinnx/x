// Writing guide for agents, served as the MCP resource threadsmith://guide and inside /llms-full.txt.
import { getConfig } from "../config.ts";
import { xConfigured } from "../env.ts";

export function threadGuide(): string {
  const { maxChars, timezone } = getConfig();
  return `# Writing X threads with Threadsmith

## Format and limits
- A thread is one text with a line containing only \`---\` between posts (or an array of posts). A single post is a thread of one.
- Each post may use ${maxChars} characters as X counts them: most Latin letters, digits and punctuation count 1;
  CJK characters and each emoji count 2; Vietnamese letters with a built-in tone mark (ạ, ấ, ệ, ố, ữ…) count 2; every link counts 23.
  Check with the \`count_characters\` tool (MCP), \`threadsmith count\` (CLI) before saving or scheduling.
- Up to 4 images per post (png, jpeg, webp, gif; ≤ 5 MB each). Give every image alt text.
- Times are ISO-8601. \`"next"\` means the next free posting slot from threadsmith.config.json (timezone ${timezone}).

## How publishing works on this instance
- X mode: ${xConfigured ? "**api** — scheduled posts are published automatically through the X API." : "**manual** — no X API keys. At the scheduled time the person gets a notification and copies the thread into X by hand; afterwards mark it published."}
- On X's pay-per-use API each post costs about $0.015, and a post that contains a link about $0.20. A 6-post thread is 6 posts.
  Avoid gratuitous links; if the person wants a link, put it in the last post (or a reply) rather than the first.

## What makes a thread work
1. **The first post is the whole game.** Most people only see it in their timeline. Lead with the most concrete, surprising
   or useful thing: a result, a number, a strong claim, a moment. It must make sense alone. Skip "A thread 🧵" and "Here's what I learned".
2. **One idea per post.** Each post should still make sense if someone lands on it from a quote or a reply.
3. **Specific beats general.** Names, numbers, examples and before/after beat adjectives. Cut hedges and filler.
4. **Short is a feature.** 3–8 posts is typical. Stop when the material runs out; don't pad to look substantial.
5. **Land it.** The last post states the takeaway. Add a call to action only when there's something real to do.
6. **Plain text.** X doesn't render Markdown. Use line breaks for rhythm. Hashtags and numbering ("1/") only if the person uses them.
7. **Their voice, their language.** Match the person's past posts (\`get_settings\` → voiceExamples) and write in the language they wrote in.
8. **Never invent facts**, quotes, statistics or links. If something is missing, ask.

## Workflow for agents
1. Draft. 2. Check counts and fix anything over the limit. 3. Show the person the thread and ask before scheduling or publishing.
4. Save with \`create_post\` (\`schedule: "next"\` or an ISO time) and report the scheduled time in their timezone.
5. Publishing immediately (\`publish_now\`) and deleting are irreversible; only do them when the person asked.
`;
}
