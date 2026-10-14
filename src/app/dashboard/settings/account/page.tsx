import { requireUser } from "@/lib/auth";
import { logout } from "../../../(auth)/actions";
import { DeleteAccount } from "../DeleteAccount";
import { ShortcutsSwitch } from "../ShortcutsSwitch";
import { PageTitle, Section } from "../Section";

export const metadata = { title: "Account — FloorTest" };

export default async function AccountSettings() {
  // Everyone can log out; deleting is only on your own desk (never a team's).
  const user = await requireUser();
  return (
    <>
      <PageTitle title="Account" />
      <Section id="shortcuts-h" title="Keyboard" sub="For this browser only.">
        <ShortcutsSwitch />
      </Section>
      <Section id="logout-h" title="Log out" sub="Signs you out on this device.">
        <form action={logout}>
          <button className="btn-ghost btn-sm min-h-11">Log out</button>
        </form>
      </Section>
      {user.role === "owner" ? (
        <Section id="danger-h" title="Delete account" tone="danger" sub="Deletes your account, your link and every track on your desk. This can't be undone.">
          <DeleteAccount handle={user.handle} twoFactor={!!user.totp_enabled_at} />
        </Section>
      ) : (
        <p className="text-sm text-mute">You&apos;re on {user.name}&apos;s desk. To change or delete your own login, switch to your own desk first.</p>
      )}
    </>
  );
}
