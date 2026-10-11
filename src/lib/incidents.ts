import { getDb } from "./db/client";

export type IncidentKind = "server_error" | "upload_failed" | "upload_rejected" | "cron_failed" | "email_failed";

/** Problems with us, not with a visitor's file: these count toward alerts and the admin to-do list. */
const COUNTED = "kind <> 'upload_rejected'";
const HOUR = 3_600_000;
/** This many incidents within an hour emails the admins. */
export const ALERT_THRESHOLD = 5;

/**
 * Records something that went wrong, for the admin incident feed. Never throws: reporting a
 * problem must not cause another one. Kept out of "server-only" so instrumentation can use it.
 * `urgent` (failed nightly jobs, stuck deletions) alerts the admins straight away instead of waiting for a spike.
 */
export async function recordIncident(kind: IncidentKind, message: string, detail = "", path = "", { urgent = false } = {}) {
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
    if (kind === "upload_rejected") return; // a visitor's bad file, not our fault: logged, never alerted
    if (urgent || kind === "cron_failed") await alert(db, "incident_alert_urgent", 15 * 60_000, `FloorTest: ${message}`, [message, detail.split("\n")[0] ?? ""]);
    else await alertIfSpiking(db);
  } catch (e) {
    console.error("[incident] could not record", e);
  }
}

type Db = Awaited<ReturnType<typeof getDb>>;

async function alertIfSpiking(db: Db) {
  const t = Date.now();
  const n = Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM incidents WHERE created_at > ? AND ${COUNTED}`, t - HOUR))?.n ?? 0);
  if (n < ALERT_THRESHOLD) return;
  const recent = await db.all<{ kind: string; message: string }>(`SELECT kind, message FROM incidents WHERE created_at > ? AND ${COUNTED} ORDER BY created_at DESC LIMIT 8`, t - HOUR);
  await alert(db, "incident_alert", HOUR, `FloorTest: ${n} errors in the last hour`, [`${n} incidents were recorded in the last hour. Latest:`, "", ...recent.map((r) => `• [${r.kind}] ${r.message}`)]);
}

/**
 * Tells the admins, at most once per `every` for this key (claimed in the database first so concurrent
 * errors can't all send it). Goes to ALERT_WEBHOOK_URL too when set (Discord or Slack incoming webhook),
 * so an alert still arrives when email itself is what's broken.
 */
async function alert(db: Db, key: string, every: number, subject: string, lines: string[]) {
  const t = Date.now();
  const claimed = await db.get(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE app_state.updated_at < ?
     RETURNING key`,
    key, String(t), t, t - every,
  );
  if (!claimed) return;
  const { env } = await import("./env");
  const { sendMail } = await import("./mail");
  const text = [...lines, "", `Details: ${env.opsUrl}/admin/incidents`].join("\n");
  const hook = process.env.ALERT_WEBHOOK_URL?.trim();
  if (hook && /^https:\/\//.test(hook))
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `**${subject}**\n${text}`.slice(0, 1900), text: `*${subject}*\n${text}`.slice(0, 3000) }),
      signal: AbortSignal.timeout(5000),
    }).catch((e) => console.error("[alert] webhook failed", e));
  for (const to of env.adminEmails)
    await sendMail({ userId: null, audience: "support", to, subject, body: `${text}\n\n— FloorTest` }).catch(() => {});
}
