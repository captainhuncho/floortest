# Brief for the lawyer (updated 1 Oct 2026)

The drafts at /terms and /privacy were rewritten on 29 Sep 2026 to close the gaps listed further down. Owner decisions so far:

- **Operator:** FloorTest LTD, a company being registered in **Ghana** (not the UK). Governing law is set to Ghana. Complaints point to Ghana's Data Protection Commission and the user's local authority, such as the UK ICO. Add the registration number and address to `src/lib/legal.ts` once incorporated.
- **Contact:** info@imullar.com for now; support@floortest.fm later.
- **Minimum age:** 18+. Stated in both documents, on sign-up and on the send form.
- **Sender licence:** the receiver may listen, download, evaluate and play the track in DJ sets, live performances and broadcasts. Releasing, distributing, selling, licensing or uploading it as a release on any platform needs a separate written agreement.
- **Agreement points:** sign-up and the send form now show a line linking to both documents.
- **Sharing with colleagues (added 1 Oct 2026, revised same day):** see the section below. Owner decisions: sharing exists only **for promotion and for playing the track in DJ sets**, never for commercial release unless backed by a signed agreement with the artist. **Colleagues must have FloorTest accounts** (so they accept the Terms), and **whether colleagues may download is fixed when the track is sent**: only if the receiver was on a paid plan at that moment. The sender sees which applies before sending.

**Questions for you:**

1. Sender licence: do recorded DJ mixes posted online (SoundCloud, YouTube, Mixcloud) count as "playing in sets" or as releasing? The owner's intent is that anything short of releasing the track is fine.
2. Controller roles for sender data: is FloorTest a separate or joint controller with the receiver?
3. Sender data retention: currently "as long as the receiver's account exists". Is that defensible, or should we set a fixed period?
4. The liability cap of £100 while free, with the consumer-law carve-outs: is it adequate?
5. Transfers: the UK–US data bridge covers certified providers; confirm the right wording for Vercel, Cloudflare and Resend.
6. Is a clickwrap line enough for senders (no checkbox), given they don't have an account?
7. Until FloorTest LTD is registered, who is legally the operator and controller? Can the pages name the company before it exists?
8. **Ghana Data Protection Act 2012 (Act 843):** does FloorTest LTD need to register with the Data Protection Commission before processing data?
9. **UK and EU users:** as a Ghana company targeting UK and EU users, does FloorTest need a UK and/or EU representative (UK GDPR / GDPR Art. 27), and is Ghana law workable as governing law for UK and EU consumers?
10. The operator is based in Ghana while hosting is in the UK and US. Does the transfers section need Ghana-specific wording?
11. **Sharing consent:** the sender agrees to sharing through one line above the Send button, shown only when the receiver's brief allows it (no checkbox). Is that clear enough consent to let third parties hear, and on paid plans download, an unreleased track?
12. **Colleagues are bound by the Terms** (decided: they must sign in; the share link works as an invite). Is that enough to enforce the no-release rule against a colleague, and is the sender a third-party beneficiary who can enforce it directly, or only FloorTest?
13. **Resolved:** downloads are fixed at send time by the receiver's plan, and the agreement line tells the sender which applies ("listen only" or "they can listen and download"). Please confirm the wording is clear enough.
14. **Colleague data:** because colleagues sign in, FloorTest now records which account played or downloaded each shared track, and shows those names to the receiver who shared it (not to the sender). The Privacy Policy needs a line on this. Is showing the receiver who listened acceptable without separate consent?
15. **Takedown:** if a sender withdraws consent or reports misuse, we can switch off every share link for a track. Should the Terms give senders a right to ask for that, and a timeframe?

**Still to confirm on the tech side:** the R2 bucket's jurisdiction, and that support@floortest.fm actually receives mail.

---

# Terms and Privacy: gap review

**This is not legal advice.** It compares the draft [Terms](../src/app/terms/page.tsx) and [Privacy](../src/app/privacy/page.tsx) pages with what the code actually does (27 Sep 2026), so a UK data-protection lawyer can finish them faster. Have a lawyer sign off before public launch.

Original assumed setup (now superseded: the operator is a Ghana company): operator based in the UK, users in the UK and EU, so UK GDPR, EU GDPR and PECR apply. Hosting: Vercel functions in London (`lhr1`), Supabase Postgres in London, Cloudflare R2 for audio, Resend for email.

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

