/**
 * A request body as text, or null when it's over `max` bytes. A Content-Length over the limit is refused before
 * anything is read, and a body without one (or one that lies) stops being read once it passes the limit, so an
 * open endpoint never holds more than `max` in memory for one request.
 */
export async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
