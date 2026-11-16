import { requireUser } from "@/lib/auth";
import { libraryLimit, libraryUsed, listFolders, listLibrary, ownCollectionTrackCount } from "@/lib/library";
import { listDeskFolders } from "@/lib/desk-folders";
import { recordId } from "@/lib/ids";
import { fmtDay } from "@/lib/format";
import { PageHead } from "@/components/Kit";
import { OwnerUpload } from "../collections/OwnerUpload";
import { MoveAllToProjects } from "./MoveAllToProjects";
import { MusicList } from "./MusicList";
import { ProjectTile } from "./ProjectsUI";
import { FolderArea, FolderCrumb, FolderTile } from "../collections/Folders";
import { CollectionsTabs } from "../collections/CollectionsTabs";

export const metadata = { title: "Projects — FloorTest" };

/**
 * Projects: the desk's own tracks, kept until someone deletes them (never by the nightly clean-up), in projects (folders,
 * built like collections) or in none. Separate from what senders send, so they never show in the Review Queue, stats or
 * receipts. Everyone on the desk can listen; the owner and admins add, move, rename and delete.
 */
export default async function Projects({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const user = await requireUser();
  const canEdit = user.role !== "member";
  const [projects, deskFolders, loose, used, limit, inCollections] = await Promise.all([
    listFolders(user),
    listDeskFolders(user, "project"),
    listLibrary(user, null),
    libraryUsed(user),
    libraryLimit(user.plan),
    canEdit ? ownCollectionTrackCount(user) : 0,
  ]);
  // Inside a folder (?folder=), only its projects; at the top, the folders, the projects in none, then loose tracks.
  const folderId = recordId((await searchParams).folder);
  const folder = folderId === null ? null : (deskFolders.find((f) => f.id === folderId) ?? null);
  const shown = projects.filter((p) => p.desk_folder_id === (folder?.id ?? null));
  const folderList = deskFolders.map((f) => ({ id: f.id, name: f.name }));
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 sm:gap-5">
        <div className="flex flex-col gap-1.5">
          <PageHead label={`${used} of ${limit} tracks`} title="Collections" center />
          <CollectionsTabs on="projects" />
        </div>
        {canEdit && inCollections > 0 && <MoveAllToProjects count={inCollections} />}
        {/* "+ New" and right-click: Upload audio, New project, New folder (owner, 16 Nov). */}
        <FolderArea kind="project" folder={folder?.id ?? null} canEdit={canEdit}>
          {folder && <FolderCrumb kind="project" name={folder.name} />}
          {(shown.length > 0 || (!folder && deskFolders.length > 0)) && (
            <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={folder ? folder.name : "Projects"}>
              {!folder &&
                deskFolders.map((f) => (
                  <li key={`f${f.id}`}>
                    <FolderTile kind="project" f={f} canEdit={canEdit} />
                  </li>
                ))}
              {shown.map((p) => (
                <li key={p.id}>
                  <ProjectTile p={{ id: p.id, name: p.name, count: p.count, duration: p.duration }} canEdit={canEdit} folders={canEdit ? folderList : undefined} folderId={p.desk_folder_id} />
                </li>
              ))}
            </ul>
          )}
          {folder && shown.length === 0 && <p className="text-[12px] text-mute">Nothing in this folder yet. Make a project with New, or move one here from its ··· menu.</p>}
          {!folder && (
            <section className="flex flex-col gap-3" aria-labelledby="loose-tracks">
              <h2 id="loose-tracks" className="text-[15px] font-semibold tracking-[-0.015em] text-bone">
                Not in a project
              </h2>
              {canEdit && <OwnerUpload api="/api/music/upload" heading="Upload audio" fromMenu />}
              <MusicList
                canEdit={canEdit}
                folders={projects.map((f) => ({ id: f.id, name: f.name }))}
                here={null}
                empty={projects.length ? "Every track is in a project." : canEdit ? "No tracks yet. Tap New to upload audio." : "No tracks yet."}
                tracks={loose.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, peaks: t.peaks, added: fmtDay(t.created_at, user.tz) }))}
              />
            </section>
          )}
        </FolderArea>
      </div>
    </div>
  );
}
