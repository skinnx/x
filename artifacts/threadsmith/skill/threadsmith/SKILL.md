---
name: threadsmith
description: Draft, check, schedule and manage X (Twitter) posts and threads through the user's self-hosted Threadsmith server. Use when the user wants to write a post or thread for X, turn notes or an article into a thread, queue something for a time or the next free slot, see what's scheduled, edit, reschedule or delete queued posts, or get a thread ready to post by hand.
---

# Threadsmith

Threadsmith is the user's own composer and scheduler for X. It stores drafts and threads, counts characters the
way X does, queues posts into posting slots, and publishes them through the X API, or (manual mode) notifies
the user at the scheduled time so they can paste the thread into X themselves.

## Reaching it

Prefer, in this order:

1. **MCP tools**, if a `threadsmith` MCP server is connected (tools such as `get_settings`, `count_characters`,
   `create_post`, `list_queue`). They return structured results. To connect Claude Code:
   `claude mcp add --transport http threadsmith http://127.0.0.1:3000/mcp`
2. **The CLI**: `threadsmith <command>` if it's on PATH, otherwise `node <threadsmith-repo>/cli/threadsmith.mjs <command>`.
   It reads `THREADSMITH_URL` (default `http://127.0.0.1:3000`) and `THREADSMITH_TOKEN` (the server's AUTH_TOKEN).
   Add `--json` for machine-readable output. Exit codes: 0 ok, 1 API or network error, 2 usage error.
3. **REST**, with `Authorization: Bearer $THREADSMITH_TOKEN` when auth is on and `X-Threadsmith-Source: ai` on writes.
   `GET $THREADSMITH_URL/llms-full.txt` documents every route; `/openapi.json` is the full spec.

Start with `threadsmith health --json` (or `get_settings`) to learn the X mode (`api` or `manual`), the per-post
limit (`maxChars`), the timezone and whether the server's AI copilot is on. If the server isn't reachable, tell the
user how to start it (`pnpm start` or `pnpm dev` in the Threadsmith folder) rather than guessing.

## Workflow

1. **Understand the ask.** Topic, audience, any facts, numbers or links that must appear, and when it should go out.
   Ask for missing facts instead of inventing them.
2. **Draft** in the user's voice and language. `get_settings` returns `voiceExamples` (their past posts): match
   their tone, sentence length and formatting. Write the thread as one text with a line containing only `---`
   between posts.
3. **Check counts** before saving: `threadsmith count --file draft.txt` or `count_characters`. Shorten every post
   that is over; a post over the limit is saved but fails when publishing.
4. **Show the user the whole thread** (with counts) and ask how to queue it: the next free slot, a specific time,
   or keep it as a draft. Don't schedule, publish or delete without their go-ahead.
5. **Save**: `threadsmith new --file draft.txt --at next --json` (or `create_post` with `schedule: "next"`).
   An exact time is ISO-8601 with an offset, e.g. `2026-11-03T09:00:00+07:00`.
6. **Confirm**: report the post id and the scheduled time in the user's timezone; `threadsmith queue` shows
   the timeline and the remaining free slots.

Common follow-ups:

| Goal | CLI | MCP tool |
|---|---|---|
| What's scheduled? | `threadsmith queue --days 7` | `list_queue` |
| Open slots | `threadsmith slots 5` | `next_free_slots` |
| Read a post | `threadsmith show <id>` | `get_post` |
| Edit text (images stay put) | `threadsmith edit <id> --file new.txt` | `update_post` |
| Reschedule / unqueue | `threadsmith schedule <id> next` / `unschedule <id>` | `schedule_post` / `unschedule_post` |
| Post by hand | `threadsmith copy <id> --clipboard`, then `posted <id> --url <link>` | `export_thread`, `mark_published` |
| Failed post | `threadsmith show <id>` (read `error`), fix, `retry <id>` | `get_post`, `retry_post` |
| Add an image | `threadsmith new ... --image 2:chart.png` | `attach_image_from_url` |

Ids can be shortened to a unique prefix in the CLI. Piping works: `threadsmith ai threadify --file notes.md | threadsmith new --file -`.

## Writing threads that work on X

- **The first post carries the thread.** Most people only see it in their timeline. Lead with the most concrete,
  surprising or useful thing (a result, a number, a strong claim, a moment) and make it stand on its own.
  Skip "A thread 🧵", "1/", and "Here's what I learned" unless the user writes that way.
- **One idea per post.** Each post should still make sense if someone lands on it from a quote or reply.
- **Specific beats general.** Names, numbers, examples and before/after comparisons beat adjectives. Cut hedges,
  throat-clearing and filler.
- **Short is a feature.** Often one strong post beats a thread; 3 to 8 posts covers most threads. Stop when the
  material runs out.
- **End by landing the point.** State the takeaway; add a call to action only when there's something real to do.
- **Plain text.** X doesn't render Markdown. Use line breaks for rhythm. Hashtags rarely help; use them only if the
  user does.
- **Links:** posts with external links tend to get less reach and cost more to publish through the API. Leave links
  out unless the user wants one, and then put it in the last post (or a later reply), not the first.
- **Images:** up to 4 per post (PNG, JPEG, WebP or GIF, ≤ 5 MB). Always write alt text.
- **Their language.** Write in the language the user writes in. Don't translate unless asked.
- **Never invent** statistics, quotes, sources, links or experiences the user didn't give you.

## Counting and limits

- The limit is `maxChars` from the server: 280 for standard accounts, larger for X Premium.
- X weighs characters: most Latin text counts 1; CJK characters and each emoji count 2; Vietnamese letters with a
  built-in tone mark (ạ, ấ, ệ, ố, ữ…) count 2, so Vietnamese posts fill up sooner than they look; every URL counts 23.
  Don't count by eye; use `count` / `count_characters`.

## Honest constraints

- **Manual mode** (no X API keys on the server): nothing is posted automatically. At the scheduled time the user gets a
  browser notification, copies the thread (Copy button, `threadsmith copy`, or the X intent link, which only prefills
  the first post) and posts it by hand, then marks it posted. Say this plainly when you schedule in manual mode, and
  never claim something "will be posted" automatically.
- **API mode costs money per post.** On X's pay-per-use API each post costs about $0.015, and a post containing a URL
  about $0.20. A thread is billed per post (6 posts ≈ $0.09). Avoid gratuitous links; mention the cost when the user
  publishes something long or link-heavy.
- **Publishing is public and irreversible.** Only use `publish` / `publish_now` when the user explicitly asks to post now.
  Deleting in Threadsmith never removes anything already on X.
- **Failed threads resume.** `retry` continues after the last post that reached X, so it doesn't duplicate.
- **The server's AI copilot** (`threadsmith ai threadify|hooks|fit|rewrite`) is optional and may be off; you can always
  write the text yourself.
