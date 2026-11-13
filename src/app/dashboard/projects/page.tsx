import { requireUser } from "@/lib/auth";
import { libraryLimit, libraryUsed, listFolders, listLibrary, MAX_FOLDERS } from "@/lib/library";
import { fmtDay } from "@/lib/format";
import { PageHead } from "@/components/Kit";
import { OwnerUpload } from "../collections/OwnerUpload";
import { MusicList } from "./MusicList";
import { NewProject, ProjectTile } from "./ProjectsUI";

export const metadata = { title: "Projects — FloorTest" };

/**
 * Projects: the desk's own tracks, kept until someone deletes them (never by the nightly clean-up), in projects (folders,
 * built like collections) or in none. Separate from what senders send, so they never show in the Review Queue, stats or
 * receipts. Everyone on the desk can listen; the owner and admins add, move, rename and delete.
 */
export default async function Projects() {
  const user = await requireUser();
  const [folders, loose, used, limit] = await Promise.all([listFolders(user), listLibrary(user, null), libraryUsed(user), libraryLimit(user.plan)]);
  const canEdit = user.role !== "member";
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 sm:gap-5">
        <PageHead label={`${used} of ${limit} tracks`} title="Projects" />
        <p className="-mt-2 text-[13px] text-mute">Your own tracks to keep and listen to, in projects or on their own. They stay until you delete them.</p>
        {(folders.length > 0 || canEdit) && (
          <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Projects">
            {folders.map((p) => (
              <li key={p.id}>
                <ProjectTile p={{ id: p.id, name: p.name, count: p.count, duration: p.duration }} canEdit={canEdit} />
              </li>
            ))}
            {canEdit && folders.length < MAX_FOLDERS && <NewProject />}
          </ul>
        )}
        <section className="flex flex-col gap-3" aria-labelledby="loose-tracks">
          <h2 id="loose-tracks" className="text-[15px] font-semibold tracking-[-0.015em] text-bone">
            Not in a project
          </h2>
          {canEdit && (
            <OwnerUpload
              api="/api/music/upload"
              heading="Add your own tracks"
              note="WAV or MP3. Each file is checked as real audio and for viruses, then kept here until you delete it."
              startOpen={used === 0}
            />
          )}
          <MusicList
            canEdit={canEdit}
            folders={folders.map((f) => ({ id: f.id, name: f.name }))}
            here={null}
            empty={folders.length ? "Every track is in a project." : "No tracks yet."}
            tracks={loose.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, peaks: t.peaks, added: fmtDay(t.created_at, user.tz) }))}
          />
        </section>
      </div>
    </div>
  );
}
