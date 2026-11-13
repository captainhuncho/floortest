import { requireUser } from "@/lib/auth";
import { libraryLimit, libraryUsed, listLibrary } from "@/lib/library";
import { fmtDay } from "@/lib/format";
import { PageHead } from "@/components/Kit";
import { OwnerUpload } from "../collections/OwnerUpload";
import { MusicList } from "./MusicList";

export const metadata = { title: "My music — FloorTest" };

/**
 * My music: the desk's own tracks, kept until someone deletes them (never by the nightly clean-up). Separate from what
 * senders send, so they never show in the Review Queue, stats or receipts. Everyone on the desk can listen; the owner
 * and admins add, rename and delete.
 */
export default async function MyMusic() {
  const user = await requireUser();
  const [tracks, used, limit] = await Promise.all([listLibrary(user), libraryUsed(user), libraryLimit(user.plan)]);
  const canEdit = user.role !== "member";
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 sm:gap-5">
        <PageHead label={`${used} of ${limit} tracks`} title="My music" />
        <p className="-mt-2 text-[13px] text-mute">Your own tracks to keep and listen to. They stay until you delete them.</p>
        {canEdit && (
          <OwnerUpload
            api="/api/music/upload"
            heading="Add your own tracks"
            note="WAV or MP3. Each file is checked as real audio and for viruses, then kept here until you delete it."
            startOpen={tracks.length === 0}
          />
        )}
        <MusicList
          canEdit={canEdit}
          tracks={tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, peaks: t.peaks, added: fmtDay(t.created_at, user.tz) }))}
        />
      </div>
    </div>
  );
}
