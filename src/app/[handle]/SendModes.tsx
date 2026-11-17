"use client";

import { useState } from "react";
import type { BriefItem } from "@/lib/brief";
import { FolderSend } from "../dashboard/send/FolderSend";
import { Brief } from "./Brief";
import { SubmitForm } from "./SubmitForm";
import { SEG, segTab } from "@/components/Kit";

type FormProps = React.ComponentProps<typeof SubmitForm>;

const SWITCH_LINK = "inline-flex min-h-11 items-center self-center text-[13px] text-mute underline underline-offset-4 hover:text-bone";

/**
 * The link page's send area: the receiver's brief (a genre tapped there carries into the form), then tracks (up to 3).
 * When the receiver's plan accepts folders, one quiet link under Choose a track switches to sending a folder, and back.
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
  return (
    <div className="flex flex-1 flex-col gap-3.5">
      {brief && <Brief {...brief} picked={picked} onPick={setPicked} />}
      {mode === "tracks" || !folderBytes ? (
        <SubmitForm
          {...form}
          presetGenre={picked}
          folderLink={
            folderBytes > 0 && (
              <button type="button" onClick={() => setMode("folder")} className={SWITCH_LINK}>
                Sending an EP? Send a folder
              </button>
            )
          }
        />
      ) : (
        <>
          <FolderSend handle={form.handle} receiverName={form.receiverName} genres={form.genres} folderBytes={folderBytes} botCheckKey={form.botCheckKey} callout={form.callout} trackArt={form.trackArt} presetGenre={picked} receiverAsksPlay={form.receiverAsksPlay} />
          <button type="button" onClick={() => setMode("tracks")} className={SWITCH_LINK}>
            Sending single tracks? Send up to 3 tracks
          </button>
        </>
      )}
    </div>
  );
}

/** "Single tracks" or "Folder": a slim switch; each mode's drop box states its own limits. Used by the dashboard Send page. */
export function SendModeTabs({ mode, setMode, className = "" }: { mode: "tracks" | "folder"; setMode: (m: "tracks" | "folder") => void; className?: string }) {
  return (
    <div className={className}>
      <div role="group" aria-label="What to send" className={SEG}>
        {(["tracks", "folder"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={`tap-tall ${segTab(mode === m)}`}
          >
            {m === "tracks" ? "Up to 3 tracks" : "A folder (EP, album)"}
          </button>
        ))}
      </div>
    </div>
  );
}
