"use client";

import { useState } from "react";
import { SaveBar } from "./SaveBar";
import { FIELD, HELP } from "./ui";
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
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>First name</span>
          <input name="first_name" defaultValue={firstName} autoComplete="given-name" className="input" required />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>Surname</span>
          <input name="last_name" defaultValue={lastName} autoComplete="family-name" className="input" required />
        </label>
      </div>
      <p className={`-mt-3 ${HELP}`}>Private. Never shown on your page.</p>
      <label className="flex flex-col gap-1.5">
        <span className={FIELD}>Professional name</span>
        <input name="name" defaultValue={name} className="input" placeholder="DJ, artist or label name" />
        <span className={HELP}>Shown on your page. Leave empty to show your username.</span>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className={`${FIELD} mb-2`}>What best describes you?</legend>
        <div className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.entries(ACCOUNT_TYPES) as [AccountType, string][]).map(([v, l]) => (
            <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[12px] border border-line bg-well px-3 py-2.5 text-[13px] text-bone transition-colors hover:border-line-2 has-[:checked]:border-lime/60 has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-lime motion-reduce:transition-none">
              <input type="radio" name="kind" value={v} checked={type === v} onChange={() => setType(v)} className="size-4 accent-lime" />
              {l}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex max-w-lg flex-col gap-1.5">
        <span className={FIELD}>What you do (optional)</span>
        <input name="kind_note" defaultValue={kindNote} maxLength={80} className="input" placeholder="Manager, PR, publisher, promoter" />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className={`${FIELD} mb-1`}>Tools</legend>
        <p className={`${HELP} -mt-1`}>Your type switches these on.</p>
        {TOOL_IDS.map((t) => (
          <label key={t} className="flex min-h-11 max-w-lg cursor-pointer items-start gap-3 rounded-[12px] border border-line bg-well px-3 py-2.5 text-[13px] hover:border-line-2">
            <input type="checkbox" checked={isOn(t)} onChange={(e) => setPicked((p) => ({ ...p, [t]: e.target.checked }))} className="mt-0.5 size-4 accent-lime" />
            <span>
              <span className="block font-semibold text-bone">{TOOLS[t].label}</span>
              <span className={HELP}>{TOOLS[t].hint}</span>
            </span>
            <input type="hidden" name={`tool_${t}`} value={isOn(t) ? "on" : "off"} />
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className={FIELD}>Username</span>
        <div className="flex items-stretch overflow-hidden rounded-md border border-field bg-well focus-within:border-lime/70 focus-within:ring-2 focus-within:ring-lime/15">
          <span className="flex shrink-0 items-center pl-3 text-[13px] text-mute">{base.replace(/^https?:\/\//, "")}/</span>
          <input name="handle" defaultValue={handle} className="min-h-11 w-full min-w-0 bg-transparent py-2.5 pr-3 text-[13px] text-bone outline-none" required />
        </div>
        <span className={HELP}>
          You can change it once a year{nextChange ? ` (next: ${nextChange})` : ""}. Your old link forwards here for 14 days, and you can switch back within that time. Update your bios first.
        </span>
      </label>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}
