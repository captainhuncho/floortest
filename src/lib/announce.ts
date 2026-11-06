import "server-only";
import { UNKNOWN_KIND, audienceIsEveryone, audienceWhere, describeAudience, readAudience } from "./audience";
import { now, q } from "./db";
import { allPlans } from "./plan-store";
import { localPath } from "./safe-links";

export type AnnouncementList = "product" | "marketing";
export type Saved = {
  id: number;
  title: string;
  body: string;
  href: string;
  label: string;
  list: AnnouncementList | null;
  people: { id: number; email: string }[];
  subscribers: { email: string; token: string }[];
};

/**
 * An announcement from the publish form, checked and saved: the row, its bell recipients, and who to email (accounts
 * that opted in, and newsletter subscribers without an account). Returns why not instead when it can't be published;
 * then nothing is written and nobody is picked to email. The caller (an admin action) has already checked the admin.
 */
export async function saveAnnouncement(adminId: number, get: (k: string) => unknown): Promise<Saved | { error: string }> {
  const title = String(get("title") || "").trim().slice(0, 100);
  const body = String(get("body") || "").trim().slice(0, 600);
  const href = String(get("href") || "").trim().slice(0, 200);
  const aud = readAudience(get);
  const list: AnnouncementList | null = get("list") === "marketing" ? "marketing" : get("list") === "product" ? "product" : null;
  const consent = list === "marketing" ? "u.notify_marketing = 1" : "u.notify_product = 1";
  const outside = !!list && get("subscribers") === "on";
  // Links must stay on FloorTest: "/path" only, never "//host", "/\host" or javascript: (src/lib/safe-links.ts).
  if (!title || (href && !localPath(href))) return { error: "Needs a title, and links must start with /" };
  // An audience that can't be read reaches nobody: refuse it before anything is saved or emailed, including newsletter
  // subscribers, who are picked outside the audience.
  if (aud.nobody || aud.kind === UNKNOWN_KIND) return { error: "This audience can't be read. Pick it again." };
  // Subscribers have no account, so no filter can narrow them (owner, 6 Nov): only with the audience set to Everyone.
  if (outside && !audienceIsEveryone(aud)) return { error: "Newsletter subscribers can only be included when the audience is Everyone." };
  const plans = await allPlans();
  const label = describeAudience(aud, (id) => plans.find((p) => p.id === id)?.name ?? id);
  const w = audienceWhere(aud);
  const id = (await q.get<{ id: number }>(
    "INSERT INTO announcements (title, body, href, audience, emailed, admin_id, created_at) VALUES (?,?,?,?,?,?,?) RETURNING id",
    title, body, href, label, list ? 1 : 0, adminId, now(),
  ))!.id;
  await q.run(`INSERT INTO announcement_recipients (announcement_id, user_id) SELECT ?, u.id FROM users u WHERE ${w.sql}`, id, ...w.args);
  const people = list
    ? await q.all<{ id: number; email: string }>(
        `SELECT u.id, u.email FROM users u WHERE ${w.sql} AND ${consent} AND u.email_verified_at IS NOT NULL LIMIT 5000`,
        ...w.args,
      )
    : [];
  // People without an account who confirmed the newsletter (and, for offers, opted into those too).
  const subscribers = outside
    ? await q.all<{ email: string; token: string }>(
        `SELECT s.email, s.token FROM newsletter_subscribers s WHERE s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL ${list === "marketing" ? "AND s.marketing = 1" : ""}
           AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = s.email) LIMIT 5000`,
      )
    : [];
  return { id, title, body, href, label, list, people, subscribers };
}
