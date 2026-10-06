/**
 * Ordered Postgres migrations. Append new ones; never edit an applied one.
 * Timestamps are epoch milliseconds (bigint) throughout.
 */
export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
create table users (
  id bigint generated always as identity primary key,
  email text not null unique,
  password_hash text not null,
  name text not null,
  handle text not null unique,
  plan text not null default 'free',
  active_collection_id bigint,
  role_line text not null default '',
  cover_key text,
  page_style text not null default 'classic' check (page_style in ('classic', 'stage')),
  notifications_seen_at bigint,
  notify_submissions text not null default 'digest' check (notify_submissions in ('instant', 'digest', 'off')),
  digest_hour int not null default 9,
  quiet_start int,
  quiet_end int,
  notify_alerts int not null default 1,
  tz text not null default 'UTC',
  last_digest_at bigint,
  alert_full_sent_at bigint,
  referral_code text unique,
  referred_by bigint references users(id) on delete set null,
  referral_rewarded_at bigint,
  bonus_songs int not null default 0,
  paused_at bigint,
  pause_until bigint,
  pause_message text not null default '',
  created_at bigint not null
);

create table sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at bigint not null,
  created_at bigint not null
);
create index sessions_user on sessions(user_id);

create table password_resets (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  expires_at bigint not null,
  used_at bigint,
  created_at bigint not null
);

create table collections (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  name text not null,
  created_at bigint not null,
  closes_at bigint,
  brief_wanted text not null default '',
  bpm_min int,
  bpm_max int,
  brief_note text not null default '',
  genres text not null default ''
);
create index collections_user on collections(user_id);
alter table users add constraint users_active_collection_fk
  foreign key (active_collection_id) references collections(id) on delete set null;

create table senders (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  email text not null,
  name text not null,
  created_at bigint not null,
  verified_at bigint,
  verify_token text unique,
  blocked_at bigint,
  unique (user_id, email)
);

create table tracks (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  collection_id bigint references collections(id) on delete set null,
  sender_id bigint not null references senders(id) on delete cascade,
  token text not null unique,
  title text not null,
  artist text not null,
  message text not null default '',
  release_status text not null default '',
  mix_status text not null default '',
  genre text not null default '',
  file_key text,
  original_name text not null,
  mime text not null,
  size bigint not null,
  duration double precision,
  bpm double precision,
  peaks text,
  played_at bigint,
  downloaded_at bigint,
  decision text check (decision in ('kept', 'passed')),
  decided_at bigint,
  replied_at bigint,
  receiver_notified_at bigint,
  deleted_at bigint,
  created_at bigint not null
);
create index tracks_user_live on tracks(user_id, deleted_at, created_at);
create index tracks_sender on tracks(sender_id);
create index tracks_collection on tracks(collection_id);

create table events (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  sender_id bigint not null references senders(id) on delete cascade,
  track_id bigint references tracks(id) on delete set null,
  type text not null,
  detail text not null default '',
  created_at bigint not null
);
create index events_user on events(user_id, created_at desc);
create index events_sender on events(sender_id, created_at);

create table outbox (
  id bigint generated always as identity primary key,
  user_id bigint references users(id) on delete cascade,
  to_email text not null,
  subject text not null,
  body text not null,
  status text not null,
  audience text not null default 'sender',
  created_at bigint not null
);
create index outbox_user on outbox(user_id, audience, created_at desc);

-- Sliding-window rate limits (uploads per IP/email, logins, contact form, resets).
create table rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  key text not null,
  created_at bigint not null
);
create index rate_events_lookup on rate_events(bucket, key, created_at);

-- Direct-to-storage uploads that have been authorised but not yet completed.
create table uploads (
  id text primary key,
  receiver_id bigint not null references users(id) on delete cascade,
  file_key text not null,
  ext text not null,
  size bigint not null,
  meta text not null,
  ip text not null,
  created_at bigint not null
);
`,
  },
  {
    // Hosted Postgres (e.g. Supabase) may expose the public schema through an HTTP API with a
    // public key. FloorTest never uses that API, so lock every table: with RLS on and no policies,
    // API roles see nothing. The app connects as the table owner, which RLS doesn't restrict.
    id: "0002_lock_public_api",
    sql: `
