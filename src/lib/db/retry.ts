/**
 * One retry when the database couldn't be reached at all (owner, 3 Nov, after incidents #38 and #39: a Neon proxy
 * refused a connection, then a connect timed out; both visitors got an error page).
 *
 * Only errors that happen before a query is sent count: postgres.js rejects the query that opened the connection
 * with them, before writing it. A reset or closed connection (ECONNRESET, CONNECTION_CLOSED) can come mid-query, after
 * a write may have run, so those are never retried. Nor is anything the server answered (a constraint, a timeout).
 */

/** Socket codes for a connection that never opened. */
const CONNECT_CODES = new Set(["CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);
/** Neon's proxy refusing a connection during startup, before any query. */
const NEON_STARTUP = /Control plane request failed|Couldn't connect to compute node/i;

export function isConnectError(e: unknown) {
  if (!e || typeof e !== "object") return false;
  const { code, errno, message } = e as { code?: unknown; errno?: unknown; message?: unknown };
  return CONNECT_CODES.has(String(code)) || CONNECT_CODES.has(String(errno)) || NEON_STARTUP.test(String(message ?? ""));
}

/** 250–500 ms: long enough for a proxy blip to pass, short enough that the page still answers. */
const pause = () => new Promise<void>((done) => setTimeout(done, 250 + Math.random() * 250));

/**
 * `work`, and once more after a short pause if it failed to connect. `mayRetry` lets a caller refuse the retry
 * (a transaction whose body already started). A recovered blip is logged, so we still see how often it happens; a
 * second failure is thrown and becomes the incident.
 */
export async function withConnectRetry<T>(work: () => Promise<T>, mayRetry: () => boolean = () => true, wait = pause): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (!isConnectError(e) || !mayRetry()) throw e;
    const code = String((e as { code?: unknown }).code ?? "neon_startup");
    await wait();
    const result = await work();
    console.warn(`[db] couldn't connect (${code}); retried once and recovered`);
    return result;
  }
}
