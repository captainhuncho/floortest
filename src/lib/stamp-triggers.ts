/**
 * The triggers that stamp times on insert or update (consent times, migrations 0134 and 0137; a plan request's time,
 * 0137). A restore or a copy turns them off while loading, so the times the backup holds are kept. Plain data with no
 * imports, so scripts that run without the server build (scripts/copy-to-neon.ts) can use it.
 */
export const STAMP_TRIGGERS = [
  { tbl: "users", name: "users_consent_times" },
  { tbl: "users", name: "users_consent_times_insert" },
  { tbl: "plan_requests", name: "plan_requests_created_at" },
] as const;
