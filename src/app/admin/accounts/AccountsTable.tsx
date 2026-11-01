"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Dialog } from "@/components/Dialog";
import { BULK_MAX } from "@/lib/admin-bulk";
import { suspendAccounts, tagAccounts } from "../actions";

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
 * The Users table with row selection (owner, 1 Nov 2026). Picking rows shows a bar to tag them or suspend them;
 * suspending asks for one reason, which goes in each email and the admin log. A table on wide screens, stacked rows on phones.
 */
export function AccountsTable({ rows, canAct }: { rows: AccountRow[]; canAct: boolean }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [tag, setTag] = useState("");
  const [pending, start] = useTransition();
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: number) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else if (next.size < BULK_MAX) next.add(id);
      return next;
    });
  const toggleAll = () => setPicked(all ? new Set() : new Set(rows.slice(0, BULK_MAX).map((r) => r.id)));
  const run = (action: (f: FormData) => Promise<void>, extra: Record<string, string>, after?: () => void) => {
    const f = new FormData();
    picked.forEach((id) => f.append("ids", String(id)));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    start(async () => {
      await action(f);
      setPicked(new Set());
      after?.();
    });
  };
  const n = picked.size;
  const box = (checked: boolean, onChange: () => void, label: string) =>
    canAct && (
      <label className="-m-2 grid size-11 cursor-pointer place-items-center">
        <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="size-[18px] cursor-pointer accent-lime" />
      </label>
    );

  if (!rows.length) return <p className="rounded-[14px] border border-line p-6 text-mute">No accounts match. Try fewer filters.</p>;

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-ink-2">
      {n > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-ink-3 px-4 py-2" role="region" aria-label="Selected accounts">
          <span className="text-sm font-semibold tnum">{n} selected</span>
          <button type="button" onClick={() => setPicked(new Set())} className="min-h-11 px-2 text-sm text-mute hover:text-bone">
            Clear
          </button>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (tag.trim()) run(tagAccounts, { tag }, () => setTag(""));
            }}
          >
            <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Tag, e.g. beta-2" aria-label="Tag to add" maxLength={30} className="input w-40 py-1.5 text-sm" />
            <button className="btn-ghost btn-sm" disabled={pending || !tag.trim()}>
              Add tag
            </button>
          </form>
          <button type="button" onClick={() => setAsking(true)} disabled={pending} className="btn-sm ml-auto rounded-md border border-danger/50 px-3 font-semibold text-danger hover:bg-danger/10">
            Suspend…
          </button>
        </div>
      )}

      {/* Wide screens: a table. */}
      <table className="hidden w-full text-left text-sm md:table">
        <thead className="border-b border-line text-faint">
          <tr>
            {canAct && <th className="w-12 px-4 py-2.5">{box(all, toggleAll, "Select every account on this page")}</th>}
            {["Receiver", "Type", "Email", "Plan", "Tracks", "Security", "Joined"].map((h) => (
              <th key={h} className={`px-4 py-2.5 font-medium ${h === "Tracks" ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((u) => (
            <tr key={u.id} className={picked.has(u.id) ? "bg-lime/[0.06]" : "hover:bg-ink-3"}>
              {canAct && <td className="px-4 py-2">{box(picked.has(u.id), () => toggle(u.id), `Select ${u.name}`)}</td>}
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
                    {u.suspended && <span className="chip ml-2 border-danger/50 text-danger">Suspended</span>}
                    {u.tags.map((t) => (
                      <span key={t} className="chip ml-1 border-line text-mute">
                        {t}
                      </span>
                    ))}
                  </span>
                </div>
              </td>
              <td className="px-4 py-2.5 text-mute">{u.kind}</td>
              <td className="px-4 py-2.5 text-mute">
                {u.email}
                {!u.confirmed && <span className="ml-1 text-danger">unconfirmed</span>}
              </td>
              <td className="px-4 py-2.5 capitalize">{u.plan}</td>
              <td className="px-4 py-2.5 text-right tnum">{u.live.toLocaleString("en-GB")}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className={`size-1.5 rounded-full ${u.twoFactor ? "bg-lime" : "bg-faint"}`} />
                  {u.twoFactor ? "2FA on" : "Password only"}
                </span>
              </td>
              <td className="px-4 py-2.5 text-mute tnum">{u.joined}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phones: stacked rows. */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((u) => (
          <li key={u.id} className={`flex items-center gap-3 px-3 py-2.5 ${picked.has(u.id) ? "bg-lime/[0.06]" : ""}`}>
            {box(picked.has(u.id), () => toggle(u.id), `Select ${u.name}`)}
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

      <Dialog
        open={asking}
        onClose={() => setAsking(false)}
        busy={pending}
        title={`Suspend ${n} account${n === 1 ? "" : "s"}?`}
        description="Each one is signed out, their link goes offline and they get an email with this reason and a way to appeal. Nothing is deleted, and you can restore them from their page."
        actions={
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAsking(false)} disabled={pending}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-sm rounded-md bg-danger px-4 font-bold text-ink"
              disabled={pending || !reason.trim()}
              onClick={() => run(suspendAccounts, { reason }, () => (setAsking(false), setReason("")))}
            >
              {pending ? "Suspending…" : `Suspend ${n}`}
            </button>
          </>
        }
      >
        <label className="block space-y-1.5">
          <span className="label">Reason (they see this)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. spam uploads" className="input w-full" autoFocus />
        </label>
      </Dialog>
    </div>
  );
}
