import crypto from "node:crypto";

/**
 * Backups are encrypted (AES-256-GCM) before they leave the server, so a leaked bucket or storage key
 * doesn't expose the database. The key is BACKUP_KEY (required).
 * Lose the key and the backups can't be read: keep a copy of it somewhere safe, apart from the bucket.
 * Free of server-only imports so the restore drill can use it.
 */
const MAGIC = Buffer.from("FTB1");

const keyFrom = (secret: string) => crypto.createHash("sha256").update(`floortest-backup:${secret}`).digest();

export function backupSecret(env: NodeJS.ProcessEnv = process.env) {
  const s = (env.BACKUP_KEY ?? "").trim();
  if (!s) throw new Error("BACKUP_KEY is not set: backups can't be written or read without it.");
  return s;
}

export function sealBackup(gzipped: Buffer, secret: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([c.update(gzipped), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

/** Returns the gzipped JSON. Anything that isn't an encrypted FloorTest backup is refused. */
export function openBackup(file: Buffer, secret: string) {
  if (!file.subarray(0, 4).equals(MAGIC)) throw new Error("Not an encrypted FloorTest backup.");
  const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret), file.subarray(4, 16));
  d.setAuthTag(file.subarray(16, 32));
  return Buffer.concat([d.update(file.subarray(32)), d.final()]);
}
