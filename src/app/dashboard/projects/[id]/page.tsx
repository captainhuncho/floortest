import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getFolder, listFolders, listLibrary } from "@/lib/library";
import { fmtDay } from "@/lib/format";
import { OwnerUpload } from "../../collections/OwnerUpload";
import { fmtLength, FolderPage } from "../../collections/FolderPage";
import { trackCount } from "../../collections/FolderRow";
import { PlayAll } from "../../collections/PlayAll";
import { MusicList } from "../MusicList";
import { musicToPlayer } from "@/lib/player-track";
import { ProjectTools } from "../ProjectsUI";

export const metadata = { title: "Project — FloorTest" };

/**
 * A project's folder page (owner, 17 Nov: option 43; the same page as a callout's): the plain music tile for a cover
 * (option 57 I; project tracks carry no artwork yet), a dashed one while it's empty, its name, its tracks and length in one line, shuffle and play, "Add tracks", then its
 * tracks, numbered.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const project = await getFolder(user, id);
  if (!project) notFound();
  const [tracks, folders] = await Promise.all([listLibrary(user, id), listFolders(user)]);
  const canEdit = user.role !== "member";
  const items = tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, peaks: t.peaks, added: fmtDay(t.created_at, user.tz) }));
  return (
    <FolderPage
      back={{ href: "/dashboard/projects", label: "Projects" }}
      tools={canEdit && <ProjectTools p={{ id: project.id, name: project.name, count: project.count, duration: project.duration }} />}
      covers={[]}
      empty={!project.count}
      name={project.name}
      lines={[project.count ? `Project · ${trackCount(project.count)}${project.duration ? ` · ${fmtLength(project.duration)}` : ""}` : "Project · no tracks yet"]}
      play={<PlayAll queue={items.map(musicToPlayer)} name={project.name} />}
      action={
        canEdit && (
          // The upload's own "Add tracks" button, stretched to the page's one wide button.
          <div className="[&>button]:min-h-12 [&>button]:w-full [&>button]:rounded-[14px] [&>button]:text-[14px]">
            <OwnerUpload
              api="/api/music/upload"
              fields={{ folderId: id }}
              heading={`Add tracks to ${project.name}`}
              note="WAV or MP3. Each file is checked as real audio and for viruses, then kept here until you delete it."
            />
          </div>
        )
      }
    >
      <MusicList canEdit={canEdit} folders={folders.map((f) => ({ id: f.id, name: f.name }))} here={id} numbered empty={canEdit ? "Add your own tracks here: WAV or MP3." : "No tracks in this project yet."} tracks={items} />
    </FolderPage>
  );
}
