/**
 * Build check for team desks: every dashboard server action states who may call it, and calls the matching guard.
 * Server actions can be called directly (without the button), so a missing `requireRole` would let a Member do an
 * Owner's thing. A new action fails this check until it's added to ROLES below on purpose.
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
  "security.ts": { changePassword: "owner", signOutOtherDevices: "owner", startTwoFactor: "owner", confirmTwoFactor: "owner", disableTwoFactor: "owner", setSigninAlerts: "owner", disconnectGoogle: "owner" },
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

if (problems.length) {
  console.error("Desk role check failed:\n" + problems.map((p) => `  ${p}`).join("\n"));
  process.exit(1);
}
console.log("Desk role check: every dashboard action names who may call it and calls that guard.");
