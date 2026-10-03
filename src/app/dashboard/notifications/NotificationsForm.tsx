"use client";

import { useActionForm } from "@/components/useActionForm";
import {useEffect, useState, useTransition} from "react";
import { useToast } from "@/components/Toast";
import { sendDigestNow, updateNotifications } from "../actions";

type Prefs = { mode: "instant" | "digest" | "off"; digestHour: number; quietStart: number | null; quietEnd: number | null; alerts: boolean; product: boolean; tz: string };

const MODES = [
  { id: "instant", title: "Every new track", sub: "An email as each track arrives (held during quiet hours)." },
  { id: "digest", title: "Daily digest", sub: "One email a day listing new tracks." },
  { id: "off", title: "No track emails", sub: "No emails about new tracks. Check the bell instead." },
] as const;

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

function HourSelect({ name, value, label }: { name: string; value: number; label: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <select name={name} defaultValue={value} className="input w-32">
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {hourLabel(h)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function NotificationsForm({ prefs, pending }: { prefs: Prefs; pending: number }) {
  const [state, onSubmit, saving] = useActionForm(updateNotifications, undefined);
  const [mode, setMode] = useState(prefs.mode);
  const [alerts, setAlerts] = useState(prefs.alerts);
  const [product, setProduct] = useState(prefs.product);
  const [quiet, setQuiet] = useState(prefs.quietStart != null);
  const [tz, setTz] = useState(prefs.tz);
  const [sending, start] = useTransition();
  const toast = useToast();

  // Use the browser's timezone so "9:00" means 9:00 where the receiver is.
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || prefs.tz), [prefs.tz]);

  return (
    <form onSubmit={onSubmit} className="space-y-7">
      <input type="hidden" name="tz" value={tz} />
      <fieldset>
        <legend className="font-semibold">New tracks</legend>
        <div className="mt-3 grid gap-2">
          {MODES.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer flex-col gap-1.5 rounded-2xl border border-line bg-ink-2 px-3.5 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime"
            >
              <input type="radio" name="notify_submissions" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="sr-only" />
              <span className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-[0.6px] ${mode === m.id ? "text-lime" : "text-faint"}`}>{mode === m.id ? "On" : "Off"}</span>
                <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full ${mode === m.id ? "bg-line text-lime" : "border border-line"}`}>
                  {mode === m.id ? "✓" : <span className="size-1.5 rounded-full bg-line" />}
                </span>
              </span>
              <span className="text-[15px] font-bold">{m.title}</span>
              <span className="text-[11px] text-mute">{m.sub}</span>
            </label>
          ))}
        </div>
        {mode === "digest" && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <HourSelect name="digest_hour" value={prefs.digestHour} label="Send at" />
            <p className="pb-3 text-sm text-mute">Your time ({tz}). Skipped on days with nothing new.</p>
          </div>
        )}
      </fieldset>

      <div>
      <fieldset disabled={mode !== "instant"} className="disabled:opacity-50">
        <legend className="font-semibold">Quiet hours</legend>
        <label className="mt-3 flex items-center gap-3">
          <input type="checkbox" name="quiet" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} className="h-4 w-4 accent-lime" />
          <span>Hold new-track emails overnight or during sets</span>
        </label>
        {quiet && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <HourSelect name="quiet_start" value={prefs.quietStart ?? 23} label="From" />
            <HourSelect name="quiet_end" value={prefs.quietEnd ?? 9} label="Until" />
            <p className="pb-3 text-sm text-mute">Anything that arrives is sent as one email when quiet hours end.</p>
          </div>
        )}
      </fieldset>
      {mode !== "instant" && <p className="mt-2 text-sm text-mute">Quiet hours only apply to “Every new track”.</p>}
      </div>

      <fieldset>
        <legend className="font-semibold">Alerts</legend>
        <label className="mt-3 flex cursor-pointer flex-col gap-1.5 rounded-2xl border border-line bg-ink-2 px-3.5 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime">
          <input type="checkbox" name="notify_alerts" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} className="sr-only" />
          <span className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-[0.6px] ${alerts ? "text-lime" : "text-faint"}`}>{alerts ? "On" : "Off"}</span>
            <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full ${alerts ? "bg-line text-lime" : "border border-line"}`}>
                  {alerts ? "✓" : <span className="size-1.5 rounded-full bg-line" />}
                </span>
          </span>
          <span className="text-[15px] font-bold">Storage warning</span>
          <span className="text-[11px] text-mute">At 80% full, when your link pauses, and a week before tracks are auto-deleted</span>
        </label>
        <label className="mt-3 flex cursor-pointer flex-col gap-1.5 rounded-2xl border border-line bg-ink-2 px-3.5 py-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime">
          <input type="checkbox" name="notify_product" checked={product} onChange={(e) => setProduct(e.target.checked)} className="sr-only" />
          <span className="flex items-center justify-between">
            <span className={`text-[11px] font-bold uppercase tracking-[0.6px] ${product ? "text-lime" : "text-faint"}`}>{product ? "On" : "Off"}</span>
            <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full ${product ? "bg-line text-lime" : "border border-line"}`}>
                  {product ? "✓" : <span className="size-1.5 rounded-full bg-line" />}
                </span>
          </span>
          <span className="text-[15px] font-bold">Product updates</span>
          <span className="text-[11px] text-mute">New features and occasional news. No more than once a month</span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button className="btn-lime btn-sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={sending}
          onClick={() =>
            start(async () => {
              const n = await sendDigestNow();
              toast.show({ message: n ? `Digest sent: ${n} track${n === 1 ? "" : "s"}` : "Nothing new to send" });
            })
          }
        >
          {sending ? "Sending…" : `Send digest now${pending ? ` (${pending})` : ""}`}
        </button>
        {state?.ok && <span className="text-sm text-lime">Saved.</span>}
      </div>
    </form>
  );
}
