import { test } from "node:test";
import assert from "node:assert/strict";
import { readFormUpTo } from "../src/lib/bounded-form";

/** A multipart form with one file, streamed in chunks, optionally with a content-length header that lies. */
async function upload(fileBytes: number, contentLength?: string) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(fileBytes).fill(7)], "a.png", { type: "image/png" }));
  const encoded = new Request("http://x/", { method: "POST", body: form });
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (sent >= bytes.length) return c.close();
      c.enqueue(bytes.slice(sent, sent + 64 * 1024));
      sent += 64 * 1024;
    },
  });
  const headers: Record<string, string> = { "content-type": encoded.headers.get("content-type")! };
  if (contentLength) headers["content-length"] = contentLength;
  return { req: new Request("http://x/", { method: "POST", body, headers, duplex: "half" } as RequestInit), read: () => sent };
}

test("a form under the limit is read as usual", async () => {
  const { req } = await upload(1000);
  const form = await readFormUpTo(req, 64 * 1024);
  assert.ok(form instanceof FormData);
  assert.equal((form.get("file") as File).size, 1000);
});

test("a body past the limit is refused while it streams in, whatever its content-length says", async () => {
  const lying = await upload(2 * 1024 * 1024, "100");
  assert.equal(await readFormUpTo(lying.req, 256 * 1024), "too-large");
  assert.ok(lying.read() < 1024 * 1024, "reading stopped soon after the limit");
  const none = await upload(2 * 1024 * 1024);
  assert.equal(await readFormUpTo(none.req, 256 * 1024), "too-large");
  const honest = await upload(2 * 1024 * 1024, String(3 * 1024 * 1024));
  assert.equal(await readFormUpTo(honest.req, 256 * 1024), "too-large");
});

test("a body that isn't a form reads as nothing", async () => {
  assert.equal(await readFormUpTo(new Request("http://x/", { method: "POST", body: "hello", headers: { "content-type": "text/plain" } }), 1024), null);
});
