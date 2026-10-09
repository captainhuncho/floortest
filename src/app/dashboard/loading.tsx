import { Crest } from "@/components/Crest";

/** Shown while a dashboard page's data loads: the crest spins like a record cueing up. */
export default function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4 py-6" role="status" aria-busy="true" aria-label="Loading">
      <Crest className="crest-loading size-12 opacity-80" />
    </div>
  );
}
