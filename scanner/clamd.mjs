import net from "node:net";

/**
 * Talks to clamd (ClamAV's daemon) over TCP with the INSTREAM command: the file is sent in length-prefixed chunks and
 * never written to disk here. Returns { clean: true } or { clean: false, signature }.
 * Protocol: "zINSTREAM\0", then for each chunk a 4-byte big-endian length and the bytes, then four zero bytes;
 * clamd answers "stream: OK\0" or "stream: <Signature> FOUND\0".
 */
export async function scanStream(chunks, { host = "127.0.0.1", port = 3310, timeoutMs = 120_000 } = {}) {
  const socket = net.connect({ host, port });
  socket.setTimeout(timeoutMs);
  const reply = new Promise((resolve, reject) => {
    let out = "";
    socket.on("data", (d) => (out += d.toString("utf8")));
    socket.on("end", () => resolve(out));
    socket.on("timeout", () => reject(new Error("clamd timed out")));
    socket.on("error", reject);
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", reject);
  });
  const write = (buf) => new Promise((resolve, reject) => (socket.write(buf, (e) => (e ? reject(e) : resolve()))));
  await write(Buffer.from("zINSTREAM\0"));
  for await (const chunk of chunks) {
    // clamd's StreamMaxLength is checked per stream; chunks are capped well below its per-chunk limit.
    for (let i = 0; i < chunk.length; i += 1 << 20) {
      const part = Buffer.from(chunk.subarray(i, i + (1 << 20)));
      const len = Buffer.alloc(4);
      len.writeUInt32BE(part.length);
      await write(Buffer.concat([len, part]));
    }
  }
  await write(Buffer.alloc(4));
  socket.end();
  const text = String(await reply).replace(/\0/g, "").trim();
  if (/^stream: OK$/.test(text)) return { clean: true };
  const found = text.match(/^stream: (.+) FOUND$/);
  if (found) return { clean: false, signature: found[1] };
  throw new Error(`clamd: ${text || "no answer"}`);
}