## 4. Sharing with colleagues (added 1 Oct 2026)

**Status: held back until after the beta** (`SHARING_LIVE = false` in `src/lib/plans.ts`). The Terms and Privacy wording below is already in place so it's reviewed before launch.

How it works in the product, for reference:

| Part | Behaviour |
| --- | --- |
| Opt-in | Off by default. A receiver turns on "Let me share tracks with colleagues" per collection. |
| What senders see | The brief on the receiver's link shows "Sharing with colleagues allowed". The agreement line above Send adds: the receiver may "share it with colleagues who have FloorTest accounts, through a private link, for promotion and their DJ sets (listen only / they can listen and download)", whichever applies at that moment. |
| Which tracks | Only tracks sent while the collection allowed sharing. Turning it on later doesn't open up older tracks (stored per track at upload). |
| The link | Private, unguessable, expires after 7 days. The receiver can switch it off at any time; it stops working immediately. Not indexed by search engines. |
| Colleague access | FloorTest account required (the link doubles as an invite, using the sharer's referral code). Listen in the browser; a "Download the original" button only if the receiver was on a paid plan when the track was sent. A browser can't fully prevent saving playing audio, so we don't promise copy protection. Plays and downloads are recorded per account and shown to the receiver who shared. |
| Sender visibility | The sender's receipt says the receiver shared a private link with a colleague, with the date. |
| Terms | Receiver section and "Use tracks only as described" were updated to cover this. Dated 1 Oct 2026. |

Open points are questions 11–15 above.

### Asking the artist first (added 1 Oct 2026)

Besides the per-collection setting, a receiver can ask the artist, per track, from the contact's page: **"Request to share"**, with an optional note on who it's for (e.g. "a DJ friend playing in Accra"). The artist gets an email and sees the request on their private receipt page with **Allow** / **Decline**. Nothing changes unless they say yes. After Allow they have 2 minutes to cancel; then it's final, the receiver is emailed, and that one track becomes shareable, for playing and promotion only. Whether the partner may download is fixed at that moment by the receiver's plan, and the request says which. The receipt records the answer and its date.

**Drafting job for you:** please write the request email and the receipt card wording. The owner wants it **clear but not tacky or scary**: a friendly ask between music people, not a legal notice, while still making the limits unmistakable (non-commercial partner, playing in sets and promotion only, no commercial release without a signed agreement, private link, 7 days, listen-only unless downloads are stated). Current placeholder:

> **Invitee would like to share this track**
> With someone they work with, so they can play it in their sets and help promote it. They'd only be able to listen, through a private FloorTest link that expires after 7 days. It's never for commercial release without a signed agreement with you.
> "A DJ friend playing in Accra"
> [Allow] [Decline]
> Nothing changes unless you say yes.

16. **Is a one-tap Allow on the receipt page enough consent**, given the sender reaches it through their private link (no account)? Should we record more (time, IP, the exact wording shown)?
17. **Withdrawal (owner decision):** after tapping Allow, the artist has a **2-minute window** to cancel (a countdown and Cancel button on their receipt, and the link in their confirmation email). After that the consent is **final and can't be withdrawn**, and only then is the receiver told and able to share. Please confirm this is enforceable and say how to word the "no take-backs" part kindly.

## 5. Admin tools: erasure, account changes, suspensions (added 1 Oct 2026)

What's built: admins can export everything held about an email address, delete an account, and erase someone as a sender. Admins can also change a user's handle or email, suspend accounts (the user is emailed the reason and can appeal), and record copyright takedowns.

18. **Sender erasure vs. receivers' copies:** erasing a sender deletes their sender records and **every track they sent, from every receiver's desk**, with the files, and the receivers aren't told. Does a sender's erasure request override a receiver keeping a track they were sent (their legitimate interest, or the licence the sender granted at upload)? Should receivers be notified, or keep the track without the sender's personal data?
19. **What we keep after erasure:** the admin log keeps a masked email (first two letters) and counts. Takedown cases keep the claimant's details and a track label. Is that acceptable to keep, and for how long?
20. **Handle take-back for impersonation:** an admin can move an impersonator to a new handle without notice beyond an email, free the name immediately and give it to the real artist. Do the Terms need explicit wording for this?
21. **Email changes by support:** support can start an email change after confirming identity by email. The new address must still confirm, and the old address is told. Is that enough protection, or should support changes need a waiting period?

## 6. Cookies and the notices we must display (added 2 Oct 2026)

Draft Cookie Policy now at `/cookies`, linked from the footer and the Privacy Policy. It lists every cookie: `floortest_session` (30 days), `floortest_2fa` (5 min), `floortest_view_as` (support only), `ft_flash` (30 s), `ft_theme` and `ft_submissions_view` (1 year, user settings). Local storage: sender name and email on the upload page, export folder name, admin menu state. No advertising or analytics cookies (Vercel Analytics and Sentry are cookieless). Turnstile runs on public forms.

FloorTest will be registered in and operated from **Ghana**, serving users worldwide, including the UK, EU and US. Hosting is in London.

22. **No banner:** we rely on the exemption for cookies that are strictly necessary or remember a setting the user asked for (UK PECR reg. 6(4), EU ePrivacy Art. 5(3)). Is that sound for the theme, layout and remembered sender details? Is Turnstile covered as security?
23. **Ghana (home country):** please confirm:
    - Data Protection Act 2012 (Act 843): registering as a data controller with the Data Protection Commission, renewal, and anything our Privacy Policy must add.
    - Electronic Transactions Act 2008 (Act 772): information the website must display (operator name, address, registration number, contact).
    - Cybersecurity Act 2020 (Act 1038): any duties for an online platform, including breach reporting and whether we must register or be licensed.
    - Copyright Act 2005 (Act 690): takedown and safe-harbour position for user uploads.
    - Company registration (Office of the Registrar of Companies): the entity type and the name to show on the site.
    - Moving personal data out of Ghana: our providers are in the UK, EU and US. What does Act 843 require?
24. **UK and EU users:**
    - Because we're outside the UK and EU, do we need a UK representative (UK GDPR Art. 27) and an EU representative (EU GDPR Art. 27)?
    - EU Digital Services Act: do we need a legal representative in the EU and a public point of contact? How do the transparency-report duties apply to a micro or small platform?
    - Online Safety Act 2023 (UK): does it apply to us as an overseas service with UK users who upload audio?
    - Consumer law for paid plans later (UK Consumer Contracts Regulations, EU Consumer Rights Directive): pre-purchase information and the 14-day right to cancel.
25. **US users:**
    - Register a DMCA designated agent with the US Copyright Office to keep safe harbour, and publish a DMCA notice and counter-notice process.
    - When do CCPA/CPRA and other state privacy laws apply (thresholds)? Once ad pixels exist, do we need a "Your Privacy Choices" link and to honour Global Privacy Control?
    - COPPA, given we're 18+ only.
    - **Advertising (future):** we may run ads to promote FloorTest, which would mean pixels such as the Meta Pixel or Google Ads tag. What consent banner and policy updates are needed? If we later sell ad space on FloorTest, which Advertising Terms, ad-labelling rules and DSA ad-transparency duties apply?
    - Accessibility statement: required or recommended in any of these markets?
26. **Automatic renewal (before payments go live):** the Plans page now shows beta terms only (no card, nothing renews, 30 days' notice and opt-in before any charge). For paid plans we'll need checkout wording for UK/EU consumer law and US state auto-renewal laws (e.g. California): price, billing period, that it renews until cancelled, how to cancel online, and renewal reminders. Please supply or approve that wording.
27. **Beta access isn't a gift:** the Terms and Plans page now say free Pro/Team during the beta (and referral bonuses) is a temporary trial, not a gift, purchase or lifetime plan, has no cash value, can't be transferred, and ends when paid plans start. Is that enough to prevent claims of a gifted or lifetime subscription, and does it work with gift-card or consumer rules in Ghana, the UK, EU and US?
28. **Age:** the Terms say 18+. Is a self-declaration at sign-up enough?

## 7. Before invites go out

1. Set `SUPPORT_EMAIL` (and ideally a published privacy@ address).
2. Fix the IP retention wording or run the purge more often.
3. Confirm the R2 bucket jurisdiction.
4. Add the operator name and contact to both pages.
5. Narrow the sender licence to evaluation by default.

Everything else can wait for the lawyer before public launch.
