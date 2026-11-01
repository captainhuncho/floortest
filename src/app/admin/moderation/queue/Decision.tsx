"use client";

import type { OpsResult } from "@/lib/ops-result";
import { OpsButton } from "../../kit/OpsButton";
import type { TrackDetail } from "./data";
import type { QueueRow } from "./model";

export type Kind = "keep" | "remove" | "block" | "blockEverywhere";

const Kbd = ({ k }: { k: string }) => (
  <kbd aria-hidden className="mq-kbd kit-kbd ml-auto">
    {k}
  </kbd>
);
const BTN = "inline-flex min-h-11 w-full items-center gap-2 rounded-control px-3.5 text-[14px] font-semibold";

/**
 * The decision: Keep (one press, marks it reviewed by you), Remove (asks for a reason first), Block sender (asks
 * first), Block everywhere (asks first, with the blocks permission) and Skip. On wide screens it sits on the right;
 * below 1280 px it opens as a dialog, and on phones as a sheet.
 */
export function Decision({
  row,
  detail,
  me,
  canBlockEverywhere,
  onAct,
  onSkip,
  keepRef,
  removeRef,
  blockRef,
  keys = true,
}: {
  row: QueueRow;
  detail: TrackDetail | null;
  me: string;
  canBlockEverywhere: boolean;
  onAct: (kind: Kind, row: QueueRow) => Promise<OpsResult | null>;
  onSkip: () => void;
  keepRef: React.Ref<HTMLButtonElement>;
  removeRef: React.Ref<HTMLButtonElement>;
  blockRef: React.Ref<HTMLButtonElement>;
  /** Shows the key hints; off in the dialog, where single keys don't act. */
  keys?: boolean;
}) {
  const track = row.track_id != null;
  const ready = !!detail && detail.track_id === row.track_id;
  return (
    <div className="mq-decision" data-keys={keys ? "" : undefined}>
      {track ? (
        <dl className="mq-kv mq-kv--text">
          <dt>Keep</dt>
          <dd>Marks it reviewed by @{me}. It leaves the queue until a new signal arrives.</dd>
          <dt>Remove</dt>
          <dd>Takes it off @{row.receiver}&apos;s desk and deletes the file. Asks for a reason first.</dd>
        </dl>
      ) : (
        <p className="text-[13px] text-mute">This upload isn&apos;t a track yet, so there is nothing to keep or remove. Jobs shows the virus check.</p>
      )}
      {track && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <OpsButton ref={removeRef} action={() => onAct("remove", row)} done="Removed" disabled={!ready} className={`${BTN} kit-btn--danger border`}>
            Remove <Kbd k="x" />
          </OpsButton>
          <OpsButton ref={keepRef} action={() => onAct("keep", row)} done="Kept" className={`${BTN} bg-lime text-[#10110f]`}>
            <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            Keep <Kbd k="a" />
          </OpsButton>
        </div>
      )}
      <div className="mt-2 grid gap-2">
        {track &&
          (ready && detail.blockedHere ? (
            <p className="text-[13px] text-faint">{detail.email} is already blocked on @{row.receiver}&apos;s link.</p>
          ) : (
            <OpsButton ref={blockRef} action={() => onAct("block", row)} done="Blocked" disabled={!ready} className={`${BTN} border border-line-2 bg-ink-3 text-bone`}>
              Block sender for @{row.receiver} <Kbd k="b" />
            </OpsButton>
          ))}
        {track && canBlockEverywhere && (
          <OpsButton action={() => onAct("blockEverywhere", row)} done="Blocked" disabled={!ready} className={`${BTN} border border-line-2 bg-ink-3 text-bone`}>
            Block everywhere
          </OpsButton>
        )}
        <button type="button" onClick={onSkip} className={`${BTN} kit-press border border-line bg-transparent text-mute`}>
          Skip <Kbd k="j" />
        </button>
      </div>
      <p className="mq-hints mt-4 hidden text-[12px] text-faint">
        <span>
          <kbd className="kit-kbd">j</kbd> <kbd className="kit-kbd">k</kbd> move
        </span>
        <span>
          <kbd className="kit-kbd">space</kbd> play (takedown claims only)
        </span>
        <span>
          <kbd className="kit-kbd">?</kbd> all keys
        </span>
      </p>
    </div>
  );
}
