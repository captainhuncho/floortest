"use server";

/** Settings: alerts, profile and public page, plans and checkout, identity, email change, theme and deleting the account. */
import { revalidatePath } from "next/cache";
import { stepUp } from "@/lib/step-up";
import { allow } from "@/lib/ratelimit";
import { sendMail } from "@/lib/mail";
import { MAX_LINKS, readLinks, slotLink, type ProfileLink } from "@/lib/socials";
import { isAccountType, TOOL_IDS, toolOverrides, type Tool } from "@/lib/account-types";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destroySession, requireRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { purgeAccount } from "@/lib/privacy";
import { cancelEmailChange, changeHandle, requestEmailChange, resetVerified } from "@/lib/accounts";
import { capacity } from "@/lib/desk";
import { now, q } from "@/lib/db";
import { sendDigest } from "@/lib/notify";
import { offeredPlan, planOf } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { audit } from "@/lib/audit";
import { cleanProfileLink, IDENTITY_HOSTS, newIdentityCode } from "@/lib/identity";
import { done } from "./common";
import { REQUEST_KINDS, VOLUMES, pendingRequest, type RequestKind } from "@/lib/plan-requests";
import { httpsLink } from "@/lib/safe-links";
import { normalEmail } from "@/lib/email-normal";

export async function updateNotifications(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  const mode = String(form.get("notify_submissions"));
  const hour = (k: string) => {
    const v = form.get(k);
    if (v === null || v === "") return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 23 ? n : null;
  };
  let tz = String(form.get("tz") || "UTC").slice(0, 64);
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  const quiet = form.get("quiet") === "on";
  await q.run(
    `UPDATE users SET notify_submissions = ?, digest_hour = ?, quiet_start = ?, quiet_end = ?, notify_alerts = ?, notify_product = ?, notify_marketing = ?,
       product_consent_at = CASE WHEN ? = 1 THEN COALESCE(product_consent_at, ?) ELSE NULL END,
       marketing_consent_at = CASE WHEN ? = 1 THEN COALESCE(marketing_consent_at, ?) ELSE NULL END, tz = ? WHERE id = ?`,
    ["instant", "digest", "off"].includes(mode) ? mode : "digest",
    hour("digest_hour") ?? 9,
    quiet ? hour("quiet_start") : null,
    quiet ? hour("quiet_end") : null,
    form.get("notify_alerts") === "on" ? 1 : 0,
    form.get("notify_product") === "on" ? 1 : 0,
    form.get("notify_marketing") === "on" ? 1 : 0,
    form.get("notify_product") === "on" ? 1 : 0,
    now(),
    form.get("notify_marketing") === "on" ? 1 : 0,
    now(),
    tz,
    u.id,
  );
  await audit(u.id, "notifications_updated");
  done();
  return { ok: true };
}

/** Sends the digest immediately, whatever the schedule. Handy for checking what it looks like. */
export async function sendDigestNow(): Promise<number> {
  const u = await requireRole("owner");
  const n = await sendDigest(u.id);
  await audit(u.id, "digest_sent", `${n} track${n === 1 ? "" : "s"}`);
  done();
  return n;
}

export type SettingsState = { ok?: boolean; error?: string } | undefined;

export async function updateSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  const handle = String(form.get("handle") || "").trim().toLowerCase();
  const name = String(form.get("name") || "").trim().slice(0, 80) || handle;
  const firstName = String(form.get("first_name") || "").trim().slice(0, 60);
  const lastName = String(form.get("last_name") || "").trim().slice(0, 60);
  if (!firstName || !lastName) return { error: "Add your first name and surname." };
  const problem = await changeHandle(u.id, handle);
  if (problem) return { error: problem };
  const picked = form.get("kind");
  const kind = isAccountType(picked) ? picked : u.kind;
  const kindNote = String(form.get("kind_note") ?? u.kind_note ?? "").trim().slice(0, 80);
  // Tools: "on" / "off" from the form; stored only where they differ from the type's defaults.
  const chosen: Partial<Record<Tool, boolean>> = {};
  for (const t of TOOL_IDS) {
    const v = form.get(`tool_${t}`);
    if (v === "on" || v === "off") chosen[t] = v === "on";
  }
  const tools = TOOL_IDS.some((t) => t in chosen) ? toolOverrides(kind, chosen) : u.tools;
  await q.run(
    "UPDATE users SET name = ?, first_name = ?, last_name = ?, kind = ?, kind_note = ?, tools = ? WHERE id = ?",
    name, firstName, lastName, kind, kindNote, tools, u.id,
  );
  if (name !== u.name) await resetVerified(q, u.id);
  if (name !== u.name || handle !== u.handle) await audit(u.id, "settings_updated", handle !== u.handle ? `link is now /${handle}` : name);
  done();
  return { ok: true };
}

