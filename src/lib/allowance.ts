import { BACKUP_KEEP_DAYS, lastBackup } from "@/lib/backup";
import { q } from "@/lib/db";

/** Free-plan allowances. Update these when a plan changes. */
export const FILES_ALLOWANCE = 10 * 1024 ** 3; // Cloudflare R2 free tier: 10 GB
export const DATABASE_ALLOWANCE = 500 * 1024 ** 2; // Supabase free plan: 500 MB database
/** From this share of an allowance, the admin Overview shows a to-do. */
export const ALLOWANCE_WARN = 0.8;

export type Allowance = { label: string; used: number; limit: number; note: string };

/** How full each storage allowance is: audio and backups in R2, and the Postgres database. */
export async function allowances(): Promise<Allowance[]> {
  const n = async (sql: string) => Number((await q.get<{ n: string | number | null }>(sql))?.n ?? 0);
  const audio =
    (await n("SELECT COALESCE(SUM(size), 0) AS n FROM tracks WHERE file_key IS NOT NULL AND deleted_at IS NULL")) +
    (await n("SELECT COALESCE(SUM(size), 0) AS n FROM stems")) +
    (await n("SELECT COALESCE(SUM(size), 0) AS n FROM uploads"));
  // Each night's backup is kept BACKUP_KEEP_DAYS days in the same bucket.
  const backups = ((await lastBackup())?.bytes ?? 0) * BACKUP_KEEP_DAYS;
  const database = await n("SELECT pg_database_size(current_database()) AS n");
  return [
    { label: "File storage (Cloudflare R2)", used: audio + backups, limit: FILES_ALLOWANCE, note: "Audio, stems, unfinished uploads and backups. Past the free 10 GB it's billed per GB, not blocked." },
    { label: "Database (Supabase)", used: database, limit: DATABASE_ALLOWANCE, note: "Accounts, track details and activity. At 500 MB the free plan goes read-only, so upgrade before then." },
  ];
}
