import { requireUser } from "@/lib/auth";
import { teamsOn } from "@/lib/account-members";
import { SettingsNav } from "./SettingsNav";

/** Settings: short pages. Desktop has a left rail; phones reach each page from the Account menu. On a team desk the rail shows only what your role can open. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="page-gutter py-4 sm:py-7 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:items-start md:gap-8">
      <SettingsNav role={user.role} teams={await teamsOn(user.id)} />
      <div className="flex min-w-0 max-w-3xl flex-col gap-4 pb-10 sm:gap-5">{children}</div>
    </div>
  );
}
