import "server-only";
import { now, q, type Queryable } from "./db";
import { emailTemplate, fillEmail } from "./email-copy";
import { APP_URL, noLinks, queueMail } from "./mail";
import { queueNewTracksNotice } from "./notify";
import { recordIncident } from "./incidents";

/*
 * One send, one email (owner, 29 Oct). Several tracks sent together (a batch of up to 3, or a release folder) used to
 * make one "Delivered" email to the sender and one "New track" email to the receiver per track. Now each track of a
 * send of several waits (`tracks.receipt_due_at`) and the send goes out as one email each way:
 *
 *   - straight away, from the request that saves the send's last track (the browser says how many tracks it holds);
 *   - or, when the rest never arrive (one was refused, the sender gave up, the browser closed), from the mail job,
 *     once GROUP_WAIT_MS has passed since the send's latest track was saved.
 *
 * Each track is claimed (its mark cleared) in the same transaction that queues its email, so a track is never in two
 * emails and never in none. A refused or failed track never has a row, so it's never in a receipt. A track that is
 * held for its virus check and arrives after its send's email went gets an email of its own.
 */

/** How long a send's saved tracks wait for the rest before their emails go anyway. */
export const GROUP_WAIT_MS = 15 * 60_000;

/** Which send a track belongs to. Only these two columns, never text from a request, reach the SQL. */
export type SendGroup = { userId: number; column: "batch_id" | "release_id"; id: string };

type Templates = { one: { subject: string; body: string }; many: { subject: string; body: string } };

type DetailTrack = { title: string; artist: string; original_name: string | null; duration: number | null; created_at: number };

const SENT_AT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const minutes = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
/** "WAV · 6:42" from the file's name and length; just the one that's known, or nothing. */
function fileLine(t: DetailTrack) {
  const ext = t.original_name?.match(/\.([a-z0-9]{2,5})$/i)?.[1].toUpperCase();
  return [ext, t.duration ? minutes(t.duration) : null].filter(Boolean).join(" · ");
}

/**
 * The receipt lines under a "Delivered" email's opening (designed version only; the text keeps the editable wording):
 * what was sent, to whom and when. Times are UTC, as the sender's own time zone isn't known.
 */
export function receiptDetails(tracks: DetailTrack[], receiver: string, collection?: string): [string, string][] {
  const to = collection ? `${receiver} · ${collection}` : receiver;
  const sent = `${SENT_AT.format(new Date(Math.max(...tracks.map((t) => t.created_at))))} UTC`;
  if (tracks.length > 1) return [["Sent to", to], ["Tracks", String(tracks.length)], ["Sent", sent]];
  const [t] = tracks;
  const file = fileLine(t);
  return [["Track", noLinks(t.title)], ["Artist", noLinks(t.artist)], ["Sent to", to], ...(file ? [["File", file] as [string, string]] : []), ["Sent", sent]];
}

/** The two "Delivered" wordings, loaded before a transaction so it only fills them in. */
export const receiptTemplates = async (): Promise<Templates> => ({ one: await emailTemplate("delivered"), many: await emailTemplate("delivered_many") });

/**
 * Inside the transaction that saved a track of a send of several: marks it (and pushes back the wait for the rest of
 * its send), then, once all `expected` tracks are saved, queues the send's emails. Returns the queued email ids.
 */
