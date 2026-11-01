/**
 * Who can do what in ops. The super admin (anyone in ADMIN_EMAILS) can do everything. Ops team members get their
 * role's defaults, plus or minus anything the super admin ticked for them. Powers in SUPER_ONLY can't be given to
 * anyone: they carry legal weight or could be used to take over an account.
 *
 * Plain data, no server imports, so the build check (scripts/check-admin-perms.ts) can read it too.
 */

export const PERMS = {
  overview: "Overview",
  metrics: "Metrics",
  usage: "Feature use",
  revenue: "Revenue (view)",
  storage: "Storage & costs",
  speed: "Speed",
  jobs: "Jobs",
  security: "Security",
  "incidents.read": "Incidents (view)",
  "incidents.act": "Incidents (mark handled)",
  "inbox.read": "Inbox (view)",
  "inbox.act": "Inbox (mark handled)",
  "feedback.read": "Feedback (view)",
  "feedback.act": "Feedback (triage)",
  "emails.read": "Emails sent (view)",
  "emails.act": "Emails sent (resend)",
  "users.read": "Users (view)",
  "users.support": "Users (suspend, restore, notes, tags)",
  "partners.read": "Beta partners (view)",
  "partners.act": "Beta partners (notes)",
  waitlist: "Waitlist",
  planRequests: "Plan requests (approve, decline)",
  invites: "Invites",
  announcements: "Announcements",
  switches: "Feature switches",
  content: "Site content",
  "plans.read": "Plans (view)",
  verification: "Verification (propose, send back requests, remove a mark)",
  // Never a role default (owner, 1 Nov): the super admin ticks these per person on Ops team.
  "verification.direct": "Verification (add the mark directly, with proof)",
  "verification.approve": "Verification (approve or decline proposals)",
  moderation: "Moderation",
  blocks: "Sender blocks",
} as const;

export type Perm = keyof typeof PERMS;
/** What a page or action needs: a permission, or "super" for the super admin alone. */
export type Need = Perm | "super";

export const ROLES = {
  care: "Customer Care",
  developer: "Developer",
  product: "Product Lead",
  sales: "Sales & Marketing",
} as const;
export type Role = keyof typeof ROLES;

export const ROLE_PERMS: Record<Role, Perm[]> = {
  care: ["overview", "inbox.act", "feedback.act", "emails.act", "users.support", "verification", "partners.read"],
  developer: ["overview", "incidents.act", "jobs", "storage", "speed", "security", "switches", "metrics"],
  product: ["overview", "metrics", "usage", "feedback.act", "announcements", "content", "switches", "plans.read", "partners.act"],
  sales: ["overview", "planRequests", "waitlist", "invites", "partners.act", "revenue", "announcements", "emails.read", "metrics"],
};

/** Shown on the Ops team page so the super admin knows what can never be handed out. */
export const SUPER_ONLY = [
  "Ops team",
  "Takedowns",
  "Data requests and exports",
  "Admin log",
  "Editing plans and prices, and changing someone's plan",
  "Deleting or erasing accounts",
  "Changing someone's email or handle, two-step reset, signing them out everywhere",
  "View as",
  "Users CSV export",
  "Storage file list download",
];

/** "x.act" includes "x.read"; "users.support" includes "users.read"; "verification.direct" and ".approve" include "verification". */
export function has(perms: ReadonlySet<Perm>, need: Perm) {
  if (perms.has(need)) return true;
  if (need.endsWith(".read")) {
    const base = need.slice(0, -5);
    return perms.has(`${base}.act` as Perm) || (base === "users" && perms.has("users.support"));
  }
  // Adding the mark directly or approving proposals includes opening Verification.
  if (need === "verification") return perms.has("verification.direct") || perms.has("verification.approve");
  return false;
}

/** Each admin page's requirement, by path under /admin. Pages not listed are super-admin only. */
export const PAGE_NEEDS: Record<string, Need> = {
  "/admin": "overview",
  "/admin/metrics": "metrics",
  "/admin/growth": "metrics",
  "/admin/usage": "usage",
  "/admin/revenue": "revenue",
  "/admin/storage": "storage",
  "/admin/speed": "speed",
  "/admin/jobs": "jobs",
  "/admin/security": "security",
  "/admin/incidents": "incidents.read",
  "/admin/inbox": "inbox.read",
  "/admin/feedback": "feedback.read",
  "/admin/emails": "emails.read",
  "/admin/accounts": "users.read",
  "/admin/partners": "partners.read",
  "/admin/waitlist": "waitlist",
  "/admin/plan-requests": "planRequests",
  "/admin/invites": "invites",
  "/admin/announcements": "announcements",
  "/admin/switches": "switches",
  "/admin/content": "content",
  "/admin/plans": "plans.read",
  "/admin/verification": "verification",
  "/admin/moderation": "moderation",
  "/admin/blocks": "blocks",
  "/admin/takedowns": "super",
  "/admin/privacy": "super",
  "/admin/log": "super",
  "/admin/team": "super",
};

