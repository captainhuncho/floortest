import assert from "node:assert/strict";
import { test } from "node:test";
import { coverData } from "../src/lib/native-now-playing";

const fakeFetch = (body: Uint8Array, type: string, status = 200) =>
  (async () => new Response(body as unknown as BodyInit, { status, headers: { "content-type": type } })) as unknown as typeof fetch;

test("a cover is handed to the iPhone app as image data", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const data = await coverData("/api/track-art/1?v=a&size=thumb", fakeFetch(png, "image/png"));
  assert.equal(data, `data:image/png;base64,${Buffer.from(png).toString("base64")}`);
});

test("a cover that isn't an image, is missing or is too big is not sent", async () => {
  assert.equal(await coverData("/x", fakeFetch(new Uint8Array([1]), "text/html")), null);
  assert.equal(await coverData("/x", fakeFetch(new Uint8Array([1]), "image/png", 404)), null);
  assert.equal(await coverData("/x", fakeFetch(new Uint8Array(1024 * 1024 + 1), "image/jpeg")), null);
});
