import crypto from "node:crypto";

/**
 * Backups are encrypted (AES-256-GCM) before they leave the server, so a leaked bucket or storage key
 * doesn't expose the database. The key is BACKUP_KEY (required).
 * Lose the key and the backups can't be read: keep a copy of it somewhere safe, apart from the bucket.
 * Free of server-only imports so the restore drill can use it.
 */
const MAGIC_V1 = Buffer.from("FTB1");
/** Version 2 names the key that sealed it (keyId, not secret), so a backup made before a key change can still be opened. */
const MAGIC = Buffer.from("FTB2");
const ID_BYTES = 8;

const keyFrom = (secret: string) => crypto.createHash("sha256").update(`floortest-backup:${secret}`).digest();
/** A short, non-secret name for a key: which key a backup needs, without revealing it. */
export const keyId = (secret: string) => crypto.createHash("sha256").update(`floortest-backup-id:${secret}`).digest().subarray(0, ID_BYTES);

export function backupSecret(env: NodeJS.ProcessEnv = process.env) {
  const s = (env.BACKUP_KEY ?? "").trim();
  if (!s) throw new Error("BACKUP_KEY is not set: backups can't be written or read without it.");
  return s;
}

/**
 * Every key that may open a backup: BACKUP_KEY, then any earlier keys in BACKUP_OLD_KEYS (comma-separated). After a key
 * change, put the old key there (and in the password manager) until the last backup made with it has aged out.
 */
export function backupSecrets(env: NodeJS.ProcessEnv = process.env) {
  const old = (env.BACKUP_OLD_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  return [backupSecret(env), ...old];
}

export function sealBackup(gzipped: Buffer, secret: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([c.update(gzipped), c.final()]);
  return Buffer.concat([MAGIC, keyId(secret), iv, c.getAuthTag(), body]);
}

const decrypt = (secret: string, iv: Buffer, tag: Buffer, body: Buffer) => {
  const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]);
};

/**
 * Returns the gzipped JSON. Takes one key or the keyring (backupSecrets()). A version-2 backup uses the key it names, and
 * says which one is missing if none matches; an older version-1 backup tries each key. Anything that isn't an encrypted
 * FloorTest backup is refused.
 */
export function openBackup(file: Buffer, secrets: string | string[]) {
  const ring = Array.isArray(secrets) ? secrets : [secrets];
  const magic = file.subarray(0, 4);
  if (magic.equals(MAGIC)) {
    const id = file.subarray(4, 4 + ID_BYTES);
    const secret = ring.find((s) => keyId(s).equals(id));
    if (!secret) throw new Error(`This backup was sealed with key ${id.toString("hex")}, which isn't in BACKUP_KEY or BACKUP_OLD_KEYS.`);
    const at = 4 + ID_BYTES;
    return decrypt(secret, file.subarray(at, at + 12), file.subarray(at + 12, at + 28), file.subarray(at + 28));
  }
  if (!magic.equals(MAGIC_V1)) throw new Error("Not an encrypted FloorTest backup.");
  for (const secret of ring) {
    try {
      return decrypt(secret, file.subarray(4, 16), file.subarray(16, 32), file.subarray(32));
    } catch {
      // wrong key: try the next one
    }
  }
  throw new Error("None of the keys in BACKUP_KEY or BACKUP_OLD_KEYS opens this backup.");
}
