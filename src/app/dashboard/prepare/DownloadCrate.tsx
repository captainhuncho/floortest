"use client";

import { useState } from "react";
import { Dialog, DIALOG_MAIN } from "@/components/Dialog";
import { Icon } from "@/components/Kit";
import { stored, useDeviceState } from "@/components/useBrowserValue";
import { CRATE_KINDS, crateHref, crateReady, type CrateKind } from "@/lib/crate-href";
import { KEY } from "../ExportButton";
import { FIELD_LABEL } from "../kitButtons";

/**
 * Prepare's one lime button (owner, 17 Nov: option 44). It opens a sheet (a centred panel on wider screens): the
 * folder's name, one of three downloads (files with an M3U8 playlist, the same with a Rekordbox XML, or the files
 * alone), then "Download N tracks". It replaces Download kept and Files only; the export behind it is the same.
 */
export function DownloadCrate({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<CrateKind>("playlist");
  // The music folder saved on this device: a Rekordbox XML needs to know where the folder will be unzipped.
  const [base, setBase] = useDeviceState(() => stored(KEY), "");
  const ready = crateReady(kind, name, base);

  // A fresh, dated name each time the sheet opens: every download is its own new folder.
  const show = () => {
    setName(`FloorTest set ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`);
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={show} aria-haspopup="dialog" className="btn-lime min-h-12 w-full gap-2 rounded-[14px] px-5! text-[14px]! font-semibold lg:w-auto">
        <Icon name="dl" className="size-4" />
        Download crate
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Download crate"
        description="The original files in a new folder. Senders are told their original was downloaded."
        actions={
          <a
            href={ready ? crateHref(kind, name, base) : undefined}
            aria-disabled={!ready || undefined}
            onClick={() => {
              try {
                if (kind === "rekordbox" && base.trim()) localStorage.setItem(KEY, base.trim());
              } catch {}
              // Let the download start before the sheet goes.
              setTimeout(() => setOpen(false), 300);
            }}
            className={`${DIALOG_MAIN} w-full ${ready ? "" : "pointer-events-none opacity-40"}`}
          >
            Download {count} {count === 1 ? "track" : "tracks"}
          </a>
        }
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Folder name</span>
            <input className="input text-base" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">What to download</legend>
            {CRATE_KINDS.map((k) => (
              <label key={k.kind} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-[14px] border p-3 ${kind === k.kind ? "border-line-2 bg-well" : "border-line"}`}>
                <input type="radio" name="crate-kind" checked={kind === k.kind} onChange={() => setKind(k.kind)} className="mt-0.5 size-5 shrink-0 accent-bone" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-bone">{k.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-[1.4] text-mute">{k.line}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {kind === "rekordbox" && (
            <label className="flex flex-col gap-1.5">
              <span className={FIELD_LABEL}>Where you&apos;ll unzip the folder (Rekordbox needs it)</span>
              <input className="input font-mono text-base" value={base} onChange={(e) => setBase(e.target.value)} placeholder="/Users/you/Music" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
            </label>
          )}
        </div>
      </Dialog>
    </>
  );
}
