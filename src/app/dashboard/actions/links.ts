"use server";

/** Collection share links, the owner's side: create, add or remove people, answer requests, reset, revoke. */
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import {
  addRecipients,
  createLink,
  decideRequest,
  LinkError,
  removeRecipient,
  resetLink,
  revokeLink,
  setRequests,
  type Permission,
} from "@/lib/share-links";
import { done } from "./common";
import { sendMailLater } from "@/lib/mail";

export type LinkState = { url?: string; error?: string; problems?: string[]; added?: number } | null;

const permissionOf = (v: FormDataEntryValue | null): Permission => (v === "download" ? "download" : "listen");
const daysOf = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v === "none" ? null : [7, 14, 30, 90].includes(n) ? n : 14;
};
const fail = (e: unknown): LinkState => ({ error: e instanceof LinkError ? e.message : "Something went wrong. Please try again." });

/** A new link. Its full address is shown once, now; afterwards only Reset makes a new one. */
export async function createShareLink(collectionId: number, _prev: LinkState, form: FormData): Promise<LinkState> {
  const u = await requireUser();
  try {
    const { link, url } = await createLink(u, collectionId, {
      permission: permissionOf(form.get("permission")),
      days: daysOf(form.get("days")),
      requests: form.get("requests") === "on",
      label: String(form.get("label") || ""),
    });
    await audit(u.id, "shared", `share link ${link.id} (${link.permission})`);
    done();
    return { url };
  } catch (e) {
    return fail(e);
  }
}

export async function resetShareLink(linkId: number): Promise<LinkState> {
  const u = await requireUser();
  try {
    const url = await resetLink(u, linkId);
    await audit(u.id, "shared", `share link ${linkId} reset`);
    done();
    return { url };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeShareLink(linkId: number) {
  const u = await requireUser();
  await revokeLink(u, linkId).catch(() => {});
  await audit(u.id, "shared", `share link ${linkId} revoked`);
  done();
}

export async function addLinkRecipients(linkId: number, _prev: LinkState, form: FormData): Promise<LinkState> {
  const u = await requireUser();
  try {
    const r = await addRecipients(u, linkId, String(form.get("who") || ""), permissionOf(form.get("permission")), daysOf(form.get("days")));
    done();
    return { added: r.added, problems: r.problems };
  } catch (e) {
    return fail(e);
  }
}

export async function removeLinkRecipient(recipientId: number) {
  const u = await requireUser();
  await removeRecipient(u, recipientId).catch(() => {});
  done();
}

export async function answerLinkRequest(requestId: number, decision: "approve" | "decline" | "block", form: FormData) {
  const u = await requireUser();
  if (!["approve", "decline", "block"].includes(decision)) return;
  const r = await decideRequest(u, requestId, decision, { permission: permissionOf(form.get("permission")), days: daysOf(form.get("days")) }).catch(() => null);
  // Tell the person who asked. A block reads like a decline: they're never told they were blocked.
  if (r)
    sendMailLater({
      userId: u.id,
      audience: "sender",
      to: r.email,
      subject: decision === "approve" ? `${u.name} let you in` : `About your request to ${u.name}`,
      body:
        decision === "approve"
          ? `Hi,\n\n${u.name} approved your request. Open the link you were sent again and confirm your email to listen.\n\nYour access is personal: please don't forward the link.\n\n— FloorTest`
          : `Hi,\n\n${u.name} isn't sharing this collection with you right now.\n\n— FloorTest`,
    });
  done();
}

export async function setLinkRequests(linkId: number, on: boolean) {
  const u = await requireUser();
  await setRequests(u, linkId, on).catch(() => {});
  done();
}
