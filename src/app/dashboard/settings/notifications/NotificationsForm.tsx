"use client";

import { useActionForm } from "@/components/useActionForm";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { Icon } from "@/components/Kit";
import { sendDigestNow, updateNotifications } from "../../actions/settings";
import { browserTimeZone, useBrowserValue } from "@/components/useBrowserValue";
import { BTN, BTN_GHOST, FIELD, HELP, Notice, WELL } from "../ui";

type Prefs = { mode: "instant" | "digest" | "off"; digestHour: number; quietStart: number | null; quietEnd: number | null; alerts: boolean; product: boolean; marketing: boolean; tz: string };

const MODES = [
  { id: "instant", title: "Every new track", sub: "An email as tracks arrive, one per send (held during quiet hours)." },
  { id: "digest", title: "Daily digest", sub: "One email a day listing new tracks." },
  { id: "off", title: "No track emails", sub: "No emails about new tracks. Check the bell instead." },
] as const;

const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** A group's title inside the form. */
const LEGEND = "mb-2.5 text-[13px] font-semibold text-bone";

function HourSelect({ name, value, label }: { name: string; value: number; label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={FIELD}>{label}</span>
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

/** One choice row: the control's mark on the left, title and line beside it. Selected rows get a lime edge. */
function Choice({ type, name, value, checked, onChange, title, sub }: { type: "radio" | "checkbox"; name: string; value?: string; checked: boolean; onChange: (on: boolean) => void; title: string; sub: string }) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 border-t border-line px-3.5 py-3 first:border-t-0 has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-lime ${checked ? "bg-lime/[0.05]" : "hover:bg-card"}`}
    >
      <input type={type} name={name} value={value} checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span
        aria-hidden
        className={`mt-0.5 grid size-5 shrink-0 place-items-center border transition-colors motion-reduce:transition-none ${type === "radio" ? "rounded-full" : "rounded-[6px]"} ${checked ? "border-lime bg-lime text-ink" : "border-line-2 bg-card"}`}
      >
        {checked && <Icon name="check" className="size-4 [&_circle]:hidden" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-bone">{title}</span>
        <span className="block text-[12px] leading-snug text-mute">{sub}</span>
      </span>
    </label>
  );
}

export function NotificationsForm({ prefs, pending }: { prefs: Prefs; pending: number }) {
  const [state, onSubmit, saving] = useActionForm(updateNotifications, undefined);
  const [mode, setMode] = useState(prefs.mode);
  const [alerts, setAlerts] = useState(prefs.alerts);
  const [product, setProduct] = useState(prefs.product);
  const [marketing, setMarketing] = useState(prefs.marketing);
  const [quiet, setQuiet] = useState(prefs.quietStart != null);
  // Use the browser's timezone so "9:00" means 9:00 where the receiver is.
  const tz = useBrowserValue(browserTimeZone(prefs.tz), prefs.tz);
  const [sending, start] = useTransition();
  const toast = useToast();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-7">
      <input type="hidden" name="tz" value={tz} />
      <fieldset>
        <legend className={LEGEND}>New tracks</legend>
        <div className={`${WELL} overflow-hidden`}>
          {MODES.map((m) => (
            <Choice key={m.id} type="radio" name="notify_submissions" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} title={m.title} sub={m.sub} />
          ))}
        </div>
        {mode === "digest" && (
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <HourSelect name="digest_hour" value={prefs.digestHour} label="Send at" />
            <p className="pb-3 text-[12px] text-mute">Your time ({tz}). Skipped on days with nothing new.</p>
          </div>
        )}
      </fieldset>

      <div>
        <fieldset disabled={mode !== "instant"} className="disabled:opacity-50">
          <legend className={LEGEND}>Quiet hours</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px] text-bone">
            <input type="checkbox" name="quiet" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} className="size-5 accent-lime" />
            <span>Hold new-track emails overnight or during sets</span>
          </label>
          {quiet && (
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <HourSelect name="quiet_start" value={prefs.quietStart ?? 23} label="From" />
              <HourSelect name="quiet_end" value={prefs.quietEnd ?? 9} label="Until" />
              <p className="basis-full text-[12px] text-mute sm:basis-auto sm:pb-3">Anything that arrives is sent as one email when quiet hours end.</p>
            </div>
          )}
        </fieldset>
        {mode !== "instant" && <p className={`mt-1 ${HELP}`}>Quiet hours only apply to “Every new track”.</p>}
      </div>

      <fieldset>
        <legend className={LEGEND}>Alerts and news</legend>
        <div className={`${WELL} overflow-hidden`}>
          <Choice type="checkbox" name="notify_alerts" checked={alerts} onChange={setAlerts} title="Storage warning" sub="At 80% full, when your link pauses, and a week before tracks are auto-deleted" />
          <Choice type="checkbox" name="notify_product" checked={product} onChange={setProduct} title="Newsletter" sub="Product news and tips. No more than once a month" />
          <Choice type="checkbox" name="notify_marketing" checked={marketing} onChange={setMarketing} title="Offers and promotions" sub="Discounts, plan offers and partner events from FloorTest" />
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        {state?.error && (
          <Notice tone="error" next="Nothing was saved. Fix that and save again.">
            {state.error}
          </Notice>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <button className={`${BTN} sm:px-6!`} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={BTN_GHOST}
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
          <p role="status" className={state?.ok ? "text-[12.5px] font-semibold text-[#6aa636]" : "sr-only"}>
            {state?.ok ? "✓ Saved. Your next emails follow these choices." : ""}
          </p>
        </div>
      </div>
    </form>
  );
}
