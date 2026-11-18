"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Kit";
import { useToast } from "@/components/Toast";
import { useBrowserValue } from "@/components/useBrowserValue";
import { switchDesk } from "../../actions/account-team";
import { ROW, ROW_PRESS, RowText } from "./rows";

/** True only inside the FloorTest phone app (Capacitor), the same test NativeApp uses. */
const inPhoneApp = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const CARD = "flex flex-col rounded-2xl bg-card px-3.5";

/**
 * The Plan group's one row, and the "Your plan" sheet it opens. During the beta plans are set by FloorTest: nothing to
 * pay, so no card form, invoices or cancel. Restore purchases shows only in the phone apps (Apple 3.1.1).
 */
export function PlanRow({ used, limit, since }: { used: number; limit: number; since: string }) {
  const [open, setOpen] = useState(false);
  const native = useBrowserValue(inPhoneApp, false);
  const toast = useToast();
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const tracks = `${used.toLocaleString("en-US")} of ${limit.toLocaleString("en-US")}`;
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={`${ROW_PRESS} border-b-0`}>
        <RowText icon="card" title="Free in the beta" sub={`${tracks} active tracks · since ${since}`} />
        <span role="img" aria-label={`${tracks} tracks`} className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-line-2">
          <span className="block h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
        </span>
        <Icon name="chev" className="size-4 text-mute" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Your plan">
        <div className="flex flex-col gap-3">
          <div className={`${CARD} bg-well!`}>
            <div className={ROW}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-bone">Free in the beta</span>
                <span className="block text-[13px] text-mute">
                  Since {since} · {tracks} active tracks
                </span>
              </span>
            </div>
          </div>
          <p className="text-[13px] leading-5 text-mute">Plans are set by FloorTest during the beta. Nothing to pay.</p>
          <div className={`${CARD} bg-well!`}>
            <Link href="/dashboard/plans" className={ROW_PRESS}>
              <RowText icon="card" title="Compare plans" sub="What each plan will include" />
              <Icon name="chev" className="size-4 text-mute" />
            </Link>
            {native && (
              <button type="button" className={ROW_PRESS} onClick={() => toast.show({ message: "Nothing to restore. Plans are free in the beta." })}>
                <RowText icon="swap" title="Restore purchases" sub="Phone apps only" />
                <Icon name="chev" className="size-4 text-mute" />
              </button>
            )}
            <div className={ROW}>
              <RowText icon="mail" title="Receipts" sub="None yet" />
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

type Desk = { id: number | null; name: string; role: string; current: boolean };

/** "Switch desk": your own desk and each team's, in a sheet. Plain forms; the server checks you're on the team. */
export function SwitchDeskRow({ desks }: { desks: Desk[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setOpen(true)} className={`${ROW_PRESS} border-b-0`}>
        <RowText icon="swap" title="Switch desk" sub={desks.map((d) => (d.id === null ? "Your own desk" : d.name)).join(", ")} />
        <Icon name="chev" className="size-4 text-mute" />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Switch desk">
        <ul className={`${CARD} bg-well!`}>
          {desks.map((d) => (
            <li key={d.id ?? "own"} className="border-b border-line last:border-b-0">
              <form action={switchDesk.bind(null, d.id)}>
                <button aria-current={d.current ? "true" : undefined} className={`${ROW_PRESS} border-b-0`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-bone">{d.id === null ? `${d.name} (yours)` : d.name}</span>
                    <span className="block truncate text-[13px] text-mute">{d.role}</span>
                  </span>
                  {d.current && <Icon name="tick" className="size-4 text-bone" />}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
