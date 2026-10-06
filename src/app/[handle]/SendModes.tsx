"use client";

import { useState } from "react";
import { fmtBytes } from "@/lib/format";
import { MAX_RELEASE_TRACKS } from "@/lib/plans";
import { FolderSend } from "../dashboard/send/FolderSend";
import { SubmitForm } from "./SubmitForm";

type FormProps = React.ComponentProps<typeof SubmitForm>;

/** The link page's send area: tracks (up to 3), plus a folder when the receiver's plan accepts folders. */
export function SendModes({ folderBytes, ...form }: FormProps & { folderBytes: number }) {
  const [mode, setMode] = useState<"tracks" | "folder">("tracks");
  if (!folderBytes) return <SubmitForm {...form} />;
  return (
    <div className="space-y-4">
      <SendModeTabs mode={mode} setMode={setMode} folderBytes={folderBytes} className="group-has-[[data-picked]]/page:hidden" />
      {mode === "tracks" ? (
        <SubmitForm {...form} />
      ) : (
        <FolderSend handle={form.handle} receiverName={form.receiverName} genres={form.genres} folderBytes={folderBytes} botCheckKey={form.botCheckKey} />
      )}
    </div>
  );
}

/** "Up to 3 tracks" or "A folder", each with its limits. Shared by the link page and the dashboard Send page. */
export function SendModeTabs({ mode, setMode, folderBytes, className = "" }: { mode: "tracks" | "folder"; setMode: (m: "tracks" | "folder") => void; folderBytes: number; className?: string }) {
  return (
    <div role="tablist" aria-label="What to send" className={`grid grid-cols-2 gap-1 rounded-xl border border-line bg-ink-3 p-1 ${className}`}>
      {(["tracks", "folder"] as const).map((m) => (
        <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-lg px-3 py-2 text-left ${mode === m ? "bg-bone text-ink" : "text-mute hover:text-bone"}`}>
          <span className="block text-sm font-semibold">{m === "tracks" ? "Up to 3 tracks" : "A folder"}</span>
          <span className={`block text-xs ${mode === m ? "text-ink/70" : "text-mute"}`}>{m === "tracks" ? "250 MB in total" : `Up to ${MAX_RELEASE_TRACKS} tracks · ${fmtBytes(folderBytes)}`}</span>
        </button>
      ))}
    </div>
  );
}
