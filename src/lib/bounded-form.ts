import "server-only";

/**
 * Reads a multipart form, but stops as soon as the body passes `max` bytes. The content-length header is only a
 * quick first check: a client can leave it out or understate it, and req.formData() would buffer the whole body
 * before anyone looks at the file's size. Returns "too-large" past the limit, and null for a body that isn't a form.
 */
export async function readFormUpTo(req: Request, max: number): Promise<FormData | "too-large" | null> {
  if (Number(req.headers.get("content-length") || 0) > max) return "too-large";
  if (!req.body) return null;
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (let r = await reader.read(); !r.done; r = await reader.read()) {
      total += r.value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return "too-large";
      }
      parts.push(r.value);
    }
  } catch {
    return null;
  }
  const body = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    body.set(p, at);
    at += p.byteLength;
  }
  return new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData().catch(() => null);
}