export async function updatePublicPage(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("admin");
  const style = form.get("page_style") === "stage" ? "stage" : "classic";
  const role = String(form.get("role_line") || "").trim().slice(0, 60);
  // One slot per profile: the platform picked, and its link.
  const platforms = form.getAll("platform").map(String);
  const urls = form.getAll("url").map((v) => String(v).slice(0, 300));
  const links: ProfileLink[] = [];
  for (const [i, raw] of urls.entries()) {
    if (!raw.trim()) continue;
    const r = slotLink(platforms[i] ?? "website", raw);
    if ("error" in r) return { error: r.error };
    if (!links.some((l) => l.url === r.url)) links.push(r);
  }
  if (links.length > MAX_LINKS) return { error: `Up to ${MAX_LINKS} profiles.` };
  const parsed = { links };
  await q.run("UPDATE users SET page_style = ?, role_line = ?, links = ? WHERE id = ?", style, role, JSON.stringify(parsed.links), u.id);
  const addresses = (l: ProfileLink[]) => l.map((x) => x.url).sort().join(" ");
  if (addresses(parsed.links) !== addresses(readLinks(u.links))) await resetVerified(q, u.id);
  await audit(u.id, "page_updated", style === "stage" ? "Stage style" : "Classic style");
  done();
  revalidatePath(`/${u.handle}`);
  return { ok: true };
}

/** Moving down (or sideways) a plan. Upgrades always go through checkout: see confirmBetaUpgrade. */
export async function setPlan(plan: string) {
  const u = await requireRole("owner");
  const next = await offeredPlan(plan);
  if (!next || next.price > (await planOf(u.plan)).price) return;
  const cap = await capacity(u);
  if (cap.used > next.limit + cap.bonus) return;
  await q.run("UPDATE users SET plan = ? WHERE id = ?", next.id, u.id);
  await audit(u.id, "plan_changed", next.name);
  done();
}

/**
 * Checkout during the beta: the beta discount makes the total $0.00, so confirming applies the plan
 * straight away (no card). Once the billing switch is on, upgrades need a real payment instead.
 */
export async function confirmBetaUpgrade(plan: string, form: FormData) {
  const u = await requireRole("owner");
  const next = await offeredPlan(plan);
  if (!next || next.price <= (await planOf(u.plan)).price) redirect("/dashboard/plans");
  if (await switchOn("billing")) redirect(`/dashboard/checkout?plan=${next.id}`);
  // During the beta, bigger plans are given on request (see requestPlan), never picked straight from checkout.
  void form;
  redirect((await switchOn("plan_requests", u)) ? `/dashboard/plans/request?plan=${next.id}` : "/dashboard/plans");
}

/** Gives the account its bio code (created once, reused so it doesn't change under them). */
export async function identityCode(): Promise<string> {
  const u = await requireRole("owner");
  const row = await q.get<{ c: string | null }>("SELECT identity_code AS c FROM users WHERE id = ?", u.id);
  if (row?.c) return row.c;
  const code = newIdentityCode();
  await q.run("UPDATE users SET identity_code = COALESCE(identity_code, ?) WHERE id = ?", code, u.id);
  return (await q.get<{ c: string }>("SELECT identity_code AS c FROM users WHERE id = ?", u.id))!.c;
}

export async function submitIdentity(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  if (u.identity_status === "verified") return { ok: true };
  const links = [...new Set(form.getAll("link").map((l) => cleanProfileLink(String(l))).filter((l): l is string => !!l))].slice(0, 5);
  if (!links.length) return { error: "Add at least one profile link." };
  const bad = links.find((l) => !IDENTITY_HOSTS.some((h) => new URL(l).host === h || new URL(l).host.endsWith(`.${h}`)));
  if (bad) return { error: `${new URL(bad).host} isn't one we can check. Use Instagram, SoundCloud, Resident Advisor, Spotify, Bandcamp, Mixcloud, TikTok, X, YouTube or Beatport.` };
  await identityCode();
  await q.run(
    "UPDATE users SET identity_status = 'pending', identity_links = ?, identity_note = '', identity_submitted_at = ? WHERE id = ?",
    JSON.stringify(links),
    now(),
    u.id,
  );
  await audit(u.id, "identity_submitted", links.map((l) => new URL(l).host).join(", "));
  done();
  return { ok: true };
}

/** Permanently deletes the account, every stored file, and all history. Password (and two-step code), then an email to say it's done. */
export async function deleteAccount(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  const problem = await stepUp(u.id, String(form.get("password") || ""), String(form.get("code") || ""));
  if (problem) return { error: problem };
  await sendMail({
    userId: null,
    audience: "support",
    to: u.email,
    reserved: true,
    subject: "Your FloorTest account was deleted",
    body: `Hi ${u.name.split(/\s+/)[0]},\n\nYour FloorTest account (${u.handle}) and everything on it were deleted just now, at your request from Settings.\n\nIf this wasn't you, reply to this email straight away.\n\n— FloorTest`,
  });
  await destroySession();
  await purgeAccount(u.id);
  redirect("/?deleted=1");
}

