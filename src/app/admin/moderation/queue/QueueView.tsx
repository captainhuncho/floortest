"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Dialog } from "@/components/Dialog";
import { announceOps, type OpsResult } from "@/lib/ops-result";
import { blockEverywhere, blockSenderAsAdmin, keepTrack, removeTrackAsAdmin } from "../../actions";
import { useKitConfirm } from "../../kit/Confirm";
import { useShortcuts } from "../../kit/Keys";
import type { PlayerHandle } from "../ModerationPlayer";
import type { TrackDetail } from "./data";
import { Decision, type Kind } from "./Decision";
import { filterCounts, nextKeyAfter, signalWords, stepKey, visibleRows, type Filter, type QueueRow } from "./model";
import { QueueList } from "./QueueList";
import { Listen, SignalBanner, TrackPane } from "./TrackPane";
import { pause, rowHref, useChosen, useMedia } from "./useQueue";
import "./queue.css";

/** How long "✓ Kept" or "✓ Removed" shows before the next row opens. */
const LEAVE_HOLD_MS = 320;
const NOT_THROUGH: OpsResult = { ok: false, error: "That didn't go through, so nothing changed. Check your connection." };

/** A track opened by its address that has no signal (a search result, a kept track): shown with "No signals". */
const rowOf = (d: TrackDetail): QueueRow => ({
  key: `track:${d.track_id}`,
  kind: null,
  track_id: d.track_id,
  title: d.title,
  artist: d.artist,
  receiver: d.receiver,
  sender: d.sender,
  email: d.email,
  token: "",
  age: "",
  ...signalWords({ kind: null, who: "", count: 1, handle: d.receiver }),
  reviewedBy: d.reviewed ? d.reviewed.replace(/^Kept by (@\S+?),.*$/, "$1") : null,
});

/**
 * The new Moderation (admin redesign B, step 4; switch `ops_shell`): a three-pane signal queue. Left, the tracks with a
 * signal; middle, the chosen track; right, the decision (a dialog below 1280 px, a sheet on phones). Keys: j/k move,
 * a keep, x remove, b block, space plays a takedown claim, ? lists them; a key pressed while an action runs waits.
 */
