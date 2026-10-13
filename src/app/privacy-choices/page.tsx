import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Your Privacy Choices (draft) — FloorTest" };

export default function PrivacyChoices() {
  return (
    <LegalPage
      title="Your Privacy Choices"
      updated={LEGAL.updated}
      sections={[
        [
          "We don't sell or share your personal information",
          [
            "FloorTest doesn't sell your personal information, and doesn't share it with third parties for targeted (cross-context behavioural) advertising. We don't use advertising or tracking cookies.",
          ],
        ],
        [
          "If that changes",
          [
            "If we ever start advertising with tracking, this page will let you opt out of the sale or sharing of your personal information, and we'll honour Global Privacy Control signals from your browser automatically.",
          ],
        ],
        [
          "Your rights",
          [
            "Wherever you live, you can ask to access, correct, delete or get a copy of your data. California residents and residents of other US states with privacy laws have these rights too, and we won't treat you differently for using them. Make a request at /contact?topic=data or by email; you can also use an authorised agent.",
            `${LEGAL.privacy}`,
          ],
        ],
        [
          "More",
          [
            "See our Privacy Policy and Cookie Policy for the full details.",
          ],
        ],
      ]}
    />
  );
}
