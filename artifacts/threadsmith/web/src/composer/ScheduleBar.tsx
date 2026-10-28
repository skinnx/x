// Composer footer: add to queue (showing the real next slot), pick a time, publish now, copy, open in X.
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Copy, ExternalLink, LoaderCircle, Send, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Health, Post } from "../../../shared/types.ts";
import { api, intentUrl } from "../api.ts";
import { Popover } from "../components/Popover.tsx";
import { formatTime, formatWhen, fromZonedInput, toZonedInput } from "../lib/time.ts";
import { cx, modKey } from "../lib/util.ts";

export type Busy = "queue" | "publish" | "unschedule" | null;

interface Props {
  health: Health;
  post: Post | null;
  empty: boolean;
  firstPost: string;
  slotTarget: string | null;
  pickerOpen: boolean;
  busy: Busy;
  setPickerOpen: (open: boolean) => void;
  onClearSlot: () => void;
  onQueue: () => void;
  onSchedule: (iso: string) => void;
  onUnschedule: () => void;
  onPublish: () => void;
  onCopy: () => void;
}

const ghost = "flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-ink-2 hover:bg-subtle hover:text-ink disabled:opacity-40";

export function ScheduleBar(p: Props) {
  const tz = p.health.timezone;
  const { data: slots } = useQuery({ queryKey: ["slots"], queryFn: () => api.nextSlots(5), refetchInterval: 60_000 });
  const next = p.slotTarget ?? slots?.[0] ?? null;
  const scheduled = p.post?.status === "scheduled" && p.post.scheduledAt;
  const apiMode = p.health.x.mode === "api";
  const [confirmPublish, setConfirmPublish] = useState(false);

  useEffect(() => {
    if (!confirmPublish) return;
    const t = setTimeout(() => setConfirmPublish(false), 4000);
    return () => clearTimeout(t);
  }, [confirmPublish]);

  const { setPickerOpen } = p;
  const closePicker = useCallback(() => setPickerOpen(false), [setPickerOpen]);

  return (
    <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
      <button onClick={p.onCopy} disabled={p.empty} className={ghost} title={`Copy thread (${modKey}⇧C)`}>
        <Copy size={15} />
        <span className="max-sm:hidden">Copy</span>
      </button>
      <a
        href={p.empty ? undefined : intentUrl(p.firstPost)}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={p.empty}
        className={cx(ghost, p.empty && "pointer-events-none opacity-40")}
        title="Open the first post in X's composer"
      >
        <ExternalLink size={15} />
        <span className="max-sm:hidden">Open in X</span>
      </a>

      <div className="flex-1" />

      {p.slotTarget && !scheduled && (
        <span className="flex h-7 items-center gap-1 rounded-full bg-subtle pr-1 pl-2.5 text-xs text-ink-2 max-sm:hidden">
          For the {formatTime(p.slotTarget, tz)} slot
          <button onClick={p.onClearSlot} aria-label="Use the next free slot instead" className="rounded-full p-0.5 hover:bg-line">
            <X size={12} />
          </button>
        </span>
      )}

      <div className="relative">
        <button onClick={() => p.setPickerOpen(!p.pickerOpen)} disabled={p.empty} className={ghost} title="Schedule for a specific time">
          <CalendarClock size={15} />
          <span className="max-sm:hidden">{scheduled ? "Change time" : "Pick time"}</span>
        </button>
        <Popover open={p.pickerOpen} onClose={closePicker} className="right-0 bottom-full mb-2">
          <TimePicker tz={tz} initial={p.post?.scheduledAt ?? next} slots={slots ?? []} onPick={p.onSchedule} busy={p.busy === "queue"} />
        </Popover>
      </div>

      <span title={apiMode ? undefined : "Add X API keys to auto-post — see README"} className="inline-flex">
        <button
          onClick={() => (confirmPublish ? (setConfirmPublish(false), p.onPublish()) : setConfirmPublish(true))}
          disabled={!apiMode || p.empty || p.busy === "publish"}
          className={cx(ghost, confirmPublish && "bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300")}
        >
          {p.busy === "publish" ? <LoaderCircle size={15} className="animate-spin" /> : <Send size={15} />}
          <span className="max-sm:hidden">{confirmPublish ? "Confirm publish" : "Publish now"}</span>
        </button>
      </span>

      {scheduled ? (
        <div className="flex h-9 items-center gap-1 rounded-lg bg-sky-50 pr-1 pl-3 text-sm text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
          <span className="font-medium">{formatWhen(p.post!.scheduledAt!, tz)}</span>
          <button
            onClick={p.onUnschedule}
            disabled={p.busy === "unschedule"}
            className="rounded-md px-2 py-1 text-xs hover:bg-sky-100 dark:hover:bg-sky-900"
          >
            Unschedule
          </button>
        </div>
      ) : (
        <button
          onClick={p.onQueue}
          disabled={p.empty || p.busy === "queue"}
          className="flex h-9 items-center gap-2 rounded-lg bg-ink pr-2 pl-3.5 text-sm font-medium text-canvas shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {p.busy === "queue" && <LoaderCircle size={15} className="animate-spin" />}
          <span>{p.slotTarget ? "Schedule" : "Add to queue"}</span>
          {next && <span className="font-normal opacity-60 max-[380px]:hidden">{formatWhen(next, tz)}</span>}
          <kbd className="rounded bg-canvas/15 px-1.5 py-0.5 text-[11px] opacity-70 max-sm:hidden">{modKey}↵</kbd>
        </button>
      )}
    </div>
  );
}

function TimePicker(p: { tz: string; initial: string | null; slots: string[]; busy: boolean; onPick: (iso: string) => void }) {
  const [value, setValue] = useState(() => toZonedInput(p.initial ?? new Date(Date.now() + 3600_000).toISOString(), p.tz));
  const iso = value ? fromZonedInput(value, p.tz) : null;
  const past = iso ? new Date(iso).getTime() < Date.now() : true;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (iso && !past) p.onPick(iso);
      }}
      className="space-y-3"
    >
      <label className="block">
        <span className="text-xs font-medium text-ink-2">Post at</span>
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm focus:border-line-strong"
        />
        <span className="mt-1 block text-xs text-ink-3">Times are in {p.tz.replace(/_/g, " ")}</span>
      </label>
      {p.slots.length > 0 && (
        <div>
          <span className="text-xs font-medium text-ink-2">Free slots</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {p.slots.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setValue(toZonedInput(s, p.tz))}
                className={cx(
                  "rounded-full border px-2.5 py-1 text-xs",
                  toZonedInput(s, p.tz) === value ? "border-ink bg-ink text-canvas" : "border-line text-ink-2 hover:border-line-strong",
                )}
              >
                {formatWhen(s, p.tz)}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        type="submit"
        disabled={past || p.busy}
        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-ink text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-40"
      >
        {p.busy && <LoaderCircle size={15} className="animate-spin" />}
        {past ? "Pick a time in the future" : `Schedule for ${iso ? formatWhen(iso, p.tz) : ""}`}
      </button>
    </form>
  );
}
