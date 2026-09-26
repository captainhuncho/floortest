// Applies pending database migrations. Run on deploy: `npm run db:migrate` (uses DATABASE_URL).
import { getDb, migrate } from "../src/lib/db/client";

process.env.DB_AUTO_MIGRATE = "false";
(async () => {
  const db = await getDb();
  await migrate(db);
  const rows = await db.all<{ id: string }>("select id from schema_migrations order by id");
  console.log(`Database (${db.kind}) is at: ${rows.map((r) => r.id).join(", ")}`);
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
