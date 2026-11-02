import { CARD } from "@/components/Kit";
import { SkBlock, SkeletonFrame, SkLine } from "@/components/Skeleton";

/** A field: its label over the box. */
function Field() {
  return (
    <div className="flex flex-col gap-2">
      <SkLine className="w-24" />
      <SkBlock className="h-11 rounded-xl" />
    </div>
  );
}

/**
 * A settings page while it loads, inside the settings layout (its rail stays put): the page title (PageTitle) and two
 * cards shaped like Section, an icon box and title over a couple of fields.
 */
export default function Loading() {
  return (
    <SkeletonFrame className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-1.5 pb-1">
        <SkLine className="w-14" />
        <SkBlock className="h-[22px] w-40 rounded-[8px]" />
        <SkLine className="w-72 max-w-full" />
      </div>
      {[2, 1].map((fields, i) => (
        <div key={i} className={`${CARD} p-4 sm:p-5`}>
          <div className="flex items-start gap-2.5">
            <SkBlock className="size-8 shrink-0 rounded-[10px]" />
            <div className="flex flex-1 flex-col gap-1.5 pt-1">
              <SkLine className="w-32" />
              <SkLine className="w-56 max-w-full" />
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-4 sm:mt-5">
            {Array.from({ length: fields }, (_, j) => (
              <Field key={j} />
            ))}
          </div>
        </div>
      ))}
    </SkeletonFrame>
  );
}
