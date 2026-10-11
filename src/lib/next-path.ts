/**
 * Where sign-in may land afterwards (the `floortest_next` cookie): only a colleague share page (`/share/<token>`) or a
 * collection shared with your account (`/c/a.<id>`). Anything else is ignored, so the cookie can't send people elsewhere.
 */
export const NEXT_COOKIE = "floortest_next";
export const safeNext = (next: string) => /^\/share\/[A-Za-z0-9_-]{10,40}$/.test(next) || /^\/c\/a\.\d{1,12}$/.test(next);