alter table users enable row level security;
alter table sessions enable row level security;
alter table password_resets enable row level security;
alter table collections enable row level security;
alter table senders enable row level security;
alter table tracks enable row level security;
alter table events enable row level security;
alter table outbox enable row level security;
alter table rate_events enable row level security;
alter table uploads enable row level security;
alter table schema_migrations enable row level security;
`,
  },
  {
    // What the account holder did, for their own audit trail. Separate from desk events, which
    // are mostly about senders and tracks and can't carry account-level actions.
    id: "0003_account_log",
    sql: `
create table account_log (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  action text not null,
  detail text not null default '',
  track_id bigint references tracks(id) on delete set null,
  created_at bigint not null
);
create index account_log_user on account_log(user_id, created_at desc);
alter table account_log enable row level security;
`,
  },
  {
    // Prepare for set works in batches: clearing takes kept tracks off the page without un-keeping them.
    id: "0004_set_cleared",
    sql: `
alter table tracks add column set_cleared_at bigint;
`,
  },
  {
    id: "0005_invite_code",
    sql: `
alter table users add column invite_code text;
create index users_invite_code on users(invite_code);
`,
  },
  {
    // Account security: verified receiver emails, optional authenticator-app sign-in, sign-in alerts.
    // Accounts created before this are treated as verified.
    id: "0006_account_security",
    sql: `
alter table users add column email_verified_at bigint;
update users set email_verified_at = created_at;
alter table users add column email_verify_token text unique;
alter table users add column totp_secret text;
alter table users add column totp_enabled_at bigint;
alter table users add column totp_last_step bigint;
alter table users add column recovery_codes text not null default '[]';
alter table users add column signin_alerts int not null default 1;
`,
  },
  {
    // Platform admin: suspensions, invite codes managed in-app, and a log of every admin action.
    id: "0007_admin",
    sql: `
alter table users add column suspended_at bigint;
alter table users add column suspended_reason text not null default '';
create table invites (
  code text primary key,
  max_uses int not null default 25,
  note text not null default '',
  created_at bigint not null,
  revoked_at bigint
);
create table admin_log (
  id bigint generated always as identity primary key,
  admin_id bigint references users(id) on delete set null,
  action text not null,
  target text not null default '',
  detail text not null default '',
  created_at bigint not null
);
create index admin_log_time on admin_log(created_at desc);
alter table invites enable row level security;
alter table admin_log enable row level security;
`,
  },
  {
    // Support tools: a contact inbox and a feed of things that went wrong.
    id: "0008_support",
    sql: `
create table contact_messages (
  id bigint generated always as identity primary key,
  user_id bigint references users(id) on delete set null,
  name text not null,
  email text not null,
  topic text not null,
  message text not null,
  handled_at bigint,
  created_at bigint not null
);
create index contact_messages_time on contact_messages(created_at desc);
create table incidents (
  id bigint generated always as identity primary key,
  kind text not null,
  message text not null,
  detail text not null default '',
  path text not null default '',
  created_at bigint not null
);
create index incidents_time on incidents(created_at desc);
alter table contact_messages enable row level security;
alter table incidents enable row level security;
`,
  },
  {
    // Personal invites: a single-use code tied to one email address.
    id: "0009_invite_email",
    sql: `
alter table invites add column email text;
alter table invites add column sent_at bigint;
create index invites_email on invites(email);
`,
  },
  {
    // Beta features: waitlist, onboarding checklist, reply templates, "played it out".
    id: "0010_beta_features",
    sql: `
create table waitlist (
  id bigint generated always as identity primary key,
  email text not null unique,
  name text not null default '',
  role text not null default '',
  link text not null default '',
  note text not null default '',
  invited_at bigint,
  created_at bigint not null
);
alter table waitlist enable row level security;
alter table users add column onboarding_dismissed_at bigint;
alter table users add column reply_templates text not null default '[]';
alter table tracks add column played_out_at bigint;
alter table tracks add column played_out_note text not null default '';
`,
  },
  {
    // Duplicate flags, 14-day follow-up nudges, and small app-wide state (e.g. last admin digest).
    id: "0011_standby_batch",
    sql: `
alter table tracks add column duplicate_of bigint references tracks(id) on delete set null;
alter table tracks add column nudged_at bigint;
create table app_state (
  key text primary key,
  value text not null,
  updated_at bigint not null
);
alter table app_state enable row level security;
`,
  },
  {
    // Light identity verification (profile links + a code in a bio, reviewed by staff) and
    // link names that can't be claimed without staff approval.
    id: "0012_identity",
    sql: `
