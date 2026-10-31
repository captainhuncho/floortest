import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/auth";
import { env } from "@/lib/env";
import { ACCOUNT_TYPES } from "@/lib/account-types";
import { ReadySteps } from "./ReadySteps";

export const metadata = { title: "Your link is ready — FloorTest", robots: { index: false } };

/**
 * The end of the guided sign-up, once the account exists (the signup action lands here): check your email, add a
 * photo, your link is ready. Signed-in only; everything shown is the person's own.
 */
export default async function SignupReady() {
  const u = await currentPerson();
  if (!u) redirect("/login");
  const host = env.appUrl.replace(/^https?:\/\//, "");
  return (
    <ReadySteps
      host={host}
      origin={env.appUrl}
      firstName={u.first_name ?? ""}
      lastName={u.last_name ?? ""}
      handle={u.handle}
      email={u.email}
      verified={!!u.email_verified_at}
      role={ACCOUNT_TYPES[u.kind as keyof typeof ACCOUNT_TYPES]}
      cover={u.cover_key ? `/api/cover/${encodeURIComponent(u.handle)}?v=${encodeURIComponent(u.cover_key)}` : null}
    />
  );
}
