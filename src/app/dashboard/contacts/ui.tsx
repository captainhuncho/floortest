/**
 * Small pieces the two Contacts pages share (option 59 A, 18 Nov). Lime only on status dots, the verified tick and the
 * one main button: the switches and filters here sit on quiet card backgrounds instead of the kit's lime tabs.
 */

/** Danger red for Blocked and Block sender, the same in night and day (spec 59 A). */
export const DANGER_TEXT = "text-[#e5484d]";

/** A two-way switch (People | Messages, Conversation | Tracks): a well track, the current one raised. */
export const QSEG = "flex gap-1 rounded-[14px] border border-line bg-well p-1";
export const qsegTab = (on: boolean) =>
  `flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] px-2.5 text-[14px] font-semibold pointer-coarse:min-h-11 sm:text-[13px] ${
    on ? "bg-ink-4 text-bone" : "text-mute hover:text-bone"
  }`;

/** A row of filter chips that scrolls sideways inside the gutter on phones, never the page. */
export const CHIP_ROW = "-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden";
export const chip = (on: boolean) =>
  `flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-semibold pointer-coarse:min-h-11 ${
    on ? "border-line bg-well text-bone" : "border-transparent text-mute hover:text-bone"
  }`;

export type TrackStatus = "Kept" | "Needs review" | "Not for me";

/** What was decided about a track; null once it's deleted. */
export function statusOf(t: { decision: string | null; deleted_at: number | null }): TrackStatus | null {
  if (t.deleted_at) return null;
  return t.decision === "kept" ? "Kept" : t.decision === "passed" ? "Not for me" : "Needs review";
}

/** Kept and Needs review as a dot and a word (lime dot for Kept, an empty ring for Needs review); Not for me as quiet text. */
export function Status({ status }: { status: TrackStatus }) {
  if (status === "Not for me") return <span className="shrink-0 text-[12px] text-faint">Not for me</span>;
  const kept = status === "Kept";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-[12px] ${kept ? "font-semibold text-bone" : "text-faint"}`}>
      <i aria-hidden className={`inline-block size-1.5 rounded-full ${kept ? "bg-lime" : "border border-line-2"}`} />
      {status}
    </span>
  );
}

/** Today, Yesterday, or the short date ("14 Nov"), in the desk's time zone. */
export function dayLabel(ts: number, timeZone?: string, now = Date.now()): string {
  const key = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone });
  const day = key(ts);
  if (day === key(now)) return "Today";
  if (day === key(now - 86_400_000)) return "Yesterday";
  return shortDate(ts, timeZone);
}

/** "3 Oct". */
export const shortDate = (ts: number, timeZone?: string) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });
