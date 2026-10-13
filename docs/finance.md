# The finance desk

How FloorTest's money is run: who thinks about it, how often, what gets measured, and what has been decided. Numbers live in `costs.md` (what it costs) and `revenue-model.md` (what it earns); this file is the standing view and the decision log. Started 13 Oct 2026.

## The finance panel

Money questions go through seven voices before they are settled, the way product changes go through the product panel. Each gives a short, specific view; disagreements end in one recommendation; what stays open goes to the owner as a numbered question.

| Voice | Looks after |
|---|---|
| Fractional CFO | Cash, margin, runway, what to measure, when to spend |
| Pricing & packaging | Plans, limits, yearly vs monthly, add-ons, discounts |
| Payments & billing ops | Paddle, Apple and Google billing, failed payments, refunds, chargebacks |
| Accountant & tax | The Ghana company, books, payouts, VAT and sales tax, invoices, records |
| Growth & revenue | Free to paid, senders to receivers, what triggers an upgrade |
| Cost controller | Infrastructure spend, allowances, cost per desk |
| Outside investor eye | Is this a business; what a stranger with money would ask |

Guardrails no voice may override, from `PRODUCT.md`: senders are never charged, nothing is sold that reads as pay-to-be-heard, and the beta promise stands. A finance decision that touches the product goes to the product panel too.

## Round one: how do we run this effectively and make money?

**CFO.** The servers cost about $2 a month today and $110–170 at launch size. Money is not the risk; attention is. Run a 10-minute weekly look and a 1-hour monthly close, and spend nothing on tooling until the first Paddle payout lands. The one number that decides the business is the paid share of desks: 4% Pro and 1% Team covers the servers by March 2027; 2% pushes it to April and halves what is left over.

**Pricing & packaging.** The prices are set and the model says they are fine; stop touching them. Pro yearly nets the same as monthly, so lead with it. The Free limit of 20 active tracks is the real pricing lever: it is what a working DJ hits in a fortnight, and the upgrade moment is the Floor saying "17 of 20". Watch how many desks reach 80% and 100% during the beta before changing anything.

**Payments & billing ops.** Three things before checkout is built. Paddle's page says orders under $10 need custom pricing agreed with them, and Pro monthly, add-on seats and any half-price Pro are under $10. Sell the beta discount as a half-price year so it clears that line. Decide refund and failed-payment rules now, in plain words, so support never improvises: 14-day refund on first payment, no refunds on renewals, 7 days of retries then the desk drops to Free with its tracks intact.

**Accountant & tax.** Paddle as merchant of record means FloorTest never collects VAT or sales tax; it invoices Paddle, in effect, and receives payouts. What the company still owns: the Ghana registration, a business bank account that can receive USD payouts, books from the first dollar, and Ghana corporate tax on profit. Confirm with Paddle that it pays out to a Ghana bank account before building anything; if it does not, the payout route (a UK or US entity, or a service such as Payoneer) is a company decision, not a code one. Keep every receipt from day one; the lawyer and the accountant will both ask.

**Growth & revenue.** The loop is already in the product: senders are free and each receipt carries "DJ too? Get your own link". Acquisition cost is near zero, so revenue is conversion, not marketing spend. Three conversion moments to instrument: a desk at 80% of Free, a desk that exports a crate, a second person joining a desk. Each is an upgrade prompt in the product and a number on the Revenue page.

**Cost controller.** Costs scale with stored audio, not with desks or traffic, because files go browser to R2 and R2 has no egress fee. Keep retention as it is (undecided 90 days, not for me 30); it is the cost control. The ClamAV box is the one cost that does not scale down, and Sentry Team is the one that can wait. Watch the allowance bars in Admin → Overview; the Neon figure there is out of date (Free is 1 GB now, not 0.5 GB).

**Outside investor eye.** A stranger would ask three things. Who pays: DJs and labels, not artists, which is the opposite of SubmitHub and LabelRadar and is the pitch. How many of them: the beta's 25 activated receivers and whether 15 come back weekly. What a desk is worth: at 4% Pro and 1% Team, a desk is worth about $0.42 a month and costs $0.03 to run. That ratio is the business. Nothing here needs outside money; it needs 2,000 desks.

## What this resolves to

**Rhythm**

- Weekly, 10 minutes: Admin → Revenue & plans (paying accounts, share on paid, plan changes), Metrics (activated, weekly active), Storage & costs (allowance bars). Note anything odd in this file's log.
- Monthly, the 1st, one hour: read every bill (Vercel, Neon, Cloudflare, Resend, UptimeRobot, Fly, domain); update `costs.md` if a price moved; record MRR, paid share, churn, cost per desk and cash in the table below; compare with `revenue-model.md`'s row for the month.
- Quarterly: pricing and limits review with the product panel; rerun the model with real numbers.

**Measures, and where each lives**

| Measure | Definition | Where |
|---|---|---|
| MRR | Monthly value of paying accounts, net of Paddle once billing is live | Admin → Revenue & plans (list price today) |
| Paid share | Paying accounts ÷ all accounts | Admin → Revenue & plans |
| Desks at the limit | Free desks at 80% and at 100% of 20 active tracks | To add to Revenue & plans |
| Upgrade triggers | Crate exports and seat invites by Free desks in the period | To add |
| Churn | Paying accounts that dropped to Free in the month ÷ paying at the start | Revenue & plans shows ups and downs; the rate is to add |
| Cost per desk | Month's bills ÷ accounts | Monthly close, by hand |
| Cash | Paddle balance plus bank | Paddle dashboard, bank |

**Rules of the house**

- Yearly Pro is shown first at checkout and in every email that mentions plans.
- The beta discount is one half-price yearly payment, offered when billing starts.
- Refunds: 14 days on a first payment, none on renewals. Failed payments: 7 days of retries, then the desk drops to Free with its tracks intact and nothing deleted.
- No cost over $50 a month is added without a line in `costs.md` first.
- Nothing is ever sold to senders.

## Decisions for the owner

1. **Payouts.** Confirm with Paddle that it pays out to a Ghana business bank account in USD. If not, choose the route before Paddle is integrated.
2. **Paddle under $10.** Ask Paddle for terms on Pro monthly ($6.99) and seats ($4), or agree that seats are billed inside the plan.
3. **Launch month.** The model assumes billing starts in January 2027. Confirm or move it.
4. **Books.** Pick where the books live from the first payout (a spreadsheet is fine until there are 50 paying desks; after that a bookkeeping tool and an accountant in Ghana).
5. **Refund and failed-payment rules** as written above: agree or amend before checkout copy is written.

## Monthly close log

| Month | Accounts | Paying | Paid share | MRR (net) | Bills | Cost per desk | Notes |
|---|---|---|---|---|---|---|---|
| Oct 2026 | | | | $0 | about $2 | | Beta; billing off; Hobby and free tiers |

## Decision log

- 13 Oct 2026: finance panel formed; round one above. Team price corrected to $19.99 across the docs; `costs.md` and `revenue-model.md` written; the Paddle under-$10 flag raised; ClamAV estimate raised to $13–25.
