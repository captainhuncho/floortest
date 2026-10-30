import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Content Rules and Moderation — FloorTest" };

export default function ContentRules() {
  return (
    <LegalPage
      title="Content Rules and Moderation"
      updated={LEGAL.updated}
      sections={[
        [
          "Why we have rules",
          [
            "FloorTest is a private place to send and review unreleased music. These rules keep it useful and safe for senders and receivers. They're part of our Terms of Use.",
          ],
        ],
        [
          "You must not use FloorTest to",
          [
            "Send music you don't have the right to share, or pretend to be another artist, label or person.",
            "Give a false answer about whether you used AI to make a track, or send AI-generated vocals or music made to sound like a real artist without their permission.",
            "Send anything illegal, including content that sexualises children, terrorist content, or content that infringes someone's rights.",
            "Harass, threaten, or send hateful or abusive messages, track titles, notes or replies.",
            "Spam receivers, send the same track again and again, or get round a block.",
            "Upload files that aren't music, or files built to harm devices or systems.",
            "Scrape, overload, probe or try to break into FloorTest, or get round limits, bot checks or bans.",
          ],
        ],
        [
          "How we find problems",
          [
            "Receivers can block senders and report abuse. Anyone can report impersonation from a public page, and rights holders can use our Notice and Takedown Policy. We check every upload is real audio before accepting it. We don't listen to private tracks unless they're reported or we need to for safety or the law.",
          ],
        ],
        [
          "What we can do",
          [
            "Depending on how serious it is, we may: warn you, remove a track or message, block a sender's email or domain across FloorTest, move an impersonating account to a different link name, suspend an account, or close it. Where the law requires, we report illegal content to the authorities.",
            "We tell you what we did and why, unless doing so would put someone at risk or break the law.",
          ],
        ],
        [
          "Appeals",
          [
            "If you think we got it wrong, appeal at /contact?appeal=1 within 6 months. A person who wasn't involved in the first decision reviews it, and we reply with the outcome and reasons. EU users can also use an out-of-court dispute settlement body certified under the Digital Services Act, or go to court.",
          ],
        ],
        [
          "Contact point",
          [
            `For authorities, the European Commission and EU users under the Digital Services Act, our single point of contact is ${LEGAL.email}, in English.`,
          ],
        ],
      ]}
    />
  );
}
