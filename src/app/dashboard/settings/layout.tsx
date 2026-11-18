import { requireUser } from "@/lib/auth";
import { teamsOn } from "@/lib/account-members";
import { SettingsNav } from "./SettingsNav";
import { SettingsShell } from "./SettingsShell";

/**
 * Settings: the Settings page itself fills the column (option 47); the pages it opens are short and centred, with a
 * left rail on laptops and a back arrow to Settings on phones. On a team desk the rail shows only what your role can
 * open.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <SettingsShell nav={<SettingsNav role={user.role} teams={await teamsOn(user.id)} />}>{children}</SettingsShell>;
}
