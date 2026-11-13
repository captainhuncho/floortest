import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getFolder, listFolders, listLibrary } from "@/lib/library";
import { fmtDay } from "@/lib/format";
import { OwnerUpload } from "../../collections/OwnerUpload";
import { MusicList } from "../MusicList";
import { ProjectHeader } from "../ProjectsUI";

export const metadata = { title: "Project — FloorTest" };

/** One project (a folder in Projects): its tracks, adding to it, and moving tracks on to another project. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const project = await getFolder(user, id);
  if (!project) notFound();
  const [tracks, folders] = await Promise.all([listLibrary(user, id), listFolders(user)]);
  const canEdit = user.role !== "member";
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-4 sm:gap-5">
        <ProjectHeader p={{ id: project.id, name: project.name, count: project.count, duration: project.duration }} canEdit={canEdit} />
        {canEdit && (
          <OwnerUpload
            api="/api/music/upload"
            fields={{ folderId: id }}
            heading={`Add tracks to ${project.name}`}
            note="WAV or MP3. Each file is checked as real audio and for viruses, then kept here until you delete it."
            startOpen={tracks.length === 0}
          />
        )}
        <MusicList
          canEdit={canEdit}
          folders={folders.map((f) => ({ id: f.id, name: f.name }))}
          here={id}
          empty="No tracks in this project yet."
          tracks={tracks.map((t) => ({ id: t.id, title: t.title, artist: t.artist, duration: t.duration, peaks: t.peaks, added: fmtDay(t.created_at, user.tz) }))}
        />
      </div>
    </div>
  );
}
