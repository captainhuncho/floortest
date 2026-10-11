"use server";

/** A collection share link, the recipient's side: prove your email, accept the notice, or ask to join. */
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { APP_URL, sendMail } from "@/lib/mail";
import { accountEmailAllowed } from "@/lib/email-budget";
import { allow, requestIp } from "@/lib/ratelimit";
import { checkLinkCode, linkByKey, LinkError, noteUnlistedCode, recipientFor, requestAccess, sendLinkCode, startLinkSession } from "@/lib/share-links";
import { provenEmail, setLinkSession, setProvenEmail } from "@/lib/link-cookies";

export type GateState = { step: "email" | "code" | "notice" | "request" | "sent" | "waiting" | "denied"; email?: string; error?: string } | null;

const GONE: GateState = { step: "denied", error: "This link isn't available." };
const err = (e: unknown, step: NonNullable<GateState>["step"], email?: string): GateState => ({
  step,
  email,
  error: e instanceof LinkError ? e.message : "Something went wrong. Please try again.",
});

/** Who is at the door: a signed-in account with a confirmed email, or an address that just passed a code for this link. */
async function visitor(linkId: number) {
  const u = await currentUser();
  if (u?.email_verified_at) return { email: u.email.toLowerCase(), userId: u.id, name: u.name };
  const email = await provenEmail(linkId);
  return email ? { email, userId: null, name: "" } : null;
}

/** Step 1: email a code. Same answer whether or not the address is on the list. */
export async function sendCode(secret: string, _prev: GateState, form: FormData): Promise<GateState> {
  const link = await linkByKey(secret, await currentUser());
  if (!link) return GONE;
  const email = String(form.get("email") || "").trim().toLowerCase();
  try {
    if (!(await accountEmailAllowed())) throw new LinkError("We can't send codes right now. Please try again in a few minutes.");
    await sendLinkCode(link, email, await requestIp(), async (to, code) => {
      await sendMail({
        userId: null,
        audience: "sender",
        to,
        subject: `${code} is your FloorTest code`,
        body: `Your code to open a private FloorTest collection:\n\n${code}\n\nIt works for 10 minutes. If you didn't try to open a FloorTest link, ignore this email.\n\n— FloorTest`,
      });
    });
    if (await noteUnlistedCode(link, email))
      await warnOwner(link.owner_id, link.collection_id, "Someone may have your share link", `Codes were asked for 10 or more addresses that aren't on the list of a share link for "${link.collection_name}" in the last hour. If you didn't expect that, reset the link: the old address stops working, and you send the new one to the people you added (FloorTest accounts on the list keep access without it).`);
    return { step: "code", email };
  } catch (e) {
    return err(e, "email", email);
  }
}

/** Step 2: check the code. Then: on the list → the access notice; not on it → ask to join (if the link allows). */
export async function checkCode(secret: string, _prev: GateState, form: FormData): Promise<GateState> {
  const link = await linkByKey(secret, await currentUser());
  if (!link) return GONE;
  const email = String(form.get("email") || "");
  try {
    const proven = await checkLinkCode(link, email, String(form.get("code") || ""));
    await setProvenEmail(link.id, proven);
    if (await recipientFor(link, { email: proven, userId: null })) return { step: "notice", email: proven };
    return link.requests_on && !link.requests_paused_at ? { step: "request", email: proven } : { step: "denied", email: proven, error: "You don't have access to this collection." };
  } catch (e) {
    return err(e, "code", email);
  }
}

/** Step 3: accept the access notice and get in (a short session tied to this link's current address). */
export async function acceptNotice(secret: string, _prev: GateState, form: FormData): Promise<GateState> {
  const link = await linkByKey(secret, await currentUser());
  if (!link) return GONE;
  if (form.get("agree") !== "on") return { step: "notice", error: "Tick the box to agree before opening the collection." };
  const who = await visitor(link.id);
  if (!who) return { step: "email" };
  const match = await recipientFor(link, who);
  if (!match) return { step: "denied", error: "You don't have access to this collection." };
  const s = await startLinkSession(link, match.recipient, who);
  await setLinkSession(link.id, s.secret, s.expires);
  revalidatePath(`/c/${secret}`);
  return null;
}

/** Not on the list: ask the owner. Grouped email to the owner (at most one an hour) plus the bell. */
export async function askToJoin(secret: string, _prev: GateState, form: FormData): Promise<GateState> {
  const link = await linkByKey(secret, await currentUser());
  if (!link) return GONE;
  const who = await visitor(link.id);
  if (!who) return { step: "email" };
  try {
    const r = await requestAccess(link, {
      email: who.email,
      userId: who.userId,
      name: String(form.get("name") || who.name || ""),
      note: String(form.get("note") || ""),
      ip: await requestIp(),
    });
    if (r.status === "sent") await tellOwner(link.owner_id, link.collection_id, link.collection_name);
    if (r.status === "sent" && r.paused)
      await warnOwner(link.owner_id, link.collection_id, "A share link stopped taking requests", `A share link for "${link.collection_name}" has 20 requests waiting, so it stopped taking more. It may have been shared publicly. Answer the requests, or reset the link.`);
    return { step: r.status === "sent" ? "sent" : "waiting", email: who.email };
  } catch (e) {
    return err(e, "denied", who.email);
  }
}

/** One email an hour at most, listing how many are waiting; the bell shows each one as it comes. */
async function tellOwner(ownerId: number, collectionId: number, collectionName: string) {
  if (!(await allow("link_request_owner_email", String(ownerId), 1, 3_600_000))) return;
  const owner = await q.get<{ email: string; first_name: string | null; name: string }>("SELECT email, first_name, name FROM users WHERE id = ?", ownerId);
  if (!owner) return;
  const waiting = Number(
    (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM link_requests r JOIN collections c ON c.id = r.collection_id WHERE c.user_id = ? AND r.status = 'pending'", ownerId))?.n ?? 0,
  );
  await sendMail({
    userId: ownerId,
    audience: "receiver",
    to: owner.email,
    subject: `${waiting} ${waiting === 1 ? "person is" : "people are"} asking to hear your music`,
    body: `Hi ${owner.first_name || owner.name.split(/\s+/)[0]},\n\nSomeone asked to join a share link for "${collectionName}"${waiting > 1 ? `, and ${waiting} requests are waiting in all` : ""}. Approve or decline: ${APP_URL}/dashboard/collections/${collectionId}\n\nNobody gets in until you approve them.\n\n— FloorTest`,
  });
}

/** A security warning about a link, emailed straight away (the bell shows it too). Never more than one an hour per owner. */
async function warnOwner(ownerId: number, collectionId: number, subject: string, text: string) {
  if (!(await allow("link_warn_owner", String(ownerId), 1, 3_600_000))) return;
  const owner = await q.get<{ email: string; first_name: string | null; name: string }>("SELECT email, first_name, name FROM users WHERE id = ?", ownerId);
  if (!owner) return;
  await sendMail({
    userId: ownerId,
    audience: "receiver",
    to: owner.email,
    subject,
    body: `Hi ${owner.first_name || owner.name.split(/\s+/)[0]},\n\n${text}\n\nManage it here: ${APP_URL}/dashboard/collections/${collectionId}\n\n— FloorTest`,
  });
}
