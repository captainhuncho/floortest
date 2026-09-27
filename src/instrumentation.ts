/** Every unhandled server error lands in the admin incident feed as well as the logs. */
export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordIncident } = await import("./lib/incidents");
  const e = err as Error & { digest?: string };
  await recordIncident("server_error", e?.message || "Server error", `${e?.digest ? `digest ${e.digest}\n` : ""}${e?.stack ?? ""}`, `${request.method} ${request.path}`);
}
