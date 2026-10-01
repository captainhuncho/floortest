"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** The QR code row: opens a preview of the code, with PNG and SVG downloads, before anything is saved. */
export function QrRow({ handle, link }: { handle: string; link: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center gap-3 py-0.5 text-left">
        <span aria-hidden className="grid w-5 shrink-0 place-items-center text-[15px] leading-none text-mute">
          ▦
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-bone">QR code</span>
          <span className="mt-0.5 hidden truncate text-[10px] text-faint md:block">For flyers, screens and stories</span>
        </span>
        <span className="text-[11px] text-mute group-hover:text-bone">Preview</span>
      </button>
      {open && createPortal(<QrDialog handle={handle} link={link} onClose={() => setOpen(false)} />, document.getElementById("theme-root") ?? document.body)}
    </>
  );
}

function QrDialog({ handle, link, onClose }: { handle: string; link: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const src = `/api/qr/${handle}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-h"
        className="w-full max-w-sm rounded-2xl border border-line bg-ink-2 p-6 font-[family-name:var(--font-stage-mono)] shadow-2xl shadow-black/70"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="qr-h" className="text-[16px] font-bold">
              Your link as a QR code
            </h2>
            <p className="mt-1 truncate text-[11px] text-mute">{link.replace(/^https?:\/\//, "")}</p>
          </div>
          <button ref={close} onClick={onClose} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full text-lg leading-none text-mute hover:bg-ink-3 hover:text-bone">
            ✕
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`QR code linking to ${link}`} className="mt-5 aspect-square w-full rounded-xl bg-white" />
        <div className="mt-5 grid grid-cols-2 gap-2">
          <a href={`${src}?format=png&download=1`} className="rounded-md bg-lime px-3 py-2.5 text-center text-[12px] font-bold text-ink">
            Download PNG
          </a>
          <a href={`${src}?format=svg&download=1`} className="rounded-md border border-line px-3 py-2.5 text-center text-[12px] font-bold text-bone hover:border-mute">
            Download SVG
          </a>
        </div>
        <p className="mt-3 text-[11px] text-mute">PNG for stories and screens. SVG stays sharp at any size for print.</p>
      </div>
    </div>
  );
}
