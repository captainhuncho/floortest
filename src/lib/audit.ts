import "server-only";
import { now, q } from "./db";

/** Things the account holder can do, as they read in their activity log. */
export const AUDIT_LABELS = {
  signed_in: "Signed in",
  signed_out: "Signed out",
  password_reset: "Reset password",
  password_changed: "Changed password",
  signed_out_others: "Signed out other devices",
  kept: "Kept",
  passed: "Marked could be better",
  decision_cleared: "Moved back to review",
  decision_undone: "Undid decision on",
  listened: "Listened to",
  downloaded: "Downloaded",
  exported: "Exported crate",
  set_cleared: "Cleared Prepare for set",
  moved: "Moved",
  deleted_track: "Deleted",
  replied: "Replied to",
  noted: "Added a note on",
  blocked: "Blocked",
  unblocked: "Unblocked",
  collection_created: "Created collection",
  collection_activated: "Now routing to",
  collection_updated: "Edited collection",
  collection_deleted: "Deleted collection",
  link_paused: "Paused your link",
  link_resumed: "Reopened your link",
  notifications_updated: "Changed notification settings",
  digest_sent: "Sent yourself a digest",
  settings_updated: "Changed name or link",
  page_updated: "Changed public page",
  cover_updated: "Changed cover photo",
  cover_removed: "Removed cover photo",
  plan_changed: "Changed plan",
} as const;
export type AuditAction = keyof typeof AUDIT_LABELS;

export type AuditRow = { id: number; action: AuditAction; detail: string; track_id: number | null; created_at: number };

/** Records one thing the account holder did. Never throws: the audit trail must not break the action. */
export async function audit(userId: number, action: AuditAction, detail = "", trackId: number | null = null) {
  try {
    await q.run("INSERT INTO account_log (user_id, action, detail, track_id, created_at) VALUES (?,?,?,?,?)", userId, action, detail.slice(0, 300), trackId, now());
  } catch (e) {
    console.error("[audit] failed to record", action, e);
  }
}

export const recentAudit = (userId: number, limit = 50) =>
  q.all<AuditRow>("SELECT id, action, detail, track_id, created_at FROM account_log WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?", userId, limit);

export const trackLabel = (t: { artist: string; title: string }) => `${t.artist} – ${t.title}`;
