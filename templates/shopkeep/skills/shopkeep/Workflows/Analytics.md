# Analytics Workflow

Generate sales reports and business insights for the storefront owner.

## Steps

1. **Determine Report Period**
   - Parse owner's request for time range:
     - "today" / "daily" -> last 24 hours
     - "this week" / "weekly" -> last 7 days
     - "this month" / "monthly" -> last 30 days
     - "all time" / no qualifier -> since storefront creation
   - Default to weekly if ambiguous

2. **Gather Data**
   - Fetch analytics from API: `GET /v1/storefronts/{id}/analytics?period={period}`
   - Supplement with local transaction log for real-time data
   - Compute:
     - Total revenue (sats)
     - Approximate USD value (using current BTC/USD rate if available)
     - Number of completed transactions
     - Number of unique buyers
     - Average order value (sats)
     - Average rating across rated purchases

3. **Identify Top Performers**
   - Top 5 listings by revenue
   - Top 5 listings by transaction count
   - Fastest-growing listings (most sales increase period-over-period)
   - Categories ranked by total revenue

4. **Generate Report**
   Format as clean markdown:

   ```
   ## Sales Report: [Period]

   | Metric | Value | Trend |
   |--------|-------|-------|
   | Revenue | 12,500 sats (~$10.00) | +15% |
   | Transactions | 23 | +8% |
   | Unique Buyers | 18 | +12% |
   | Avg Order Value | 543 sats | +3% |
   | Avg Rating | 4.7/5 | -- |

   ### Top Sellers
   | # | Listing | Sales | Revenue |
   |---|---------|-------|---------|
   | 1 | Articulated Dragon STL | 8 | 4,000 sats |
   | 2 | Gear Set SVG Pack | 6 | 3,600 sats |
   | 3 | ... | ... | ... |

   ### Category Breakdown
   | Category | Revenue | % of Total |
   |----------|---------|-----------|
   | STL | 7,500 sats | 60% |
   | SVG | 3,600 sats | 29% |
   | Other | 1,400 sats | 11% |
   ```

   - Use trend indicators: up arrow for growth, down arrow for decline, dash for flat
   - Include period-over-period comparison when previous period data exists

5. **Provide Insights**
   - Which categories sell best and why (price point? demand?)
   - Price point analysis: are lower-priced items moving faster? Is there a sweet spot?
   - Time-of-day patterns if enough data exists
   - Suggestions for new listings based on popular tags and categories
   - Listings with zero sales that might need better descriptions or pricing

6. **Deliver**
   - Present the markdown report directly in the conversation
   - Offer to export as CSV if the owner needs raw data
   - Offer to set up recurring reports (daily/weekly summary)

## Verification

- [ ] Revenue totals match sum of individual transactions
- [ ] All active listings accounted for in the report
- [ ] Trend percentages calculated correctly against previous period
- [ ] No fabricated data -- report "insufficient data" if sample size is too small
- [ ] USD approximation clearly labeled as approximate
