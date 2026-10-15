/**
 * Build check for team desks: every dashboard server action, and every API route that works on the signed-in desk,
 * states who may call it and calls the matching guard. Both can be called directly (without the button), so a missing
 * check would let a Member do an Owner's thing. A new one fails this check until it's added below on purpose.
 * Run: tsx scripts/check-desk-roles.ts (part of `npm run check:perms`).
 *
 *   owner   requireRole("owner"): account security, billing, plan, deleting the account (only on your own desk)
 *   admin   requireRole("admin"): links, routing, team tools, deleting, blocking
 *   member  requireUser(): anyone working the desk (review, notes, replies, comments)
 *   lib     requireUser(), with the role checked inside src/lib/account-members.ts (tested in tests/account-teams.test.ts)
 *   person  requirePerson(): the signed-in person, whatever desk they're on
 *   public  no sign-in (a cookie preference, or a private receipt link)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type Need = "owner" | "admin" | "member" | "lib" | "person" | "public";
const ROLES: Record<string, Record<string, Need>> = {
  "account-team.ts": { inviteTeammate: "lib", cancelTeamInvite: "lib", removeTeammate: "lib", changeTeamRole: "lib", saveReplyApproval: "lib", answerHeldReply: "lib", switchDesk: "person", joinTeam: "person" },
  "batch.ts": { batchTracks: "member" }, // deleting in a batch is refused to members inside the action
  "collections.ts": { createCollection: "member", setActiveCollection: "admin", updateCollection: "member", deleteCollection: "admin" },
  "desk.ts": { sendFeedback: "member", dismissOnboarding: "admin", lookupReceiver: "member", clearNotifications: "member", markNotificationsRead: "member", quickSearch: "member", pauseLink: "admin", resumeLink: "admin" },
  "links.ts": { createShareLink: "admin", resetShareLink: "admin", revokeShareLink: "admin", addLinkRecipients: "admin", removeLinkRecipient: "admin", answerLinkRequest: "admin", setLinkRequests: "admin" },
  "review.ts": {
    decideTrack: "member", clearDecision: "member", undoDecision: "member", moveTrack: "member", deleteTrack: "admin", clearKept: "admin", playedOut: "member", playedOutBatch: "admin", skipPlayedOutPrompt: "admin",
    getReplyTemplates: "member", saveReplyTemplate: "member", deleteReplyTemplate: "member", addNote: "member", replyToSender: "member", askForStems: "member",
    savePrep: "member", blockSender: "admin", decideRelease: "member",
  },
  "security.ts": { changePassword: "owner", signOutOtherDevices: "owner", signOutDevice: "owner", startTwoFactor: "owner", confirmTwoFactor: "owner", disableTwoFactor: "owner", setSigninAlerts: "owner", disconnectGoogle: "owner" },
  "settings.ts": {
    updateNotifications: "owner", sendDigestNow: "owner", updateSettings: "owner", updatePublicPage: "admin", setPlan: "owner", confirmBetaUpgrade: "owner",
    identityCode: "owner", submitIdentity: "owner", deleteAccount: "owner", changeMyEmail: "owner", cancelMyEmailChange: "owner", setTheme: "public",
    requestPlan: "owner", withdrawPlanRequest: "owner", setRerouteClosed: "admin",
  },
  "team.ts": { commentOnTrack: "member", deleteComment: "member", shortlistTrack: "member" },
};
const GUARD: Record<Need, string | null> = {
  owner: 'requireRole("owner")',
  admin: 'requireRole("admin")',
  member: "requireUser()",
  lib: "requireUser()",
  person: "requirePerson()",
  public: null,
};

const dir = join(__dirname, "../src/app/dashboard/actions");
const problems: string[] = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
  const parts = readFileSync(join(dir, file), "utf8").split(/^(?=export async function )/m);
  const listed = ROLES[file] ?? {};
  const seen = new Set<string>();
  for (const part of parts) {
    const name = part.match(/^export async function (\w+)/)?.[1];
    if (!name) continue;
    seen.add(name);
    const need = listed[name];
    if (!need) {
      problems.push(`${file}: ${name} isn't in ROLES (scripts/check-desk-roles.ts): decide who may call it`);
      continue;
    }
    const guard = GUARD[need];
    if (guard && !part.includes(guard)) problems.push(`${file}: ${name} is "${need}" so it must call ${guard}`);
    if ((need === "member" || need === "lib") && part.includes("requireRole(")) problems.push(`${file}: ${name} is "${need}" but calls requireRole: update ROLES`);
  }
  for (const name of Object.keys(listed)) if (!seen.has(name)) problems.push(`ROLES: ${file} ${name} isn't an action any more`);
}

/**
 * API routes on the signed-in desk (`currentUser()`). "admin" handlers must refuse Members themselves:
 * `!atLeast(user.role, "admin")` or `role === "member"`. "member" and "public" need nothing more.
 */
const ROUTES: Record<string, Record<string, "admin" | "member" | "public">> = {
  "collection-art/[id]": { GET: "member", POST: "member", DELETE: "member" }, // like updateCollection
  "collections/[id]/upload": { POST: "admin" },
  "collections/[id]/upload/complete": { POST: "admin" },
  "cover": { POST: "admin", DELETE: "admin" }, // part of the public page (updatePublicPage)
  "export": { GET: "member" },
  "offline/list": { GET: "member" },
  "pulse": { GET: "member" },
  "submit/[handle]": { POST: "member" }, // sending as the account is refused to members inside
  "track-art/[ref]": { GET: "public", POST: "public" }, // the sender's receipt token
  "tracks/[id]/analysis": { POST: "member" },
  "tracks/[id]/audio": { GET: "member" },
  "tracks/[id]/download": { GET: "member" },
  "tracks/[id]/listened": { POST: "member" },
  "tracks/[id]/stems/[stemId]": { GET: "member" },
  "tracks/[id]/stems/zip": { GET: "member" },
};
const REFUSES_MEMBERS = /!atLeast\(\w+\.role, "admin"\)|\.role === "member"/;
const api = join(__dirname, "../src/app/api");
const routeFiles = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? routeFiles(join(d, e.name)) : e.name === "route.ts" ? [join(d, e.name)] : []));
const seenRoutes = new Set<string>();
for (const path of routeFiles(api)) {
  const src = readFileSync(path, "utf8");
  if (!/\bcurrentUser\(/.test(src)) continue;
  const route = path.slice(api.length + 1, -"/route.ts".length);
  seenRoutes.add(route);
  const listed = ROUTES[route];
  if (!listed) {
    problems.push(`api/${route}: uses the signed-in desk but isn't in ROUTES (scripts/check-desk-roles.ts): decide who may call it`);
    continue;
  }
  for (const part of src.split(/^(?=export async function )/m)) {
    const method = part.match(/^export async function (GET|POST|PUT|PATCH|DELETE)\b/)?.[1];
    if (!method) continue;
    const need = listed[method];
    if (!need) problems.push(`api/${route}: ${method} isn't in ROUTES: decide who may call it`);
    else if (need === "admin" && !REFUSES_MEMBERS.test(part)) problems.push(`api/${route}: ${method} is "admin" so it must refuse Members (!atLeast(user.role, "admin"))`);
  }
}
for (const route of Object.keys(ROUTES)) if (!seenRoutes.has(route)) problems.push(`ROUTES: api/${route} doesn't use the signed-in desk any more`);

if (problems.length) {
  console.error("Desk role check failed:\n" + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log("Desk role check: every dashboard action and desk API route names who may call it and checks it.");
