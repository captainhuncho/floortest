import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

/** Where an ops team member lands when they open something outside their role. */
export default async function NoAccess() {
  const me = await requireAdmin();
  return (
    <div className="max-w-lg rounded-lg border border-line bg-ink-2 p-6">
      <h1 className="text-2xl font-bold tracking-tight">You don&apos;t have access to that</h1>
      <p className="mt-2 text-mute">It isn&apos;t part of your role. If you need it, ask the super admin to add it for you on the Ops team page.</p>
      {me.access.super || me.access.perms.has("overview") ? (
        <Link href="/admin" className="btn-lime btn-sm mt-5 inline-flex">Back to Overview</Link>
      ) : null}
    </div>
  );
}
