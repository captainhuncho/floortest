/**
 * Where sign-in may land afterwards (the `floortest_next` cookie): only a collection shared with your account
 * (`/c/a.<id>`). Anything else is ignored, so the cookie can't send people elsewhere.
 */
export const NEXT_COOKIE = "floortest_next";
export const safeNext = (next: string) => /^\/c\/a\.\d{1,12}$/.test(next);
