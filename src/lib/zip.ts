import zlib from "node:zlib";

export type Entry = { name: string; open: () => Promise<ReadableStream<Uint8Array>>; onSent?: () => Promise<void> | void };

const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};

/**
 * Streaming, store-only (uncompressed) ZIP. Each entry uses a data descriptor, so its CRC and
 * size are computed as bytes flow and memory use stays flat whatever the file sizes.
 * Audio doesn't compress anyway. Limited to 4 GB total (no ZIP64).
 */
export function zipStream(entries: Entry[]): ReadableStream<Uint8Array> {
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const FLAGS = 0x0008 | 0x0800; // data descriptor + UTF-8 names

  async function* chunks(): AsyncGenerator<Uint8Array> {
    const central: Buffer[] = [];
    let offset = 0;
    for (const e of entries) {
      const name = Buffer.from(e.name, "utf8");
      const localOffset = offset;
      const header = Buffer.concat([u32(0x04034b50), u16(20), u16(FLAGS), u16(0), u16(time), u16(date), u32(0), u32(0), u32(0), u16(name.length), u16(0), name]);
      offset += header.length;
      yield new Uint8Array(header);
      let crc = 0;
      let size = 0;
      for await (const value of (await e.open()) as unknown as AsyncIterable<Uint8Array>) {
        crc = zlib.crc32(value, crc);
        size += value.byteLength;
        offset += value.byteLength;
        yield value;
      }
      if (offset > 0xfffffff0) throw new Error("Crate too large for a single ZIP");
      const descriptor = Buffer.concat([u32(0x08074b50), u32(crc), u32(size), u32(size)]);
      offset += descriptor.length;
      yield new Uint8Array(descriptor);
      central.push(
        Buffer.concat([
          u32(0x02014b50), u16(20), u16(20), u16(FLAGS), u16(0), u16(time), u16(date),
          u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(localOffset), name,
        ]),
      );
      // Resumed only when the consumer asks for more, i.e. after this file's bytes have gone out.
      await e.onSent?.();
    }
    const cd = Buffer.concat(central);
    yield new Uint8Array(Buffer.concat([cd, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cd.length), u32(offset), u16(0)]));
  }

  // Pull-based, so storage is read only as fast as the receiver downloads.
  const it = chunks();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel() {
      await it.return(undefined);
    },
  });
}

