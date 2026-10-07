"use client";

import { useState } from "react";
import { FolderSend } from "../dashboard/send/FolderSend";
import { SubmitForm } from "./SubmitForm";

type FormProps = React.ComponentProps<typeof SubmitForm>;

/** The link page's send area: tracks (up to 3), plus a folder when the receiver's plan accepts folders. */
export function SendModes({ folderBytes, ...form }: FormProps & { folderBytes: number }) {
  const [mode, setMode] = useState<"tracks" | "folder">("tracks");
  if (!folderBytes) return <SubmitForm {...form} />;
  return (
    <div className="space-y-4">
      <SendModeTabs mode={mode} setMode={setMode} className="group-has-[[data-picked]]/page:hidden" />
      {mode === "tracks" ? (
        <SubmitForm {...form} />
      ) : (
        <FolderSend handle={form.handle} receiverName={form.receiverName} genres={form.genres} folderBytes={folderBytes} botCheckKey={form.botCheckKey} callout={form.callout} />
      )}
    </div>
  );
}

/** "3 tracks" or "Folder": a slim switch; each mode's drop box states its own limits. Shared by the link page and the dashboard Send page. */
export function SendModeTabs({ mode, setMode, className = "" }: { mode: "tracks" | "folder"; setMode: (m: "tracks" | "folder") => void; className?: string }) {
  return (
    <div className={className}>
      <div role="tablist" aria-label="What to send" className="inline-flex rounded-full border border-line bg-ink-2 p-1 text-sm">
        {(["tracks", "folder"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`tap-tall rounded-full px-4 py-1.5 transition ${mode === m ? "bg-ink-4 font-semibold text-lime" : "text-mute hover:text-bone"}`}
          >
            {m === "tracks" ? "3 tracks" : "Folder"}
          </button>
        ))}
      </div>
    </div>
  );
}
