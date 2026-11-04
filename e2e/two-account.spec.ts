import { expect, logIn, test } from "./fixtures";

/**
 * Two accounts, real ids (Safety's two-account list, 4 Nov; isolation.spec.ts holds the first ones): Sam (stranger@)
 * signed in, Maxwell's (demo@) actual ids. Each answer is the same as for an id that doesn't exist, and nothing of
 * Maxwell's changes.
 */
test.describe.configure({ mode: "serial" });

const appLogin = async (request: import("@playwright/test").APIRequestContext, email: string) => {
  const r = await request.post("/api/v1/auth/login", { data: { email, password: "floortest-demo", humanToken: "XXXX.DUMMY.TOKEN.XXXX" } });
  expect(r.status()).toBe(200);
  return { Authorization: `Bearer ${(await r.json()).accessToken}` };
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");

test("export, collection artwork, owner uploads and stems: another desk's ids answer as missing ones", async ({ page, request }) => {
  const max = await appLogin(request, "demo@floortest.test");
  const track = (await (await request.get("/api/v1/queue", { headers: max })).json()).tracks[0] as { id: number };
  const collection = (await (await request.get("/api/v1/collections", { headers: max })).json()).collections[0] as { id: number };
  expect(track?.id).toBeTruthy();
  expect(collection?.id).toBeTruthy();
  const before = await (await request.get(`/api/v1/collections/${collection.id}`, { headers: max })).text();

  await logIn(page, "stranger@floortest.test");
  const r = page.request;
  const same = async (what: string, theirs: Promise<import("@playwright/test").APIResponse>, none: Promise<import("@playwright/test").APIResponse>) => {
    const [a, b] = await Promise.all([theirs, none]);
    expect(a.status(), what).toBe(b.status());
    expect(await a.text(), what).toBe(await b.text());
    expect([200, 201, 302], what).not.toContain(a.status());
  };

  // A crate of Maxwell's track: none of it can be downloaded, as with an id nobody has.
  await same("export", r.get(`/api/export?ids=${track.id}`, { maxRedirects: 0 }), r.get("/api/export?ids=999999", { maxRedirects: 0 }));
  // Artwork on Maxwell's collection: neither set nor removed.
  const image = { file: { name: "a.png", mimeType: "image/png", buffer: PNG } };
  await same("art set", r.post(`/api/collection-art/${collection.id}`, { multipart: image }), r.post("/api/collection-art/999999", { multipart: image }));
  await same("art remove", r.delete(`/api/collection-art/${collection.id}`), r.delete("/api/collection-art/999999"));
  // An upload into Maxwell's collection: refused at the start and at completion.
  const start = { fileName: "x.wav", size: 1000, title: "T", artist: "A", genre: "House" };
  await same("upload start", r.post(`/api/collections/${collection.id}/upload`, { data: start }), r.post("/api/collections/999999/upload", { data: start }));
  await same("upload complete", r.post(`/api/collections/${collection.id}/upload/complete`, { data: { uploadId: "x" } }), r.post("/api/collections/999999/upload/complete", { data: { uploadId: "x" } }));
  // A stem of Maxwell's track.
  await same("stem", r.get(`/api/tracks/${track.id}/stems/1`, { maxRedirects: 0 }), r.get("/api/tracks/999999/stems/1", { maxRedirects: 0 }));

  // Nothing of Maxwell's changed.
  expect(await (await request.get(`/api/v1/collections/${collection.id}`, { headers: max })).text()).toBe(before);
  const queue = (await (await request.get("/api/v1/queue", { headers: max })).json()).tracks as { id: number }[];
  expect(queue.some((t) => t.id === track.id)).toBe(true);
});
