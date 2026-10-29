// Reminder notifications (Web Push): enable, test, turn off. Manual mode relies on these to tell you when to post.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, LoaderCircle } from "lucide-react";
import { api } from "../api.ts";
import { toast, toastError } from "../components/Toasts.tsx";
import { disableReminders, enableReminders, reminderState, type ReminderState } from "../lib/reminders.ts";
import { Card } from "../components/Card.tsx";

const EXPLAIN: Record<ReminderState, string> = {
  on: "This browser gets a notification when a post is due, published or fails, even with Threadsmith closed.",
  off: "Get a notification at posting time with a one-click copy, even when this tab is closed.",
  denied: "Notifications are blocked for this site. Allow them in your browser's site settings, then come back.",
  insecure: "Browsers only allow push notifications on HTTPS or localhost. Put Threadsmith behind HTTPS to enable reminders.",
  unsupported: "This browser doesn't support push notifications. While the tab is open you'll still see in-app reminders.",
};

export function useReminders() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["reminders"], queryFn: reminderState, staleTime: Infinity });
  const enable = useMutation({
    mutationFn: enableReminders,
    onSuccess: (s) => {
      qc.setQueryData(["reminders"], s);
      if (s === "on") toast({ title: "Reminders are on", description: "You'll be notified when a post is due.", tone: "success" });
      else toast({ title: "Reminders not enabled", description: EXPLAIN[s] });
    },
    onError: (e) => toastError("Couldn't enable reminders", e),
  });
  return { state: state.data, enable };
}

export function Reminders() {
  const qc = useQueryClient();
  const { state, enable } = useReminders();
  const disable = useMutation({
    mutationFn: disableReminders,
    onSuccess: (s) => qc.setQueryData(["reminders"], s),
    onError: (e) => toastError("Couldn't turn off reminders", e),
  });
  const test = useMutation({
    mutationFn: api.pushTest,
    onSuccess: (r) => toast({ title: "Test sent", description: r.message }),
    onError: (e) => toastError("Test failed", e),
  });

  return (
    <Card icon={<Bell size={16} />} title="Reminders" badge="browser notifications">
      <p>{state ? EXPLAIN[state] : "Checking…"}</p>
      <div className="flex flex-wrap gap-2">
        {state === "on" ? (
          <>
            <button
              onClick={() => test.mutate()}
              disabled={test.isPending}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:bg-subtle"
            >
              {test.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <BellRing size={14} />} Send a test
            </button>
            <button onClick={() => disable.mutate()} className="h-9 rounded-lg px-3 text-sm text-ink-2 hover:bg-subtle">
              Turn off
            </button>
          </>
        ) : (
          <button
            onClick={() => enable.mutate()}
            disabled={enable.isPending || state === "insecure" || state === "unsupported"}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-40"
          >
            {enable.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Bell size={14} />} Enable reminders
          </button>
        )}
      </div>
    </Card>
  );
}
