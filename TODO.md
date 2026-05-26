# five dollars TODO

## Immediate Build Order

1. Done: collect one public USDT-TRC20 payout address from the user.
2. Done: store the address in project configuration as a public receive-only value.
3. Done: build a TRC20 receipt checker that confirms inbound USDT transfers >= 5 USDT.
4. Done: build the data prototype for Government Opportunity Radar.
5. Done: generate daily opportunity digests from public government data.
6. Done: add optional email delivery via Resend.
7. Done: add crypto payment instructions for first USDT milestone.
8. Done: add scheduled GitHub Actions job so the project can run without daily manual operation after deployment.
9. Done: generate a static public page from the latest opportunity data.
10. Done: add deployment and local scheduler instructions.
11. Done: add README with commands, outputs, and safety boundaries.
12. Done: generate opportunity detail pages, topic landing pages, and public payment status JSON.
13. Done: add payment logic tests and generated-site verification.
14. Done: install and document local daily scheduler.
15. Done: add scheduler status/run-now commands and verify launchd can execute the daily pipeline.
16. Done: add offline payment QR generation and machine-readable payment request.
17. Done: add dedicated public payment/about pages, share metadata, structured data, and `llms.txt`.
18. Done: add a static search/filter interface over generated opportunity data.
19. Done: add automated GitHub milestone issue updates for one stable public status surface.
20. Done: add automated GitHub status release updates under one stable tag.
21. Done: add GitHub funding metadata that points the repository Sponsor button to the payment page.

## Non-Negotiable Constraints

- No fake traffic.
- No ad-click automation.
- No spam.
- No private keys or seed phrases.
- No scraping behind login walls.
- No claims that revenue is guaranteed.

## First Technical Prototype

The first useful prototype should produce these files automatically:

- `data/opportunities.sqlite`
- `digests/latest.md`
- `logs/run-latest.json`
- `logs/payment-check-latest.json`

## First Revenue Check

The project stops pursuing the first milestone only after the configured public USDT-TRC20 address receives an inbound USDT transfer of at least 5 USDT.
