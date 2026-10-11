import { requireUser } from "@/lib/auth";
import { teamsOn } from "@/lib/account-members";
import { SettingsNav } from "./SettingsNav";

/** Settings: short pages. Desktop has a left rail; phones reach each page from the Account menu. On a team desk the rail shows only what your role can open. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-5xl px-4 py-3 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-10 md:px-8 md:py-8">
      <SettingsNav role={user.role} teams={await teamsOn()} />
      <div className="min-w-0 max-w-3xl space-y-6 pb-10">{children}</div>
    </div>
  );
}
