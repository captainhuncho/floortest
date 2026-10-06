import "server-only";
import { q } from "./db";
import { env } from "./env";

/**
 * Wording of FloorTest's everyday emails, edited in Admin → Site content → Emails. `{name}` fill-ins are replaced
 * when the email is sent; a fill-in that ends up empty (an optional line) leaves no gap. Security and account emails
 * (sign-in codes, password and email changes, suspensions) keep fixed wording in code on purpose.
 */
export type EmailDef = { label: string; to: string; subject: string; body: string; vars: Record<string, string> };

const RECEIPT = "Your receipt: {receipt_url}\nEverything you've sent: {sent_url}\n\n— FloorTest";
const TRACK_VARS = { sender: "Sender's name", receiver: "Receiver's name", title: "Track title", receipt_url: "Receipt link", sent_url: "Sender's history link" };

export const EMAILS = {
  delivered: {
    label: "Delivered",
    to: "Sender, when their track arrives",
    subject: "Delivered: {artist} – {title}",
    body: "Hi {sender},\n\n\"{title}\" was delivered to {receiver}{for_collection}.\nWe'll email you when it's listened to, when the original is downloaded, and if {receiver} replies.\n\nYour private receipt: {receipt_url}\nEverything you've sent, with what happened to each: {sent_url}\n\n— FloorTest",
    vars: { ...TRACK_VARS, artist: "Artist", for_collection: '" for <collection>" when sent to one, else empty' },
  },
  listened: {
    label: "Listened",
    to: "Sender, after 30+ seconds of play",
    subject: "Listened: {title}",
    body: `Hi {sender},\n\n{receiver} listened to "{title}".\n\nThis means it was played for at least 30 seconds (or a quarter of the track). It doesn't tell you whether it'll be played out.\n\n${RECEIPT}`,
    vars: TRACK_VARS,
  },
  downloaded: {
    label: "Downloaded",
    to: "Sender, when the original is downloaded",
    subject: "Downloaded: {title}",
    body: `Hi {sender},\n\n{receiver} downloaded the original file of "{title}".\n\nDownloading usually means they want it on hand, but it isn't a promise.\n\n${RECEIPT}`,
    vars: TRACK_VARS,
  },
  played_out: {
    label: "Played out",
    to: "Sender, when their track is played in a set",
    subject: "Played out: {title}",
    body: `Hi {sender},\n\n{receiver} played "{title}" out in a set{note}. 🎛️\n\n${RECEIPT}`,
    vars: { ...TRACK_VARS, note: '" (<the receiver\'s note>)" when they added one, else empty' },
  },
  welcome: {
    label: "Welcome",
    to: "Receiver, once their email is confirmed",
    subject: "Your link is live: {link_short}",
    body: "Hi {first_name},\n\nYour receiving link is ready: {link}\n\nPut it in your bio or your next callout. Artists upload the original file and you'll get an email when tracks arrive (change how often in Notifications).\n\nOn your desk:\n• Space plays\n• K keeps, X marks not for me, and the next track starts\n• U undoes\n\nKept tracks download as a crate with a Rekordbox XML.\n\nReply to this email with anything that's broken or missing. During the beta, I read every one.\n\n— FloorTest",
    vars: { first_name: "Receiver's first name", link: "Their link", link_short: "Their link without https://" },
  },
  first_track_nudge: {
    label: "No tracks yet",
    to: "Receiver, 7 days after sign-up with no tracks",
    subject: "Nothing on your desk yet",
    body: "Hi {first_name},\n\nYour link hasn't had a track yet. The quickest way to get the first one: post a callout with your link, for example:\n\n\"Sending me music? Upload the WAV here: {link}. You'll know when I've listened.\"\n\n— FloorTest",
    vars: { first_name: "Receiver's first name", link: "Their link" },
  },
  invite: {
    label: "Beta invite",
    to: "Invited person",
    subject: "You're invited to the FloorTest beta",
    body: "Hi,\n\n{inviter} invited you to the FloorTest beta: one receiving link that never changes and takes every track, a queue to review them fast, and receipts that tell senders what happened.\n{personal_note}\nClaim your link: {signup_url}\n\nYour invite code is {code}. It's for {email} only and works once.\n\n— FloorTest",
    vars: { inviter: "Who invited them", personal_note: "Your personal note in quotes, when you wrote one", signup_url: "Sign-up link with the code", code: "Invite code", email: "Their email" },
  },
  referral: {
    label: "Referral bonus",
    to: "Receiver whose referral got their first track",
    subject: "You both got {bonus} more track slots",
    body: "{friend} just received their first track on FloorTest. You both get {bonus} extra active tracks.\n\nYour referrals: {referrals_url}",
    vars: { friend: "The person they referred", bonus: "Extra track slots", referrals_url: "Their referrals page" },
  },
} satisfies Record<string, EmailDef>;

export type EmailId = keyof typeof EMAILS;
export const emailKey = (id: EmailId) => `email_${id}`;

/** Fill `{name}` fill-ins, then tidy the gaps an empty optional line leaves behind. */
export function fillEmail(s: string, vars: Record<string, string | number>) {
  return s
    .replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The saved wording for an email (or its original wording), before fill-ins. */
export async function emailTemplate(id: EmailId, which: "published" | "draft" = "published") {
  const row = await q.get<{ draft: string; published: string }>("SELECT draft, published FROM site_content WHERE page = ?", emailKey(id));
  let saved: { subject?: unknown; body?: unknown } = {};
  try {
    saved = JSON.parse(row?.[which] || "{}");
  } catch {}
  return {
    subject: typeof saved.subject === "string" && saved.subject ? saved.subject : EMAILS[id].subject,
    body: typeof saved.body === "string" && saved.body ? saved.body : EMAILS[id].body,
  };
}

/** Subject and body ready to send. */
export async function emailText(id: EmailId, vars: Record<string, string | number>) {
  const t = await emailTemplate(id);
  return { subject: fillEmail(t.subject, vars).replace(/\s+/g, " "), body: fillEmail(t.body, vars) };
}

/** Example fill-ins for the editor's preview and test send. */
const U = env.appUrl;
export const SAMPLE_VARS: Record<string, string> = {
  sender: "Ade",
  receiver: "Maxwell",
  title: "Night Bus (Extended Mix)",
  artist: "Ade",
  receipt_url: `${U}/receipt/example`,
  sent_url: `${U}/sent`,
  for_collection: " for Friday residency",
  note: " (opened the second hour)",
  first_name: "Maxwell",
  link: `${U}/maxwell`,
  link_short: `${U.replace(/^https?:\/\//, "")}/maxwell`,
  personal_note: '\n"Would love your ears on this."\n',
  inviter: "Maxwell",
  signup_url: `${U}/signup?invite=FLOOR-EXAMPLE`,
  code: "FLOOR-EXAMPLE",
  email: "you@example.com",
  friend: "Ade",
  bonus: "10",
  referrals_url: `${U}/dashboard/referrals`,
};
