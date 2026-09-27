import { getDb } from "./db/client";

/**
 * Records something that went wrong, for the admin incident feed. Never throws: reporting a
 * problem must not cause another one. Kept out of "server-only" so instrumentation can use it.
 */
export async function recordIncident(kind: "server_error" | "upload_failed" | "cron_failed" | "email_failed", message: string, detail = "", path = "") {
  try {
    const db = await getDb();
    await db.run(
      "INSERT INTO incidents (kind, message, detail, path, created_at) VALUES (?,?,?,?,?)",
      kind,
      message.slice(0, 300),
      detail.slice(0, 2000),
      path.slice(0, 300),
      Date.now(),
    );
  } catch (e) {
    console.error("[incident] could not record", e);
  }
}
