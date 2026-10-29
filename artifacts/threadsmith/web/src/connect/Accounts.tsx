// Connected accounts: list (handle, problems, re-check, character limit, remove) and the connect flow, whose form
// is generated from the platform's credential fields in shared/platforms.ts.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, ExternalLink, LoaderCircle, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { PLATFORMS } from "../../../shared/platforms.ts";
import { PLATFORM_IDS, type Account, type Health, type PlatformId } from "../../../shared/types.ts";
import { api, ApiError } from "../api.ts";
import { Card } from "../components/Card.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { Popover } from "../components/Popover.tsx";
import { toast, toastError } from "../components/Toasts.tsx";
import { limitFor, PlatformIcon, useAccounts } from "../lib/platforms.tsx";
import { timeAgo } from "../lib/time.ts";
import { cx } from "../lib/util.ts";

const field = "h-9 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-3 focus:border-line-strong";
const smallBtn = "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-2 hover:bg-subtle hover:text-ink disabled:opacity-50";

export function Accounts({ health }: { health: Health }) {
  const { data: accounts, isPending } = useAccounts();
  const [connecting, setConnecting] = useState(false);
  return (
    <Card
      icon={<Users size={16} />}
      title="Accounts"
      badge="where your posts go"
      action={
        <button onClick={() => setConnecting(true)} className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-ink hover:bg-subtle">
          <Plus size={14} /> Connect account
        </button>
      }
    >
      <p>
        Pick connected accounts as destinations in the composer; each one publishes, and resumes after a failure, on its own. A post with no
        destinations keeps going to X {health.x.mode === "api" ? "with the API keys in .env" : "by copy & post"}.
      </p>
      {isPending ? (
        <LoaderCircle size={16} className="animate-spin text-ink-3" />
      ) : accounts?.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} health={health} />
          ))}
        </ul>
      ) : (
        <p className="text-ink-3">No accounts yet. Connect X, Bluesky, Mastodon, Threads, LinkedIn, Telegram or Discord.</p>
      )}
      {connecting && <ConnectDialog health={health} onClose={() => setConnecting(false)} />}
    </Card>
  );
}

function AccountRow({ account: a, health }: { account: Account; health: Health }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["accounts"] });
  const check = useMutation({
    mutationFn: () => api.checkAccount(a.id),
    onSuccess: (r) => {
      void refresh();
      if (r.lastError) toast({ title: `${r.label} needs attention`, description: r.lastError, tone: "error" });
      else toast({ title: `${r.label} is working`, tone: "success" });
    },
    onError: (e) => toastError("Couldn't check the account", e),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteAccount(a.id),
    onSuccess: () => {
      void refresh();
      toast({ title: `Removed ${a.label}` });
    },
    onError: (e) => {
      setConfirm(false);
      toastError(`Couldn't remove ${a.label}`, e);
    },
  });
  const info = PLATFORMS[a.platform];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-subtle text-ink">
        <PlatformIcon platform={a.platform} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-medium text-ink">{a.label}</span>
          {a.handle &&
            (a.profileUrl ? (
              <a href={a.profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-ink-2 hover:text-ink hover:underline">
                {a.handle} <ExternalLink size={11} />
              </a>
            ) : (
              <span className="text-ink-2">{a.handle}</span>
            ))}
        </p>
        <p className="text-xs text-ink-3">
          {info.name} · <LimitEditor account={a} health={health} />
          {a.verifiedAt && ` · checked ${timeAgo(a.verifiedAt)}`}
        </p>
        {a.lastError && (
          <p className="mt-1 flex items-start gap-1 text-xs break-words text-red-700 dark:text-red-300">
            <CircleAlert size={12} className="mt-0.5 shrink-0" /> {a.lastError}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => check.mutate()} disabled={check.isPending} className={smallBtn} title="Check the credentials with the platform">
          {check.isPending ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCw size={13} />} Check
        </button>
        <button
          onClick={() => (confirm ? remove.mutate() : setConfirm(true))}
          onBlur={() => setConfirm(false)}
          disabled={remove.isPending}
          aria-label={confirm ? `Confirm removing ${a.label}` : `Remove ${a.label}`}
          className={cx(smallBtn, confirm ? "bg-red-600 text-white hover:bg-red-700 hover:text-white" : "hover:text-red-600")}
        >
          <Trash2 size={13} /> {confirm && "Click again to remove"}
        </button>
      </div>
    </li>
  );
}