/** Starts an email change from Settings. Needs the password; the new address must confirm before it takes effect. */
export async function changeMyEmail(_: SettingsState, form: FormData): Promise<SettingsState> {
  const u = await requireRole("owner");
  const denied = await stepUp(u.id, String(form.get("password") || ""), String(form.get("code") || ""));
  if (denied) return { error: denied };
  const email = normalEmail(String(form.get("email") || ""));
  // Each change emails the new address: limited, so this can't be used to flood someone's inbox.
  if (!(await allow("email_change_to", email, 3, 24 * 3_600_000))) return { error: "Too many confirmation emails to that address today. Try again tomorrow." };
  const problem = await requestEmailChange(u.id, email, "user");
  if (problem) return { error: problem };
  await audit(u.id, "settings_updated", "started an email change");
  done();
  return { ok: true };
}

export async function cancelMyEmailChange() {
  const u = await requireRole("owner");
  await cancelEmailChange(u.id);
  done();
}

/** Day, Night or System for the signed-in app. A cookie, so every page renders in it from the first byte. */
export async function setTheme(theme: string) {
  if (!["night", "day", "system"].includes(theme)) return;
  (await cookies()).set("ft_theme", theme, { path: "/", maxAge: 365 * 86_400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  revalidatePath("/", "layout");
}

/**
 * During the beta: ask for Pro or Team. Ops checks who the person is (artist, label, distributor…) and approves the
 * plan that fits. One open request at a time; a new one replaces the old.
 */
export async function requestPlan(form: FormData) {
  const u = await requireRole("owner");
  if ((await switchOn("billing")) || !(await switchOn("plan_requests", u))) redirect("/dashboard/plans");
  const next = await offeredPlan(String(form.get("plan") || ""));
  if (!next || next.price <= (await planOf(u.plan)).price) redirect("/dashboard/plans");
  if (!(await allow("plan_request", String(u.id), 5, 86_400_000))) redirect(`/dashboard/plans/request?plan=${next.id}&error=limit`);
  const kind = String(form.get("kind") || "") as RequestKind;
  if (!(kind in REQUEST_KINDS)) redirect(`/dashboard/plans/request?plan=${next.id}&error=kind`);
  const org = String(form.get("org") || "").trim().slice(0, 120);
  const rawLink = String(form.get("link") || "").trim().slice(0, 300);
  // Shown to ops as a link: https only, never javascript: or data: (src/lib/safe-links.ts).
  const link = rawLink ? httpsLink(rawLink) : "";
  const volume = (VOLUMES as readonly string[]).includes(String(form.get("volume"))) ? String(form.get("volume")) : "";
  const note = String(form.get("note") || "").trim().slice(0, 1000);
  if (link === null) redirect(`/dashboard/plans/request?plan=${next.id}&error=link`);
  await q.run("UPDATE plan_requests SET status = 'withdrawn' WHERE user_id = ? AND status = 'pending'", u.id);
  await q.run(
    "INSERT INTO plan_requests (user_id, plan, kind, org, link, volume, note, created_at) VALUES (?,?,?,?,?,?,?,?)",
    u.id, next.id, kind, org, link, volume, note, now(),
  );
  await audit(u.id, "plan_requested", next.name);
  // A heads-up to the super admins; the request waits in ops either way.
  for (const to of env.adminEmails)
    await sendMail({ userId: null, to, subject: `Plan request: @${u.handle} asked for ${next.name}`, body: `@${u.handle} (${REQUEST_KINDS[kind]}${org ? `, ${org}` : ""}) asked for ${next.name}.\n\nReview it in ops: ${env.opsUrl}/admin/plan-requests` }).catch(() => {});
  done();
  redirect("/dashboard/plans?requested=1");
}

/** Takes back an open plan request. */
export async function withdrawPlanRequest() {
  const u = await requireRole("owner");
  if (await pendingRequest(u.id)) {
    await q.run("UPDATE plan_requests SET status = 'withdrawn' WHERE user_id = ? AND status = 'pending'", u.id);
    await audit(u.id, "plan_request_withdrawn", "");
  }
  done();
  redirect("/dashboard/plans");
}

/** Settings → Receiving: when a callout's closing date passes, move the link to the newest open collection (off by default). */
export async function setRerouteClosed(on: boolean) {
  const u = await requireRole("admin");
  await q.run("UPDATE users SET reroute_closed = ? WHERE id = ?", on ? 1 : 0, u.id);
  await audit(u.id, "settings_updated", on ? "link moves to an open collection when a callout closes" : "link stays put when a callout closes");
  done();
}
