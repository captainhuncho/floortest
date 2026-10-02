import { LegalPage } from "@/components/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Sub-processors (draft) — FloorTest" };

export default function Subprocessors() {
  return (
    <LegalPage
      title="Sub-processors"
      updated={LEGAL.updated}
      sections={[
        [
          "Who processes data for us",
          [
            "FloorTest uses these providers to run the service. Each acts only on our instructions, under a data processing agreement. We'll update this page before adding a new one.",
          ],
        ],
        [
          "Current list",
          [
            "Vercel Inc. (USA): hosts the website and app, run from London (UK). Sees: all data passing through pages and requests. Also Vercel Web Analytics: anonymous page-visit counts, no cookies.",
            "Supabase Inc. (USA): database, hosted in London (UK). Stores: accounts, track details, sender details, activity records.",
            "Cloudflare Inc. (USA): R2 private file storage (audio files, stems, cover photos, backups) and Turnstile bot checks on public forms.",
            "Resend Inc. (USA): sends email (receipts, alerts, digests, sign-in and security emails). Sees: recipient name and email, and the email content.",
            "Functional Software Inc., trading as Sentry (USA): error and performance reports when a page crashes or runs slowly. No IP addresses or form contents are sent.",
          ],
        ],
        [
          "Transfers",
          [
            "FloorTest is operated from Ghana. Our providers may handle data in the UK, the EU and the United States. Where the law requires, we rely on safeguards such as standard contractual clauses, the UK\u2013US data bridge or the EU\u2013US Data Privacy Framework.",
          ],
        ],
        [
          "Contact",
          [
            `${LEGAL.email}`,
          ],
        ],
      ]}
    />
  );
}
