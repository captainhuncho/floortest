"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Kit";

/** One price as shown in a row: the amount, an optional struck list price, and the line under it. */
export type PickPrice = { amount: string; list?: string; note: string };

/** What the one button under the list does for the picked plan (the same choices the laptop cards make). */
export type PickAction =
  | { kind: "current" }
  | { kind: "note"; text: string }
  | { kind: "pending"; href: string }
  | { kind: "go"; href: string; label: string }
  | { kind: "move"; label: string; action: () => Promise<void> };

export type PickRow = {
  id: string;
  name: string;
  /** "Your plan" or "Recommended", as small mute words beside the name. */
  tag: string;
  /** Room and the plan's line, e.g. "500 active tracks · For active DJs and curators". */
  sub: string;
  month: PickPrice;
  /** Only when the page has a Monthly / Yearly switch. */
  year?: PickPrice;
  /** "Everything in Free, plus:" (or "Included in every plan:" on the first plan). */
  linesHead: string;
  lines: string[];
  action: PickAction;
};

const LIME = "grid min-h-12 w-full place-items-center rounded-[14px] bg-lime px-4 text-[15px] font-semibold text-ink hover:brightness-95";
const OFF = "grid min-h-12 w-full place-items-center rounded-[14px] border border-dashed border-line-2 px-4 text-center text-[13px] text-mute";

function Price({ p }: { p: PickPrice }) {
  return (
    <span className="flex flex-col items-end text-right">
      <span className="flex items-baseline gap-1.5">
        {p.list && <s className="text-[12px] text-mute tnum">{p.list}</s>}
        <b className="font-mono text-[16px] font-bold tracking-[-0.02em] text-bone tnum">{p.amount}</b>
      </span>
      <span className="whitespace-nowrap text-[11.5px] text-faint">{p.note}</span>
    </span>
  );
}

function Action({ a }: { a: PickAction }) {
  switch (a.kind) {
    case "current":
      return (
        <p className={OFF} aria-disabled="true">
          <span className="flex items-center gap-1.5">
            <Icon name="tick" className="size-4" />
            Your plan
          </span>
        </p>
      );
    case "note":
      return <p className={OFF}>{a.text}</p>;
    case "pending":
      return (
        <Link href={a.href} className="grid min-h-12 w-full place-items-center rounded-[14px] border border-lime/40 bg-lime/10 px-4 text-[14px] font-semibold text-lime">
          Requested, in review
        </Link>
      );
    case "go":
      return (
        <Link href={a.href} className={LIME}>
          {a.label}
        </Link>
      );
    case "move":
      return (
        <form action={a.action}>
          <button className="grid min-h-12 w-full place-items-center rounded-[14px] border border-line bg-well px-4 text-[14px] font-semibold text-bone hover:border-line-2">
            {a.label}
          </button>
        </form>
      );
  }
}

/**
 * Plans on a phone: the plans as radio rows you pick from. The picked row opens to show what that plan adds, and one
 * button under the list acts on it. Native radios, so arrow keys, VoiceOver and forms all work as usual.
 */
export function PlanPick({ rows, initial, note }: { rows: PickRow[]; initial: string; note?: string }) {
  const [picked, setPicked] = useState(rows.some((r) => r.id === initial) ? initial : (rows[0]?.id ?? ""));
  const chosen = rows.find((r) => r.id === picked);
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Plans</legend>
        {rows.map((r) => {
          const on = r.id === picked;
          return (
            <label
              key={r.id}
              className={`flex cursor-pointer flex-col rounded-[16px] border bg-card px-3.5 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-lime ${on ? "border-bone/60" : "border-line"}`}
            >
              <span className="flex min-h-10 items-center gap-3">
                <input type="radio" name="plan-pick" value={r.id} checked={on} onChange={() => setPicked(r.id)} className="peer sr-only" />
                <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-bone" : "border-line-2"}`}>
                  {on && <span className="size-2.5 rounded-full bg-bone" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold text-bone">
                    {r.name}
                    {r.tag && <span className="ml-1.5 text-[11.5px] font-medium text-mute">{r.tag}</span>}
                  </span>
                  <span className="text-[12px] leading-[1.4] text-mute">{r.sub}</span>
                </span>
                {r.year ? (
                  <span className="period-stack">
                    <span className="period-month">
                      <Price p={r.month} />
                    </span>
                    <span className="period-year">
                      <Price p={r.year} />
                    </span>
                  </span>
                ) : (
                  <Price p={r.month} />
                )}
              </span>
              {on && r.lines.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-2 border-t border-line pt-2.5 pl-8 text-[13px] leading-5 text-bone">
                  <li className="text-[12px] font-semibold text-mute">{r.linesHead}</li>
                  {r.lines.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Icon name="tick" className="mt-0.5 size-4 shrink-0 text-mute" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
            </label>
          );
        })}
      </fieldset>
      {chosen && <Action a={chosen.action} />}
      {note && <p className="px-1 text-[12px] leading-5 text-faint">{note}</p>}
    </div>
  );
}