export function QueueView({ rows, search, initial, detail, me, canBlockEverywhere }: { rows: QueueRow[]; search: string; initial: string | null; detail: TrackDetail | null; me: string; canBlockEverywhere: boolean }) {
  const path = usePathname();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState(search);
  const { chosen, choose, loading } = useChosen(initial, search);
  const [sheet, setSheet] = useState(false);
  const [leaving, setLeaving] = useState<QueueRow | null>(null);
  const [ask, confirmNode] = useKitConfirm();
  const wide = useMedia("(min-width: 1280px)", true);
  const phone = useMedia("(max-width: 767px)", false);
  const player = useRef<PlayerHandle>(null);
  const keepBtn = useRef<HTMLButtonElement>(null);
  const removeBtn = useRef<HTMLButtonElement>(null);
  const blockBtn = useRef<HTMLButtonElement>(null);
  // The action now running, with its move to the next row: a key pressed meanwhile waits for it (kit Keys).
  const work = useRef<Promise<unknown>>(Promise.resolve());

  // Typing filters only rows that came from the server; Enter asks the server (the search form).
  const typed = query === search ? "" : query;
  const visible = useMemo(() => visibleRows(rows, filter, typed), [rows, filter, typed]);
  const counts = useMemo(() => filterCounts(rows, typed), [rows, typed]);
  const keys = visible.map((r) => r.key);
  const current: QueueRow | null =
    rows.find((r) => r.key === chosen) ?? (leaving?.key === chosen ? leaving : null) ?? (detail && chosen === `track:${detail.track_id}` ? rowOf(detail) : null);
  const d = detail && current?.track_id === detail.track_id ? detail : null;
  const at = current ? keys.indexOf(current.key) : -1;
  const position = at >= 0 ? `${at + 1} of ${keys.length}` : null;

  const pick = (row: QueueRow | null) => {
    choose(row);
    if (row && phone) setSheet(true);
  };
  const move = (step: number) => {
    const next = stepKey(keys, current?.key ?? null, step);
    if (next && next !== current?.key) choose(visible.find((r) => r.key === next) ?? null);
  };

  /** Runs one decision; the queue waits for it, and for the move to the next row when the row leaves. */
  const tracked = (run: () => Promise<{ r: OpsResult | null; leaves?: boolean }>, row: QueueRow) => {
    const before = visible;
    const p = run().catch(() => ({ r: NOT_THROUGH, leaves: false }));
    work.current = p.then(async ({ r, leaves }) => {
      if (!r?.ok || !leaves) return;
      setLeaving(row);
      await pause(LEAVE_HOLD_MS);
      const next = nextKeyAfter(before.map((x) => x.key), row.key);
      setLeaving(null);
      setSheet(false);
      choose(before.find((x) => x.key === next) ?? null);
    });
    return p.then(({ r }) => r);
  };

  /** One decision on a row, asked first where it can't be undone. */
  const act = (kind: Kind, row: QueueRow): Promise<OpsResult | null> => {
    const det = detail && detail.track_id === row.track_id ? detail : null;
    if (kind === "keep") return tracked(async () => ({ r: await keepTrack(row.track_id!), leaves: true }), row);
    if (kind === "remove")
      return tracked(async () => {
        const yes = await ask({
          title: `Remove "${row.title}"?`,
          body: `Takes it off @${row.receiver}'s desk and deletes the file. This can't be undone. The admin log keeps your reason.`,
          names: [`${row.title} · ${row.artist}`],
          requireReason: true,
          reasonLabel: "Reason (kept in the admin log)",
          reasonPlaceholder: "e.g. upheld takedown claim",
          confirmLabel: "Remove track",
          danger: true,
        });
        if (!yes) return { r: null };
        return { r: (await removeTrackAsAdmin(row.track_id!, yes.reason, true)) ?? NOT_THROUGH, leaves: true };
      }, row);
    return tracked(async () => {
      if (!det) return { r: null };
      const here = kind === "block";
      const yes = await ask({
        title: here ? `Block ${det.email} from @${row.receiver}'s link?` : `Block ${det.email} everywhere?`,
        body: here
          ? `The same as @${row.receiver} blocking them: new sends to that link are refused. Tracks already sent stay.`
          : "They can't send to anyone on FloorTest. Tracks already sent stay. You can lift it from Sender blocks.",
        names: [`${det.sender} · ${det.email}`],
        confirmLabel: here ? "Block sender" : "Block everywhere",
        danger: true,
      });
      if (!yes) return { r: null };
      return { r: (here ? await blockSenderAsAdmin(det.sender_id, true) : await blockEverywhere(det.email, true)) ?? NOT_THROUGH };
    }, row);
  };

  /** A key presses the button when it is on screen (so it shows "✓ Kept"); otherwise it runs the same decision. */
  const pressKey = (kind: "keep" | "remove" | "block") => {
    if (!current?.track_id) return;
    const b = (kind === "keep" ? keepBtn : kind === "remove" ? removeBtn : blockBtn).current;
    if (b && b.isConnected) {
      if (b.disabled || b.getAttribute("aria-busy")) return work.current;
      b.click();
      return work.current;
    }
    if (kind !== "keep" && !d) return;
    return act(kind, current).then((r) => r && announceOps(r));
  };
  useShortcuts({
    j: { label: "Next track", run: () => move(1) },
    k: { label: "Previous track", run: () => move(-1) },
    a: { label: "Keep (mark reviewed)", run: () => pressKey("keep") },
    x: { label: "Remove…", run: () => pressKey("remove") },
    b: { label: "Block sender…", run: () => pressKey("block") },
    " ": { label: "Play or pause (takedown claims only)", run: () => void (d?.playable && player.current?.toggle()) },
  });

  const decision = current && (
    <Decision key={current.key} row={current} detail={d} me={me} canBlockEverywhere={canBlockEverywhere} onAct={act} onSkip={() => move(1)} keepRef={keepBtn} removeRef={removeBtn} blockRef={blockBtn} />
  );

  return (
    <div className="mq">
      <QueueList
        rows={rows}
        visible={visible}
        total={rows.length}
        counts={counts}
        filter={filter}
        onFilter={(f) => {
          setFilter(f);
          const left = visibleRows(rows, f, typed);
          if (!current || !left.some((r) => r.key === current.key)) choose(left[0] ?? null);
        }}
        query={query}
        onQuery={setQuery}
        search={search}
        chosen={current?.key ?? null}
        hrefFor={(r) => rowHref(path, search, r)}
        onPick={pick}
      />
      {!phone &&
        (current ? (
          <TrackPane row={current} detail={d} loading={loading} position={position} handle={player} onDecide={() => setSheet(true)} />
        ) : (
          <div className="mq-body mq-empty">
            <p className="font-semibold text-bone">{rows.length ? "Pick a track" : "No signals right now"}</p>
            <p className="mt-1 text-[13px] text-faint">{rows.length ? "Choose one on the left, or press j." : "Nothing needs a decision. New signals show up here."}</p>
          </div>
        ))}
      {wide && (
        <aside aria-label="Decision" className="mq-act">
          {current && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[16px] font-semibold tracking-[-0.015em]">Decision</h2>
                <span className="text-[12px] text-mute">as @{me}</span>
              </div>
              {decision}
            </>
          )}
        </aside>
      )}
      {!wide && current && (
        <Dialog
          open={sheet}
          onClose={() => setSheet(false)}
          title={phone ? current.title : `Decision · ${current.title}`}
          description={`${current.artist ? `${current.artist} · ` : ""}to @${current.receiver}${current.age ? ` · ${current.age} ago` : ""} · as @${me}`}
        >
          {phone && (
            <div className="mb-4">
              <SignalBanner row={current} />
              {d ? <Listen d={d} handle={player} compact /> : current.track_id ? <p className="mt-3 text-faint">Opening the track…</p> : null}
            </div>
          )}
          {decision}
        </Dialog>
      )}
      {confirmNode}
    </div>
  );
}
