"use client";

import { useState } from "react";
import type { BriefItem } from "@/lib/brief";
import { FolderSend } from "../dashboard/send/FolderSend";
import { Brief } from "./Brief";
import { SubmitForm } from "./SubmitForm";

type FormProps = React.ComponentProps<typeof SubmitForm>;

/**
 * The link page's send area: the receiver's brief (a genre tapped there carries into the form), then tracks (up to 3),
 * plus a folder when the receiver's plan accepts folders.
 */
export function SendModes({
  folderBytes,
  brief,
  ...form
}: FormProps & {
  folderBytes: number;
  brief?: { heading: React.ReactNode; genres: string[]; items: BriefItem[]; shareNote?: string | null } | null;
}) {
  const [mode, setMode] = useState<"tracks" | "folder">("tracks");
  const [picked, setPicked] = useState("");
  const tracks = <SubmitForm {...form} presetGenre={picked} />;
  return (
    <div className="flex flex-col gap-5">
      {brief && <Brief {...brief} picked={picked} onPick={setPicked} />}
      {!folderBytes ? (
        tracks
      ) : (
        <div className="space-y-4">
          <SendModeTabs mode={mode} setMode={setMode} className="group-has-[[data-picked]]/page:hidden" />
          {mode === "tracks" ? (
            tracks
          ) : (
            <FolderSend handle={form.handle} receiverName={form.receiverName} genres={form.genres} folderBytes={folderBytes} botCheckKey={form.botCheckKey} callout={form.callout} trackArt={form.trackArt} presetGenre={picked} />
          )}
        </div>
      )}
    </div>
  );
}

/** "Single tracks" or "Folder": a slim switch; each mode's drop box states its own limits. Shared by the link page and the dashboard Send page. */
export function SendModeTabs({ mode, setMode, className = "" }: { mode: "tracks" | "folder"; setMode: (m: "tracks" | "folder") => void; className?: string }) {
  return (
    <div className={className}>
      <div role="group" aria-label="What to send" className="inline-flex rounded-full border border-line bg-ink-2 p-1 text-sm">
        {(["tracks", "folder"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`tap-tall rounded-full px-4 py-1.5 transition ${mode === m ? "bg-bone font-semibold text-ink" : "text-mute hover:text-bone"}`}
          >
            {m === "tracks" ? "Up to 3 tracks" : "A folder (EP, album)"}
          </button>
        ))}
      </div>
    </div>
  );
}