/** "300 characters" with a small editor for the per-account override (X Premium, an instance's own limit). */
function LimitEditor({ account: a, health }: { account: Account; health: Health }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(a.maxChars ? String(a.maxChars) : "");
  const fallback = a.platform === "x" ? health.maxChars : PLATFORMS[a.platform].maxChars;
  const save = useMutation({
    mutationFn: (maxChars: number | null) => api.updateAccount(a.id, { maxChars }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      setOpen(false);
    },
    onError: (e) => toastError("Couldn't change the limit", e),
  });
  return (
    <span className="relative">
      <button onClick={() => setOpen(!open)} className="underline decoration-dotted underline-offset-2 hover:text-ink" title="Change the character limit">
        {limitFor(a, health)} characters{a.maxChars ? " (custom)" : ""}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="top-full left-0 mt-1 w-64">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(value.trim() ? Number(value) : null);
          }}
          className="space-y-2 text-ink"
        >
          <label className="block text-xs font-medium text-ink-2">
            Character limit
            <input autoFocus type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} placeholder={String(fallback)} className={cx(field, "mt-1")} />
          </label>
          <p className="text-xs text-ink-3">Leave empty for {PLATFORMS[a.platform].name}'s default ({fallback}).{a.platform === "x" && " X Premium allows 25000."}</p>
          <button type="submit" disabled={save.isPending} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-ink text-sm font-medium text-canvas">
            {save.isPending && <LoaderCircle size={13} className="animate-spin" />} Save
          </button>
        </form>
      </Popover>
    </span>
  );
}

function ConnectDialog({ health, onClose }: { health: Health; onClose: () => void }) {
  const [platform, setPlatform] = useState<PlatformId | null>(null);
  return (
    <Dialog title={platform ? `Connect ${PLATFORMS[platform].name}` : "Connect an account"} onClose={onClose}>
      {platform ? (
        <ConnectForm key={platform} platform={platform} health={health} onBack={() => setPlatform(null)} onDone={onClose} />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PLATFORM_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setPlatform(id)}
              className="flex flex-col items-start gap-2 rounded-xl border border-line bg-canvas p-3 text-left hover:border-line-strong"
            >
              <PlatformIcon platform={id} size={18} />
              <span>
                <span className="block text-sm font-medium">{PLATFORMS[id].name}</span>
                <span className="block text-xs text-ink-3">{PLATFORMS[id].costNote.startsWith("Free") ? "Free" : "Paid API"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function ConnectForm({ platform, health, onBack, onDone }: { platform: PlatformId; health: Health; onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const info = PLATFORMS[platform];
  const [values, setValues] = useState<Record<string, string>>({});
  const [label, setLabel] = useState("");
  const [maxChars, setMaxChars] = useState("");
  const [error, setError] = useState<string | null>(null);
  const connect = useMutation({
    mutationFn: () =>
      api.connectAccount({
        platform,
        credentials: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())),
        label: label.trim() || undefined,
        maxChars: maxChars.trim() ? Number(maxChars) : undefined,
      }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      toast({ title: `Connected ${a.label}`, description: a.handle ?? undefined, tone: "success" });
      onDone();
    },
    // The platform's own reason (bad token, wrong instance…) belongs next to the fields, not in a toast.
    onError: (e) => (e instanceof ApiError && e.status === 400 ? setError(e.message) : toastError("Couldn't connect", e)),
  });
  const fallback = platform === "x" ? health.maxChars : info.maxChars;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        connect.mutate();
      }}
      className="space-y-3 text-sm"
    >
      <p className="text-xs leading-relaxed text-ink-2">{info.setup}</p>
      <p className={cx("rounded-lg px-2.5 py-1.5 text-xs", info.costNote.startsWith("Free") ? "bg-subtle text-ink-2" : "bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200")}>
        {info.costNote}
      </p>
      {info.credentials.map((f) => (
        <label key={f.key} className="block">
          <span className="text-xs font-medium text-ink-2">
            {f.label}
            {f.optional && <span className="font-normal text-ink-3"> (optional)</span>}
          </span>
          <input
            type={f.secret ? "password" : "text"}
            autoComplete={f.secret ? "new-password" : "off"}
            spellCheck={false}
            required={!f.optional}
            value={values[f.key] ?? ""}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className={cx(field, "mt-1 font-mono text-[13px]")}
          />
          {f.help && <span className="mt-0.5 block text-xs text-ink-3">{f.help}</span>}
        </label>
      ))}
      <div className="grid grid-cols-[1fr_8rem] gap-2">
        <label className="block">
          <span className="text-xs font-medium text-ink-2">
            Name <span className="font-normal text-ink-3">(optional)</span>
          </span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Defaults to the handle" className={cx(field, "mt-1")} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-2">Char limit</span>
          <input type="number" min={1} value={maxChars} onChange={(e) => setMaxChars(e.target.value)} placeholder={String(fallback)} className={cx(field, "mt-1")} />
        </label>
      </div>
      {platform === "x" && <p className="-mt-1 text-xs text-ink-3">X Premium accounts can post up to 25000 characters: set the limit to 25000.</p>}
      {error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs break-words text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          <CircleAlert size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button type="button" onClick={onBack} className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-ink-2 hover:bg-subtle hover:text-ink">
          <ArrowLeft size={14} /> Platforms
        </button>
        <button type="submit" disabled={connect.isPending} className="flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 font-medium text-canvas hover:opacity-90 disabled:opacity-50">
          {connect.isPending && <LoaderCircle size={14} className="animate-spin" />}
          {connect.isPending ? "Checking with " + info.name + "…" : "Connect"}
        </button>
      </div>
    </form>
  );
}
