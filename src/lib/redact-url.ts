/**
 * Private links carry their key in the path: whoever has /receipt/<token> sees that receipt, /reset/<token> sets a
 * password. Monitoring (Sentry, Vercel Analytics, the incident log) only needs the page, not the key, so every URL or
 * path sent there goes through this first. Signed storage links lose their query (the signature) the same way.
 * No server imports: the browser uses it too.
 */
const TOKEN_PATH =
  /\/(receipt|reset|verify-email|confirm-email|c|join|sent|unsubscribe|newsletter\/confirm|newsletter\/unsubscribe|api\/c|api\/stems|api\/unsubscribe|api\/offline\/file|api\/pulse\/receipt|api\/track-art)\/(?!\[token\])[^/?#\s"')]+/g;
const SIGNED_QUERY = /\?[^#\s"')]*X-Amz-[^#\s"')]*/gi;

export function redactUrl(s: string): string;
export function redactUrl(s: string | undefined): string | undefined;
export function redactUrl(s: string | undefined) {
  return s?.replace(TOKEN_PATH, "/$1/[token]").replace(SIGNED_QUERY, "?[signed]");
}
