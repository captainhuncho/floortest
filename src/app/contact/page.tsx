import { botCheckKey } from "@/lib/turnstile";
import { DocHead, PublicShell } from "@/components/LegalPage";
import { CARD, Icon } from "@/components/Kit";
import { currentPerson } from "@/lib/auth";
import { ContactForm } from "./ContactForm";
import { APP_URL } from "@/lib/mail";

const HOST = APP_URL.replace(/^https?:\/\//, "");

export const metadata = { title: "Contact us — FloorTest" };

export default async function Contact({ searchParams }: { searchParams: Promise<{ report?: string; appeal?: string; takedown?: string }> }) {
  const user = await currentPerson();
  const sp = await searchParams;
  const appeal = !!sp.appeal;
  const takedown = !!sp.takedown;
  const report = ((sp).report || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  return (
    <PublicShell>
      <DocHead label={<><Icon name="mail" className="size-[15px]" />We reply by email</>} title="Contact us">
        <p className="text-[13.5px] leading-6 text-mute">Questions, problems with a track, or something to report. A person reads every message.</p>
      </DocHead>
      <section aria-label="Message" className={`${CARD} p-4 sm:p-6`}>
      <ContactForm
        botCheckKey={await botCheckKey()}
        name={user?.name ?? ""}
        email={user?.email ?? ""}
        topic={appeal ? "Suspension appeal" : takedown ? "Copyright claim" : report ? "Impersonation" : undefined}
        message={appeal ? "Account email: \nWhy I think the suspension is a mistake: " : takedown ? "My work (title, artist):\nWhere it is on FloorTest (link, track title):\nI'm the rights holder / acting for: \nI believe in good faith this use isn't authorised, and this notice is accurate. Signed: " : report ? `I think ${HOST}/${report} is pretending to be someone else, because: ` : undefined}
      />
      </section>
    </PublicShell>
  );
}
