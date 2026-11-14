import "server-only";
import { asPerson, now, q } from "./db";
import { localPath } from "./safe-links";

/**
 * Ops → Notices (Desk, 13 Nov): a short notice of upcoming work ("Short update Sat 15 Nov, 02:00–02:20. Uploads pause
 * for a few minutes."), shown as a strip on the signed-in dashboard from `show_from` until `hide_after`, or until an
 * admin ends it early. Plain text only (React prints it as text); the optional link is a path on FloorTest. At most
 * one shows at a time: the soonest.
 */
export const TITLE_MAX = 80;
export const DETAIL_MAX = 200;
/** One read of the upcoming notices serves every page for this long (per server instance). */
export const NOTICE_TTL_MS = 30_000;

export type Notice = { id: number; title: string; detail: string; href: string; show_from: number; starts_at: number; ends_at: number; hide_after: number };
export type NoticeRow = Notice & { ended_at: number | null; created_at: number };
export type NoticeInput = Pick<Notice, "title" | "detail" | "href" | "show_from" | "starts_at" | "ends_at" | "hide_after">;

/** Text on one line: control characters and line breaks become single spaces. */
const oneLine = (raw: string) => raw.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
const time = (raw: unknown) => {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/** Checks what an admin typed; the first problem, in words, or the cleaned notice. */
export function readNotice(get: (k: string) => unknown): NoticeInput | { error: string } {
  const title = oneLine(String(get("title") ?? ""));
  const detail = oneLine(String(get("detail") ?? ""));
  const rawHref = String(get("href") ?? "").trim();
  if (!title) return { error: "Add a title." };
  if ([...title].length > TITLE_MAX) return { error: `Keep the title to ${TITLE_MAX} characters.` };
  if ([...detail].length > DETAIL_MAX) return { error: `Keep the detail to ${DETAIL_MAX} characters.` };
  if (/!/.test(title + detail)) return { error: "No exclamation marks (brand voice)." };
  const href = rawHref ? localPath(rawHref) : "";
  if (href === null) return { error: "The link must be a page on FloorTest, starting with /." };
  if (href.length > 200) return { error: "Keep the link to 200 characters." };
  const [show_from, starts_at, ends_at, hide_after] = ["show_from", "starts_at", "ends_at", "hide_after"].map((k) => time(get(k)));
  if (!show_from || !starts_at || !ends_at || !hide_after) return { error: "Fill in all four times." };
  if (show_from > starts_at) return { error: "“Show from” must be before the update starts." };
  if (starts_at >= ends_at) return { error: "The update must end after it starts." };
  if (ends_at > hide_after) return { error: "“Hide after” must be after the update ends." };
  return { title, detail, href, show_from, starts_at, ends_at, hide_after };
}

const COLS = "id, title, detail, href, show_from, starts_at, ends_at, hide_after";
const asNotice = (r: Notice): Notice => ({
  id: Number(r.id),
  title: r.title,
  detail: r.detail,
  href: r.href,
  show_from: Number(r.show_from),
  starts_at: Number(r.starts_at),
  ends_at: Number(r.ends_at),
  hide_after: Number(r.hide_after),
});
const asRow = (r: NoticeRow): NoticeRow => ({ ...asNotice(r), ended_at: r.ended_at === null ? null : Number(r.ended_at), created_at: Number(r.created_at) });

let cached: { at: number; rows: Notice[] } | null = null;
/** Drops this instance's copy after a change; other instances catch up within NOTICE_TTL_MS. */
export const forgetNotices = () => {
  cached = null;
};

/** The notice to show now, if any: live (shown from, not past hide-after, not ended), the soonest first. */
export async function liveNotice(at = now()): Promise<Notice | null> {
  if (!cached || at - cached.at >= NOTICE_TTL_MS || at < cached.at) {
    const rows = await q.all<Notice>(`SELECT ${COLS} FROM site_notices WHERE ended_at IS NULL AND hide_after > ? ORDER BY starts_at, id LIMIT 10`, at);
    cached = { at, rows: rows.map(asNotice) };
  }
  return cached.rows.find((n) => n.show_from <= at && at < n.hide_after) ?? null;
}

/** The live notice for this person, unless they closed it (one primary-key read, only while a notice is live). */
export async function liveNoticeFor(person: number, at = now()): Promise<Notice | null> {
  const n = await liveNotice(at);
  if (!n) return null;
  const closed = await q.get<{ x: number }>("SELECT 1 AS x FROM notice_dismissals WHERE user_id = ? AND notice_id = ?", person, n.id);
  return closed ? null : n;
}

/** The person closed a notice: written as them (per-person rules), so the row is always their own. */
export async function dismissNoticeFor(person: number, noticeId: number): Promise<boolean> {
  if (!Number.isSafeInteger(noticeId) || noticeId <= 0) return false;
  try {
    await asPerson(person, () => q.run("INSERT INTO notice_dismissals (notice_id, created_at) VALUES (?, ?) ON CONFLICT DO NOTHING", noticeId, now()));
    return true;
  } catch {
    return false; // no such notice
  }
}

/** For Ops → Notices: the latest notices, latest update first. */
export async function noticesForAdmin(limit = 50): Promise<NoticeRow[]> {
  const rows = await q.all<NoticeRow>(`SELECT ${COLS}, ended_at, created_at FROM site_notices ORDER BY starts_at DESC, id DESC LIMIT ?`, limit);
  return rows.map(asRow);
}

export async function noticeById(id: number): Promise<NoticeRow | null> {
  const r = await q.get<NoticeRow>(`SELECT ${COLS}, ended_at, created_at FROM site_notices WHERE id = ?`, id);
  return r ? asRow(r) : null;
}

export async function createNotice(n: NoticeInput, adminId: number): Promise<number> {
  const t = now();
  const r = await q.get<{ id: number }>(
    "INSERT INTO site_notices (title, detail, href, show_from, starts_at, ends_at, hide_after, admin_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id",
    n.title, n.detail, n.href, n.show_from, n.starts_at, n.ends_at, n.hide_after, adminId, t, t,
  );
  forgetNotices();
  return Number(r!.id);
}

/** Saves an edit to a notice that hasn't been ended; false when there's no such notice. */
export async function updateNotice(id: number, n: NoticeInput, adminId: number): Promise<boolean> {
  const r = await q.run(
    "UPDATE site_notices SET title = ?, detail = ?, href = ?, show_from = ?, starts_at = ?, ends_at = ?, hide_after = ?, admin_id = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL",
    n.title, n.detail, n.href, n.show_from, n.starts_at, n.ends_at, n.hide_after, adminId, now(), id,
  );
  forgetNotices();
  return r.changes > 0;
}

/** Ends a notice early (it stops showing at once); false when it's missing or already ended. */
export async function endNotice(id: number, adminId: number): Promise<boolean> {
  const t = now();
  const r = await q.run("UPDATE site_notices SET ended_at = ?, admin_id = ?, updated_at = ? WHERE id = ? AND ended_at IS NULL", t, adminId, t, id);
  forgetNotices();
  return r.changes > 0;
}

/** "Sat 15 Nov, 02:00–02:20" in the viewer's time zone; both days named when it runs past midnight. */
export function noticeWindow(n: Pick<Notice, "starts_at" | "ends_at">, tz: string): string {
  const zone = validZone(tz);
  const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: zone }).replace(/,/g, "");
  const hm = (t: number) => new Date(t).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: zone });
  const [d1, d2] = [day(n.starts_at), day(n.ends_at)];
  return d1 === d2 ? `${d1}, ${hm(n.starts_at)}–${hm(n.ends_at)}` : `${d1}, ${hm(n.starts_at)} – ${d2}, ${hm(n.ends_at)}`;
}

function validZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}
