"use server";

/**
 * Report a track from inside the desk (App Store Review 1.2): the report lands in the same admin inbox and support
 * email as the contact form's "Report abuse", with the track and sender attached so staff can find it in Moderation.
 */
import { atLeast } from "@/lib/account-members";
import { audit, trackLabel } from "@/lib/audit";
import { currentPerson, requireUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { ownedSender, ownedTrack } from "@/lib/desk";
import { sendMail } from "@/lib/mail";
import { allow } from "@/lib/ratelimit";
import { setBlocked } from "@/lib/review";
import { supportEmail } from "@/lib/site";
import { done } from "./common";

/** What a receiver can report, and the contact topic staff already sort by. */
const REASONS = {
  abuse: "Report abuse",
  impersonation: "Impersonation",
  copyright: "Copyright claim",
  other: "Report abuse",
} as const;
type Reason = keyof typeof REASONS;
const isReason = (v: string): v is Reason => Object.hasOwn(REASONS, v);

const REPORTS_PER_HOUR = 10;

export type ReportState = { ok?: boolean; blocked?: boolean; error?: string } | undefined;

export async function reportTrack(trackId: number, _: ReportState, form: FormData): Promise<ReportState> {
  const u = await requireUser();
  const t = await ownedTrack(u, trackId);
  if (!t) return { error: "That track isn't on this desk any more." };
  if (!(await allow("report_track", String(u.actor_id), REPORTS_PER_HOUR, 3_600_000))) return { error: "Too many reports in an hour. Try again later." };

  const reason = String(form.get("reason") ?? "");
  if (!isReason(reason)) return { error: "Pick a reason." };
  const note = String(form.get("note") ?? "").trim().slice(0, 2000);
  const sender = await ownedSender(u, t.sender_id);
  const me = await currentPerson();
  const topic = REASONS[reason];
  const message = [
    `Reported from the desk @${u.handle}: ${reason}.`,
    `Track #${t.id}: ${t.title}`,
    sender ? `Sender: ${sender.name} <${sender.email}>` : "Sender: not found",
    note ? `\n${note}` : "",
  ].join("\n");

  await q.run(
    "INSERT INTO contact_messages (user_id, name, email, topic, message, created_at) VALUES (?,?,?,?,?,?)",
    me?.id ?? u.actor_id,
    me?.name ?? u.name,
    me?.email ?? u.email,
    topic,
    message,
    Date.now(),
  );
  await sendMail({
    userId: me?.id ?? u.actor_id,
    audience: "support",
    to: supportEmail() ?? "support (SUPPORT_EMAIL not set)",
    subject: `[${topic}] track #${t.id} on @${u.handle}`,
    body: message,
  });
  await audit(u.id, "reported", trackLabel(t), t.id);

  // Blocking follows the desk's own rule: admins and owners only, like the Block button on the sender's page.
  const block = form.get("block") === "on" && !!sender && !sender.blocked_at && atLeast(u.role, "admin");
  if (block && sender) {
    await setBlocked(u, sender, true);
    await audit(u.id, "blocked", sender.name);
  }
  done();
  return { ok: true, blocked: block };
}
