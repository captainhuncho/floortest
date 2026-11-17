import { CARD } from "@/components/Kit";
import { PAGE } from "./ReceiptParts";

/**
 * Shown while the receipt loads, in the receipt's own shape: the icon circle, the headline and its line, a card, the
 * steps. Fades in only after 150ms (.skeleton-in), so a quick load shows nothing. The pulse stops for reduced motion.
 */
export default function Loading() {
  return (
    <main className={PAGE} role="status" aria-busy="true" aria-label="Loading">
      <div className="skeleton-in flex animate-pulse flex-col gap-3 motion-reduce:animate-none">
        <div className="flex flex-col items-center gap-3 px-2 pb-2 pt-9 sm:pt-6">
          <div className="size-16 rounded-full bg-well" />
          <div className="mt-1 h-7 w-56 max-w-full rounded-[9px] bg-well" />
          <div className="h-3 w-40 rounded-full bg-well" />
        </div>
        <div className={`${CARD} flex items-center gap-3 p-3`}>
          <div className="size-11 shrink-0 rounded-[12px] bg-well" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-1/2 rounded-full bg-well" />
            <div className="h-3 w-3/4 rounded-full bg-well" />
          </div>
        </div>
        <div className={`${CARD} flex flex-col gap-4 p-3.5`}>
          <div className="h-2.5 w-28 rounded-full bg-well" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="size-3 shrink-0 rounded-full bg-well" />
              <div className={`h-3 rounded-full bg-well ${i % 2 ? "w-24" : "w-40"}`} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