/**
 * The requirement for a path: its own entry, else its nearest listed parent below /admin (so /admin/accounts/42
 * follows /admin/accounts). Overview's entry covers /admin itself only, so a new page is super-admin only until listed.
 */
export function needFor(path: string): Need {
  const clean = path.replace(/\/+$/, "") || "/admin";
  if (clean === "/admin") return PAGE_NEEDS["/admin"];
  for (let p = clean; p.startsWith("/admin/"); p = p.slice(0, p.lastIndexOf("/"))) if (PAGE_NEEDS[p]) return PAGE_NEEDS[p];
  return "super";
}

/** What every admin action needs. The build check fails if an exported action is missing here. */
export const ACTION_NEEDS: Record<string, Need> = {
  suspendAccount: "users.support",
  suspendAccounts: "users.support",
  tagAccounts: "users.support",
  paletteSearch: "users.read",
  unsuspendAccount: "users.support",
  liftSuppression: "users.support",
  saveTags: "users.support",
  addNote: "users.support",
  signOutEverywhere: "super",
  resetTwoFactor: "super",
  setPlanFor: "super",
  setExtraSeatsFor: "super",
  backupNow: "storage",
  checkStorage: "storage",
  startViewAs: "super",
  adminChangeHandle: "super",
  adminChangeEmail: "super",
  adminCancelEmailChange: "super",
  adminDeleteAccount: "super",
  adminEraseSender: "super",
  createInvite: "invites",
  revokeInvite: "invites",
  inviteByEmail: "invites",
  resendInvite: "invites",
  restoreInvite: "invites",
  deleteInvite: "invites",
  approvePlanRequest: "planRequests",
  declinePlanRequest: "planRequests",
  inviteFromWaitlist: "waitlist",
  inviteOldestFromWaitlist: "waitlist",
  removeFromWaitlist: "waitlist",
  removeTrackAsAdmin: "moderation",
  blockSenderAsAdmin: "moderation",
  keepTrack: "moderation",
  runJobNow: "jobs",
  resendEmail: "emails.act",
  setContactHandled: "inbox.act",
  // Approving their own request adds the mark, so it also needs "verification.direct" or "verification.approve"
  // (checked inside, src/lib/verification-proposals.ts approveRequest); plain "verification" forwards it as a proposal.
  approveIdentity: "verification",
  verifyDirectly: "verification.direct",
  proposeVerification: "verification",
  withdrawProposal: "verification",
  approveProposal: "verification.approve",
  declineProposal: "verification.approve",
  revokeIdentity: "verification",
  rejectIdentity: "verification",
  addProtectedName: "verification",
  removeProtectedName: "verification",
  addPlatformBlock: "blocks",
  blockEverywhere: "blocks",
  removePlatformBlock: "blocks",
  openTakedown: "super",
  decideTakedown: "super",
  saveSwitch: "switches",
  // Site-wide switches (open sign-up, billing, pause uploads) are business calls; per-feature rollouts are not.
  flipSwitch: "super",
  saveSwitchRule: "super",
  clearSwitchRule: "super",
  publishAnnouncement: "announcements",
  resolveIncident: "incidents.act",
  resolveAllIncidents: "incidents.act",
  savePartnerNote: "partners.act",
  setFeedbackStatus: "feedback.act",
  savePlan: "super",
  addPlan: "super",
  setPlanOffered: "super",
  deletePlan: "super",
  saveContent: "content",
  restoreContent: "content",
  discardDraft: "content",
  saveEmail: "content",
  sendTestEmail: "content",
  addOpsMember: "super",
  saveOpsMember: "super",
  setOpsMemberDisabled: "super",
};

export const parsePerms = (s: string | null | undefined) => (s ? (s.split(",").filter((p) => p in PERMS) as Perm[]) : []);
