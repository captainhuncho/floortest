import { Icon, type IconName } from "@/components/Kit";

/** The history page's outer box: light or dark with the visitor's device, one ~600px column (its loading skeleton copies it). */
export const SENT_MAIN =
  "theme-system mx-auto flex min-h-dvh w-full max-w-[600px] flex-col bg-ink pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(0.875rem,env(safe-area-inset-left))] pr-[max(0.875rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-5 sm:pb-10 sm:pt-8";

/** The quiet button on the sender-link screens (Use a different email, End this link now): an outline, no fill. */
export const QUIET = "inline-flex min-h-11 items-center justify-center rounded-full border border-line px-[18px] text-[14px] font-semibold text-bone hover:bg-well";

/** The round disc that heads a short screen (link on its way, link expired, nothing sent yet). `dim` quiets the icon. */
export function Disc({ icon, dim = false, small = false }: { icon: IconName; dim?: boolean; small?: boolean }) {
  return (
    <span aria-hidden className={`flex size-16 shrink-0 items-center justify-center rounded-full border border-line bg-card ${dim ? "text-dim" : "text-bone"}`}>
      <Icon name={icon} className={small ? "size-[22px]" : "size-7"} />
    </span>
  );
}
