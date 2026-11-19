import Link from "next/link";
import { CARD, Chip, initials } from "@/components/Kit";

/** A person from your own sends: the latest step of your last send to them (option 58 A, Sent to before). */
export type SentBefore = { handle: string; name: string; label: string; lit: boolean; when: string | null };
/** One of your latest sends, only what its row prints. */
export type LatestSend = { href: string; title: string; receiver: string; label: string; lit: boolean; when: string | null };

const HEAD = "px-1 text-[13px] font-semibold tracking-[-0.01em] text-bone";
const ROW = "flex min-h-[60px] w-full min-w-0 items-center gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-b-0 hover:bg-ink-4";

/** The step a row ends on: lit lime dot from delivery on, dim for a track unheard for the whole window. */
function Step({ label, lit, when }: { label: string; lit: boolean; when: string | null }) {
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-[11.5px] ${lit ? "font-semibold text-bone" : "text-faint"}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${lit ? "bg-lime" : "border border-current"}`} />
      {label}
      {when && <span className="font-normal text-mute">· {when}</span>}
    </span>
  );
}

/** Up to three people you've sent to, newest first. Tapping one fills the field and looks them up. */
export function SentToBefore({ people, onPick }: { people: SentBefore[]; onPick: (handle: string) => void }) {
  if (!people.length) return null;
  return (
    <section aria-labelledby="before-h" className="flex min-w-0 flex-col gap-2">
      <h2 id="before-h" className={HEAD}>Sent to before</h2>
      <ul className={`${CARD} overflow-hidden`}>
        {people.map((p) => (
          <li key={p.handle}>
            <button type="button" onClick={() => onPick(p.handle)} className={ROW}>
              <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-well text-[12px] font-bold text-mute">
                {initials(p.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-bone">{p.name}</span>
                <span className="block truncate font-mono text-[11.5px] text-mute">/{p.handle}</span>
              </span>
              <Step label={p.label} lit={p.lit} when={null} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Your three latest sends, each opening its receipt, with the way to all of them. Empty: the faint sample receipt. */
export function LatestSends({ sends, total }: { sends: LatestSend[]; total: number }) {
  return (
    <section aria-labelledby="latest-h" className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="latest-h" className={HEAD}>Your latest sends</h2>
        {total > 0 && (
          <Link href="/dashboard/send?all=1" className="inline-flex min-h-11 items-center rounded-[11px] px-2 text-[12.5px] font-semibold text-mute hover:text-bone">
            All {total}
          </Link>
        )}
      </div>
      {sends.length ? (
        <ul className={`${CARD} overflow-hidden`}>
          {sends.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-bone">{s.title}</span>
                  <span className="block truncate text-[11.5px] text-mute">to {s.receiver}</span>
                </span>
                <Step label={s.label} lit={s.lit} when={s.when} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <p className="px-1 text-[12px] text-mute">Nothing sent yet. Each track gets a private receipt.</p>
          {/* A sample row, faint and labelled, so the receipt's ladder is clear before there's a real one. */}
          <figure className="rounded-[16px] border border-dashed border-line-2 p-3.5 text-faint">
            <figcaption className="sr-only">Sample receipt</figcaption>
            <p className="flex items-baseline justify-between gap-4">
              <span className="min-w-0 truncate text-[12.5px]">Sample Artist - Nightbus (demo)</span>
              <Chip>Sample</Chip>
            </p>
            <ol aria-label="What a receipt can say, in order" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              {["Delivered", "Listened", "Downloaded", "Replied", "Played out"].map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden>→</span>}
                  <span className="flex items-center gap-1.5">
                    {/* A receipt starts lit: Delivered is the lime light until something happens. */}
                    <span aria-hidden className={`size-1.5 rounded-full ${i === 0 ? "bg-lime" : "border border-current"}`} />
                    {s}
                  </span>
                </li>
              ))}
            </ol>
          </figure>
        </>
      )}
    </section>
  );
}
