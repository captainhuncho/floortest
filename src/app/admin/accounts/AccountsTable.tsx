"use client";

import Link from "next/link";
import { useState } from "react";
import { BULK_MAX, SUSPEND_MAX } from "@/lib/admin-bulk";
import { suspendAccounts, tagAccounts } from "../actions";
import { BulkBar } from "../kit/BulkBar";
import { useKitConfirm } from "../kit/Confirm";
import { cleanTag } from "../kit/core";
import { OpsButton } from "../kit/OpsButton";
import { useSelection } from "../kit/Selection";

export type AccountRow = {
  id: number;
  name: string;
  handle: string;
  email: string;
  plan: string;
  kind: string;
  live: number;
  joined: string;
  suspended: boolean;
  confirmed: boolean;
  twoFactor: boolean;
  tags: string[];
};

const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/**
 * The Users table with row selection (owner, 1 Nov 2026), on the ops kit's Selection and BulkBar. Checkboxes pick rows
 * (Shift-click picks a range; j/k, x, Shift+J/K, Space and ⌘A on the keyboard); the floating bar tags them or
 * suspends them. Suspending names who it affects and asks for one reason, which goes in each email and the admin log.
 * At most BULK_MAX picked, SUSPEND_MAX suspended at a time. A table on wide screens, stacked rows on phones.
 */
