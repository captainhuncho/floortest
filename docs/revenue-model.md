# Revenue model

What FloorTest earns per plan after Paddle's cut, what the beta promise costs, and when subscriptions cover the running costs in `costs.md`. Written 13 Oct 2026 from the 12 Oct launch decisions. A sheet to argue with, not a forecast: change the assumptions and the arithmetic follows.

## What one subscriber is worth

Paddle takes 5% + $0.50 per checkout. Net per month, with yearly plans spread over 12 months:

| Plan | List | Paddle | Net a month | Fee share |
|---|---|---|---|---|
| Pro monthly | $6.99 | $0.85 | $6.14 | 12.2% |
| Pro yearly | $77.99 | $4.40 | $6.13 | 5.6% |
| Team monthly | $19.99 | $1.50 | $18.49 | 7.5% |
| Team yearly | $199 | $10.45 | $15.71 | 5.3% |
| Add-on seat, monthly | $4 | $0.70 | $3.30 | 17.5% |

Two things fall out of this:

- **Pro yearly earns the same as Pro monthly.** The 7% yearly discount is paid for by Paddle's lower fee share, so a yearly Pro costs nothing in margin, pays a year ahead and can't churn mid-year. Show it first.
- **Team yearly gives up 15%** ($15.71 against $18.49). Still worth offering for the cash and the commitment, but it is a real discount.

Paddle's page says orders under $10 need custom pricing agreed with Paddle. Pro monthly, add-on seats and any half-price Pro are under $10; see the flag in `costs.md`.

## The beta promise

Beta users keep their plan free for 6 months after billing starts, then pay 50% for 12 months. Assumed beta cohort on request plans: 10 Pro, 2 Team; 8 Pro and 2 Team still there when payment starts.

| Period | List price given up | Net we receive |
|---|---|---|
| Months 1–6 (free) | $659 | $0 |
| Months 7–18 (half price, monthly) | $659 | $487 |
| Total over 18 months | $1,319 | $487 |

A half-price Pro monthly is $3.50, of which Paddle takes $0.67 (19%). If the half-price year is sold as one yearly payment instead ($39 Pro, $99.50 Team), we net $480 for the year, almost the same, the fee share falls to 6%, the orders clear Paddle's $10 line and the cash arrives in month 7 rather than over a year. **Recommendation:** offer the beta discount as a half-price yearly plan.

The whole promise costs about $1,300 in list price over 18 months. It is cheap for what it buys: 12 reference customers and the honest story that early users were looked after.

## When subscriptions cover the running costs

Assumptions, base case:

- Billing switches on at public launch, taken as January 2027 (beta runs 8 weeks from 19 Oct).
- New desks a month: 100, 150, 200 in the first quarter (500 desks by March, the launch size in `costs.md`), then 150 a month.
- 4% of public desks on Pro and 1% on Team at any time, 30% of them yearly. Paid churn is inside those shares: they are the steady state, not a cumulative count.
- Running costs: $130 fixed, plus $0.025 per desk a month for storage (1.6 GB of audio and vault copy per desk), plus Sentry Team ($26) past 1,500 desks.
- Nothing for the owner's time, the lawyer, company registration or marketing. "Covered" below means the servers pay for themselves, nothing more.

| Month | Desks | Pro | Team | Beta net | Revenue | Costs | Month | Cumulative |
|---|---|---|---|---|---|---|---|---|
| Jan 27 | 150 | 4 | 1 | $0 | $42 | $134 | −$92 | −$92 |
| Feb 27 | 300 | 10 | 2 | $0 | $97 | $138 | −$41 | −$132 |
| Mar 27 | 500 | 18 | 4 | $0 | $181 | $142 | $39 | −$94 |
| Apr 27 | 650 | 24 | 6 | $0 | $253 | $146 | $107 | $13 |
| May 27 | 800 | 30 | 8 | $0 | $325 | $150 | $175 | $189 |
| Jun 27 | 950 | 36 | 9 | $0 | $380 | $154 | $226 | $415 |
| Jul 27 | 1,100 | 42 | 10 | $41 | $475 | $158 | $317 | $732 |
| Sep 27 | 1,400 | 54 | 14 | $41 | $619 | $165 | $454 | $1,572 |
| Dec 27 | 1,850 | 72 | 18 | $41 | $800 | $202 | $598 | $3,179 |
| Mar 28 | 2,300 | 90 | 22 | $41 | $981 | $214 | $768 | $5,331 |
| Jun 28 | 2,750 | 108 | 27 | $41 | $1,180 | $225 | $955 | $8,027 |

Base case: the servers are covered from March 2027, the launch spend is back by April, and the 18 months end about $8,000 ahead of running costs.

| Scenario | New desks a month after Q1 | Servers covered | Cumulative at Jun 28 |
|---|---|---|---|
| Low (half the sign-ups) | 75 | May 2027 | $3,200 |
| Base | 150 | March 2027 | $8,000 |
| High (double) | 300 | February 2027 | $18,000 |

The thing that moves the answer is not price or sign-ups but the paid share. At 2% Pro instead of 4%, 18-month revenue falls 28% ($11,262 to $8,126), the amount ahead of running costs falls 39% ($8,027 to $4,891), and the servers are covered in April 2027, not March. Team at 1% of desks brings 40% of the revenue, so that share matters as much. The beta metric that predicts this is desks hitting the 20-track limit and exporting crates; count them before announcing prices.

## What this says to do

1. Lead with yearly Pro. It nets the same as monthly, pays upfront and avoids the under-$10 problem.
2. Sell the beta discount as a half-price year, not twelve half-price months.
3. Ask Paddle about orders under $10 before checkout is built, or bill add-on seats inside the plan.
4. Pricing is not the lever. The paid share is. Watch desks at the 20-track limit through the beta.

## How the numbers were made

Net = list price minus (5% of list + $0.50). Yearly plans are divided by 12 for the monthly view. Revenue a month = Pro payers × $6.14 (70% monthly) and $6.13 (30% yearly) + Team payers × $18.49 and $15.71 in the same split + the beta cohort's half-price net from month 7. Costs as above. Recompute by hand or in a sheet; nothing here depends on the database.
