import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";
import { APP_URL } from "@/lib/mail";

const HOST = APP_URL.replace(/^https?:\/\//, "");

export const metadata = { title: "Notice and Takedown Policy (draft) — FloorTest" };

export default function Takedown() {
  return (
    <LegalPage
      title="Notice and Takedown Policy"
      updated={LEGAL.updated}
      sections={[
        [
          "What this covers",
          [
            "FloorTest lets artists send unreleased music privately to DJs, curators and labels. If you believe a track on FloorTest infringes your copyright or other rights, tell us and we'll act quickly. Tracks on FloorTest are private, so you may only know about one because it was sent to you or shared with you.",
          ],
        ],
        [
          "How to send a notice",
          [
            "Use our contact form with the topic \"Copyright claim\" at /contact?takedown=1, or email us. Please include:",
            "1. Your name, address, phone and email, and whether you're the rights holder or acting for them.",
            "2. The work you own (title, artist, and a link or ISRC if released).",
            `3. Where it is on FloorTest: the sender's link (${HOST}/name), the track title and artist as shown, and roughly when it was sent.`,
            "4. A statement that you believe in good faith the use isn't authorised by the rights holder, its agent or the law.",
            "5. A statement that the information in your notice is accurate and, under penalty of perjury, that you are the rights holder or authorised to act for them.",
            "6. Your physical or electronic signature (typing your full name is fine).",
          ],
        ],
        [
          "What we do",
          [
            "We review every complete notice, usually within 2 working days. If it's valid we remove or disable the track, tell the person who sent it, and keep a record. Repeat infringers lose their account.",
            "We may forward your notice, including your name and contact details, to the person who sent the track, so they can respond.",
          ],
        ],
        [
          "Counter-notice",
          [
            "If your track was removed and you believe that was a mistake or that you have permission, you can send a counter-notice with: your name, address, phone and email; the track that was removed; a statement under penalty of perjury that you believe in good faith it was removed by mistake or misidentification; consent to the jurisdiction of the courts where you live (or, outside the US, any court where FloorTest can be found); and your signature.",
            "We'll pass it to the person who complained. Under US law, unless they tell us within 10\u201314 working days that they've started court action, we may restore the track.",
          ],
        ],
        [
          "United States (DMCA)",
          [
            "For US users this policy follows the Digital Millennium Copyright Act, 17 U.S.C. \u00a7 512. Our designated agent's details will be listed here once registered with the US Copyright Office.",
          ],
        ],
        [
          "Misuse",
          [
            "Knowingly false notices or counter-notices can make you liable for damages. If you're not sure the use infringes your rights, get legal advice first.",
          ],
        ],
        [
          "Contact",
          [
            `${LEGAL.copyright}`,
          ],
        ],
      ]}
    />
  );
}
