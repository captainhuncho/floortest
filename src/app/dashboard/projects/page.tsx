import { requireUser } from "@/lib/auth";
import { libraryLimit, libraryUsed, listFolders, listLibrary, ownCollectionTrackCount } from "@/lib/library";
import { listDeskFolders } from "@/lib/desk-folders";
import { recordId } from "@/lib/ids";
import { fmtDay } from "@/lib/format";
import { OwnerUpload } from "../collections/OwnerUpload";
import { MoveAllToProjects } from "./MoveAllToProjects";
import { MusicList } from "./MusicList";
import { ProjectTile } from "./ProjectsUI";
import { ProjectsBar, ProjectsEmpty } from "./ProjectsBar";
import { FolderArea, FolderCrumb, FolderTile } from "../collections/Folders";
import { FolderList } from "../collections/FolderList";
import { CollectionsTabs } from "../collections/CollectionsTabs";

export const metadata = { title: "Projects — FloorTest" };

/**
 * Projects, the "Projects" filter of Collections (owner, 17 Nov: option 43): the desk's own tracks, kept until someone
 * deletes them (never by the nightly clean-up), in projects (folders, shown like callouts) or in none. Separate from what
 * senders send, so they never show in the Review Queue, stats or receipts. Everyone on the desk can listen; the owner
 * and admins add, move, rename and delete.
 *
 * Layout (owner, 19 Nov: option 63 A): the filter, the room line and the two tools (New folder, Upload audio) in one bar;
 * the tiles two a row on phones and five on a laptop; then the tracks in no project as rows. Nothing in Projects at all:
 * one sentence, with Upload audio and New folder for those who can add.
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
  const folderList = deskFolders.map((f) => ({ id: f.id, name: f.name }));
  const items = [
    ...(folder ? [] : deskFolders.map((f) => ({ key: `pf${f.id}`, name: f.name, node: <FolderTile kind="project" f={f} canEdit={canEdit} tile /> }))),
    ...projects
      .filter((p) => p.desk_folder_id === (folder?.id ?? null))
      .map((p) => ({
        key: `p${p.id}`,
        name: p.name,
        node: <ProjectTile p={{ id: p.id, name: p.name, count: p.count, duration: p.duration, art: p.art }} canEdit={canEdit} folders={canEdit ? folderList : undefined} folderId={p.desk_folder_id} tile />,
      })),
  ];
  const nothing = !folder && deskFolders.length === 0 && projects.length === 0 && loose.length === 0;
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-[1040px] flex-col gap-5 sm:gap-6">
        {/* Right-click on the page: New folder; on a tile: its ··· menu (FolderArea). */}
        <FolderArea view="projects" folder={folder?.id ?? null} canEdit={canEdit}>
          {canEdit && inCollections > 0 && <MoveAllToProjects count={inCollections} />}
          {nothing ? (
            <>
              <CollectionsTabs on="projects" />
              <ProjectsEmpty canEdit={canEdit} />
            </>
          ) : (
            <ProjectsBar used={used} limit={limit} canEdit={canEdit} />
          )}
          {/* One file picker for every Upload audio on the page; it stays in this place in both layouts, so an upload
              in progress isn't lost when the first track turns the empty page into the list. */}
          {canEdit && <OwnerUpload api="/api/music/upload" heading="Upload audio" fromMenu pageDrop="project" />}
          {!nothing && (
            <>
              {folder && <FolderCrumb kind="project" name={folder.name} />}
              <FolderList
                items={items}
                label={folder ? folder.name : "Projects"}
                tiles
                searchFrom={7}
                empty={folder ? "Nothing in this folder yet. Make a project with New folder, or move one here from its ··· menu." : "No projects yet."}
              />
              {!folder && (
                <section className="flex flex-col gap-1" aria-labelledby="loose-tracks">
                  <h2 id="loose-tracks" className="text-[13px] font-semibold text-mute">
                    Not in a project
                  </h2>
                  <MusicList
                    canEdit={canEdit}
                    folders={projects.map((f) => ({ id: f.id, name: f.name }))}
                    here={null}
                    empty={projects.length ? "Every track is in a project." : canEdit ? "No tracks yet. Tap Upload audio to add some." : "No tracks yet."}
                    tracks={loose.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, peaks: t.peaks, added: fmtDay(t.created_at, user.tz) }))}
                  />
                </section>
              )}
            </>
          )}
        </FolderArea>
      </div>
    </div>
  );
}
