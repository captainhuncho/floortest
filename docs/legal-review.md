# Terms and Privacy: gap review

**This is not legal advice.** It compares the draft [Terms](../src/app/terms/page.tsx) and [Privacy](../src/app/privacy/page.tsx) pages with what the code actually does (27 Sep 2026), so a UK data-protection lawyer can finish them faster. Have a lawyer sign off before public launch.

Assumed setup: operator based in the UK, users in the UK and EU, so UK GDPR, EU GDPR and PECR apply. Hosting: Vercel functions in London (`lhr1`), Supabase Postgres in London, Cloudflare R2 for audio, Resend for email.

## 1. Where the drafts don't match the code

| # | Draft says | Code does | Risk | Fix |
| --- | --- | --- | --- | --- |
| 1 | "Senders can ask us to delete their data through the Contact us page." | `SUPPORT_EMAIL` isn't set, so the contact form reaches no one ([HANDOFF.md](../HANDOFF.md)). | **High**: the only route for sender rights requests is broken. | Set `SUPPORT_EMAIL` before inviting anyone, and name a plain email address in the policy too. |
| 2 | IP addresses recorded "with each upload" and deleted "after 48 hours". | IPs are also stored for login, sign-up, password reset and contact-form limits (`rate_events`), and in `uploads` for pending uploads. The purge deletes rows older than 2 days but runs once a day, so rows can live about 72 hours. Email addresses are stored as rate-limit keys too. | Medium: inaccurate statement. | "We record IP addresses (and, for some limits, email addresses) when you upload, sign in, reset a password or use the contact form, to stop abuse. We delete these records within 3 days." Or run the purge hourly and keep "48 hours". |
| 3 | Sender data retention is only described for audio. | Sender name, email, messages and track history stay until the receiver deletes their account, with no time limit. | Medium: storage limitation principle. | Pick a period (for example 24 months after the last track from that sender) and purge, or explain why it's kept as long as the receiver's account exists. |
| 4 | "Only the receiver you sent a track to can play or download it" (Trust page). | Also technically reachable by FloorTest's operator and infrastructure providers. | Low | "Only the receiver you sent it to can play or download it in FloorTest." |
| 5 | Account deletion removes "every stored file". | Database backups (Supabase) may hold data for their backup window. | Low | "…deleted immediately from the live service and from backups within {n} days." |
| 6 | Cookies: "one to keep you signed in and one to remember your preferred layout". Upload page remembers name and email in the browser. | Matches. | Low: all strictly necessary or requested by the user, so no consent banner is needed under PECR. Lawyer to confirm the localStorage point. | None |

## 2. Missing from the Privacy Policy (required under UK/EU GDPR Art. 13)

- **Who we are:** legal entity or sole-trader name, address, contact email. There's no named controller at all.
- **Lawful basis** for each use: contract (receiver accounts), legitimate interests (sender receipts, abuse prevention), plus a note on the receiver's own use of sender contact details.
- **Roles:** FloorTest is controller for receiver accounts. For sender data it's arguably a joint or separate controller alongside the receiver. The lawyer needs to decide this; it drives the wording.
- **Processors, with countries:** Vercel (US company, London region), Supabase (London), Cloudflare R2 (**check the bucket's jurisdiction**; set it to EU if the policy says EU/UK hosting), Resend (US). Name them.
- **International transfers:** Resend and Vercel involve the US. State the safeguard (UK Extension to the EU–US Data Privacy Framework or IDTA/SCCs, per provider).
- **Rights:** access, correction, deletion, restriction, objection, portability, and the right to complain to the ICO (or an EU authority).
- **Minimum age.** Producers may be under 18. Set a minimum (commonly 13 in the UK, up to 16 in some EU states) or require 18+.
- **Changes** to the policy and how users are told.

## 3. Terms of Use gaps

| Area | Issue |
| --- | --- |
| **Licence from senders** | "…including playing it for consideration in their sets" grants a public-performance right by default. Many senders won't expect that for an unreleased demo. Suggest: evaluation only by default, with performance only if the sender ticks a box or agrees directly with the receiver. |
| **Copyright complaints** | No notice-and-takedown process for someone whose music was uploaded without permission. Add a contact and a process. |
| **Operator and law** | No legal entity, governing law (England and Wales), or disputes clause. |
| **Liability** | "Provided as is" alone isn't enough, and UK consumer law limits what can be excluded. Needs a proper cap and carve-outs. |
| **Malware** | Uploads aren't antivirus-scanned (the Trust page says so). The Terms should tell receivers to open files at their own risk until scanning ships. |
| **Termination and suspension** | Say what happens to data when an account is suspended or closed. |
| **Referral bonus** | Say bonus slots can be changed or withdrawn after the beta. |
| **Beta and pricing** | Good that it promises notice before charging. Add how much notice (for example 30 days) and that beta users can leave without charge. |

## 4. Before invites go out

1. Set `SUPPORT_EMAIL` (and ideally a published privacy@ address).
2. Fix the IP retention wording or run the purge more often.
3. Confirm the R2 bucket jurisdiction.
4. Add the operator name and contact to both pages.
5. Narrow the sender licence to evaluation by default.

Everything else can wait for the lawyer before public launch.