alter table users add column identity_status text not null default 'none' check (identity_status in ('none', 'pending', 'verified', 'rejected'));
alter table users add column identity_code text;
alter table users add column identity_links text not null default '[]';
alter table users add column identity_note text not null default '';
alter table users add column identity_submitted_at bigint;
alter table users add column identity_verified_at bigint;
create table protected_names (
  handle text primary key,
  note text not null default '',
  created_at bigint not null
);
alter table protected_names enable row level security;
`,
  },
  {
    // Receivers can send music too, from their account: the sender row remembers which account it was.
    id: "0013_account_sends",
    sql: `
alter table senders add column account_id bigint references users(id) on delete set null;
create index senders_account on senders(account_id);
`,
  },
  {
    // Repair two placeholder values that escaped into Maxwell's beta receiver page.
    // The exact predicates make this a no-op for every other account and collection.
    id: "0014_maxwell_public_page_repair",
    sql: `
update users set role_line = 'DJ / Performer' where handle = 'maxwell' and role_line = 'MA?';
update collections set name = 'Afterlife'
where name = 'MA?' and user_id = (select id from users where handle = 'maxwell');
`,
  },
  {
    // The link name someone typed on the home page before joining the waitlist. Not reserved: a hint for their invite.
    id: "0015_waitlist_handle",
    sql: `
alter table waitlist add column handle text not null default '';
`,
  },
  {
    // Storage heads-up at 80%, a warning before auto-deletion, and opt-in product news.
    id: "0016_storage_and_product_notices",
    sql: `
alter table users add column alert_80_sent_at bigint;
alter table users add column notify_product int not null default 0;
alter table tracks add column expiry_warned_at bigint;
`,
  },
  {
    // "Clear all" in the bell hides everything before this moment.
    id: "0017_notifications_cleared",
    sql: `
alter table users add column notifications_cleared_at bigint;
`,
  },
  {
    // Receivers can ask for stems; senders upload them to the track from their receipt page.
    id: "0018_stems",
    sql: `
alter table tracks add column stems_requested_at bigint;
create table stems (
  id bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  file_key text not null,
  name text not null,
  mime text not null,
  size bigint not null,
  created_at bigint not null
);
create index stems_track on stems(track_id);
alter table stems enable row level security;
`,
  },
  {
    // Sharing with colleagues: a collection can allow it; each track remembers whether it was allowed when it was sent.
    id: "0019_sharing",
    sql: `
alter table collections add column allow_sharing int not null default 0;
alter table tracks add column share_ok int not null default 0;
create table track_shares (
  id bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  token text not null unique,
  created_at bigint not null,
  expires_at bigint not null,
  revoked_at bigint,
  plays int not null default 0
);
create index track_shares_track on track_shares(track_id);
alter table track_shares enable row level security;
`,
  },
  {
    // Set prep on kept tracks: an energy rating (1–5) and labelled cue points, exported to Rekordbox.
    id: "0020_cues_energy",
    sql: `
alter table tracks add column energy int check (energy between 1 and 5);
alter table tracks add column cues text not null default '[]';
`,
  },
  {
    // Colleague downloads from share links (paid plans only).
    id: "0021_share_downloads",
    sql: `
alter table track_shares add column downloads int not null default 0;
`,
  },
  {
    // Share downloads are fixed by the receiver's plan when the track was sent; colleagues sign in, and access is logged per account.
    id: "0022_share_accounts",
    sql: `
alter table tracks add column share_download int not null default 0;
create table share_access (
  id bigint generated always as identity primary key,
  share_id bigint not null references track_shares(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  kind text not null check (kind in ('play', 'download')),
  created_at bigint not null
);
create index share_access_share on share_access(share_id);
alter table share_access enable row level security;
`,
  },
  {
    // A receiver asks the artist, per track, to share it with a non-commercial partner (playing and promotion only).
    id: "0023_share_requests",
    sql: `
create table share_requests (
  id bigint generated always as identity primary key,
  track_id bigint not null references tracks(id) on delete cascade,
  note text not null default '',
  downloads int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'allowed', 'declined')),
  created_at bigint not null,
  decided_at bigint
);
create index share_requests_track on share_requests(track_id);
alter table share_requests enable row level security;
`,
  },
  {
    // An artist's Allow has a cancel window; a cancelled consent is kept for the record.
    id: "0024_share_consent_cancel",
    sql: `
