import crypto from "node:crypto";

/**
 * How a link or session token is stored: as its SHA-256, so a copy of the database (a backup, an ops query) holds
 * nothing that works as the link. The email carries the token itself; the lookup hashes it again.
 */
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
