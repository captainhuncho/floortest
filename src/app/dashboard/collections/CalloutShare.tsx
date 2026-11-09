"use client";

import { useRef, useState } from "react";
import { useModalDialog } from "@/components/Dialog";
import { Icon } from "@/components/Kit";
import { useToast } from "@/components/Toast";
import { GHOST_TALL, LIME } from "../kitButtons";
import { cardCaption, cardProblem, type CardFormat } from "./callout-card";

const CARD_TIMEOUT_MS = 20_000;
const FORMATS: { id: CardFormat; label: string; aspect: string }[] = [
  { id: "story", label: "Story", aspect: "aspect-[9/16]" },
  { id: "square", label: "Square", aspect: "aspect-square" },
];

type Card =
  | { status: "loading" }
  | { status: "ready"; file: File; url: string; canShare: boolean }
  | { status: "problem"; message: string; canRetry: boolean };

/**
 * Share a callout as an image for a story or a feed. The image is fetched when the sheet opens, not on the Share tap:
 * phones only allow navigator.share straight after a tap, and waiting on the network first loses that.
 */
export function CalloutShare({ collectionId, collectionName, link }: { collectionId: number; collectionName: string; link: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<CardFormat>("story");
  const [cards, setCards] = useState<Partial<Record<CardFormat, Card>>>({});
  // Each opening of the sheet gets a number, so a card that arrives after the sheet closed is dropped.
  const opening = useRef(0);

  const close = () => {
    opening.current += 1;
    for (const c of Object.values(cards)) if (c.status === "ready") URL.revokeObjectURL(c.url);
    setCards({});
    setFormat("story");
    setOpen(false);
  };
  const { modalProps } = useModalDialog(open, close);

  async function load(f: CardFormat) {
    const started = opening.current;
    const put = (card: Card) => {
      if (started === opening.current) setCards((c) => ({ ...c, [f]: card }));
    };
    put({ status: "loading" });
    try {
      const res = await fetch(`/api/callout-card/${collectionId}?format=${f}`, { signal: AbortSignal.timeout(CARD_TIMEOUT_MS) });
      if (!res.ok) {
        const reason = res.status === 409 ? ((await res.json().catch(() => null)) as { reason?: string } | null)?.reason ?? null : null;
        put({ status: "problem", ...cardProblem(res.status, reason, res.headers.get("Retry-After")) });
        return;
      }
      const file = new File([await res.blob()], `floortest-callout-${f}.png`, { type: "image/png" });
      if (started !== opening.current) return;
      put({ status: "ready", file, url: URL.createObjectURL(file), canShare: !!navigator.canShare?.({ files: [file] }) });
    } catch {
      put({ status: "problem", ...cardProblem(0, null, null) });
    }
  }

  function start() {
    setOpen(true);
    void load("story");
  }
  function choose(f: CardFormat) {
    setFormat(f);
    if (!cards[f]) void load(f);
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: done });
    } catch {
      toast.show({ message: "Couldn't copy. Try again.", tone: "error" });
    }
  }
  async function share(file: File) {
    try {
      // Files only: some apps drop the image when text comes with it. The caption has its own button.
      await navigator.share({ files: [file] });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.show({ message: "Couldn't share. Save the image instead.", tone: "error" });
    }
  }

  const card = cards[format] ?? { status: "loading" as const };
  const aspect = FORMATS.find((x) => x.id === format)?.aspect;

  return (
    <>
      <button type="button" onClick={start} aria-haspopup="dialog" className={`${GHOST_TALL} w-full`}>
        <Icon name="share" className="size-4" />
        Share as a card
      </button>
      <dialog
        {...modalProps}
        aria-labelledby="callout-share-h"
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-[22px] border border-b-0 border-line bg-card p-0 text-bone backdrop:bg-black/55 sm:m-auto sm:max-w-md sm:rounded-[22px] sm:border-b"
      >
        {open && (
          <div className="flex flex-col gap-3 px-4 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-2">
              <h2 id="callout-share-h" className="min-w-0 truncate text-[15px] font-semibold">
                Share {collectionName}
              </h2>
              <button type="button" onClick={close} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-xl text-mute">
                <Icon name="x" className="size-5" />
              </button>
            </div>
            <div role="group" aria-label="Card size" className="grid grid-cols-2 gap-2">
              {FORMATS.map((x) => (
                <button key={x.id} type="button" aria-pressed={format === x.id} onClick={() => choose(x.id)} className={`${GHOST_TALL} ${format === x.id ? "border-lime/40 text-lime" : ""}`}>
                  {x.label}
                </button>
              ))}
            </div>
            <div aria-live="polite" className="flex justify-center">
              {card.status === "problem" ? (
                <div className="flex w-full flex-col items-start gap-3 rounded-xl border border-line bg-well p-3">
                  <p className="text-[13px] leading-5 text-bone">{card.message}</p>
                  {card.canRetry && (
                    <button type="button" onClick={() => void load(format)} className={GHOST_TALL}>
                      Try again
                    </button>
                  )}
                </div>
              ) : card.status === "ready" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a generated image held in the browser; Next's optimizer can't read blob URLs
                <img src={card.url} alt={`${format === "story" ? "Story" : "Square"} card for ${collectionName}`} className={`${aspect} max-h-[50dvh] rounded-xl border border-line`} />
              ) : (
                <div role="status" aria-label="Making your card" className={`${aspect} h-[50dvh] max-w-full animate-pulse rounded-xl bg-well`} />
              )}
            </div>
            {card.status === "ready" && (
              <div className="flex flex-col gap-2">
                {card.canShare && (
                  <button type="button" onClick={() => void share(card.file)} className={`${LIME} w-full`}>
                    Share image
                  </button>
                )}
                <a href={card.url} download={card.file.name} className={card.canShare ? `${GHOST_TALL} w-full` : `${LIME} inline-flex w-full items-center justify-center`}>
                  Save image
                </a>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void copy(cardCaption(collectionName, link), "Caption copied.")} className={GHOST_TALL}>
                    Copy caption
                  </button>
                  <button type="button" onClick={() => void copy(link, "Link copied.")} className={GHOST_TALL}>
                    Copy link
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
