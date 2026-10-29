import "server-only";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { dataDir } from "./db";
import { env } from "./env";

/**
 * File storage for audio and cover images.
 *   - "s3": any S3-compatible bucket (Cloudflare R2, Supabase Storage, AWS S3, MinIO). Browsers upload
 *     and play directly against the bucket with short-lived signed URLs.
 *   - "local": a folder under DATA_DIR, with uploads going through a signed app route. For development
 *     and single-server installs.
 */
export interface Storage {
  driver: "local" | "s3";
  /** Where the browser should PUT the file. */
  uploadTarget(key: string, contentType: string, size: number): Promise<{ url: string; headers: Record<string, string> }>;
  /** The file's size, or null when it isn't there. Any other failure (keys, bucket, network) throws. */
  head(key: string): Promise<{ size: number } | null>;
  /** Bytes [start, end] inclusive. */
  read(key: string, start: number, end: number): Promise<Uint8Array>;
  stream(key: string, range?: { start: number; end: number }): Promise<{ body: ReadableStream<Uint8Array>; size: number }>;
  /** A short-lived URL the browser can fetch directly, or null when the app must stream the file itself. */
  signedGetUrl(key: string, opts?: { filename?: string; contentType?: string; expiresIn?: number }): Promise<string | null>;
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** Server-side copy within the bucket; with `contentType`, the copy's Content-Type is set to it, not copied. */
  copy(from: string, to: string, contentType?: string): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * How long an upload link can be used to start an upload. Short, so a link can't be reused to change a file later;
 * a long upload still finishes, because only the start of the request has to fall inside it.
 */
export const UPLOAD_LINK_SECONDS = 15 * 60;

/**
 * Moves an upload out of reach of its upload link: copies it to a new random key (in the same folder) that no link
 * points at. The caller discards the original (discardFiles), so a failed delete is retried rather than lost.
 * Check the file *after* sealing, so what was checked is what's kept.
 *
 * The sealed copy's Content-Type is set here, from the extension, never kept from the upload: a presigned upload link
 * doesn't bind Content-Type, so the sender could have stored any type with the original.
 */
const SEALED_TYPES: Record<string, string> = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
export async function sealUpload(store: Storage, key: string) {
  const slash = key.lastIndexOf("/");
  const ext = key.slice(key.lastIndexOf(".")).toLowerCase();
  const sealed = `${key.slice(0, slash + 1)}${crypto.randomUUID()}${/^\.[a-z0-9]{1,5}$/.test(ext) ? ext : ""}`;
  await store.copy(key, sealed, SEALED_TYPES[ext] ?? "application/octet-stream");
  return sealed;
}

/* ───────────── Local ───────────── */

const localRoot = () => path.join(dataDir(), "storage");
/** Where a key lives on disk in local storage (for the local recovery copy, src/lib/vault.ts). */
export const localStoragePath = (key: string) => localPath(key);
function localPath(key: string) {
  const p = path.resolve(localRoot(), key);
  if (!p.startsWith(localRoot() + path.sep)) throw new Error("Invalid storage key");
  return p;
}

/** HMAC-signed token authorising one local upload of at most `size` bytes to `key`. */
export function signUploadToken(key: string, size: number, ttlMs = UPLOAD_LINK_SECONDS * 1000) {
  const body = Buffer.from(JSON.stringify({ key, size, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = crypto.createHmac("sha256", env.secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUploadToken(token: string): { key: string; size: number } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", env.secret).update(body).digest("base64url");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as { key: string; size: number; exp: number };
    return data.exp > Date.now() ? { key: data.key, size: data.size } : null;
  } catch {
    return null;
  }
}

const local: Storage = {
  driver: "local",
  async uploadTarget(key, contentType, size) {
    return { url: `/api/storage/upload?token=${encodeURIComponent(signUploadToken(key, size))}`, headers: { "Content-Type": contentType } };
  },
  async head(key) {
    try {
      return { size: (await fs.promises.stat(localPath(key))).size };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  },
  async read(key, start, end) {
    const fh = await fs.promises.open(localPath(key), "r");
    try {
      const buf = Buffer.alloc(end - start + 1);
      const { bytesRead } = await fh.read(buf, 0, buf.length, start);
      return new Uint8Array(buf.subarray(0, bytesRead));
    } finally {
      await fh.close();
    }
  },
  async stream(key, range) {
    const p = localPath(key);
    const size = (await fs.promises.stat(p)).size;
    const node = fs.createReadStream(p, range ? { start: range.start, end: range.end } : undefined);
    return { body: Readable.toWeb(node) as ReadableStream<Uint8Array>, size };
  },
  async signedGetUrl() {
    return null;
  },
  async put(key, data) {
    const p = localPath(key);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, data);
  },
  async copy(from, to) {
    const p = localPath(to);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.copyFile(localPath(from), p);
  },
  async delete(key) {
    await fs.promises.rm(localPath(key), { force: true });
  },
};

/** Writes a request body to local storage, enforcing the signed size limit. Used by /api/storage/upload. */
export async function writeLocalUpload(key: string, body: ReadableStream<Uint8Array>, maxSize: number) {
  const p = localPath(key);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  const out = fs.createWriteStream(p);
  let written = 0;
  try {
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      written += chunk.byteLength;
      if (written > maxSize) throw new Error("too large");
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    }
    await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
    return written;
  } catch (e) {
    out.destroy();
    await fs.promises.rm(p, { force: true });
    throw e;
  }
}

/* ───────────── S3-compatible ───────────── */

/**
 * Timeouts for every call to the bucket (plan B7 item 3, 24 Oct). Without them a hung connection to R2 holds a request
 * until the platform kills it. There's deliberately no limit on a whole request: a 250 MB stream or a stems ZIP takes
 * as long as it takes while data keeps moving. Only a connection that can't be made in 5 s, or one where nothing moves
 * for 30 s, is given up (the SDK then retries it, up to 3 tries in all).
 */
export const R2_HTTP = { connectionTimeout: 5_000, socketTimeout: 30_000 } as const;

let s3Impl: Storage | undefined;
let s3Client: import("@aws-sdk/client-s3").S3Client | undefined;

async function s3(): Promise<Storage> {
  if (s3Impl) return s3Impl;
  const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const c = env.storage.s3;
  const client = new S3Client({
    region: c.region,
    endpoint: c.endpoint,
    forcePathStyle: c.forcePathStyle,
    credentials: c.accessKeyId && c.secretAccessKey ? { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey } : undefined,
    // Otherwise the SDK signs a CRC32 of an empty body into presigned PUTs, which R2 rejects
    // for the real file (and browsers see it as a CORS failure).
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    requestHandler: R2_HTTP,
  });
  s3Client = client;
  const Bucket = c.bucket!;
  const asciiName = (s: string) => s.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");

  s3Impl = {
    driver: "s3",
    async uploadTarget(key, contentType, size) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: size }), {
        expiresIn: UPLOAD_LINK_SECONDS,
      });
      return { url, headers: { "Content-Type": contentType } };
    },
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: Number(r.ContentLength ?? 0) };
      } catch (e) {
        // Only "not found" means missing. Wrong keys, a wrong bucket or a network failure throw, so they show up as
        // errors (and in /api/health) instead of looking like a missing file (Codex review, 19 Oct).
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw new Error(`Storage error: ${(e as Error).name || "error"}`);
      }
    },
    async read(key, start, end) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: `bytes=${start}-${end}` }));
      return (await r.Body?.transformToByteArray()) ?? new Uint8Array();
    },
    async stream(key, range) {
      const r = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: range ? `bytes=${range.start}-${range.end}` : undefined }));
      const total = r.ContentRange ? Number(r.ContentRange.split("/")[1]) : Number(r.ContentLength ?? 0);
      return { body: r.Body!.transformToWebStream() as ReadableStream<Uint8Array>, size: total };
    },
    async signedGetUrl(key, opts) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket,
          Key: key,
          ResponseContentType: opts?.contentType,
          ResponseContentDisposition: opts?.filename
            ? `attachment; filename="${asciiName(opts.filename)}"; filename*=UTF-8''${encodeURIComponent(opts.filename)}`
            : undefined,
        }),
        { expiresIn: opts?.expiresIn ?? 3600 },
      );
    },
    async put(key, data, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: data, ContentType: contentType }));
    },
    async copy(from, to, contentType) {
      const CopySource = `${Bucket}/${from.split("/").map(encodeURIComponent).join("/")}`;
      await client.send(new CopyObjectCommand({ Bucket, Key: to, CopySource, ...(contentType ? { MetadataDirective: "REPLACE", ContentType: contentType } : {}) }));
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
  return s3Impl;
}

export async function storage(): Promise<Storage> {
  return env.storage.driver === "s3" ? s3() : local;
}

/**
 * Size of `key` in another bucket on the same storage account (null if it isn't there). For the storage move check in
 * ops: confirms files arrived in the new bucket before the app is switched to it. Local storage has one folder, so the
 * bucket name is ignored there.
 */
export async function headIn(bucket: string, key: string): Promise<{ size: number } | null> {
  if (env.storage.driver !== "s3") return local.head(key);
  await s3();
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const r = await s3Client!.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: Number(r.ContentLength ?? 0) };
  } catch (e) {
    // Only "not found" means missing; anything else (no access, wrong bucket, network) must not read as missing.
    if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw new Error(`Couldn't read ${bucket}: ${(e as Error).name || "error"}`);
  }
}
