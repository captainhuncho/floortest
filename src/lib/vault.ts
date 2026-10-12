import "server-only";
import fs from "node:fs";
import path from "node:path";
import { dataDir, now, q } from "./db";
import { env } from "./env";
import { localStoragePath, type Storage } from "./storage";
import { expectedFiles } from "./storage-audit";

/**
 * The recovery copy ("vault"): a second private bucket, with its own key, that holds the database backups and a copy of
 * every stored file. A bad delete or a leaked main key can't lose a sender's only copy. Off until BACKUP_BUCKET is set
 * (with BACKUP_ACCESS_KEY_ID / BACKUP_SECRET_ACCESS_KEY: write on the vault, read on the main bucket); locally it's a
 * folder next to the storage folder.
 *
 * Privacy: a file deleted from storage (account deletion, sender erasure, retention, a replaced cover) is deleted from
 * the vault too, through the same retry queue (vaultDeleter), so a "deleted" track doesn't live on in the copy.
 */
export type Vault = {
  bucket: string;
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
  /** Server-side copy of `key` from the main storage bucket into the vault (same key). */
  copyFromMain(key: string): Promise<void>;
};

let cached: Vault | null | undefined;

export async function vault(): Promise<Vault | null> {
  if (cached !== undefined) return cached;
  const c = env.storage.vault;
  if (!c.bucket) return (cached = null);
  if (env.storage.driver !== "s3") return (cached = localVault(c.bucket));
  const main = env.storage.s3;
  if (!c.accessKeyId || !c.secretAccessKey || !main.bucket) return (cached = null);
  const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, CopyObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: main.region,
    endpoint: main.endpoint,
    forcePathStyle: main.forcePathStyle,
    credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = c.bucket;
  return (cached = {
    bucket: Bucket,
    async put(key, data, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: data, ContentType: contentType }));
    },
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: Number(r.ContentLength ?? 0) };
      } catch (e) {
        if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
    async copyFromMain(key) {
      await client.send(new CopyObjectCommand({ Bucket, Key: key, CopySource: `${main.bucket}/${key.split("/").map(encodeURIComponent).join("/")}` }));
    },
  });
}

/** Local development: the vault is a folder beside the storage folder. */
function localVault(bucket: string): Vault {
  const root = path.join(dataDir(), "vault", bucket.replace(/[^a-z0-9-]/gi, "_"));
  const at = (key: string) => {
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return p;
  };
  return {
    bucket,
    async put(key, data) {
      await fs.promises.mkdir(path.dirname(at(key)), { recursive: true });
      await fs.promises.writeFile(at(key), data);
    },
    async head(key) {
      try {
        return { size: (await fs.promises.stat(at(key))).size };
      } catch {
        return null;
      }
    },
    async delete(key) {
      await fs.promises.rm(at(key), { force: true });
    },
    async copyFromMain(key) {
      await fs.promises.mkdir(path.dirname(at(key)), { recursive: true });
      await fs.promises.copyFile(localStoragePath(key), at(key));
    },
  };
}

/**
 * A deleter for the deletion queue: deletes from storage, then the vault's copy if there is one. Either failing throws,
 * so the key stays queued and is retried until both are gone.
 */
export async function vaultDeleter(store: Pick<Storage, "delete">) {
  const v = await vault();
  return {
    async delete(key: string) {
      await store.delete(key);
      if (!v) return;
      if (!(await q.get("SELECT 1 FROM vault_copies WHERE file_key = ?", key))) return;
      await v.delete(key);
      await q.run("DELETE FROM vault_copies WHERE file_key = ?", key);
    },
  };
}

/**
 * Nightly: copies every stored file the database points to that isn't in the vault yet (audio, stems, artwork, covers,
 * site images). Database backups are written there directly. Stops at the time budget; the rest goes next night.
 */
export async function runVaultCopy(budgetMs = 120_000, at = now()) {
  const v = await vault();
  if (!v) return { on: false as const };
  const until = Date.now() + budgetMs;
  const copied = new Set((await q.all<{ file_key: string }>("SELECT file_key FROM vault_copies")).map((r) => r.file_key));
  const todo = (await expectedFiles()).filter((f) => f.kind !== "database backup" && !copied.has(f.key));
  let done = 0;
  let failed = 0;
  for (const f of todo) {
    if (Date.now() > until) break;
    try {
      await v.copyFromMain(f.key);
      const h = await v.head(f.key);
      if (!h || (f.size !== null && h.size !== f.size)) throw new Error("copy didn't arrive at the right size");
      await q.run("INSERT INTO vault_copies (file_key, size, copied_at) VALUES (?, ?, ?) ON CONFLICT (file_key) DO NOTHING", f.key, h.size, at);
      done++;
    } catch {
      failed++;
    }
  }
  const result = { on: true as const, copied: done, failed, waiting: todo.length - done - failed, inVault: copied.size + done };
  await q.run(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('vault_copy', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    JSON.stringify({ at, ...result }),
    at,
  );
  return result;
}

export async function lastVaultCopy() {
  const v = (await q.get<{ value: string }>("SELECT value FROM app_state WHERE key = 'vault_copy'"))?.value;
  try {
    return v ? (JSON.parse(v) as { at: number; copied: number; failed: number; waiting: number; inVault: number }) : null;
  } catch {
    return null;
  }
}
