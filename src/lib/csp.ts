/**
 * The Content-Security-Policy (audit 27 Oct). Pages get a fresh nonce on every request from `src/proxy.ts`: only scripts
 * carrying it run (Next's own scripts and bundles get it automatically), and with 'strict-dynamic' the scripts they
 * load (Turnstile, the consent-gated Analytics and Sentry) are trusted in turn. No 'unsafe-inline' for scripts, so an
 * injected inline script never runs. Plain module: the proxy, next.config.ts and tests all import it.
 *
 * Every other directive is unchanged from the policy live before 27 Oct. style-src keeps 'unsafe-inline' (React style
 * attributes); frame-ancestors 'none' is the owner's no-clickjacking rule (23 Oct).
 */
const TURNSTILE = "https://challenges.cloudflare.com";

/** Audio, covers and uploads go straight to the storage bucket via signed URLs. */
function storageSources(endpoint = process.env.S3_ENDPOINT) {
  if (!endpoint) return "";
  try {
    const host = new URL(endpoint).host;
    return `https://*.${host} https://${host}`;
  } catch {
    return "";
  }
}

/**
 * `nonce`: the request's nonce (pages). Without one (static files, which the proxy skips), scripts may come only from
 * our own origin and Turnstile, still never inline. `dev`: React needs eval in development for its error overlays.
 */
export function contentSecurityPolicy({ nonce, dev = false, endpoint }: { nonce?: string; dev?: boolean; endpoint?: string } = {}) {
  const store = storageSources(endpoint);
  const script = nonce ? `'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE}` : `'self' ${TURNSTILE}`;
  return [
    "default-src 'self'",
    `script-src ${script}${dev ? " 'unsafe-eval'" : ""}`,
    `frame-src ${TURNSTILE}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${store}`,
    `media-src 'self' blob: ${store}`,
    `connect-src 'self' ${store} ${TURNSTILE}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 128 random bits, base64: unguessable and new for every request. Web Crypto works in the proxy and in Node. */
export function makeNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The paths the proxy skips (keep in step with `config.matcher` in src/proxy.ts, which has to be a literal; the test
 * `tests/csp.test.ts` checks the two agree). next.config.ts gives these the nonce-free policy above.
 */
export const PROXY_SKIPS = "(?:_next/|favicon|icons/|fonts/|images/|api/storage/upload|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml|woff2?)$)";
