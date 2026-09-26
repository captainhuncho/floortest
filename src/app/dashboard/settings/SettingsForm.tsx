"use client";

import { useActionState } from "react";
import { updateSettings } from "../actions";

export function SettingsForm({ name, handle, base }: { name: string; handle: string; base: string }) {
  const [state, action, pending] = useActionState(updateSettings, undefined);
  return (
    <form action={action} className="mt-4 space-y-4">
      <label className="block space-y-1.5">
        <span className="label">Display name</span>
        <input name="name" defaultValue={name} className="input" required />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Receiver link</span>
        <div className="flex items-stretch overflow-hidden rounded-md border border-line bg-ink-2 focus-within:border-lime/70">
          <span className="flex items-center pl-3 text-sm text-mute">{base.replace(/^https?:\/\//, "")}/</span>
          <input name="handle" defaultValue={handle} className="w-full bg-transparent py-2.5 pr-3 text-sm outline-none" required />
        </div>
        <span className="block text-xs text-mute">Changing this breaks links you&apos;ve already shared.</span>
      </label>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p className="text-sm text-lime">Saved.</p>}
      <button className="btn-lime btn-sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