alter table share_requests drop constraint if exists share_requests_status_check;
alter table share_requests add constraint share_requests_status_check check (status in ('pending', 'allowed', 'declined', 'cancelled'));
`,
  },
{
    // Platform-wide sender blocks (one address or a whole domain), and copyright takedown cases.
    id: "0025_blocks_takedowns",
    sql: `
create table platform_blocks (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('email', 'domain')),
  value text not null unique,
  reason text not null default '',
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
alter table platform_blocks enable row level security;
create table takedowns (
  id bigint generated always as identity primary key,
  track_id bigint references tracks(id) on delete set null,
  track_label text not null default '',
  claimant text not null,
  claimant_email text not null,
  basis text not null default '',
  status text not null default 'open' check (status in ('open', 'removed', 'rejected')),
  notes text not null default '',
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null,
  decided_at bigint
);
create index takedowns_status on takedowns(status);
alter table takedowns enable row level security;
`,
  },
{
    // Every suspension and restore on an account, kept as history (the users row only holds the current state).
    id: "0026_account_actions",
    sql: `
create table account_actions (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  kind text not null check (kind in ('suspended', 'unsuspended')),
  reason text not null default '',
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
create index account_actions_user on account_actions(user_id, created_at desc);
alter table account_actions enable row level security;
`,
  },
{
    // Announcements to users (bell, optional email), and admin feature switches.
    id: "0027_announcements_switches",
    sql: `
create table announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null default '',
  href text not null default '',
  audience text not null default 'all' check (audience in ('all', 'free', 'pro', 'team')),
  emailed int not null default 0,
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
create index announcements_time on announcements(created_at desc);
alter table announcements enable row level security;
create table feature_switches (
  feature text primary key,
  plans text not null default '[]',
  users text not null default '[]',
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null
);
alter table feature_switches enable row level security;
`,
  },
{
    // Email changes wait for a click from the new address; old handles forward (and stay reserved) for a while.
    id: "0028_email_change_handle_history",
    sql: `
alter table users add column pending_email text;
alter table users add column pending_email_token text unique;
alter table users add column pending_email_at bigint;
create table handle_history (
  old_handle text primary key,
  user_id bigint not null references users(id) on delete cascade,
  forward int not null default 1,
  created_at bigint not null,
  expires_at bigint not null
);
create index handle_history_user on handle_history(user_id);
alter table handle_history enable row level security;
`,
  },
{
    // Where people came from (UTM tags or the referring site), for the waitlist and sign-ups.
    id: "0029_sources",
    sql: `
alter table waitlist add column source text not null default '';
alter table users add column signup_source text not null default '';
`,
  },
{
    // A consent becomes final exactly once: cancel and finalise both claim the row, and only one can win.
    id: "0030_share_consent_final",
    sql: `
alter table share_requests add column finalized_at bigint;
update share_requests r set finalized_at = r.decided_at from tracks t where t.id = r.track_id and r.status = 'allowed' and t.share_ok = 1;
`,
  },
{
    // Files waiting to be deleted from storage. Recorded before the rows that point to them go, so none is lost.
    id: "0031_storage_deletions",
    sql: `
create table storage_deletions (
  file_key text primary key,
  reason text not null default '',
  attempts int not null default 0,
  last_error text,
  created_at bigint not null,
  last_attempt_at bigint
);
alter table storage_deletions enable row level security;
`,
  },
{
    // Incidents can be marked handled; indexes for the nightly jobs and admin queries as data grows.
    id: "0032_resolved_and_indexes",
    sql: `
alter table incidents add column resolved_at bigint;
create index incidents_kind_time on incidents(kind, created_at desc);
create index tracks_retention_unreviewed on tracks(created_at) where deleted_at is null and decision is null;
create index tracks_retention_passed on tracks(decided_at) where deleted_at is null and decision = 'passed';
create index tracks_played_out on tracks(played_out_at) where played_out_at is not null;
create index rate_events_time on rate_events(created_at);
create index account_log_time on account_log(created_at);
create index outbox_status_time on outbox(status, created_at desc);
`,
  },
{
    // Site-wide on/off switches flipped from admin (sharing, bot check, open sign-up, pause uploads).
    id: "0033_switches",
    sql: `
create table switches (
  key text primary key,
  on_ int not null,
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null
);
alter table switches enable row level security;
`,
  },
{
    // Sign in with a 6-digit code emailed to the account address (instead of a password).
    id: "0034_login_codes",
    sql: `
create table login_codes (
  user_id bigint primary key references users(id) on delete cascade,
  code_hash text not null,
  attempts int not null default 0,
  expires_at bigint not null,
  created_at bigint not null
);
alter table login_codes enable row level security;
`,
  },
{
    // Send folders (paid, off in the beta): tracks sent together share a batch id so the receiver sees them as one folder.
    id: "0035_track_batches",
    sql: `
alter table tracks add column batch_id text;
create index tracks_batch on tracks(batch_id) where batch_id is not null;
`,
  },
{
    // Onboarding emails, each sent once: welcome on confirming the email, and a nudge 7 days later if nothing has arrived.
    id: "0036_onboarding_emails",
    sql: `
alter table users add column welcomed_at bigint;
alter table users add column first_track_nudged_at bigint;
update users set welcomed_at = created_at, first_track_nudged_at = created_at;
`,
  },
{
    // Shared collections (Team): teammates can listen to a collection's tracks and vote keep or pass with a note. The owner decides.
    id: "0037_shared_collections",
    sql: `
create table collection_members (
  collection_id bigint not null references collections(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  added_at bigint not null,
  primary key (collection_id, user_id)
);
create index collection_members_user on collection_members(user_id);
create table track_votes (
  track_id bigint not null references tracks(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  vote text not null check (vote in ('keep','pass')),
  note text not null default '',
  created_at bigint not null,
  primary key (track_id, user_id)
);
alter table collection_members enable row level security;
alter table track_votes enable row level security;
`,
  },
{
    // Playing a track in DJ sets is the sender's choice (off by default). Tracks sent earlier were sent under terms that allowed it.
    id: "0038_sets_consent",
    sql: `
alter table tracks add column sets_ok int not null default 0;
update tracks set sets_ok = 1;
`,
  },
{
    // Link names can change once a year; an undo back to the old name within the hold doesn't count.
    id: "0039_handle_changed_at",
    sql: `
alter table users add column handle_changed_at bigint;
`,
  },
{
    // Tap speed: how long the screen takes to respond after a tap or key press. No account, IP or query string is stored.
    id: "0040_tap_speed",
    sql: `
create table tap_timings (
  id bigint generated always as identity primary key,
  created_at bigint not null,
  path text not null,
  target text not null default '',
  ms int not null,
  device text not null default '',
  browser text not null default ''
);
create index tap_timings_created on tap_timings(created_at);
alter table tap_timings enable row level security;
`,
  },
{
    // Speed: besides taps, page changes inside the app ("nav") and the first appearance of a freshly opened page ("load").
    id: "0041_speed_kinds",
    sql: `
alter table tap_timings add column kind text not null default 'tap';
create index tap_timings_kind on tap_timings(kind, created_at);
`,
  },
{
    // Removes one batch of four fake timings sent to production by mistake while testing on 2026-10-05.
    // Matched by its exact values and the single timestamp the batch was saved with, so no real timing can match.
    id: "0042_remove_test_timings",
    sql: `
delete from tap_timings where created_at in (
  select created_at from tap_timings
  where path = '/dashboard/collections/:id' and ms = 850 and device = 'phone' and browser = 'Safari' and target = 'link'
) and device = 'phone' and browser = 'Safari' and (
  (path = '/dashboard/collections/:id' and ms = 850 and target = 'link') or
  (path = '/:link' and ms = 1400 and target = 'page') or
  (path = '/dashboard' and ms = 40 and target = 'Keep') or
  (path = '/:link' and ms = 20 and target = '')
);
`,
  },
{
    // Beta partners and feedback: when each account was last active (updated at most hourly), the admin's call notes
    // per person (by email, so invites not yet used can have notes too), and feedback status and page.
    id: "0043_partners_feedback",
    sql: `
alter table users add column last_active_at bigint;
create table partner_notes (
  email text primary key,
  note text not null default '',
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null
);
alter table partner_notes enable row level security;
alter table contact_messages add column feedback_status text not null default 'new' check (feedback_status in ('new', 'planned', 'fixed', 'wontdo'));
alter table contact_messages add column page text not null default '';
update contact_messages set page = substring(message from '\nPage: ([^\n]*)$'), message = regexp_replace(message, '\n\nPage: [^\n]*$', '')
  where topic like 'Feedback%' and message ~ '\nPage: [^\n]*$';
`,
  },
{
    // Scheduled job history (the latest run per job stays in app_state for the Overview); kept 90 days.
    id: "0044_job_runs",
    sql: `
create table job_runs (
  id bigint generated always as identity primary key,
  job text not null,
  started_at bigint not null,
  ms int not null,
  ok int not null,
  result text not null default ''
);
create index job_runs_job on job_runs(job, started_at);
alter table job_runs enable row level security;
`,
  },
{
    // Delivery tracking from Resend's webhooks: what happened after an email left us, and addresses we stop emailing
    // because they bounced for good or marked us as spam.
    id: "0045_email_delivery",
    sql: `
alter table outbox add column provider_id text;
alter table outbox add column delivery text not null default '';
alter table outbox add column delivery_at bigint;
create index outbox_provider on outbox(provider_id) where provider_id is not null;
create table email_suppressions (
  email text primary key,
  reason text not null check (reason in ('bounced', 'complained')),
  detail text not null default '',
  created_at bigint not null
);
alter table email_suppressions enable row level security;
`,
  },
{
    // Feature use: per account, per day, how often each part of FloorTest was used (no content), for Admin → Feature use.
    id: "0046_feature_use",
    sql: `
create table feature_use (
  user_id bigint not null references users(id) on delete cascade,
  feature text not null,
  day text not null,
  uses int not null default 1,
  primary key (user_id, feature, day)
);
create index feature_use_day on feature_use(day);
alter table feature_use enable row level security;
`,
  },
{
    // Indexes for the queries that run most (backend review, 2026-10-05): the Review Queue's status filters,
    // the duplicate check on every upload, email lookups that ignore case, foreign keys that cascades scan,
    // and the nightly clean-up's age filters. Small tables today, so building them here is quick.
    id: "0047_query_indexes",
    sql: `
create index tracks_user_decision on tracks(user_id, decision, created_at) where deleted_at is null;
create index tracks_user_decided on tracks(user_id, decided_at desc) where deleted_at is null and decision is not null;
create index tracks_user_size on tracks(user_id, size) where deleted_at is null;
create index tracks_sender_title on tracks(sender_id, lower(title)) where deleted_at is null;
create index tracks_duplicate_of on tracks(duplicate_of) where duplicate_of is not null;
create index events_track on events(track_id) where track_id is not null;
create index events_time on events(created_at);
create index contact_messages_user on contact_messages(user_id) where user_id is not null;
create index share_access_user on share_access(user_id);
create index share_access_time on share_access(created_at);
create index senders_email_lower on senders(lower(email));
create index outbox_to_lower on outbox(lower(to_email));
create index outbox_time on outbox(created_at);
create index uploads_receiver on uploads(receiver_id);
create index uploads_time on uploads(created_at);
`,
  },
{
    // Rules the database enforces itself (backend review, 2026-10-05). NOT VALID: they apply to every new or changed
    // row without re-checking old ones, so the update can't fail on historic data. Link names are unique whatever their case.
    id: "0048_constraints",
    sql: `
alter table users add constraint users_plan_known check (plan in ('free', 'pro', 'team')) not valid;
alter table users add constraint users_signin_alerts_flag check (signin_alerts in (0, 1)) not valid;
alter table tracks add constraint tracks_size_positive check (size >= 0) not valid;
alter table tracks add constraint tracks_flags check (share_ok in (0, 1) and share_download in (0, 1) and sets_ok in (0, 1)) not valid;
alter table tracks add constraint tracks_decision_known check (decision is null or decision in ('kept', 'passed')) not valid;
alter table collections add constraint collections_bpm_range check (bpm_min is null or bpm_max is null or bpm_min <= bpm_max) not valid;
alter table collections add constraint collections_sharing_flag check (allow_sharing in (0, 1)) not valid;
create unique index users_handle_lower on users(lower(handle));
`,
  },
{
    // Plans move from code into the database so Admin → Plans can change prices, limits, names, feature lists and
    // which features each plan unlocks, and add or retire plans. Seeded with today's three plans exactly.
    id: "0049_plans_table",
    sql: `
create table plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]{1,23}$'),
  name text not null,
  price_cents int not null default 0 check (price_cents >= 0),
  track_limit int not null check (track_limit > 0),
  blurb text not null default '',
  features text not null default '[]',
  share_downloads int not null default 0 check (share_downloads in (0, 1)),
  featured int not null default 0 check (featured in (0, 1)),
  position int not null default 0,
  retired_at bigint,
  updated_at bigint not null
);
alter table plans enable row level security;
insert into plans (id, name, price_cents, track_limit, blurb, features, share_downloads, featured, position, updated_at) values
  ('free', 'Free', 0, 20, 'Delete a track and the slot returns',
   '["20 active tracks","Your receiving link and public page","Review Queue, collections and Rekordbox export","Receipts and updates for your senders"]', 0, 0, 1, 0),
  ('pro', 'Pro', 699, 500, 'For active DJs and curators',
   '["500 active tracks","Everything in Free","Colleagues can download tracks you share","Paid features as they launch (stems, folders)"]', 1, 1, 2, 0),
  ('team', 'Team', 1299, 2000, 'For labels and crews who listen together',
   '["2,000 active tracks","Everything in Pro","Shared collections: up to 10 teammates listen and vote"]', 1, 0, 3, 0);
alter table users drop constraint if exists users_plan_known;
alter table users add constraint users_plan_fk foreign key (plan) references plans(id) not valid;
`,
  },
  {
    // Site wording and images edited in Admin → Site content: a draft and a published copy per page, plus every
    // published version so an older one can be restored.
    id: "0050_site_content",
    sql: `
create table site_content (
  page text primary key,
  draft text not null default '{}',
  published text not null default '{}',
  admin_id bigint references users(id) on delete set null,
  updated_at bigint not null,
  published_at bigint
);
create table site_content_versions (
  id bigint generated always as identity primary key,
  page text not null,
  body text not null,
  admin_id bigint references users(id) on delete set null,
  created_at bigint not null
);
create index site_content_versions_page on site_content_versions (page, created_at desc);
alter table site_content enable row level security;
alter table site_content_versions enable row level security;
`,
  },
  {
    // Who the account is for: a DJ/curator, a producer, or a label/A&R team. Asked at sign-up so beta feedback can be told apart;
    // existing accounts stay unset until they pick in Settings.
    id: "0051_user_kind",
    sql: `
alter table users add column kind text check (kind in ('dj', 'producer', 'label'));
`,
  },
  {
    // Proof of agreement at sign-up: when the person ticked "18 or over and agree to the Terms", and which Terms
    // (the date on the legal pages). Older accounts agreed through the sign-up notice and stay unset.
    id: "0052_terms_acceptance",
    sql: `
alter table users add column terms_accepted_at bigint;
alter table users add column terms_version text;
`,
  },
  {
    // Senders must say whether AI was used to make a track; receivers see it on the track. Older tracks stay unset.
    id: "0053_track_ai_use",
    sql: `
alter table tracks add column ai_use text check (ai_use in ('none', 'partial', 'full'));
`,
  },
  {
    // Admin CRM: announcements go to an exact list of people chosen by filters (plan, account type, tag, joined,
    // activity), so the bell and email always reach the same audience. Older announcements are backfilled to who
    // they reached then. Plus private admin tags and notes on accounts.
    id: "0054_admin_crm",
    sql: `
create table announcement_recipients (
  announcement_id bigint not null references announcements(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  primary key (announcement_id, user_id)
);
create index announcement_recipients_user on announcement_recipients (user_id);
insert into announcement_recipients (announcement_id, user_id)
  select a.id, u.id from announcements a join users u on (a.audience = 'all' or u.plan = a.audience) and u.created_at <= a.created_at;
alter table announcements drop constraint if exists announcements_audience_check;
update announcements set audience = case audience when 'all' then 'Everyone' when 'free' then 'Free' when 'pro' then 'Pro' when 'team' then 'Team' else audience end;
alter table announcement_recipients enable row level security;
alter table users add column admin_tags text not null default '';
create table account_notes (
  id bigint generated always as identity primary key,
  user_id bigint not null references users(id) on delete cascade,
  admin_id bigint references users(id) on delete set null,
  body text not null,
  created_at bigint not null
);
create index account_notes_user on account_notes (user_id, created_at desc);
alter table account_notes enable row level security;
`,
  },
];
