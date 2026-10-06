"use client";

import { useState } from "react";
import { FolderSend } from "../dashboard/send/FolderSend";
import { SubmitForm } from "./SubmitForm";

type FormProps = React.ComponentProps<typeof SubmitForm>;

/** The link page's send area: tracks (up to 3), plus an EP or album when the receiver's plan accepts folders. */
export function SendModes({ folderBytes, ...form }: FormProps & { folderBytes: number }) {
  const [mode, setMode] = useState<"tracks" | "folder">("tracks");
  if (!folderBytes) return <SubmitForm {...form} />;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="What to send" className="inline-flex rounded-full border border-line bg-ink-3 p-0.5 text-sm group-has-[[data-picked]]/page:hidden">
        {(["tracks", "folder"] as const).map((m) => (
          <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 ${mode === m ? "bg-bone font-semibold text-ink" : "text-mute"}`}>
            {m === "tracks" ? "Up to 3 tracks" : "A folder"}
          </button>
        ))}
      </div>
      {mode === "tracks" ? (
        <SubmitForm {...form} />
      ) : (
        <FolderSend handle={form.handle} receiverName={form.receiverName} genres={form.genres} folderBytes={folderBytes} botCheckKey={form.botCheckKey} />
      )}
    </div>
  );
}
