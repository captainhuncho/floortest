"use client";

import { useActionForm } from "@/components/useActionForm";

import { updateSettings } from "../actions/settings";

export function SettingsForm({ name, handle, base, nextChange, kind }: { name: string; handle: string; base: string; nextChange: string | null; kind: string | null }) {
  const [state, onSubmit, pending] = useActionForm(updateSettings, undefined);
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <label className="block space-y-1.5">
        <span className="label">Display name</span>
        <input name="name" defaultValue={name} className="input" required />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="label mb-1.5 block">I&apos;m receiving music as</legend>
        <div className="grid max-w-lg grid-cols-3 gap-2">
          {[
            ["dj", "DJ or curator"],
            ["producer", "Producer"],
            ["label", "Label or A&R"],
          ].map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-ink-2 px-3 py-2.5 text-sm has-[:checked]:border-lime/70">
              <input type="radio" name="kind" value={v} defaultChecked={kind === v} className="accent-lime" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5">
        <span className="label">Your link</span>
        <div className="flex items-stretch overflow-hidden rounded-md border border-line bg-ink-2 focus-within:border-lime/70">
          <span className="flex items-center pl-3 text-sm text-mute">{base.replace(/^https?:\/\//, "")}/</span>
          <input name="handle" defaultValue={handle} className="w-full bg-transparent py-2.5 pr-3 text-sm outline-none" required />
        </div>
        <span className="block text-xs text-mute">
          Your link stays the same until you change it, and you can change it once a year{nextChange ? ` (next: ${nextChange})` : ""}. Your old link forwards here for 14 days and nobody else can take it; after that anyone can claim it, so update your bios first. Changed your mind? You can switch back within those 14 days.
        </span>
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-lime">Saved.</p>}
      <button className="btn-lime btn-sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
