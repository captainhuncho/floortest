"use client";

import { useState } from "react";
import { SaveBar } from "./SaveBar";
import { useActionForm } from "@/components/useActionForm";
import { ACCOUNT_TYPES, readTools, TOOL_IDS, TOOLS, toolDefault, type AccountType, type Tool } from "@/lib/account-types";

import { updateSettings } from "../actions/settings";

export function SettingsForm({ name, firstName, lastName, handle, base, nextChange, kind, kindNote, tools }: { name: string; firstName: string; lastName: string; handle: string; base: string; nextChange: string | null; kind: AccountType | null; kindNote: string; tools: string | null }) {
  const [state, onSubmit, pending] = useActionForm(updateSettings, undefined);
  const [type, setType] = useState<AccountType | null>(kind);
  // A tool follows the chosen type's default until it's switched by hand.
  const [picked, setPicked] = useState<Partial<Record<Tool, boolean>>>(() => readTools(tools));
  const isOn = (t: Tool) => picked[t] ?? toolDefault(type, t);
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">First name</span>
          <input name="first_name" defaultValue={firstName} autoComplete="given-name" className="input" required />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Surname</span>
          <input name="last_name" defaultValue={lastName} autoComplete="family-name" className="input" required />
        </label>
      </div>
      <p className="-mt-2 text-xs text-mute">Kept private: for your account, billing and receipts. Never shown on your page.</p>
      <label className="block space-y-1.5">
        <span className="label">Professional name</span>
        <input name="name" defaultValue={name} className="input" placeholder="DJ, artist or label name" />
        <span className="block text-xs text-mute">Shown on your page. Leave empty to show your username.</span>
      </label>
      <fieldset className="space-y-1.5">
        <legend className="label mb-1.5 block">What best describes you?</legend>
        <div className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.entries(ACCOUNT_TYPES) as [AccountType, string][]).map(([v, l]) => (
            <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line bg-ink-2 px-3 py-2.5 text-sm has-[:checked]:border-lime/70">
              <input type="radio" name="kind" value={v} checked={type === v} onChange={() => setType(v)} className="accent-lime" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block max-w-lg space-y-1.5">
        <span className="label">What you do (optional)</span>
        <input name="kind_note" defaultValue={kindNote} maxLength={80} className="input" placeholder="Manager, PR, publisher, promoter" />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="label mb-1.5 block">Tools</legend>
        <p className="text-xs text-mute">Your type switches these on. Turn any of them on or off.</p>
        {TOOL_IDS.map((t) => (
          <label key={t} className="flex max-w-lg min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line bg-ink-2 px-3 py-2.5 text-sm">
            <input type="checkbox" checked={isOn(t)} onChange={(e) => setPicked((p) => ({ ...p, [t]: e.target.checked }))} className="mt-0.5 accent-lime" />
            <span>
              <span className="block">{TOOLS[t].label}</span>
              <span className="block text-xs text-mute">{TOOLS[t].hint}</span>
            </span>
            <input type="hidden" name={`tool_${t}`} value={isOn(t) ? "on" : "off"} />
          </label>
        ))}
      </fieldset>
      <label className="block space-y-1.5">
        <span className="label">Username</span>
        <div className="flex items-stretch overflow-hidden rounded-md border border-line bg-ink-2 focus-within:border-lime/70">
          <span className="flex shrink-0 items-center pl-3 text-sm text-mute">{base.replace(/^https?:\/\//, "")}/</span>
          <input name="handle" defaultValue={handle} className="w-full min-w-0 bg-transparent py-2.5 pr-3 text-sm outline-none" required />
        </div>
        <span className="block text-xs text-mute">
          You can change it once a year{nextChange ? ` (next: ${nextChange})` : ""}. Your old link forwards here for 14 days, and you can switch back within that time. Update your bios first.
        </span>
      </label>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}
