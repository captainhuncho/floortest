"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { TOUR_FINISH, TOUR_STEPS } from "@/lib/tour";
import { markTourSeen } from "./actions/desk";
import { GHOST_TALL, LIME } from "./kitButtons";

/**
 * The FloorTest tour (owner, 6 Nov): step cards in the one pop-up shell (a sheet on phones, a box from 640px), each with
 * a picture of the real screen and two lines, ending on Share your link. It opens by itself once, on the Floor, for
 * someone who hasn't seen it (users.tour_seen_at); closing it at any step counts as seen. How FloorTest works replays it.
 */
function TourDialog({ open, onClose, tip, finishHref }: { open: boolean; onClose: () => void; tip: string | null; finishHref?: string }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const total = TOUR_STEPS.length + 1;
  const step = TOUR_STEPS[i];
  const last = i === TOUR_STEPS.length;
  const close = () => {
    onClose();
    setI(0);
  };
  const finish = () => {
    close();
    if (finishHref) router.push(finishHref);
  };
  return (
    <Dialog
      open={open}
      onClose={close}
      closeLabel="Close the tour"
      title={last ? TOUR_FINISH.title : step.title}
      description={<span aria-live="polite">{`Step ${i + 1} of ${total}`}</span>}
      actions={
        <>
          {i === 0 ? (
            <button type="button" onClick={close} className={GHOST_TALL}>
              Skip the tour
            </button>
          ) : (
            <button type="button" onClick={() => setI(i - 1)} className={GHOST_TALL}>
              Back
            </button>
          )}
          {last ? (
            <button type="button" onClick={finish} className={LIME}>
              Share your link
            </button>
          ) : (
            <button type="button" onClick={() => setI(i + 1)} className={LIME}>
              Next
            </button>
          )}
        </>
      }
    >
      {last ? (
        <div className="space-y-3">
          <p>{TOUR_FINISH.line}</p>
          {tip && (
            <p className="rounded-[12px] border border-line bg-well p-3 text-mute">
              <span className="font-semibold text-bone">For you: </span>
              {tip}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Keyed to the step: a fresh picture each step, so the last one never lingers while the next loads. */}
          <Image
            key={step.id}
            src={step.image}
            alt={step.alt}
            width={800}
            height={500}
            sizes="(min-width: 640px) 30rem, 100vw"
            priority={i === 0}
            className="aspect-[8/5] h-auto w-full rounded-[12px] border border-line bg-well object-cover object-top"
          />
          <p>{step.lines[0]}</p>
          <p className="text-mute">{step.lines[1]}</p>
        </div>
      )}
      <ol aria-hidden className="mt-4 flex justify-center gap-1.5">
        {Array.from({ length: total }, (_, n) => (
          <li key={n} className={`h-1.5 rounded-full transition-[width] motion-reduce:transition-none ${n === i ? "w-4 bg-lime" : "w-1.5 bg-line-2"}`} />
        ))}
      </ol>
    </Dialog>
  );
}

/** Opens by itself on the first visit to the Floor; closing it at any step marks it seen for this person. */
export function FirstVisitTour({ tip }: { tip: string | null }) {
  const [open, setOpen] = useState(true);
  return (
    <TourDialog
      open={open}
      tip={tip}
      onClose={() => {
        setOpen(false);
        void markTourSeen();
      }}
    />
  );
}

/** How FloorTest works: the same tour, any time. Finishing it goes to the Floor, where the link is. */
export function ReplayTour({ tip }: { tip: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={LIME}>
        Take the tour
      </button>
      <TourDialog open={open} tip={tip} finishHref="/dashboard/floor" onClose={() => setOpen(false)} />
    </>
  );
}
