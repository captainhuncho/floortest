# Running costs

What FloorTest costs to run each month, today and after public launch. Estimates from each service's list price on 13 Oct 2026; the real bill is in each dashboard. Update this file when a service, plan or price changes.

## Two sizes

| | Beta (Oct–Dec 2026) | Launch (first 3 months public) |
|---|---|---|
| Desks | 50 | 500 |
| Weekly active receivers | 15 | 150 |
| Tracks received a month | 300 | 3,000 |
| Average file | 40 MB (mix of WAV and MP3) | 40 MB |
| Audio stored (after retention) | 20 GB | 400 GB |
| Recovery copy (vault bucket) | doubles stored audio | doubles stored audio |
| Emails a month | 2,500 | 20,000 |

Beta sizes come from the beta targets in `beta-launch-plan.md`; launch sizes are ten times that. Scale the storage and email rows if the real numbers differ; the fixed fees don't move.

## Monthly, by service

| Service | Beta today | Launch | Notes |
|---|---|---|---|
| Vercel | $0 (Hobby) | $20–30 | Pro is $20 with $20 of usage credit, 1 developer seat, 1 TB transfer, 10M CDN requests. Audio never passes through Vercel (browser → R2, signed links out), so usage stays low; crate ZIP downloads are the one stream that does. Firewall rate limiting is $0.50 per million allowed requests: under $1. Hobby forbids commercial use, so Pro comes on before billing. |
| Neon (database) | $0 (Free) | $25–35 | Launch plan has no base fee: $0.106 per CU-hour, $0.35 per GB-month, instant restore $0.20 per GB-month of history. A 0.25 CU database awake most of the day is $19 of compute; storage and 7-day restore add a few dollars. The Free plan now includes 1 GB per project (the admin allowance still says 0.5 GB). |
| Cloudflare R2 (files) | $0 | $12 | $0.015 per GB-month after a free 10 GB; egress free. Launch: 400 GB audio + 400 GB vault copy = 800 GB → $12. Operations stay inside the free 1M writes / 10M reads. |
| Resend (email) | $0 → $20 | $20 | Free stops at 100 a day, which invite days will hit, so Pro ($20, 50,000 a month) goes on before invites. The $35 tier (100,000) is for later. |
| UptimeRobot | $0 | $10 | Free is for personal use only; Solo is $10 a month ($9 billed yearly), 60-second checks. |
| Sentry | $0 | $0–26 | Developer plan: 5,000 errors a month, free. Team is $26 for 50,000. Only needed if errors outgrow the free plan. |
| Cloudflare Turnstile | $0 | $0 | Free. |
| Cloudflare Workers Paid | $5 until cancelled | $0 | Left over from the 6 Oct Workers trial (the hosting decision was Vercel). Invoice IN 82507574, 6 Oct 2026: $3.33 pro-rata for 6–25 Oct, then $5 a month. R2 does not need it. Owner: cancel in the Cloudflare dashboard, Billing → Subscriptions. |
| Virus scanning (own ClamAV) | $0 | $13–25 | A ClamAV daemon needs about 1.5 GB of RAM for its signatures. Fly.io shared-cpu-1x: 2 GB $12.70, 4 GB $24.70, plus a volume at $0.15 per GB. The earlier $5–7 estimate in `services.md` is too low. |
| Domain (floortest.app) | $3 | $3 | $101.97 paid for 3 years at Hosting.com (owner, 13 Oct): $34 a year, $2.83 a month. Next renewal is a one-off, not a monthly bill. |
| Google Workspace (support mailbox) | $0 | $7–8 | Business Starter, 1 user: $7 a month billed yearly, $8.40 monthly. Planned for the two weeks after launch. |
| GitHub, Figma, Vercel Analytics | $0 | $0 | Free tiers. Analytics events are $3 per 100,000 past the Pro allowance; not expected. |
| **Total** | **$3 now ($8 while Workers Paid is still on), $23 once Resend is upgraded** | **$110–170** | Before payment fees and one-offs. |

Old Supabase projects are on the free plan and cost nothing; deleting them (from 13 Oct) is housekeeping, not a saving.

## Per sale: Paddle

Paddle takes 5% + $0.50 per checkout, with no monthly fee, as merchant of record (it handles VAT and sales tax). What that means per plan:

| Plan | Price | Paddle fee | Share | We keep |
|---|---|---|---|---|
| Pro monthly | $6.99 | $0.85 | 12.2% | $6.14 |
| Pro yearly | $77.99 | $4.40 | 5.6% | $73.59 |
| Team monthly | $19.99 | $1.50 | 7.5% | $18.49 |
| Team yearly | $199 | $10.45 | 5.3% | $188.55 |
| Add-on seat, monthly | $4 | $0.70 | 17.5% | $3.30 |

**Flag for the owner:** Paddle's pricing page says orders under $10 need custom pricing agreed with Paddle. Pro monthly ($6.99) and add-on seats ($4) are under $10. Ask Paddle before building checkout, or bill seats with the plan rather than as separate orders. Yearly plans carry the lowest fee share, which is a reason to show them first.

Rough break-even: the launch stack ($110–170) is covered by 18–28 Pro monthly subscribers, or 8–10 Team monthly. Month by month in `docs/revenue-model.md`. Beta users pay nothing for the first 6 months after billing starts, so the first paying customers are new sign-ups.

## One-offs

| Item | Cost | When |
|---|---|---|
| Lawyer (Ghana, UK/EU data protection) | owner's quote | before launch |
| Company registration (FloorTest Labs, Ghana) | owner's quote | before launch |
| Apple Developer Program | $99 a year | when the apps go to the store (held) |
| Google Play registration | $25 once | same |
| App store fees | 15% of in-app sales (small business rate), absorbed per the 12 Oct decision | same |

## Sources

List prices read on 13 Oct 2026: [Vercel](https://vercel.com/pricing), [Neon](https://neon.com/pricing), [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/), [Resend](https://resend.com/pricing), [UptimeRobot](https://uptimerobot.com/pricing/), [Sentry](https://sentry.io/pricing/), [Paddle](https://www.paddle.com/pricing), [Fly.io](https://docs.fly.io/about/pricing). Vercel's billing API reports no charges for the team so far, which matches the Hobby plan.
