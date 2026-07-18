# five dollars

Automated project for publishing a searchable daily shortlist of U.S. government grants and contracts for software, AI, data, cybersecurity, automation, and cloud teams, with public verification for an optional 5 USDT TRC20 support target.

<!-- five-dollars-status:start -->
## Live Status

- Product: Software, AI, and Automation Opportunities
- What it is: Searchable daily shortlist of U.S. government grants and contracts for software, AI, data, cybersecurity, automation, and cloud teams.
- Best use: Start with the homepage priority picks; each lead explains why it is worth reviewing before the full list.
- Who it helps: Grant writers, business development teams, proposal teams, software companies, AI labs, cybersecurity teams, data teams, cloud teams, and research groups.
- Public site: https://awkwardsky.github.io/five-dollars/
- Support page: https://awkwardsky.github.io/five-dollars/payment.html
- Support status JSON: https://awkwardsky.github.io/five-dollars/payment-status.json
- GitHub status issue: https://github.com/awkwardsky/five-dollars/issues/1
- GitHub status release: https://github.com/awkwardsky/five-dollars/releases/tag/five-dollar-status
- RSS feed: https://awkwardsky.github.io/five-dollars/feed.xml
- Funding metadata: `.github/FUNDING.yml`

### Optional Support

- Status: Not received yet
- Support target: 5 USDT
- Network: TRON / TRC20
- Receive address: `TW4aVr9dQa4eAEyMmqfwYSyjs8Woq4aBgZ`
- Matching transfers: 0
- Last checked: 2026-07-18T03:36:36.215Z
- Latest run: 2026-07-18T03:36:36.073Z

### Current Top Opportunities

1. [Pathways to Enable Secure Open-Source Ecosystems](https://awkwardsky.github.io/five-dollars/opportunities/grants-gov-361333-pathways-to-enable-secure-open-source-ecosystems.html) - U.S. National Science Foundation - deadline 09/01/2026
2. [U.S.-D.R. Technology and Science Fair](https://awkwardsky.github.io/five-dollars/opportunities/grants-gov-362758-u-s-d-r-technology-and-science-fair.html) - U.S. Mission to the Dominican Republic - deadline 07/10/2026
3. [Tech Innovation Lab](https://awkwardsky.github.io/five-dollars/opportunities/grants-gov-362392-tech-innovation-lab.html) - U.S. Mission to Morocco - deadline 07/13/2026
4. [Prosperity Stack Fellowship](https://awkwardsky.github.io/five-dollars/opportunities/grants-gov-362757-prosperity-stack-fellowship.html) - U.S. Mission to South Korea - deadline 07/13/2026
5. [FY 2026 CN Technology Innovation Grant for Child and Adult Care Food Program Integrity](https://awkwardsky.github.io/five-dollars/opportunities/grants-gov-362971-fy-2026-cn-technology-innovation-grant-for-child-and-adult-care-food-p.html) - Food and Nutrition Service - deadline 07/31/2026
<!-- five-dollars-status:end -->

## Current Product

Government Opportunity Radar scans public U.S. government opportunity sources for software, AI, automation, cybersecurity, data, and cloud-related grants/contracts. It is built for grant writers, business development teams, proposal teams, software companies, AI labs, cybersecurity teams, data teams, cloud teams, and research groups that want a daily shortlist instead of a broad manual search.

The homepage now starts with priority picks: a smaller set of leads ranked by fit, deadline, topic match, and usable details such as listed funding amount. Each pick explains why it is worth reviewing before the full list.

Generated outputs:

- `.github/FUNDING.yml` - GitHub Sponsor button metadata pointing to the public support page
- `site/index.html` - public product page
- `site/about.html` - product and automation explanation
- `site/payment.html` - optional support request and latest receipt status
- `site/app.js` - static search/filter interface for the public page
- `site/opportunities/*.html` - generated detail pages for individual opportunities
- `site/topics/*.html` - topic landing pages
- `site/llms.txt` - compact machine-readable project summary
- `site/feed.xml` - RSS feed
- `site/sitemap.xml` - crawler sitemap
- `site/opportunities.json` - machine-readable opportunity data
- `site/payment-status.json` - public support receipt status
- `site/payment-request.json` - machine-readable support request
- `site/payment-qr.svg` - QR code for the public receive address
- `digests/latest.md` - email-ready digest
- `data/opportunities.sqlite` - local opportunity database
- `logs/payment-check-latest.json` - latest USDT receipt check
- `logs/github-issue-latest.json` - latest GitHub issue update result
- `logs/github-release-latest.json` - latest GitHub release update result

## Optional Support

- Network: TRON
- Token: USDT TRC20
- Address: `TW4aVr9dQa4eAEyMmqfwYSyjs8Woq4aBgZ`
- Support target: at least 5 USDT

## Commands

Install dependencies first:

```bash
npm ci
```

```bash
npm run fetch:opportunities
npm run build:site
npm run deliver:digest
npm run update:readme
npm run update:issue
npm run update:release
npm run check:payment
npm run verify
npm run run:daily
npm run scheduler:install
npm run scheduler:run-now
npm run scheduler:status
npm run scheduler:uninstall
```

`run:daily` checks the public receive address before building the public site so `site/payment-status.json` and the visible support status reflect the latest chain lookup.

`update:readme` refreshes the live status block on this README so the GitHub repository homepage reflects the latest payment check and product links.

`update:issue` maintains one public GitHub issue with the current support status and top opportunity links when `GITHUB_TOKEN`/`GH_TOKEN` and `GITHUB_REPOSITORY` are available. Without those variables it writes a skipped log and exits successfully.

`update:release` maintains one public GitHub release tagged `five-dollar-status` with the same support status and product links. It updates the existing release instead of creating daily releases.

`verify` runs the payment-core test fixture, checks generated site artifacts, and validates repo-level automation metadata such as the Sponsor button funding URL and daily issue/release update commands.

## Deployment

See `DEPLOYMENT.md`.

The GitHub Actions workflow can run daily automation and deploy `site/` to GitHub Pages after the repository is pushed and Pages is configured to use GitHub Actions.

It also maintains a single public issue and one stable release tagged `five-dollar-status` as non-spam public status surfaces for the optional support request and latest shortlist.

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
