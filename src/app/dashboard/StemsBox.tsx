import type { Track } from "@/lib/db";
import { fmtBytes, fmtDay } from "@/lib/format";
import { stemsFor } from "@/lib/stems";
import { askForStems } from "./actions/review";
import { CARD } from "@/components/Kit";

/** Stems for a track: ask the sender for them, then download them one by one or as a ZIP. */
export async function StemsBox({ track: t, senderName }: { track: Track; senderName: string }) {
  const stems = await stemsFor(t.id);
  const first = senderName.split(/\s+/)[0];
  return (
    <section aria-labelledby={`stems-${t.id}`} className={`${CARD} p-3.5 sm:p-4`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`stems-${t.id}`} className="text-[15px] font-semibold tracking-[-0.015em] text-bone">
          Stems{stems.length ? ` (${stems.length})` : ""}
        </h3>
        {stems.length > 0 && (
          <a href={`/api/tracks/${t.id}/stems/zip`} className="btn-ghost btn-sm">
            Download all (ZIP)
          </a>
        )}
      </div>
      {stems.length > 0 ? (
        <ul className="mt-3 divide-y divide-line">
          {stems.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
              <span className="min-w-0 truncate">{s.name}</span>
              <a href={`/api/tracks/${t.id}/stems/${s.id}`} className="shrink-0 text-[11px] text-mute underline-offset-4 hover:text-bone hover:underline">
                {fmtBytes(s.size)} ↓
              </a>
            </li>
          ))}
        </ul>
      ) : t.stems_requested_at ? (
        <p className="mt-2 text-[12px] text-mute">
          Asked {fmtDay(t.stems_requested_at)}. Waiting for {first} to upload them. They&apos;ll show up here.
        </p>
      ) : (
        <form action={askForStems.bind(null, t.id)} className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[12px] text-mute">Want to play it out properly? Ask {first} for the stems.</p>
          <button className="btn-lime btn-sm">Request stems</button>
        </form>
      )}
    </section>
  );
}
