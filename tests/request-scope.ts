// Runs a server action as if inside a request, without module mocks: Next's own request stores, filled with a cookie jar
// and headers the test controls. `after()` finds no after-context here, so afterResponse runs its task straight away.
import Module from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";

// Next's server puts AsyncLocalStorage on the global object before any of its request stores load; do the same.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;

// Next's bundler gives server code the server build of next/navigation (redirect, notFound); plain Node would load the
// client build, which needs React's client half. Point it at the server build, as the bundler does.
type Resolve = (request: string, ...rest: unknown[]) => string;
const mod = Module as unknown as { _resolveFilename: Resolve };
const resolve = mod._resolveFilename;
mod._resolveFilename = (request, ...rest) =>
  resolve(request === "next/navigation" ? "next/dist/client/components/navigation.react-server" : request, ...rest);

export type Jar = Map<string, string>;

function cookieStore(jar: Jar) {
  const entry = (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined);
  return {
    get: (name: string | { name: string }) => entry(typeof name === "string" ? name : name.name),
    getAll: () => [...jar.keys()].map((n) => entry(n)!),
    has: (name: string) => jar.has(name),
    set: (name: string | { name: string; value: string }, value?: string) => {
      if (typeof name === "string") jar.set(name, String(value ?? ""));
      else jar.set(name.name, name.value);
    },
    delete: (name: string) => jar.delete(name),
    get size() {
      return jar.size;
    },
  };
}

/** What an action ended with: its answer, or the page it redirected to. */
export type Outcome = { answer?: unknown; redirect?: string };

export async function inRequest(jar: Jar, ip: string, action: () => Promise<unknown>): Promise<Outcome> {
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  const { workUnitAsyncStorage } = await import("next/dist/server/app-render/work-unit-async-storage.external");
  const cookies = cookieStore(jar);
  const headers = new Headers({ "x-forwarded-for": ip, "user-agent": "test" });
  const workStore = { route: "/test", forceStatic: false, dynamicShouldError: false, isStaticGeneration: false } as never;
  const requestStore = { type: "request", phase: "action", cookies, mutableCookies: cookies, userspaceMutableCookies: cookies, headers, url: { pathname: "/test", search: "" } } as never;
  try {
    const answer = await workAsyncStorage.run(workStore, () => workUnitAsyncStorage.run(requestStore, action));
    return { answer };
  } catch (e) {
    const digest = (e as { digest?: string }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return { redirect: digest.split(";")[2] };
    throw e;
  }
}

export function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
