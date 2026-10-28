// The home screen: a thread as sortable post cards (or one text area), autosaved, with scheduling and the copilot.
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlignLeft,
  CalendarClock,
  Copy,
  Ellipsis,
  Image as ImageIcon,
  LayoutList,
  LoaderCircle,
  MessageSquareQuote,
  PenLine,
  Plus,
  Rows3,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { joinThread, splitThread, weightedLength } from "../../../shared/thread.ts";
import type { Health, Post, Segment } from "../../../shared/types.ts";
import { api, ApiError, intentUrl, liveSummary, remainingThread } from "../api.ts";
import { Popover } from "../components/Popover.tsx";
import { dismissToast, toast, toastError } from "../components/Toasts.tsx";
import { useCommands, type Command } from "../lib/commands.ts";
import { copyThread as copyExport, useLiveEvent } from "../lib/live.ts";
import { adoptPostId, navigate, newDraft } from "../lib/router.ts";
import { formatWhen } from "../lib/time.ts";
import { cx, keys, uid } from "../lib/util.ts";
import { AiPanel, type AiSection } from "./AiPanel.tsx";
import { AltTextDialog } from "./AltTextDialog.tsx";
import { MAX_IMAGES, PostCard, type PendingUpload } from "./PostCard.tsx";
import { ScheduleBar, type Busy } from "./ScheduleBar.tsx";
import { StatusBanner } from "./StatusBanner.tsx";
import { blankSegment, isBlank, useDraft, type SaveState } from "./useDraft.ts";

const SEPARATOR = /^\s*-{3,}\s*$/m;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function pref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function savePref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // preferences are optional
  }
}

/** Split a card whose text now contains "---" lines. A trailing separator yields a new empty card to type into. */
function splitCard(value: string): string[] {
  const parts = splitThread(value);
  const pieces = value.split(new RegExp(SEPARATOR.source, "gm"));
  if (!parts.length || (pieces.length > 1 && !pieces[pieces.length - 1]!.trim())) parts.push("");
  return parts;
}

/** Dice similarity of character bigrams: how alike an edited post is to an old one (0..1). */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const grams = (t: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) ?? 0) + 1);
    return m;
  };
  const A = grams(a);
  const B = grams(b);
  let shared = 0;
  for (const [g, n] of A) shared += Math.min(n, B.get(g) ?? 0);
  const total = a.length + b.length - 2;
  return total > 0 ? (2 * shared) / total : 0;
}

/**
 * Text mode → segments, keeping each post's segment (id, images) wherever it can tell which post is which:
 * 1. posts whose text is unchanged (longest common subsequence against `base`, the thread when text mode opened,
 *    so an edit typed back restores every image where it was);
 * 2. unchanged posts that were moved;
 * 3. edited posts, matched within each gap between the anchors above to the most similar old post there.
 * Anything left is a new post without images.
 */
function segmentsFromText(text: string, base: Segment[], prev: Segment[]): Segment[] {
  const parts = splitThread(text);
  if (!parts.length) return [{ ...(base[0] ?? blankSegment()), text: "" }];
  const old = base.map((s) => s.text.trim());
  const n = parts.length;
  const m = old.length;

  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i]![j] = parts[i] === old[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const match = new Array<number>(n).fill(-1);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (parts[i] === old[j]) match[i++] = j++;
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) i++;
    else j++;
  }
  const used = new Set(match.filter((j) => j >= 0));

  parts.forEach((t, i) => {
    if (match[i]! >= 0) return;
    const j = old.findIndex((o, k) => !used.has(k) && o === t);
    if (j >= 0) {
      match[i] = j;
      used.add(j);
    }
  });

  for (let i = 0, lastBase = -1; i < n; ) {
    if (match[i]! >= 0) {
      lastBase = Math.max(lastBase, match[i]!);
      i++;
      continue;
    }
    let end = i;
    while (end < n && match[end]! < 0) end++;
    const nextBase = end < n ? match[end]! : m;
    const free: number[] = [];
    for (let j = lastBase + 1; j < nextBase; j++) if (!used.has(j)) free.push(j);
    const pairs = free
      .flatMap((j) => Array.from({ length: end - i }, (_, k) => ({ k: i + k, j, score: similarity(parts[i + k]!, old[j]!) })))
      .sort((a, b) => b.score - a.score || Math.abs(a.k - i - (a.j - lastBase - 1)) - Math.abs(b.k - i - (b.j - lastBase - 1)));
    for (const { k, j } of pairs) {
      if (match[k]! < 0 && !used.has(j)) {
        match[k] = j;
        used.add(j);
      }
    }
    i = end;
  }

  const baseIds = new Set(base.map((s) => s.id));
  return parts.map((t, i): Segment => {
    if (match[i]! >= 0) return { ...base[match[i]!]!, text: t };
    const id = prev[i]?.id; // a post being typed keeps its id from one keystroke to the next
    return id && !baseIds.has(id) ? { id, text: t, mediaIds: [] } : blankSegment(t);
  });
}

