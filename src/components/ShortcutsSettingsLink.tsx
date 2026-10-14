import Link from "next/link";

/** The line under a shortcuts list: where letter and number keys are switched off (or back on). */
export function ShortcutsSettingsLink({ on }: { on: boolean }) {
  return (
    <>
      {on ? "Letter and number keys can be turned off in " : "Turn them back on in "}
      <Link href="/dashboard/settings/account#shortcuts-h" className="text-bone underline underline-offset-4 hover:text-lime">
        Settings → Account
      </Link>
      .
    </>
  );
}
