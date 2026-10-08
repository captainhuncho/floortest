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
  verification: "Verification",
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
];

/** "x.act" includes "x.read"; "users.support" includes "users.read". */
export function has(perms: ReadonlySet<Perm>, need: Perm) {
  if (perms.has(need)) return true;
  if (need.endsWith(".read")) {
    const base = need.slice(0, -5);
    return perms.has(`${base}.act` as Perm) || (base === "users" && perms.has("users.support"));
  }
  return false;
}

/** Each admin page's requirement, by path under /admin. Pages not listed are super-admin only. */
export const PAGE_NEEDS: Record<string, Need> = {
  "/admin": "overview",
  "/admin/metrics": "metrics",
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
  unsuspendAccount: "users.support",
  liftSuppression: "users.support",
  saveTags: "users.support",
  addNote: "users.support",
  signOutEverywhere: "super",
  resetTwoFactor: "super",
  setPlanFor: "super",
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
  approvePlanRequest: "planRequests",
  declinePlanRequest: "planRequests",
  inviteFromWaitlist: "waitlist",
  inviteOldestFromWaitlist: "waitlist",
  removeFromWaitlist: "waitlist",
  removeTrackAsAdmin: "moderation",
  blockSenderAsAdmin: "moderation",
  resendEmail: "emails.act",
  setContactHandled: "inbox.act",
  approveIdentity: "verification",
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
