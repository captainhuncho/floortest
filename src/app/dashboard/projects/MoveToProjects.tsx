"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Kit";
import { useToast } from "@/components/Toast";
import { moveToProjects } from "../actions/music";

/**
 * On a track the desk added itself (never a sender's; owner, 13 Nov): moves it out of the collection into Projects, into
 * a project or none. It leaves the collection, so the page goes on to `after` (the next track, or the Queue).
 */
export function MoveToProjects({ trackId, title, folders, after }: { trackId: number; title: string; folders: { id: number; name: string }[]; after: string }) {
  const router = useRouter();
  const toast = useToast();
  const [folder, setFolder] = useState("");
  const [pending, start] = useTransition();
  const move = () =>
    start(async () => {
      const r = await moveToProjects(trackId, folder ? Number(folder) : null);
      if (!r.ok) return toast.show({ message: r.error, tone: "error" });
      const where = folders.find((f) => String(f.id) === folder)?.name;
      toast.show({ message: `Moved ${title} to ${where ? `Projects · ${where}` : "Projects"}` });
      router.push(after);
    });
  return (
    <div className="flex min-h-11 min-w-0 sm:col-span-2">
      <label className="sr-only" htmlFor={`project-${trackId}`}>
        Project
      </label>
      <select
        id={`project-${trackId}`}
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        className="min-w-0 flex-1 rounded-l-xl border border-line bg-well px-2.5 text-[13px] text-bone max-sm:text-base"
      >
        <option value="">Projects (no project)</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={move}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-r-xl border border-l-0 border-line bg-well px-3 text-[13px] font-semibold text-bone hover:border-line-2"
      >
        <Icon name="music" className="size-4" />
        {pending ? "Moving…" : "Move to Projects"}
      </button>
    </div>
  );
}
