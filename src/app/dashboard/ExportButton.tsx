"use client";

import { useEffect, useState } from "react";

const KEY = "floortest.exportBase";

/** "Prepare for set": downloads kept originals into a new, named folder. A Rekordbox XML is optional (it needs to know where the folder is unzipped). */
export function ExportButton({
  collectionId,
  count,
  whole = false,
  label,
  variant = "lime",
  buttonClassName,
  crateName,
  align = "right",
  showCount = true,
}: {
  collectionId: number | null;
  count: number;
  /** The whole collection folder instead of just its kept tracks. */
  whole?: boolean;
  label?: string;
  variant?: "lime" | "ghost";
  /** Replaces the default button look (Figma full-width buttons on Prepare). */
  buttonClassName?: string;
  /** Suggested folder name (a collection's name); otherwise a dated set name. */
  crateName?: string;
  /** Which edge the panel lines up with; "start" opens rightwards on phones (for a button at the left). */
  align?: "right" | "start";
  /** Off where the count is already on the page. */
  showCount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState("");
  const [name, setName] = useState("");
  const [xml, setXml] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) || "";
      setBase(saved);
      setXml(!!saved);
    } catch {}
  }, []);

  // A fresh, dated name each time the panel opens: every download is its own new folder.
  const openPanel = () => {
    if (!open) setName(crateName || `FloorTest set ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
    setOpen((o) => !o);
  };

  const href = () => {
    const p = new URLSearchParams({ name: name.trim() });
    if (xml && base.trim()) p.set("base", base.trim());
    if (collectionId) p.set("collection", String(collectionId));
    if (whole && collectionId) p.set("all", "1");
    return `/api/export?${p}`;
  };
  const ready = !!name.trim() && (!xml || !!base.trim());

  return (
    <div className={buttonClassName?.includes("w-full") ? "relative w-full" : "relative"}>
      <button className={buttonClassName ?? `${variant === "lime" ? "btn-lime" : "btn-ghost"} btn-sm`} disabled={!count} onClick={openPanel} aria-expanded={open}>
        {label ?? "Prepare for set"}{showCount ? ` (${count})` : ""}
      </button>
      {open && (
        <div className={`card absolute ${align === "start" ? "left-0 md:left-auto md:right-0" : "right-0"} top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-4 p-4 shadow-2xl shadow-black/50`}>
          <div>
            <p className="font-medium">
              Download {count} {whole ? "" : "kept "}track{count === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-xs text-mute">The original files and a playlist (M3U8) in a new folder. Senders are told their original was downloaded.</p>
          </div>
          <label className="block space-y-1.5">
            <span className="label">Name the new folder</span>
            <input className="input py-2 text-sm" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="space-y-2">
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={xml} onChange={(e) => setXml(e.target.checked)} className="mt-0.5 size-4 accent-lime" />
              <span>
                Add a Rekordbox XML
                <span className="block text-xs text-mute">Rekordbox needs to know where you&apos;ll unzip the folder.</span>
              </span>
            </label>
            {xml && (
              <input className="input py-2 font-mono text-xs" value={base} onChange={(e) => setBase(e.target.value)} placeholder="/Users/you/Music" aria-label="Where you'll unzip the folder" />
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <a
              href={ready ? href() : undefined}
              onClick={() => {
                try {
                  if (xml && base.trim()) localStorage.setItem(KEY, base.trim());
                } catch {}
                setTimeout(() => setOpen(false), 300);
              }}
              className={`btn-lime btn-sm flex-1 ${ready ? "" : "pointer-events-none opacity-40"}`}
            >
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
