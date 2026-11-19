import { requireUser } from "@/lib/auth";
import { libraryLimit, libraryUsed, listFolders, listLibrary, ownCollectionTrackCount } from "@/lib/library";
import { listDeskFolders } from "@/lib/desk-folders";
import { recordId } from "@/lib/ids";
import { fmtDay } from "@/lib/format";
import { OwnerUpload } from "../collections/OwnerUpload";
import { MoveAllToProjects } from "./MoveAllToProjects";
import { MusicList } from "./MusicList";
import { ProjectTile } from "./ProjectsUI";
import { FolderArea, FolderCrumb, FolderTile } from "../collections/Folders";
import { FolderList } from "../collections/FolderList";
import { CollectionsTabs } from "../collections/CollectionsTabs";

export const metadata = { title: "Projects — FloorTest" };

/**
 * Projects, the "Projects" filter of Collections (owner, 17 Nov: option 43): the desk's own tracks, kept until someone
 * deletes them (never by the nightly clean-up), in projects (folders, shown like callouts) or in none. Separate from what
 * senders send, so they never show in the Review Queue, stats or receipts. Everyone on the desk can listen; the owner
 * and admins add, move, rename and delete.
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
    ...(folder ? [] : deskFolders.map((f) => ({ key: `pf${f.id}`, name: f.name, node: <FolderTile kind="project" f={f} canEdit={canEdit} /> }))),
    ...projects
      .filter((p) => p.desk_folder_id === (folder?.id ?? null))
      .map((p) => ({
        key: `p${p.id}`,
        name: p.name,
        node: <ProjectTile p={{ id: p.id, name: p.name, count: p.count, duration: p.duration, art: p.art }} canEdit={canEdit} folders={canEdit ? folderList : undefined} folderId={p.desk_folder_id} />,
      })),
  ];
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 sm:gap-6">
        {/* "New folder" and right-click: a project, or a group of projects; Upload audio beside it (owner, 16 Nov). */}
        <FolderArea view="projects" folder={folder?.id ?? null} canEdit={canEdit} label={`${used} of ${limit} tracks`}>
          {canEdit && inCollections > 0 && <MoveAllToProjects count={inCollections} />}
          {folder && <FolderCrumb kind="project" name={folder.name} />}
          <FolderList
            items={items}
            label={folder ? folder.name : "Projects"}
            filter={<CollectionsTabs on="projects" />}
            empty={folder ? "Nothing in this folder yet. Make a project with New folder, or move one here from its ··· menu." : "No projects yet."}
          />
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
                empty={projects.length ? "Every track is in a project." : canEdit ? "No tracks yet. Tap Upload audio to add some." : "No tracks yet."}
                tracks={loose.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, peaks: t.peaks, added: fmtDay(t.created_at, user.tz) }))}
              />
            </section>
          )}
        </FolderArea>
      </div>
    </div>
  );
}
