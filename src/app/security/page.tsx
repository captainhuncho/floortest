import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Responsible Disclosure (draft) — FloorTest" };

export default function Security() {
  return (
    <LegalPage
      title="Responsible Disclosure"
      updated={LEGAL.updated}
      sections={[
        [
          "Report a security problem",
          [
            `If you think you've found a security vulnerability in FloorTest, email ${LEGAL.email} with "Security" in the subject. Include what you found, the steps to reproduce it, and what an attacker could do with it.`,
          ],
        ],
        [
          "Our promise",
          [
            "We'll acknowledge your report within 3 working days, keep you updated, and tell you when it's fixed. If you follow this policy in good faith, we won't take legal action against you for your research, and we'll credit you if you'd like.",
          ],
        ],
        [
          "Please",
          [
            "Only test against your own accounts. Don't access, change or delete other people's data or music; stop and report as soon as you see any.",
            "Don't run denial-of-service, spam, social-engineering or physical attacks, and don't use automated scanners that send heavy traffic.",
            "Give us reasonable time to fix the problem before telling anyone else.",
          ],
        ],
        [
          "Out of scope",
          [
            "Missing best-practice headers with no real impact, clickjacking on pages with no sensitive actions, reports from automated tools without a working example, and issues in services we use (report those to the provider).",
          ],
        ],
        [
          "Rewards",
          [
            "We don't run a paid bug bounty yet.",
          ],
        ],
      ]}
    />
  );
}
