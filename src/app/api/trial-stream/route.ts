import { storage } from "@/lib/storage";
import { q } from "@/lib/db";
import { zipStream } from "@/lib/zip";

// TEMPORARY, Cloudflare trial only: find which layer buffers large downloads. Protected by CRON_SECRET.
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("no", { status: 401 });
  const t = await q.get<{ file_key: string }>("SELECT file_key FROM tracks WHERE file_key IS NOT NULL AND deleted_at IS NULL ORDER BY id DESC LIMIT 1");
  const { body } = await (await storage()).stream(t!.file_key);
  if (url.searchParams.get("mode") === "zip") return new Response(zipStream([{ name: "a.wav", open: async () => body }]));
  if (url.searchParams.get("mode") === "pipe") {
    // Read every chunk and drop it: does reading alone stay small?
    let n = 0;
    for await (const c of body as unknown as AsyncIterable<Uint8Array>) n += c.byteLength;
    return new Response(`read ${n} bytes`);
  }
  return new Response(body);
}