export async function holdForSend(db: Queryable, g: SendGroup, trackId: number, expected: number, t: Templates) {
  await db.run(
    `UPDATE tracks SET receipt_due_at = ? WHERE user_id = ? AND ${g.column} = ? AND (id = ? OR receipt_due_at IS NOT NULL)`,
    now() + GROUP_WAIT_MS,
    g.userId,
    g.id,
    trackId,
  );
  const saved = Number((await db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ? AND ${g.column} = ?`, g.userId, g.id))?.n ?? 0);
  return saved >= expected ? queueSendEmails(db, g, t) : [];
}

type Waiting = { id: number; token: string; title: string; artist: string; sender_id: number; collection_id: number | null; deleted_at: number | null; decision: string | null; track_no: number | null; created_at: number; original_name: string | null; duration: number | null };

/**
 * Claims every track of this send still waiting and queues one "Delivered" email to the sender listing them (with each
 * track's own receipt link) and, if the receiver hears about tracks straight away, one "New tracks" email to them.
 * Returns the queued email ids (none if another run already sent them).
 */
export async function queueSendEmails(db: Queryable, g: SendGroup, t: Templates) {
  const claimed = await db.all<Waiting>(
    `UPDATE tracks SET receipt_due_at = NULL WHERE user_id = ? AND ${g.column} = ? AND receipt_due_at IS NOT NULL
     RETURNING id, token, title, artist, sender_id, collection_id, deleted_at, decision, track_no, created_at, original_name, duration`,
    g.userId,
    g.id,
  );
  if (!claimed.length) return [];
  const tracks = [...claimed].sort((a, b) => (a.track_no ?? 99) - (b.track_no ?? 99) || a.created_at - b.created_at || a.id - b.id);
  const sender = (await db.get<{ name: string; email: string }>("SELECT name, email FROM senders WHERE id = ?", tracks[0].sender_id))!;
  const receiver = (await db.get<{ name: string }>("SELECT name FROM users WHERE id = ?", g.userId))!;
  const collection = tracks[0].collection_id ? await db.get<{ name: string }>("SELECT name FROM collections WHERE id = ?", tracks[0].collection_id) : undefined;
  const receipt = (token: string) => `${APP_URL}/receipt/${token}`;
  // Everything the sender typed is shown without links: this email goes to whatever address they entered.
  const vars = {
    sender: noLinks(sender.name),
    receiver: receiver.name,
    for_collection: collection ? ` for ${collection.name}` : "",
    sent_url: `${APP_URL}/sent`,
    ...(tracks.length === 1
      ? { title: noLinks(tracks[0].title), artist: noLinks(tracks[0].artist), receipt_url: receipt(tracks[0].token) }
      : {
          count: `${tracks.length} tracks`,
          tracks: tracks.map((x) => `• ${noLinks(x.artist)} – ${noLinks(x.title)}\n  Receipt: ${receipt(x.token)}`).join("\n\n"),
        }),
  };
  const words = tracks.length === 1 ? t.one : t.many;
  const ids = [
    await queueMail(
      {
        userId: g.userId,
        to: sender.email,
        secrets: tracks.map((x) => x.token),
        subject: fillEmail(words.subject, vars).replace(/\s+/g, " "),
        body: fillEmail(words.body, vars),
        details: receiptDetails(tracks, receiver.name, collection?.name),
      },
      db,
    ),
  ];
  // The receiver hears only about tracks still on the desk and still to decide.
  const fresh = tracks.filter((x) => x.deleted_at == null && x.decision == null).map((x) => x.id);
  const notice = await queueNewTracksNotice(db, g.userId, fresh);
  if (notice) ids.push(notice);
  return ids;
}

/**
 * Mail job: queues the emails of every send whose wait is over (the rest of its tracks never came). The job then sends
 * them with the rest of the queue. One send's failure never stops the others; it is retried on the next run.
 */
export async function sendDueReceipts(at = now()) {
  const due = await q.all<{ user_id: number; batch_id: string | null; release_id: string | null }>(
    "SELECT DISTINCT user_id, batch_id, release_id FROM tracks WHERE receipt_due_at IS NOT NULL AND receipt_due_at <= ? LIMIT 200",
    at,
  );
  if (!due.length) return 0;
  const t = await receiptTemplates();
  let sends = 0;
  let failed = 0;
  for (const d of due) {
    const g: SendGroup | null = d.release_id
      ? { userId: d.user_id, column: "release_id", id: d.release_id }
      : d.batch_id
        ? { userId: d.user_id, column: "batch_id", id: d.batch_id }
        : null;
    if (!g) {
      // Can't happen (only tracks of a send wait), but a mark nothing would ever clear must not sit there for ever.
      await q.run("UPDATE tracks SET receipt_due_at = NULL WHERE user_id = ? AND batch_id IS NULL AND release_id IS NULL AND receipt_due_at IS NOT NULL", d.user_id);
      continue;
    }
    try {
      const ids = await q.tx(async (db) => {
        // The same lock a saving track takes, so a late track and this run can't both email the same send.
        await db.get("SELECT id FROM users WHERE id = ? FOR UPDATE", g.userId);
        return queueSendEmails(db, g, t);
      });
      if (ids.length) sends++;
    } catch (e) {
      failed++;
      console.error("[send-receipts] send", g.userId, e);
    }
  }
  if (failed) await recordIncident("email_failed", `${failed} send receipt${failed === 1 ? "" : "s"} couldn't be queued`, "They'll be retried on the next run.");
  return sends;
}
