/**
 * Test runs only (SEED_TERMS_ACCEPTED=1, set by playwright.config.ts), after scripts/seed.ts: the seeded accounts have
 * accepted the current Terms, so the desk doesn't send every seeded log-in to /accept-terms. Accounts a test signs up
 * accept at sign-up as everyone does. Run with the react-server condition and the next/link placeholder, as the unit
 * tests are, because the Terms text is read from the Terms page.
 */
import { getDb } from "../src/lib/db/client";
import { currentTerms } from "../src/lib/terms-record";

async function main() {
  if (process.env.SEED_TERMS_ACCEPTED !== "1") return;
  const terms = await currentTerms();
  const db = await getDb();
  const now = Date.now();
  await db.run(
    "INSERT INTO terms_acceptances (kind, user_id, email, version, hash, name, accepted_at, pdf_sent_at) SELECT 'account', id, email, ?, ?, name, ?, ? FROM users WHERE id NOT IN (SELECT user_id FROM terms_acceptances WHERE user_id IS NOT NULL)",
    terms.version,
    terms.hash,
    now,
    now,
  );
  await db.close();
  console.log(`Seeded Terms acceptance (${terms.version})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
