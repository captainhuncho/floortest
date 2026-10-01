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
    await alertIfSpiking(db);
  } catch (e) {
    console.error("[incident] could not record", e);
  }
}

const HOUR = 3_600_000;
/** This many incidents within an hour emails the admins. */
export const ALERT_THRESHOLD = 5;

/** At most one alert email an hour, claimed in the database first so concurrent errors can't all send it. */
async function alertIfSpiking(db: Awaited<ReturnType<typeof getDb>>) {
  const t = Date.now();
  const n = Number((await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM incidents WHERE created_at > ?", t - HOUR))?.n ?? 0);
  if (n < ALERT_THRESHOLD) return;
  const claimed = await db.get(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('incident_alert', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE app_state.updated_at < ?
     RETURNING key`,
    String(t), t, t - HOUR,
  );
  if (!claimed) return;
  const { env } = await import("./env");
  const { sendMail, APP_URL } = await import("./mail");
  const recent = await db.all<{ kind: string; message: string }>("SELECT kind, message FROM incidents WHERE created_at > ? ORDER BY created_at DESC LIMIT 8", t - HOUR);
  for (const to of env.adminEmails)
    await sendMail({
      userId: null,
      audience: "support",
      to,
      subject: `FloorTest: ${n} errors in the last hour`,
      body: [`${n} incidents were recorded in the last hour. Latest:`, "", ...recent.map((r) => `• [${r.kind}] ${r.message}`), "", `Details: ${APP_URL}/admin/incidents`, "", "You'll get at most one of these an hour.", "— FloorTest"].join("\n"),
    }).catch(() => {});
}
