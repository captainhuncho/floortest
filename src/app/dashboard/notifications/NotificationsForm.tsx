"use client";

import { useActionForm } from "@/components/useActionForm";
import {useEffect, useState, useTransition} from "react";
import { useToast } from "@/components/Toast";
import { sendDigestNow, updateNotifications } from "../actions";

type Prefs = { mode: "instant" | "digest" | "off"; digestHour: number; quietStart: number | null; quietEnd: number | null; alerts: boolean; tz: string };

const MODES = [
  { id: "instant", title: "Every new track", sub: "An email as each track arrives (held during quiet hours)." },
  { id: "digest", title: "Daily digest", sub: "One email a day listing new tracks." },
  { id: "off", title: "Off", sub: "No emails about new tracks. Check the bell instead." },
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
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime ${
                mode === m.id ? "border-lime/60 bg-lime/5" : "border-line hover:border-mute"
              }`}
            >
              <input type="radio" name="notify_submissions" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="mt-1 accent-lime" />
              <span>
                <span className="block font-medium">{m.title}</span>
                <span className="block text-sm text-mute">{m.sub}</span>
              </span>
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
        {mode !== "instant" && <p className="mt-2 text-sm text-mute">Only applies to “Every new track”.</p>}
      </fieldset>

      <fieldset>
        <legend className="font-semibold">Alerts</legend>
        <label className="mt-3 flex items-center gap-3">
          <input type="checkbox" name="notify_alerts" defaultChecked={prefs.alerts} className="h-4 w-4 accent-lime" />
          <span>Email me when my link pauses because my desk is full</span>
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
