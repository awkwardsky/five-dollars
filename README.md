# five dollars

Automated project for building a small public data product and verifying the first inbound USDT-TRC20 payment of at least 5 USDT.

## Current Product

Government Opportunity Radar scans public U.S. government opportunity sources for software, AI, automation, cybersecurity, data, and cloud-related grants/contracts.

Generated outputs:

- `site/index.html` - public product page
- `site/about.html` - product and automation explanation
- `site/payment.html` - public payment request and latest milestone status
- `site/app.js` - static search/filter interface for the public page
- `site/opportunities/*.html` - generated detail pages for individual opportunities
- `site/topics/*.html` - topic landing pages
- `site/llms.txt` - compact machine-readable project summary
- `site/feed.xml` - RSS feed
- `site/sitemap.xml` - crawler sitemap
- `site/opportunities.json` - machine-readable opportunity data
- `site/payment-status.json` - public milestone status
- `site/payment-request.json` - machine-readable payment request
- `site/payment-qr.svg` - QR code for the public receive address
- `digests/latest.md` - email-ready digest
- `data/opportunities.sqlite` - local opportunity database
- `logs/payment-check-latest.json` - latest USDT receipt check
- `logs/github-issue-latest.json` - latest GitHub issue update result

## Payment Milestone

- Network: TRON
- Token: USDT TRC20
- Address: `TW4aVr9dQa4eAEyMmqfwYSyjs8Woq4aBgZ`
- Required first receipt: at least 5 USDT

## Commands

Install dependencies first:

```bash
npm ci
```

```bash
npm run fetch:opportunities
npm run build:site
npm run deliver:digest
npm run update:issue
npm run check:payment
npm run verify
npm run run:daily
npm run scheduler:install
npm run scheduler:run-now
npm run scheduler:status
npm run scheduler:uninstall
```

`run:daily` checks payment before building the public site so `site/payment-status.json` and the visible funding status reflect the latest chain lookup.

`update:issue` maintains one public GitHub issue with the current funding status and top opportunity links when `GITHUB_TOKEN`/`GH_TOKEN` and `GITHUB_REPOSITORY` are available. Without those variables it writes a skipped log and exits successfully.

`verify` runs the payment-core test fixture and checks the generated site for required files, local links, clean generated HTML, opportunity pages, topic pages, metadata, machine-readable payment artifacts, and payment-status synchronization.

## Deployment

See `DEPLOYMENT.md`.

The GitHub Actions workflow can run daily automation and deploy `site/` to GitHub Pages after the repository is pushed and Pages is configured to use GitHub Actions.

It also maintains a single public issue named `Five dollar milestone status` as a non-spam public status surface for the payment request and latest scan.

Optional secrets improve coverage:

- `SAM_API_KEY` enables SAM.gov contracts.
- `TRONGRID_API_KEY` raises TronGrid reliability.
- `TRONSCAN_API_KEY` enables the TronScan backup payment check.
- `RESEND_API_KEY` and `DIGEST_FROM_EMAIL` enable email delivery.

## Safety Boundaries

- No fake traffic
- No ad-click automation
- No spam
- No private keys or seed phrases
- No scraping behind login walls
- No revenue guarantee
