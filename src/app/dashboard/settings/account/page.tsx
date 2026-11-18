import { requireUser } from "@/lib/auth";
import { UNDO_DAYS } from "@/lib/undo-days";
import { logout } from "../../../(auth)/actions";
import { DeleteAccount } from "../DeleteAccount";
import { ShortcutsSwitch } from "../ShortcutsSwitch";
import { PageTitle, Section } from "../Section";
import { BTN_GHOST, Notice, SettingLine } from "../ui";

export const metadata = { title: "Account — FloorTest" };

export default async function AccountSettings() {
  // Everyone can log out; deleting is only on your own desk (never a team's).
  const user = await requireUser();
  return (
    <>
      <PageTitle title="Account" sub="This browser's shortcuts, leaving this device, and removing your account." />
      <Section id="shortcuts-h" icon="grid" title="Keyboard" sub="For this browser only.">
        <ShortcutsSwitch />
      </Section>
      <Section id="logout-h" icon="user" title="Log out">
        <SettingLine title="Sign out on this device" sub="Your desk stays as it is. Sign back in any time.">
          <form action={logout} className="w-full sm:w-auto">
            <button className={`${BTN_GHOST} w-full sm:w-auto`}>Log out</button>
          </form>
        </SettingLine>
      </Section>
      {user.role === "owner" ? (
        <Section id="danger-h" title="Delete account" tone="danger" sub={`Switches your account off now. Sign in within ${UNDO_DAYS} days to restore it; after that, your account, link and every track on your desk are deleted for good.`}>
          <DeleteAccount twoFactor={!!user.totp_enabled_at} />
        </Section>
      ) : (
        <Notice tone="info" next="Switch to your own desk from the desk menu, then come back here.">
          You&apos;re on {user.name}&apos;s desk. To change or delete your own login, switch to your own desk first.
        </Notice>
      )}
    </>
  );
}
