import Link from "next/link";
import { cookies } from "next/headers";
import { AuthFrame } from "../AuthFrame";
import { deletionStatus, RESTORE_COOKIE, restoreTicketUser } from "@/lib/account-deletion";
import { RestoreButton } from "./RestoreButton";

export const metadata = { title: "Restore your account — FloorTest", robots: { index: false } };

const day = (t: number) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(t);

/** The only page a switched-off account reaches after signing in: restore it, or leave it to be deleted. */
export default async function Restore() {
  const userId = await restoreTicketUser((await cookies()).get(RESTORE_COOKIE)?.value);
  const status = userId ? await deletionStatus(userId) : null;
  return (
    <AuthFrame>
      <div className="flex flex-col gap-8">
        {status?.purgeAt ? (
          <>
            <div className="flex flex-col gap-3">
              <h1 className="af-h">Your account is switched off</h1>
              <p className="text-[13px] text-mute">
                You asked to delete it. Everything on it will be deleted on {day(status.purgeAt)}. Until then you can restore it, and your link, desk and collections come back as they were.
              </p>
            </div>
            <RestoreButton />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <h1 className="af-h">Sign in to restore your account</h1>
              <p className="text-[13px] text-mute">This page opens after you sign in to an account you asked to delete. The link lasts 15 minutes.</p>
            </div>
            <Link href="/login" className="af-btn af-prime">
              Sign in
            </Link>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
