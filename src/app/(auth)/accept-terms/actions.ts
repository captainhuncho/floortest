"use server";
import { redirect } from "next/navigation";
import { currentPerson, viewingAs } from "@/lib/auth";
import { q } from "@/lib/db";
import { afterResponse } from "@/lib/mail";
import { currentTerms, recordAcceptance } from "@/lib/terms-record";
import { termsPdfMail } from "@/lib/terms-mail";

/**
 * The tick on /accept-terms: records the person's acceptance of the exact Terms they were shown (the page sends the
 * text's hash; if the Terms changed while it was open they are asked to read the new ones), then emails their stamped
 * copy and opens the desk.
 */
export async function acceptTerms(_: unknown, form: FormData): Promise<{ error: string } | undefined> {
  if (await viewingAs()) return { error: "Only the person can accept the Terms, not an admin view." };
  const me = await currentPerson();
  if (!me) redirect("/login");
  if (form.get("tick") !== "on") return { error: "Tick the box to accept the Terms." };
  const terms = await currentTerms();
  if (form.get("version") !== terms.hash) return { error: "The Terms changed while this page was open. Read them again, then tick." };
  // The person's own address: on a team desk `me` is the team's account, `actor_id` the person signed in.
  const person = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", me.actor_id);
  if (!person) redirect("/login");
  const { row } = await recordAcceptance({ userId: me.actor_id }, person.name, terms);
  afterResponse(() => termsPdfMail({ userId: me.actor_id, email: person.email, name: person.name, acceptanceId: row.id }), "[terms] copy failed; the queue will retry");
  redirect("/dashboard/floor");
}
