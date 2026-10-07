import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { APP_URL } from "@/lib/mail";

const HOST = APP_URL.replace(/^https?:\/\//, "");

export const metadata = { title: "Information for Law Enforcement (draft) — FloorTest" };

export default function LawEnforcement() {
  return (
    <LegalPage
      title="Information for Law Enforcement"
      updated={LEGAL.updated}
      sections={[
        [
          "Requests for user data",
          [
            "FloorTest is operated from Ghana. We respond to requests from law enforcement and government authorities that are valid under the law that applies to us. Requests from other countries may need to go through a mutual legal assistance treaty (MLAT) or a similar process.",
            `Send requests from an official email address to ${LEGAL.email}, with "Law enforcement request" in the subject. Include the legal basis, the account link name (${HOST}/name) or email address, the data you need, and a deadline.`,
          ],
        ],
        [
          "What we hold",
          [
            "Account details, track details and files, activity records, and IP addresses for at most 48 hours. Unreviewed tracks are deleted after 90 days and declined ones after 30. Deleted data may stay in encrypted backups for up to 14 days.",
          ],
        ],
        [
          "Emergencies",
          [
            "If there's an immediate risk of death or serious harm, say so in the subject line. We may share data without legal process when we believe in good faith it's needed to prevent that harm.",
          ],
        ],
        [
          "Notifying users",
          [
            "We tell users about requests for their data unless the law forbids it, or telling them would put someone at risk.",
          ],
        ],
        [
          "Preservation",
          [
            "We can preserve specific data for 90 days while you obtain formal legal process.",
          ],
        ],
      ]}
    />
  );
}
