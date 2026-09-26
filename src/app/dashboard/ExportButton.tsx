"use client";

import { useEffect, useState } from "react";

const KEY = "floortest.exportBase";

/** "Prepare for set": downloads every kept original as a crate. Rekordbox XML needs absolute paths, so we ask once where it'll be unzipped. */
export function ExportButton({
  collectionId,
  count,
  whole = false,
  label,
  variant = "lime",
}: {
  collectionId: number | null;
  count: number;
  /** The whole collection folder instead of just its kept tracks. */
  whole?: boolean;
  label?: string;
  variant?: "lime" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");

  useEffect(() => {
    try {
      setBase(localStorage.getItem(KEY) || "");
    } catch {}
  }, []);

  const href = () => {
    const p = new URLSearchParams({ base });
    if (collectionId) p.set("collection", String(collectionId));
    if (whole && collectionId) p.set("all", "1");
    return `/api/export?${p}`;
  };

  return (
    <div className="relative">
      <button className={`${variant === "lime" ? "btn-lime" : "btn-ghost"} btn-sm`} disabled={!count} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label ?? "Prepare for set"} ({count})
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-20 mt-2 w-80 p-4 shadow-2xl shadow-black/50">
          <p className="font-medium">
            Download {count} {whole ? "" : "kept "}track{count === 1 ? "" : "s"} as a crate
          </p>
          <p className="mt-1 text-sm text-mute">
            A ZIP of the original files with a <code>rekordbox.xml</code> and an M3U8 playlist (works in Serato, Traktor and Engine too).
            Senders are told their original was downloaded.
          </p>
          <label className="mt-4 block space-y-1.5">
            <span className="label">Folder you&apos;ll unzip into</span>
            <input className="input py-2 font-mono text-xs" value={base} onChange={(e) => setBase(e.target.value)} placeholder="/Users/you/Music/FloorTest" />
          </label>
          <p className="mt-2 text-xs text-mute">
            In Rekordbox: Preferences → Advanced → Database → rekordbox xml, pick the XML, then drag the playlist in.
          </p>
          <a
            href={base.trim() ? href() : undefined}
            onClick={() => {
              try {
                localStorage.setItem(KEY, base.trim());
              } catch {}
              setTimeout(() => setOpen(false), 300);
            }}
            className={`btn-lime btn-sm mt-4 w-full ${base.trim() ? "" : "pointer-events-none opacity-40"}`}
          >
            Download crate
          </a>
          <button type="button" className="btn btn-sm mt-2 w-full text-mute" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