interface Props {
  sessionKey: string;
  postId: string | null;
  slot: string | null;
  fromReminder: boolean;
  health: Health;
}

export function Composer(props: Props) {
  const { health, sessionKey } = props;
  const qc = useQueryClient();
  const maxChars = health.maxChars;
  const aiEnabled = health.ai.configured;

  const onCreated = useCallback(
    (post: Post) => {
      adoptPostId(post.id, sessionKey);
      void qc.invalidateQueries({ queryKey: ["posts"] });
    },
    [qc, sessionKey],
  );
  const draft = useDraft(props.postId, onCreated);
  const thread = draft.thread;
  const post = draft.post;
  const readOnly = post?.status === "published" || post?.status === "publishing";
  // A thread that stopped partway on X: its first posts are live, so they can't change (Retry resumes by position).
  const liveCount = readOnly ? 0 : Math.min(post?.xPostIds.length ?? 0, thread?.length ?? 0);
  const isLocked = (index: number) => readOnly || index < liveCount;

  const [textMode, setTextMode] = useState(() => pref("threadsmith:textMode", false));
  const [aiOpen, setAiOpen] = useState(() => pref("threadsmith:copilot", aiEnabled));
  const [aiFocus, setAiFocus] = useState<{ section: AiSection; nonce: number } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Record<string, PendingUpload[]>>({});
  const [altFor, setAltFor] = useState<string | null>(null);
  const [fitting, setFitting] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [slotTarget, setSlotTarget] = useState(props.slot);

  const textareas = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; at: "start" | "end" } | null>(null);
  const aiUndo = useRef<Segment[] | null>(null);
  const autoFocused = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleting = useRef<string | null>(null);

  useLayoutEffect(() => {
    // A fresh draft focuses its first card so typing starts immediately.
    if (thread && !autoFocused.current) {
      autoFocused.current = true;
      if (!props.postId && isBlank(thread)) pendingFocus.current = { id: thread[0]!.id, at: "end" };
    }
    const f = pendingFocus.current;
    if (!f) return;
    const el = textareas.current.get(f.id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus();
    const pos = f.at === "start" ? 0 : el.value.length;
    el.setSelectionRange(pos, pos);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });

  // Keep the drafts sidebar title in sync without waiting for the SSE round trip.
  useEffect(() => {
    if (!post) return;
    qc.setQueryData<Post[]>(["posts", "draft"], (list) => list?.map((p) => (p.id === post.id ? post : p)));
  }, [post, qc]);

  useLiveEvent((event) => {
    if (event.type === "post.deleted") {
      if (event.id === draft.currentId() && event.id !== deleting.current) {
        toast({ title: "This draft was deleted elsewhere" });
        newDraft();
      }
    } else draft.applyRemote(event.post);
  });

  const empty = !thread || isBlank(thread);
  const segIndex = (id: string) => draft.thread?.findIndex((s) => s.id === id) ?? -1;
  const focusCard = (id: string, at: "start" | "end") => (pendingFocus.current = { id, at });

  /** Any user edit invalidates the AI undo snapshot. */
  const edit = (next: Segment[] | ((prev: Segment[]) => Segment[])) => {
    if (aiUndo.current) {
      aiUndo.current = null;
      dismissToast("ai-undo");
    }
    draft.setThread(next);
  };

  const applyAi = (next: Segment[], label: string) => {
    if (readOnly) return toast({ title: "This post can no longer be edited", tone: "error" });
    aiUndo.current = draft.thread;
    draft.setThread(next);
    toast({ id: "ai-undo", title: label, tone: "success", actions: [{ label: `Undo (${keys.undo})`, onClick: undoAi }], duration: 10_000 });
  };
  const undoAi = () => {
    if (!aiUndo.current) return;
    draft.setThread(aiUndo.current);
    aiUndo.current = null;
    dismissToast("ai-undo");
    toast({ id: "ai-reverted", title: "Reverted the AI change" });
  };

  const onCardChange = (id: string, value: string) => {
    if (!SEPARATOR.test(value)) {
      edit((prev) => prev.map((s) => (s.id === id ? { ...s, text: value } : s)));
      return;
    }
    const parts = splitCard(value);
    edit((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const replaced = parts.map((t, j) => (j === 0 ? { ...prev[i]!, text: t } : blankSegment(t)));
      focusCard(replaced[replaced.length - 1]!.id, "end");
      return [...prev.slice(0, i), ...replaced, ...prev.slice(i + 1)];
    });
  };

  const addPost = (afterText?: { id: string; text: string }) => {
    const seg = blankSegment();
    edit((prev) => [...prev.map((s) => (afterText && s.id === afterText.id ? { ...s, text: afterText.text } : s)), seg]);
    focusCard(seg.id, "end");
  };

  const removePost = (id: string) => {
    const i = segIndex(id);
    if (isLocked(i)) return;
    edit((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
    const neighbour = draft.thread?.[i > 0 ? i - 1 : 1];
    if (neighbour) focusCard(neighbour.id, "end");
  };

  const onCardKeyDown = (seg: Segment) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const list = draft.thread ?? [];
    const i = list.findIndex((s) => s.id === seg.id);
    const collapsed = el.selectionStart === el.selectionEnd;
    const atStart = collapsed && el.selectionStart === 0;
    const atEnd = collapsed && el.selectionEnd === el.value.length;
    const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;
    const editable = !isLocked(i);
    // Two Enters make a blank line (a paragraph break); a third at the end of the last post starts a new post.
    if (editable && e.key === "Enter" && plain && atEnd && i === list.length - 1 && el.value.endsWith("\n\n") && el.value.trim()) {
      e.preventDefault();
      addPost({ id: seg.id, text: el.value.replace(/\n+$/, "") });
    } else if (e.key === "Enter" && plain && !el.value && i > 0) {
      e.preventDefault(); // e.g. Enter right after typing "---": don't start the new post with a blank line
    } else if (editable && e.key === "Backspace" && plain && !el.value && i > 0 && !seg.mediaIds.length) {
      e.preventDefault();
      removePost(seg.id);
    } else if (e.key === "ArrowUp" && plain && atStart && i > 0) {
      e.preventDefault();
      focusCard(list[i - 1]!.id, "end");
      setFocusedId(list[i - 1]!.id);
    } else if (e.key === "ArrowDown" && plain && atEnd && i < list.length - 1) {
      e.preventDefault();
      focusCard(list[i + 1]!.id, "start");
      setFocusedId(list[i + 1]!.id);
    }
  };

  const addImages = async (segId: string, files: File[]) => {
    const seg = draft.thread?.find((s) => s.id === segId);
    if (!seg) return;
    const room = MAX_IMAGES - seg.mediaIds.length - (uploads[segId]?.length ?? 0);
    if (files.length > room) toast({ title: `Up to ${MAX_IMAGES} images per post`, tone: "error" });
    const accepted = files.slice(0, Math.max(room, 0)).filter((f) => {
      if (!IMAGE_TYPES.includes(f.type)) toast({ title: `${f.name || "That file"} isn't a PNG, JPEG, WebP or GIF`, tone: "error" });
      else if (f.size > MAX_IMAGE_BYTES) toast({ title: `${f.name || "Image"} is over X's 5 MB limit`, tone: "error" });
      else return true;
      return false;
    });
    const pending = accepted.map((file) => ({ key: uid(), url: URL.createObjectURL(file), file }));
    if (!pending.length) return;
    setUploads((u) => ({ ...u, [segId]: [...(u[segId] ?? []), ...pending] }));
    await Promise.all(
      pending.map(async (item) => {
        try {
          const media = await api.uploadMedia(item.file);
          qc.setQueryData(["media", media.id], media);
          edit((prev) => prev.map((s) => (s.id === segId ? { ...s, mediaIds: [...s.mediaIds, media.id] } : s)));
        } catch (e) {
          toastError(`Couldn't upload ${item.file.name || "the image"}`, e);
        } finally {
          setUploads((u) => ({ ...u, [segId]: (u[segId] ?? []).filter((x) => x.key !== item.key) }));
          URL.revokeObjectURL(item.url);
        }
      }),
    );
  };

  const fitPost = async (seg: Segment) => {
    setFitting(seg.id);
    try {
      const { text } = await api.ai.fit(seg.text, maxChars);
      applyAi(
        (draft.thread ?? []).map((s) => (s.id === seg.id ? { ...s, text } : s)),
        `Fit post ${segIndex(seg.id) + 1} to ${maxChars}`,
      );
    } catch (e) {
      toastError("Couldn't shorten the post", e);
    } finally {
      setFitting(null);
    }
  };

  const overLimit = () => (draft.thread ?? []).findIndex((s) => weightedLength(s.text) > maxChars);

  const slotPassed = (at: string) =>
    toast({
      title: `${formatWhen(at, health.timezone)} has already passed`,
      description: "Pick a later time, or use the next free slot.",
      tone: "error",
      duration: 10_000,
      actions: [
        {
          label: "Use next free slot",
          primary: true,
          onClick: () => {
            setSlotTarget(null);
            void actions.current.schedule("next");
          },
        },
      ],
    });

  /** Save, then schedule. "next" lets the server pick the next free slot. */
  const schedule = async (at: string) => {
    if (empty) return toast({ title: "Write something first" });
    if (at !== "next" && Date.parse(at) < Date.now() - 60_000) return slotPassed(at);
    const over = overLimit();
    if (over >= 0)
      return toast({
        title: `Post ${over + 1} is over the ${maxChars} limit`,
        description: aiEnabled ? "Shorten it, or use “Fit” on the card." : "Shorten it before scheduling.",
        tone: "error",
      });
    setBusy("queue");
    try {
      await draft.flush();
      const id = draft.currentId();
      if (!id) throw new Error("The draft hasn't been saved yet");
      const saved = await api.schedule(id, at);
      setPickerOpen(false);
      toast({
        title: `Queued for ${formatWhen(saved.scheduledAt!, health.timezone)}`,
        tone: "success",
        actions: [
          { label: "View queue", onClick: () => navigate("/queue") },
          { label: "Edit", onClick: () => navigate(`/?post=${id}`) },
        ],
      });
      void qc.invalidateQueries({ queryKey: ["queue"] });
      void qc.invalidateQueries({ queryKey: ["slots"] });
      newDraft();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && at !== "next" && Date.parse(at) < Date.now()) slotPassed(at);
      else toastError("Couldn't schedule", e);
      setBusy(null);
    }
  };

  /** Ctrl+Enter / palette "Add to queue": what the footer's main button does; a scheduled post keeps its time. */
  const queueShortcut = () => {
    if (readOnly) return;
    if (post?.status === "scheduled" && post.scheduledAt) {
      void draft.flush();
      return toast({
        id: "still-scheduled",
        title: `Saved · still scheduled for ${formatWhen(post.scheduledAt, health.timezone)}`,
        description: "Use “Change time” to move it.",
      });
    }
    void schedule(slotTarget ?? "next");
  };

  const unschedule = async () => {
    const id = draft.currentId();
    if (!id) return;
    setBusy("unschedule");
    try {
      draft.setPost(await api.unschedule(id));
      toast({ title: "Moved back to drafts" });
    } catch (e) {
      toastError("Couldn't unschedule", e);
    } finally {
      setBusy(null);
    }
  };

  const publishNow = async () => {
    if (overLimit() >= 0) return toast({ title: "A post is over the character limit", tone: "error" });
    setBusy("publish");
    try {
      await draft.flush();
      const result = await api.publish(draft.currentId()!);
      draft.setPost(result);
      if (result.status === "published")
        toast({
          id: `published-${result.id}`,
          title: "Posted to X",
          tone: "success",
          actions: result.url ? [{ label: "View on X", onClick: () => open(result.url!, "_blank", "noopener") }] : undefined,
        });
    } catch (e) {
      toastError("Couldn't publish", e);
    } finally {
      setBusy(null);
    }
  };

  /** Starts the clipboard write synchronously (gesture), resolving the text after the save + export. */
  const copyThread = async (): Promise<boolean> => {
    if (empty) {
      toast({ title: "Nothing to copy yet" });
      return false;
    }
    return copyExport(draft.flush().then(() => draft.currentId()!));
  };

  const deleteDraft = async () => {
    const id = draft.currentId();
    if (id && !confirmDelete) return setConfirmDelete(true);
    setMenuOpen(false);
    if (!id) return newDraft();
    deleting.current = id;
    try {
      await api.deletePost(id);
      void qc.invalidateQueries({ queryKey: ["posts"] });
      toast({ title: post?.status === "draft" ? "Draft deleted" : "Post deleted" });
      newDraft();
    } catch (e) {
      deleting.current = null;
      setConfirmDelete(false);
      toastError("Couldn't delete", e);
    }
  };

  const toggleText = () =>
    setTextMode((v) => {
      savePref("threadsmith:textMode", !v);
      return !v;
    });
  const toggleAi = (open?: boolean) =>
    setAiOpen((v) => {
      const next = open ?? !v;
      savePref("threadsmith:copilot", next);
      return next;
    });
  const openAi = (section: AiSection) => {
    toggleAi(true);
    setAiFocus({ section, nonce: Date.now() });
  };

  // Latest handlers for global shortcuts and palette commands (registered once).
  const actions = useRef({ schedule, queueShortcut, copyThread, undoAi, toggleText, openAi, publishNow, setPickerOpen });
  useEffect(() => {
    actions.current = { schedule, queueShortcut, copyThread, undoAi, toggleText, openAi, publishNow, setPickerOpen };
  });

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      // Shortcuts belong to the thread editor or the page, not to other fields (mark-posted URL, time picker,
      // copilot prompt) or dialogs on top of it (alt text, palette), which handle their own keys.
      const field = e.target instanceof Element ? e.target.closest("input, textarea, select, [contenteditable='true'], dialog") : null;
      if (!mod || e.defaultPrevented || (field && !field.closest("[data-thread-editor]"))) return;
      const a = actions.current;
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        a.queueShortcut();
      } else if (e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void a.copyThread();
      } else if (e.key.toLowerCase() === "z" && !e.shiftKey && aiUndo.current) {
        e.preventDefault();
        a.undoAi();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo<Command[]>(() => {
    const a = () => actions.current;
    const list: Command[] = [
      { id: "queue", group: "Thread", title: "Add to queue", icon: CalendarClock, shortcut: keys.queue, run: () => a().queueShortcut() },
      { id: "pick", group: "Thread", title: "Schedule for a specific time…", icon: CalendarClock, run: () => a().setPickerOpen(true) },
      { id: "copy", group: "Thread", title: "Copy thread", icon: Copy, shortcut: keys.copy, run: () => void a().copyThread() },
      { id: "text", group: "Thread", title: "Toggle text mode", icon: AlignLeft, keywords: "cards markdown plain", run: () => a().toggleText() },
      { id: "ai-threadify", group: "AI", title: "Threadify notes into a thread…", icon: Rows3, keywords: "copilot generate", run: () => a().openAi("threadify") },
      { id: "ai-hooks", group: "AI", title: "Suggest opening hooks", icon: MessageSquareQuote, keywords: "copilot first post", run: () => a().openAi("hooks") },
      { id: "ai-rewrite", group: "AI", title: "Rewrite the focused post…", icon: PenLine, keywords: "copilot edit", run: () => a().openAi("rewrite") },
    ];
    if (health.x.mode === "api")
      list.push({ id: "publish", group: "Thread", title: "Publish now", icon: Send, run: () => void a().publishNow() });
    return list;
  }, [health.x.mode]);
  useCommands("composer", commands);

  if (draft.missing)
    return (
      <div className="grid flex-1 place-items-center p-8 text-center">
        <div>
          <p className="font-medium">This post no longer exists</p>
          <p className="mt-1 text-sm text-ink-2">It may have been deleted by you or an agent.</p>
          <button onClick={() => newDraft()} className="mt-4 rounded-lg bg-ink px-3.5 py-2 text-sm font-medium text-canvas">
            Start a new draft
          </button>
        </div>
      </div>
    );

  const focused = thread?.find((s) => s.id === focusedId) ?? null;
  const focusedIndex = focused && thread ? thread.indexOf(focused) : -1;
  const aiTarget = focused && !isLocked(focusedIndex) ? { index: focusedIndex, text: focused.text } : null;
  const showText = textMode && !readOnly && liveCount === 0;
  // "Open in X" prefills the first post that isn't on X yet, as a reply when earlier posts are live.
  const openInX = post && thread ? remainingThread({ ...post, thread }).intent : intentUrl(thread?.[0]?.text ?? "");

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4 sm:px-6">
          <StatusLabel post={post} saveState={draft.saveState} tz={health.timezone} />
          <div className="flex-1" />
          {!readOnly && (
            <div role="group" aria-label="Editor mode" className="flex rounded-lg border border-line p-0.5">
              {[
                { on: !showText, icon: LayoutList, label: "Cards" },
                { on: showText, icon: AlignLeft, label: "Text" },
              ].map(({ on, icon: Icon, label }) => (
                <button
                  key={label}
                  aria-pressed={on}
                  onClick={() => !on && toggleText()}
                  disabled={label === "Text" && liveCount > 0}
                  title={
                    label === "Cards"
                      ? "One card per post"
                      : liveCount > 0
                        ? `Text mode is off for this thread: ${liveSummary(liveCount)} and can't be changed. Edit the rest as cards.`
                        : "Whole thread as one text, posts separated by ---"
                  }
                  className={cx(
                    "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    on ? "bg-subtle text-ink" : "text-ink-3 enabled:hover:text-ink",
                  )}
                >
                  <Icon size={14} />
                  <span className="max-sm:hidden">{label}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => toggleAi()}
            aria-pressed={aiOpen}
            aria-label="Copilot"
            className={cx(
              "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors",
              aiOpen ? "bg-ai-soft text-ai" : "text-ink-2 hover:bg-subtle hover:text-ink",
            )}
          >
            <Sparkles size={15} className={aiEnabled ? "text-ai" : undefined} />
            <span className="max-sm:hidden">Copilot</span>
          </button>
          <div className="relative">
            <button onClick={() => (setMenuOpen(!menuOpen), setConfirmDelete(false))} aria-label="More" className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-subtle">
              <Ellipsis size={16} />
            </button>
            <Popover
              open={menuOpen}
              onClose={() => (setMenuOpen(false), setConfirmDelete(false))}
              className="top-full right-0 mt-1 w-52 p-1 max-sm:top-auto"
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  newDraft();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-subtle"
              >
                <Plus size={15} /> New draft
              </button>
              {post && post.status !== "publishing" && post.status !== "published" && (
                <button
                  onClick={() => void deleteDraft()}
                  className={cx(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm",
                    confirmDelete ? "bg-red-600 font-medium text-white" : "text-red-600 hover:bg-subtle",
                  )}
                >
                  <Trash2 size={15} /> {confirmDelete ? "Click again to delete" : `Delete ${post.status === "draft" ? "draft" : "post"}`}
                </button>
              )}
            </Popover>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[640px] px-3 pt-2 pb-16 sm:px-6">
            {post && (
              <StatusBanner
                post={post}
                health={health}
                fromReminder={props.fromReminder}
                onCopy={copyThread}
                onPublish={publishNow}
                flush={draft.flush}
                onChange={draft.setPost}
              />
            )}
            {slotTarget && !post?.scheduledAt && (
              <p className="mb-3 ml-10 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                <span>
                  Writing for the slot at <span className="font-medium text-ink-2">{formatWhen(slotTarget, health.timezone)}</span>
                  {Date.parse(slotTarget) < Date.now() && <span className="text-amber-700 dark:text-amber-400"> (already passed)</span>}
                </span>
                <button onClick={() => setSlotTarget(null)} className="underline-offset-2 hover:text-ink hover:underline">
                  Use next free slot instead
                </button>
              </p>
            )}

            {textMode && liveCount > 0 && (
              <p className="mb-3 ml-10 text-xs text-ink-3">Showing cards: text mode is off while part of this thread is live on X.</p>
            )}
            <div data-thread-editor>
            {!thread ? (
              <div className="ml-10 space-y-3" aria-busy>
                <div className="h-28 animate-pulse rounded-2xl bg-subtle" />
                <div className="h-20 animate-pulse rounded-2xl bg-subtle" />
              </div>
            ) : showText ? (
              <TextMode thread={thread} maxChars={maxChars} onChange={edit} />
            ) : (
              <Cards
                thread={thread}
                onReorder={(e) => {
                  const from = thread.findIndex((s) => s.id === e.active.id);
                  const to = thread.findIndex((s) => s.id === e.over?.id);
                  // Live posts stay where they are; nothing moves above them.
                  if (from >= liveCount && to >= liveCount && from !== to) edit((prev) => arrayMove(prev, from, to));
                }}
              >
                {thread.map((seg, i) => (
                  <PostCard
                    key={seg.id}
                    segment={seg}
                    index={i}
                    total={thread.length}
                    maxChars={maxChars}
                    readOnly={isLocked(i)}
                    liveUrl={i < liveCount ? `https://x.com/i/status/${post!.xPostIds[i]}` : undefined}
                    uploads={uploads[seg.id] ?? []}
                    aiEnabled={aiEnabled}
                    fitting={fitting === seg.id}
                    textareaRef={(el) => (el ? textareas.current.set(seg.id, el) : textareas.current.delete(seg.id))}
                    onChange={(v) => onCardChange(seg.id, v)}
                    onKeyDown={onCardKeyDown(seg)}
                    onFocus={() => setFocusedId(seg.id)}
                    onRemove={() => removePost(seg.id)}
                    onFiles={(files) => void addImages(seg.id, files)}
                    onRemoveImage={(mid) => edit((prev) => prev.map((s) => (s.id === seg.id ? { ...s, mediaIds: s.mediaIds.filter((m) => m !== mid) } : s)))}
                    onEditImage={setAltFor}
                    onFit={() => void fitPost(seg)}
                  />
                ))}
              </Cards>
            )}
            </div>

            {thread && !readOnly && !showText && (
              <div className="flex items-center gap-3 pl-10">
                <button
                  onClick={() => addPost()}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm whitespace-nowrap text-ink-2 hover:bg-subtle hover:text-ink"
                >
                  <Plus size={16} /> Add post
                </button>
                {busy === null && thread.length === 1 && (
                  <span className="text-xs text-ink-3">
                    or press <kbd className="rounded border border-line px-1 font-sans">Enter</kbd> 3×, or type{" "}
                    <kbd className="rounded border border-line px-1 font-mono whitespace-nowrap">---</kbd> on its own line
                  </span>
                )}
              </div>
            )}
            {thread && !readOnly && (
              <p className="mt-10 hidden text-center text-xs text-ink-3 sm:block">
                {post?.status !== "scheduled" && (
                  <>
                    <kbd className="font-sans">{keys.queue}</kbd> add to queue ·{" "}
                  </>
                )}
                <kbd className="font-sans">{keys.copy}</kbd> copy thread · <kbd className="font-sans">{keys.palette}</kbd> commands
              </p>
            )}
          </div>
        </div>

        {thread && !readOnly && (
          <footer className="shrink-0 border-t border-line bg-canvas/85 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
            <div className="mx-auto max-w-[640px]">
              <ScheduleBar
                health={health}
                post={post}
                empty={empty}
                openInX={openInX}
                live={liveCount}
                slotTarget={slotTarget}
                pickerOpen={pickerOpen}
                setPickerOpen={setPickerOpen}
                busy={busy}
                onQueue={() => void schedule(slotTarget ?? "next")}
                onSchedule={(iso) => void schedule(iso)}
                onUnschedule={() => void unschedule()}
                onPublish={() => void publishNow()}
                onCopy={() => void copyThread()}
              />
            </div>
          </footer>
        )}
      </div>

      {aiOpen && (
        <>
          <div onClick={() => toggleAi(false)} className="fixed inset-0 z-30 animate-fade bg-black/20 xl:hidden" />
          <aside className="z-40 w-[340px] shrink-0 border-l border-line bg-canvas max-xl:fixed max-xl:inset-y-0 max-xl:right-0 max-xl:w-[min(360px,100vw)] max-xl:animate-slide-in max-xl:shadow-2xl">
            <AiPanel
              ai={health.ai}
              maxChars={maxChars}
              thread={thread ?? []}
              target={aiTarget}
              focus={aiFocus}
              onClose={() => toggleAi(false)}
              onThreadify={(posts, mode) => {
                const fresh = posts.map((t) => blankSegment(t));
                const current = draft.thread ?? [];
                // Posts already live on X stay first and untouched, whatever the mode.
                const live = current.slice(0, liveCount);
                const keep = current.slice(liveCount).filter((s) => s.text.trim() || s.mediaIds.length);
                applyAi(
                  mode === "replace" ? [...live, ...fresh] : [...live, ...keep, ...fresh],
                  mode === "replace" ? `Wrote ${posts.length} posts` : `Added ${posts.length} posts`,
                );
              }}
              onReplacePost={(index, text, label) =>
                isLocked(index)
                  ? toast({ title: `Post ${index + 1} can't be changed`, description: `${liveSummary(liveCount)}.`, tone: "error" })
                  : applyAi((draft.thread ?? []).map((s, i) => (i === index ? { ...s, text } : s)), label)
              }
            />
          </aside>
        </>
      )}

      {altFor && <AltTextDialog mediaId={altFor} aiEnabled={aiEnabled} onClose={() => setAltFor(null)} />}
    </div>
  );
}

function Cards(p: { thread: Segment[]; onReorder: (e: DragEndEvent) => void; children: ReactNode }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={p.onReorder}>
      <SortableContext items={p.thread.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div>{p.children}</div>
      </SortableContext>
    </DndContext>
  );
}

function TextMode(p: { thread: Segment[]; maxChars: number; onChange: (thread: Segment[]) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const sig = JSON.stringify(p.thread.map((s) => s.text));
  // Raw text is local while typing; resync (and re-base the image mapping) when the thread changes from
  // elsewhere (AI, another device).
  const [raw, setRaw] = useState(() => ({ text: joinThread(p.thread.map((s) => s.text)), sig, base: p.thread }));
  if (raw.sig !== sig && JSON.stringify(splitThread(raw.text)) !== JSON.stringify(p.thread.map((s) => s.text.trim()).filter(Boolean))) {
    setRaw({ text: joinThread(p.thread.map((s) => s.text)), sig, base: p.thread });
  }
  useLayoutEffect(() => {
    const el = ref.current!;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
  }, [raw.text]);
  const parts = splitThread(raw.text);
  const kept = new Set(p.thread.flatMap((s) => s.mediaIds));
  const dropped = raw.base.flatMap((s) => s.mediaIds).filter((m) => !kept.has(m)).length;
  return (
    <div className="ml-10">
      <div className="rounded-2xl border border-line bg-surface px-4 py-3 focus-within:border-line-strong">
        <textarea
          ref={ref}
          autoFocus
          value={raw.text}
          onChange={(e) => {
            setRaw({ ...raw, text: e.target.value });
            p.onChange(segmentsFromText(e.target.value, raw.base, p.thread));
          }}
          spellCheck
          aria-label="Thread as text"
          placeholder={"First post\n\n---\n\nSecond post"}
          className="block w-full resize-none overflow-hidden bg-transparent text-base leading-relaxed placeholder:text-ink-3 sm:text-[17px]"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs tabular-nums">
        {parts.map((t, i) => {
          const n = weightedLength(t);
          const images = p.thread[i]?.mediaIds.length ?? 0;
          return (
            <span
              key={i}
              className={cx(
                "flex items-center gap-1 rounded-full px-2 py-0.5",
                n > p.maxChars ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-subtle text-ink-2",
              )}
            >
              {i + 1} · {n > p.maxChars ? `−${n - p.maxChars}` : n}
              {images > 0 && (
                <span className="flex items-center gap-0.5" title={`${images} image${images > 1 ? "s" : ""}`}>
                  · <ImageIcon size={11} aria-label="images" /> {images}
                </span>
              )}
            </span>
          );
        })}
        <span className="px-1 text-ink-3">Separate posts with a line containing only ---</span>
      </div>
      {dropped > 0 && (
        <p role="status" className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {dropped} image{dropped > 1 ? "s" : ""} belonged to a post you removed and will be dropped. Undo ({keys.undo}) to keep{" "}
          {dropped > 1 ? "them" : "it"}.
        </p>
      )}
    </div>
  );
}

function StatusLabel({ post, saveState, tz }: { post: Post | null; saveState: SaveState; tz: string }) {
  const status = post?.status ?? "draft";
  const label = { draft: "Draft", scheduled: "Scheduled", due: "Due now", publishing: "Publishing", published: "Published", failed: "Failed" }[
    status
  ];
  const dot = {
    draft: "bg-ink-3",
    scheduled: "bg-sky-500",
    due: "bg-amber-500",
    publishing: "bg-sky-500 animate-pulse",
    published: "bg-emerald-500",
    failed: "bg-red-500",
  }[status];
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className={cx("size-2 shrink-0 rounded-full", dot)} />
      <span className="font-medium">{label}</span>
      {status === "scheduled" && post?.scheduledAt && <span className="truncate text-ink-2 max-sm:hidden">{formatWhen(post.scheduledAt, tz)}</span>}
      <span className="flex items-center gap-1 text-xs text-ink-3" aria-live="polite">
        {saveState === "saving" && (
          <>
            <LoaderCircle size={12} className="animate-spin" /> Saving…
          </>
        )}
        {saveState === "saved" && "Saved"}
        {saveState === "offline" && <span className="text-amber-600 dark:text-amber-400">Offline · kept locally, retrying</span>}
      </span>
    </div>
  );
}
