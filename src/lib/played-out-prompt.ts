import "server-only";
import { q, type User } from "./db";

const DAY = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The Monday question ("Did any of these get played?") belongs to the receiver's own week: it shows on Monday and
 * Tuesday in their time zone and asks about last Monday to Sunday. `key` is this Monday's date, so one answer
 * (marking tracks or "None this weekend") closes it until next week.
 */
export function promptWeek(tz: string, ts = Date.now()) {
  const parts = (zone: string) => {
    try {
      return Object.fromEntries(
        new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short" })
          .formatToParts(ts)
          .map((p) => [p.type, p.value]),
      );
    } catch {
      return null;
    }
  };
  const p = parts(tz) ?? parts("UTC")!;
  const localDate = Date.UTC(+p.year, +p.month - 1, +p.day);
  const offset = localDate + ((+p.hour * 60 + +p.minute) * 60 + +p.second) * 1000 - Math.floor(ts / 1000) * 1000;
  const dow = WEEKDAYS.indexOf(p.weekday);
  const mondayDate = localDate - dow * DAY;
  const monday = mondayDate - offset;
  return { open: dow === 0 || dow === 1, key: new Date(mondayDate).toISOString().slice(0, 10), from: monday - 7 * DAY, to: monday };
}

export type PromptTrack = { id: number; title: string; artist: string; bpm: number | null };

/**
 * DJ desks only, for the owner and A&R / Admin. Lists last week's kept or downloaded tracks not yet played out.
 * Tracks whose sender asked for evaluation only are held back by name, so the DJ is reminded to ask first.
 * Nothing to ask about (or already answered this week): no prompt.
 */
export async function playedOutPrompt(user: Pick<User, "id" | "kind" | "tz"> & { role?: string }, ts = Date.now()) {
  if (user.kind !== "dj" || user.role === "member") return null;
  const week = promptWeek(user.tz || "UTC", ts);
  if (!week.open) return null;
  const answered = await q.get<{ w: string | null }>("SELECT played_out_prompt_week AS w FROM users WHERE id = ?", user.id);
  if (answered?.w === week.key) return null;
  const rows = await q.all<PromptTrack & { sets_ok: number }>(
    `SELECT id, title, artist, bpm, sets_ok FROM tracks
     WHERE user_id = ? AND deleted_at IS NULL AND decision = 'kept' AND played_out_at IS NULL
       AND ((decided_at >= ? AND decided_at < ?) OR (downloaded_at >= ? AND downloaded_at < ?))
     ORDER BY decided_at LIMIT 50`,
    user.id, week.from, week.to, week.from, week.to,
  );
  const tracks = rows.filter((r) => r.sets_ok).map(({ id, title, artist, bpm }) => ({ id, title, artist, bpm }));
  if (!tracks.length) return null;
  return { key: week.key, from: week.from, to: week.to, tracks, heldBack: rows.filter((r) => !r.sets_ok).map((r) => r.title) };
}

export async function closePlayedOutPrompt(userId: number, key: string) {
  await q.run("UPDATE users SET played_out_prompt_week = ? WHERE id = ?", key, userId);
}
