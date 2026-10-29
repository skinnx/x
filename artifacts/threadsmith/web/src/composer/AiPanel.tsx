// Copilot panel: threadify notes, opening-hook variants, rewrite/fit the focused post.
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle, MessageSquareQuote, PenLine, Plug, Rows3, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { weightedLength } from "../../../shared/thread.ts";
import type { Health, Segment } from "../../../shared/types.ts";
import { api } from "../api.ts";
import { toastError } from "../components/Toasts.tsx";
import { navigate } from "../lib/router.ts";
import { cx, keys } from "../lib/util.ts";

export type AiSection = "threadify" | "hooks" | "rewrite";

const QUICK_REWRITES: [string, string][] = [
  ["Tighter", "Make it tighter: cut filler and redundancy, keep every idea."],
  ["Punchier", "Make it punchier and more confident, with a stronger first line."],
  ["Casual", "Make it more casual and conversational, like talking to a friend."],
  ["More specific", "Make it more concrete: replace vague claims with specifics or an example."],
  ["Fix grammar", "Fix grammar, spelling and punctuation only. Change nothing else."],
];

interface Props {
  ai: Health["ai"];
  maxChars: number;
  thread: Segment[];
  target: { index: number; text: string } | null;
  focus: { section: AiSection; nonce: number } | null;
  onClose: () => void;
  onThreadify: (posts: string[], mode: "replace" | "append") => void;
  onReplacePost: (index: number, text: string, label: string) => void;
}

export function AiPanel(p: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <Sparkles size={16} className="text-ai" />
        <h2 className="text-sm font-semibold">Copilot</h2>
        {p.ai.model && <span className="truncate rounded bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{p.ai.model}</span>}
        <div className="flex-1" />
        <button onClick={p.onClose} aria-label="Close copilot" className="rounded-md p-1.5 text-ink-3 hover:bg-subtle hover:text-ink">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">{p.ai.configured ? <Tools {...p} /> : <ConnectAi />}</div>
    </div>
  );
}

function ConnectAi() {
  return (
    <div className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
      <p className="font-medium text-ink">Connect an AI provider</p>
      <p className="mt-1.5 leading-relaxed">
        Add <code className="rounded bg-subtle px-1 font-mono text-xs">ANTHROPIC_API_KEY</code> to <code className="font-mono text-xs">.env</code>,
        then restart. The copilot turns notes
        into threads, writes hooks, fits long posts and describes images.
      </p>
      <button onClick={() => navigate("/connect")} className="mt-3 flex items-center gap-1 font-medium text-ai hover:underline">
        <Plug size={14} /> Connect settings <ArrowRight size={14} />
      </button>
    </div>
  );
}

function Section(p: { icon: ReactNode; title: string; hint: string; children: ReactNode; active?: boolean }) {
  return (
    <section className={cx("rounded-xl border bg-surface p-3.5 transition-colors", p.active ? "border-ai/50" : "border-line")}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-ai">{p.icon}</span>
        {p.title}
      </div>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-ink-2">{p.hint}</p>
      {p.children}
    </section>
  );
}

const input = "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm placeholder:text-ink-3 focus:border-line-strong";
const runButton =
  "flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity disabled:opacity-50";

