// The redesign's buttons and field labels as class strings, for the smaller pieces inside pages (forms, dialogs,
// rows). Same look as the List view's batch bar: quiet 36px buttons that grow to 44px on touch screens.

/** The quiet button: a well-coloured box with a hairline edge. */
export const GHOST =
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-line bg-well px-3 text-[12px] font-semibold text-bone transition hover:border-line-2 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11";

/** The quiet button when it sits inside a well (a field or inner box): a card-coloured box so it still stands out. */
export const GHOST_ON_WELL = GHOST.replace("bg-well", "bg-card");

/** The quiet button at full 44px everywhere, for a form's own buttons beside a 44px lime one. */
export const GHOST_TALL = GHOST.replace("min-h-9", "min-h-11");

/** The main action: lime, 44px, the kit's 13px corners. */
export const LIME = "btn-lime min-h-11 rounded-[13px] px-4! text-[13px]! font-semibold";

/** A lime action inside a tight row (approve, switch): the quiet button's size, 44px on touch screens. */
export const LIME_SM = "btn-lime min-h-9 rounded-[10px] px-3! text-[12px]! font-semibold pointer-coarse:min-h-11";

/** A destructive action: red text on a faint red box. */
export const DANGER =
  "inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-danger/40 bg-danger/10 px-3 text-[12px] font-semibold text-danger transition hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11";

/** A field's title: small, mute, sentence case. */
export const FIELD_LABEL = "block text-[11.5px] text-mute";
