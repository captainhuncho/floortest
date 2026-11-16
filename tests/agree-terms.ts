/**
 * Ticks the current Terms for a test account. Nobody uses the desk or the app without agreeing (owner, 15 Nov), so a
 * test that signs someone in to use them agrees first, as a real person would.
 */
export async function agreeTerms(userId: number) {
  const { q } = await import("../src/lib/db");
  const { currentTerms, recordAcceptance } = await import("../src/lib/terms-record");
  const u = (await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", userId))!;
  await recordAcceptance({ userId, email: u.email }, u.name, await currentTerms());
}
