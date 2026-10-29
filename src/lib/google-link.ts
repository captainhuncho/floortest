import "server-only";
import { audit } from "./audit";
import { now, q } from "./db";
import { sendMail } from "./mail";

const first = (name: string) => name.split(/\s+/)[0];

/** Pins a Google account to `userId` (only if none is pinned yet) and emails the owner. False if it couldn't. */
export async function pinGoogle(userId: number, sub: string): Promise<boolean> {
  let pinned = false;
  try {
    pinned = !!(await q.run("UPDATE users SET google_sub = ?, google_linked_at = ? WHERE id = ? AND google_sub IS NULL", sub, now(), userId)).changes;
  } catch (e) {
    // That Google account is already pinned to another FloorTest account.
    if ((e as { code?: string })?.code === "23505") return false;
    throw e;
  }
  if (!pinned) return false;
  await audit(userId, "google_connected");
  const u = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", userId);
  if (u)
    await sendMail({
      userId,
      audience: "receiver",
      to: u.email,
      reserved: true,
      subject: "Google sign-in was added to your account",
      body: `Hi ${first(u.name)},\n\nYou can now sign in to FloorTest with your Google account (${u.email}).\n\nIf this wasn't you, remove it in Settings → Security, change your password, and turn on two-step sign-in.\n\n— FloorTest`,
    });
  return true;
}

/** Removes the pinned Google account and emails the owner. */
export async function unpinGoogle(userId: number) {
  const r = await q.run("UPDATE users SET google_sub = NULL, google_linked_at = NULL WHERE id = ? AND google_sub IS NOT NULL", userId);
  if (!r.changes) return;
  await audit(userId, "google_disconnected");
  const u = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", userId);
  if (u)
    await sendMail({
      userId,
      audience: "receiver",
      to: u.email,
      reserved: true,
      subject: "Google sign-in was removed from your account",
      body: `Hi ${first(u.name)},\n\nGoogle sign-in was just removed from your FloorTest account. You can still sign in with your password or an email code.\n\nIf this wasn't you, change your password now.\n\n— FloorTest`,
    });
}
