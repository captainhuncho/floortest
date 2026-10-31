"use client";

import { Icon } from "@/components/Kit";
import { Dialog, DIALOG_MAIN, DIALOG_QUIET } from "@/components/Dialog";
import { useState } from "react";

/** The QR code button beside your link: opens a preview of the code, with PNG and SVG downloads, before anything is saved. */
export function QrButton({ handle, link, className }: { handle: string; link: string; className: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/qr/${handle}`;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="QR code" title="QR code" aria-haspopup="dialog" className={className}>
        <Icon name="grid" className="size-[15px]" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Your link as a QR code"
        description={<span className="block truncate">{link.replace(/^https?:\/\//, "")}</span>}
        actions={
          <>
            <a href={`${src}?format=svg&download=1`} className={DIALOG_QUIET}>
              Download SVG
            </a>
            <a href={`${src}?format=png&download=1`} className={DIALOG_MAIN}>
              Download PNG
            </a>
          </>
        }
      >
        {/* Loaded only once opened: the code is drawn on request. */}
        {open && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`QR code linking to ${link}`} className="mx-auto aspect-square w-full max-w-[18rem] rounded-xl bg-white" />
        )}
        <p className="mt-3 text-[12px] text-mute">PNG for stories and screens. SVG stays sharp at any size for print.</p>
      </Dialog>
    </>
  );
}