export function AccountsTable({ rows, canAct }: { rows: AccountRow[]; canAct: boolean }) {
  const ids = rows.map((r) => r.id);
  const sel = useSelection(ids, BULK_MAX);
  const [ask, confirmNode] = useKitConfirm();
  const [tag, setTag] = useState("");
  const n = sel.count;
  const pickedRows = rows.filter((r) => sel.isSelected(r.id));
  const form = (extra: Record<string, string>) => {
    const f = new FormData();
    pickedRows.forEach((r) => f.append("ids", String(r.id)));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const box = (i: number, label: string) =>
    canAct && (
      <label {...sel.pressProps} className="-m-2 grid size-11 cursor-pointer place-items-center">
        <input type="checkbox" {...sel.checkboxProps(i)} aria-label={label} className="kit-check" />
      </label>
    );
  const cleanedTag = cleanTag(tag);

  if (!rows.length) return <p className="rounded-[14px] border border-line p-6 text-mute">No accounts match. Try fewer filters.</p>;

  return (
    <div className="kit-bulkwrap">
      <div className="overflow-hidden rounded-[14px] border border-line bg-ink-2">
        {/* Wide screens: a table. */}
        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line text-faint">
            <tr>
              {canAct && (
                <th className="w-12 px-4 py-2.5">
                  <label className="-m-2 grid size-11 cursor-pointer place-items-center">
                    <input
                      type="checkbox"
                      checked={sel.allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = n > 0 && !sel.allSelected;
                      }}
                      onChange={() => (sel.allSelected ? sel.clear() : sel.selectAll())}
                      aria-label="Select every account on this page"
                      className="kit-check"
                    />
                  </label>
                </th>
              )}
              {["Receiver", "Type", "Email", "Plan", "Tracks", "Security", "Joined"].map((h) => (
                <th key={h} className={`px-4 py-2.5 font-medium ${h === "Tracks" ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((u, i) => (
              <tr key={u.id} {...(canAct ? sel.rowProps(i) : {})} className={`kit-row ${sel.isSelected(u.id) ? "" : "hover:bg-ink-3"}`}>
                {canAct && <td className="px-4 py-2">{box(i, `Select ${u.name}`)}</td>}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-4 text-[11px] font-bold">
                      {initials(u.name)}
                    </span>
                    <span className="min-w-0">
                      <Link href={`/admin/accounts/${u.id}`} className="font-semibold hover:underline">
                        {u.name}
                      </Link>
                      <span className="text-mute"> @{u.handle}</span>
                      {u.suspended && <span className="ml-2 inline-flex rounded-full bg-danger/15 px-2.5 py-0.5 text-[12px] font-semibold text-danger">Suspended</span>}
                      {u.tags.map((t) => (
                        <span key={t} className="ml-1 inline-flex rounded-full bg-ink-4 px-2 py-0.5 text-[11.5px] font-semibold text-mute">
                          {t}
                        </span>
                      ))}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-mute">{u.kind}</td>
                <td className="px-4 py-2.5 text-mute">
                  {u.email}
                  {!u.confirmed && <span className="ml-2 inline-flex whitespace-nowrap rounded-full bg-[var(--admin-amber)]/15 px-2 py-0.5 text-[11.5px] font-semibold text-[var(--admin-amber)]">Unconfirmed</span>}
                </td>
                <td className="px-4 py-2.5">
                  {/* Pills like pins 107 and 110: paid plans lit, free plain. */}
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-semibold capitalize ${u.plan === "free" ? "bg-ink-4 text-mute" : "bg-[var(--admin-violet)]/20 text-[var(--admin-violet)]"}`}>{u.plan}</span>
                </td>
                <td className="px-4 py-2.5 text-right tnum">{u.live.toLocaleString("en-GB")}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${u.twoFactor ? "bg-lime/15 text-lime" : "bg-ink-4 text-mute"}`}>
                    <span aria-hidden className={`size-1.5 rounded-full ${u.twoFactor ? "bg-lime" : "bg-faint"}`} />
                    {u.twoFactor ? "2FA on" : "Password only"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-mute tnum">{u.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Phones: stacked rows. */}
        <ul className="divide-y divide-line md:hidden">
          {rows.map((u, i) => (
            <li key={u.id} data-selected={sel.isSelected(u.id) || undefined} className="kit-row flex items-center gap-3 px-3 py-2.5">
              {box(i, `Select ${u.name}`)}
              <Link href={`/admin/accounts/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {u.name}
                    {u.suspended && <span className="chip ml-2 border-danger/50 text-danger">Suspended</span>}
                  </span>
                  <span className="block truncate text-[12.5px] text-mute">
                    @{u.handle} · {u.kind} · <span className="capitalize">{u.plan}</span>
                    {!u.confirmed && <span className="text-danger"> · unconfirmed</span>}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[12px] text-faint tnum">
                  {u.live} tracks
                  <br />
                  {u.twoFactor ? "2FA on" : "Password only"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {canAct && (
        <BulkBar count={n} onClear={sel.clear}>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              // Enter in the tag field presses Add tag.
              e.preventDefault();
              e.currentTarget.querySelector<HTMLButtonElement>("button[data-phase]")?.click();
            }}
          >
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag, e.g. beta-2" aria-label="Tag to add" maxLength={30} className="input kit-bulk-input" />
            <OpsButton
              className="kit-btn"
              disabled={!cleanedTag}
              action={() => tagAccounts(form({ tag: cleanedTag }))}
              done="Tagged"
              onDone={() => {
                setTag("");
                sel.clear();
              }}
            >
              Add tag
            </OpsButton>
          </form>
          {n > SUSPEND_MAX && <span className="kit-bulk-note">Suspend works on {SUSPEND_MAX} at a time</span>}
          <OpsButton
            className="kit-btn kit-btn--danger"
            disabled={n > SUSPEND_MAX}
            done="Suspended"
            onDone={() => sel.clear()}
            action={async () => {
              const ok = await ask({
                title: `Suspend ${n} account${n === 1 ? "" : "s"}?`,
                body: "Each one is signed out, their link goes offline and they get an email with this reason and a way to appeal. Nothing is deleted, and you can restore them from their page.",
                names: pickedRows.map((r) => `${r.name} @${r.handle}`),
                requireReason: true,
                confirmLabel: `Suspend ${n}`,
                danger: true,
              });
              return ok ? suspendAccounts(form({ reason: ok.reason })) : null;
            }}
          >
            Suspend…
          </OpsButton>
        </BulkBar>
      )}
      {confirmNode}
    </div>
  );
}
