"use client";

import { Icon } from "@/components/Kit";
import { useFocusTrap } from "@/components/useFocusTrap";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** The QR code button beside your link: opens a preview of the code, with PNG and SVG downloads, before anything is saved. */
export function QrButton({ handle, link, className }: { handle: string; link: string; className: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="QR code" title="QR code" className={className}>
        <Icon name="grid" className="size-[15px]" />
      </button>
      {open && createPortal(<QrDialog handle={handle} link={link} onClose={() => setOpen(false)} />, document.getElementById("theme-root") ?? document.body)}
    </>
  );
}

function QrDialog({ handle, link, onClose }: { handle: string; link: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
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
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-h"
        className="w-full max-w-sm rounded-[18px] border border-line bg-card p-5 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="qr-h" className="text-[15px] font-semibold tracking-[-0.015em] text-bone">
              Your link as a QR code
            </h2>
            <p className="mt-1 truncate text-[11px] text-mute">{link.replace(/^https?:\/\//, "")}</p>
          </div>
          <button ref={close} onClick={onClose} aria-label="Close" className="-m-1.5 grid size-11 shrink-0 place-items-center rounded-full text-mute hover:bg-well hover:text-bone">
            <Icon name="x" className="size-4" />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`QR code linking to ${link}`} className="mt-5 aspect-square w-full rounded-xl bg-white" />
        <div className="mt-5 grid grid-cols-2 gap-2">
          <a href={`${src}?format=png&download=1`} className="btn-lime min-h-11 rounded-[13px] font-semibold">
            Download PNG
          </a>
          <a href={`${src}?format=svg&download=1`} className="btn-ghost min-h-11 rounded-[13px] bg-well font-semibold">
            Download SVG
          </a>
        </div>
        <p className="mt-3 text-[11px] text-mute">PNG for stories and screens. SVG stays sharp at any size for print.</p>
      </div>
    </div>
  );
}
