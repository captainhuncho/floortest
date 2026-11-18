import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { canMarkPlayedOut } from "@/lib/played-out-prompt";
import { toPlayer } from "@/lib/player-track";
import { fmtLength, FolderPage, WIDE } from "../collections/FolderPage";
import { PlayAll } from "../collections/PlayAll";
import { loadRows } from "../rows";
import { ClearKept } from "./ClearKept";
import { DownloadCrate } from "./DownloadCrate";
import { crateExtras } from "./KeptCards";
import { KeptCardsList } from "./KeptCardsList";
import { GHOST_BTN } from "./buttons";
import { OfflineSave } from "./OfflineSave";

export const metadata = { title: "Prepare — FloorTest" };

/** A quiet text link (Mark what I played on phones; Start a new batch has the same look). */
const QUIET_LINK = "inline-flex min-h-11 items-center rounded-[10px] text-[13px] font-medium text-mute underline-offset-4 transition-colors hover:text-bone hover:underline";

/**
 * The crate's cover: up to four covers from inside it, two by two. A crate with fewer than four shows the first one
 * whole; with none (or nothing kept) the box stays a plain square.
 */
function CrateCover({ arts }: { arts: string[] }) {
  if (!arts.length) return null;
  const tiles = arts.length === 4 ? arts : arts.slice(0, 1);
  return (
    <span className={`grid size-full ${tiles.length === 4 ? "grid-cols-2 grid-rows-2" : ""}`}>
      {tiles.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" decoding="async" className="size-full min-h-0 object-cover" />
      ))}
    </span>
  );
}

/**
 * Your kept tracks as one crate, laid out like a folder's page in Collections (owner, 17 Nov: option 44). Downloading
 * is the main job, so Download crate is the one lime button; the counts are two lines under the name. Phones: cover,
 * name, Download crate, Save on this phone (the phone apps), the tracks, then Start a new batch as a quiet link. From
 * lg the cover sits on the left and the three actions share one row.
 */
export default async function PrepareForSet() {
  const user = await requireUser();
  await trackUse(user.id, "prepare");
  const kept = await loadRows(user.id, { inSet: true, actor: user.actor_id });
  const { status, senders, arts } = await crateExtras(user.id, kept);
  const canMark = canMarkPlayedOut(user);
  // Starting a new batch is for the owner and admins.
  const canClear = user.role !== "member";
  const n = kept.length;

  if (!n)
    return (
      <FolderPage
        cover={<CrateCover arts={[]} />}
        label="Prepare"
        name="Your crate"
        lines={["Nothing kept yet"]}
        action={
          <>
            <p className="text-[13px] leading-[1.5] text-mute">Tracks you keep in the Queue land here, ready to download with a playlist.</p>
            <Link href="/dashboard/review" className={WIDE}>
              Open the Queue
            </Link>
          </>
        }
      >
        <OfflineSave count={0} />
      </FolderPage>
    );

  const downloaded = kept.filter((r) => r.downloaded).length;
  const playedOut = kept.filter((r) => status[r.id]?.at).length;
  // The total length only when every track has one stored.
  const length = kept.every((r) => r.duration) ? kept.reduce((sum, r) => sum + (r.duration ?? 0), 0) : 0;
  const counts = [downloaded ? `${downloaded} downloaded` : null, playedOut ? `${playedOut} played out` : null].filter(Boolean).join(" · ");
  const mark = canMark ? "/dashboard/played-out" : null;

  return (
    <FolderPage
      cover={<CrateCover arts={arts} />}
      label="Prepare"
      name="Your crate"
      lines={[`${n} kept ${n === 1 ? "track" : "tracks"}${length ? ` · ${fmtLength(length)}` : ""}`, ...(counts ? [counts] : [])]}
      play={<PlayAll queue={kept.map(toPlayer)} name="your crate" />}
      action={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DownloadCrate count={n} />
          {/* From lg the other two actions share this row; on phones they sit by the tracks and under them. */}
          <span className="hidden lg:contents">
            {mark && (
              <Link href={mark} className={`${GHOST_BTN} min-h-12 w-auto! rounded-[14px]! px-4!`}>
                Mark what I played
              </Link>
            )}
            {canClear && <ClearKept count={n} />}
          </span>
        </div>
      }
    >
      <OfflineSave count={n} />
      <section aria-labelledby="tracks-h" className="flex flex-col gap-1">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <h2 id="tracks-h" className="text-[13px] font-semibold text-mute">
            Tracks
          </h2>
          {mark && (
            <Link href={mark} className={`${QUIET_LINK} lg:hidden`}>
              Mark what I played
            </Link>
          )}
        </div>
        <KeptCardsList rows={kept} status={status} senders={senders} canMark={canMark} />
      </section>
      {canClear && (
        <div className="flex flex-col items-start lg:hidden">
          <ClearKept count={n} />
          <p className="text-[12px] leading-[1.45] text-faint">Empties Prepare. Tracks stay Kept and still count toward your desk.</p>
        </div>
      )}
    </FolderPage>
  );
}
