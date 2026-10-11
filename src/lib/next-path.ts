/**
 * Where sign-in may land afterwards (the `floortest_next` cookie): only a collection shared with your account
 * (`/c/a.<id>`) or a team invite (`/join/<invite>`). Anything else is ignored, so the cookie can't send people elsewhere.
 */
export const NEXT_COOKIE = "floortest_next";
/** A team invite being accepted through sign-up (password or Google): its secret, for an hour. */
export const TEAM_INVITE_COOKIE = "ft_team_invite";
export const safeNext = (next: string) => /^\/c\/a\.\d{1,12}$/.test(next) || /^\/join\/[A-Za-z0-9_-]{20,64}$/.test(next);
