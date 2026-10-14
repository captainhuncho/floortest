import Link from "next/link";
import { trackUse } from "@/lib/usage";
import { readLinks } from "@/lib/socials";
import { nextHandleChange } from "@/lib/accounts";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { APP_URL } from "@/lib/mail";
import { CoverUpload, PublicPageForm } from "../PublicPageForm";
import { IdentityForm } from "../IdentityForm";
import { SettingsForm } from "../SettingsForm";
import { PageTitle, Section } from "../Section";

export const metadata = { title: "Profile — FloorTest" };

export default async function Profile() {
  const user = await requireRole("admin");
  await trackUse(user.id, "settings");
  const nextLink = await nextHandleChange(user.id);
  const identity = await q.get<{ status: "none" | "pending" | "verified" | "rejected"; links: string; note: string }>(
    "SELECT identity_status AS status, identity_links AS links, identity_note AS note FROM users WHERE id = ?",
    user.id,
  );
  return (
    <>
      <PageTitle
        title="Profile"
        sub={
          <>
            What senders see on your link.{" "}
            <Link href={`/${user.handle}`} target="_blank" className="text-bone underline underline-offset-4">
              View your page ↗
            </Link>
          </>
        }
      />
      <Section id="photo-h" title="Profile photo" sub="Shown at the top of your page and when people send to you from FloorTest.">
        <CoverUpload handle={user.handle} cover={user.cover_key} />
      </Section>
      <Section id="link-h" title="Name and link">
        <SettingsForm kind={user.kind} kindNote={user.kind_note} tools={user.tools} firstName={user.first_name} lastName={user.last_name} name={user.name} handle={user.handle} base={APP_URL} nextChange={nextLink ? new Date(nextLink).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null} />
      </Section>
      <Section id="page-h" title="Role line and profiles" sub="Your profiles show as icons under your name, so senders know it's really you.">
        <PublicPageForm roleLine={user.role_line} links={readLinks(user.links)} />
      </Section>
      <Section id="identity-h" title="Verified mark" sub="Tells senders they've found the real you, not an impersonator.">
        <IdentityForm status={identity?.status ?? "none"} links={identity ? JSON.parse(identity.links || "[]") : []} note={identity?.note ?? ""} />
      </Section>
    </>
  );
}
