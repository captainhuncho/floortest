import { requireUser } from "@/lib/auth";
import { teamsOn } from "@/lib/account-members";
import { SettingsNav } from "./SettingsNav";

/**
 * Settings: short pages, centred in the content area like Account. Desktop has a left rail; phones reach each page
 * from the Account menu. On a team desk the rail shows only what your role can open.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto w-full max-w-[1000px] md:grid md:grid-cols-[208px_minmax(0,1fr)] md:items-start md:gap-8 lg:gap-10">
        <SettingsNav role={user.role} teams={await teamsOn(user.id)} />
        <div className="flex min-w-0 flex-col gap-4 pb-10 sm:gap-5">{children}</div>
      </div>
    </div>
  );
}