function Tools(p: Props) {
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const instructionRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [angle, setAngle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [variants, setVariants] = useState<string[]>([]);
  const firstPost = p.thread[0]?.text.trim() ?? "";
  const threadEmpty = p.thread.every((s) => !s.text.trim());

  const threadify = useMutation({
    mutationFn: (mode: "replace" | "append") => api.ai.threadify(notes, angle).then((r) => ({ ...r, mode })),
    onSuccess: ({ posts, mode }) => {
      p.onThreadify(posts, mode);
      setNotes("");
    },
    onError: (e) => toastError("Threadify failed", e),
  });
  const hooks = useMutation({
    mutationFn: () => api.ai.hooks(firstPost, 3),
    onSuccess: (r) => setVariants(r.variants),
    onError: (e) => toastError("Couldn't write hooks", e),
  });
  const rewrite = useMutation({
    mutationFn: (args: { index: number; text: string; instruction: string; label: string }) =>
      api.ai.rewrite(args.text, args.instruction).then((r) => ({ ...args, result: r.text })),
    onSuccess: (r) => {
      p.onReplacePost(r.index, r.result, `${r.label} · post ${r.index + 1}`);
      setInstruction("");
    },
    onError: (e) => toastError("Rewrite failed", e),
  });
  const fit = useMutation({
    mutationFn: (args: { index: number; text: string }) => api.ai.fit(args.text, p.maxChars).then((r) => ({ ...args, result: r.text })),
    onSuccess: (r) => p.onReplacePost(r.index, r.result, `Fit post ${r.index + 1}`),
    onError: (e) => toastError("Couldn't shorten the post", e),
  });

  useEffect(() => {
    if (!p.focus) return;
    if (p.focus.section === "threadify") notesRef.current?.focus();
    if (p.focus.section === "rewrite") instructionRef.current?.focus();
    if (p.focus.section === "hooks" && firstPost) hooks.mutate();
    // Runs only when the palette asks again (new nonce), not on every edit.
  }, [p.focus?.nonce]);

  const target = p.target && p.target.text.trim() ? p.target : null;
  const runRewrite = (text: string, label: string) =>
    target && rewrite.mutate({ index: target.index, text: target.text, instruction: text, label });
  const targetOver = target ? weightedLength(target.text) > p.maxChars : false;

  return (
    <>
      <Section
        icon={<Rows3 size={15} />}
        title="Threadify"
        hint="Paste notes, a draft, an article or a transcript. Get a thread where every post fits."
        active={p.focus?.section === "threadify"}
      >
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && notes.trim()) {
              e.preventDefault();
              e.stopPropagation();
              threadify.mutate(threadEmpty ? "replace" : "append");
            }
          }}
          rows={5}
          placeholder="Raw notes, bullet points, a blog post…"
          className={cx(input, "resize-y leading-relaxed")}
        />
        <input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Angle or tone (optional)" className={cx(input, "mt-2")} />
        <div className="mt-2.5 flex gap-2">
          <button
            onClick={() => threadify.mutate("replace")}
            disabled={!notes.trim() || threadify.isPending}
            className={cx(runButton, "flex-1 bg-ai text-white hover:opacity-90 dark:text-black")}
          >
            {threadify.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {threadify.isPending ? "Writing…" : threadEmpty ? "Write thread" : "Replace thread"}
          </button>
          {!threadEmpty && (
            <button
              onClick={() => threadify.mutate("append")}
              disabled={!notes.trim() || threadify.isPending}
              className={cx(runButton, "border border-line hover:bg-subtle")}
            >
              Append
            </button>
          )}
        </div>
      </Section>

      <Section
        icon={<MessageSquareQuote size={15} />}
        title="Hooks"
        hint="Alternative opening posts. The first line decides whether anyone reads the rest."
        active={p.focus?.section === "hooks"}
      >
        <button
          onClick={() => hooks.mutate()}
          disabled={!firstPost || hooks.isPending}
          className={cx(runButton, "w-full border border-line hover:bg-subtle")}
        >
          {hooks.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} className="text-ai" />}
          {hooks.isPending ? "Thinking…" : firstPost ? (variants.length ? "Try 3 more" : "Suggest 3 openers") : "Write post 1 first"}
        </button>
        {variants.length > 0 && (
          <ul className="mt-2.5 space-y-2">
            {variants.map((v, i) => {
              const len = weightedLength(v);
              return (
                <li key={i} className="group rounded-lg border border-line bg-canvas p-2.5">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{v}</p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className={cx("text-xs tabular-nums", len > p.maxChars ? "text-red-600" : "text-ink-3")}>
                      {len}/{p.maxChars}
                    </span>
                    <button
                      onClick={() => {
                        p.onReplacePost(0, v, "New opener");
                        setVariants((vs) => vs.filter((_, j) => j !== i));
                      }}
                      className="rounded-md px-2 py-0.5 text-xs font-medium text-ai hover:bg-ai-soft"
                    >
                      Use as post 1
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        icon={<PenLine size={15} />}
        title={target ? `Rewrite post ${target.index + 1}` : "Rewrite"}
        hint={target ? "Applies to the post you were last editing." : "Click into a post, then tell the copilot what to change."}
        active={p.focus?.section === "rewrite"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim()) runRewrite(instruction.trim(), "Rewrote");
          }}
        >
          <input
            ref={instructionRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            disabled={!target}
            placeholder="e.g. lead with the number, drop the jargon"
            className={input}
          />
        </form>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_REWRITES.map(([label, text]) => (
            <button
              key={label}
              disabled={!target || rewrite.isPending}
              onClick={() => runRewrite(text, label)}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-ai/50 hover:text-ink disabled:opacity-40"
            >
              {label}
            </button>
          ))}
          {targetOver && (
            <button
              disabled={fit.isPending}
              onClick={() => target && fit.mutate(target)}
              className="rounded-full border border-red-300 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
            >
              Fit to {p.maxChars}
            </button>
          )}
        </div>
        {(rewrite.isPending || fit.isPending) && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-ink-2">
            <LoaderCircle size={13} className="animate-spin text-ai" /> Rewriting post {target ? target.index + 1 : ""}…
          </p>
        )}
      </Section>

      <p className="px-1 text-xs leading-relaxed text-ink-3">
        Every AI change can be undone with {keys.undo} or the Undo button. Agents can call the same copilot over the REST API
        (/api/ai/*) or the CLI.
      </p>
    </>
  );
}
