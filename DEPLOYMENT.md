# Deployment

The project can run without daily manual operation after one deployment path is configured.

## Option A: GitHub Actions

Use this when the project is pushed as a GitHub repository.

1. Push the `five dollars` directory as a repo.
2. Keep `.github/workflows/daily.yml`.
3. Add optional repository secrets:
   - `SAM_API_KEY`
   - `TRONGRID_API_KEY`
   - `TRONSCAN_API_KEY`
   - `RESEND_API_KEY`
   - `DIGEST_FROM_EMAIL`
   The workflow automatically uses the built-in `GITHUB_TOKEN` to maintain one public milestone issue.
4. Add optional repository variable:
   - `PUBLIC_SITE_URL`, for example `https://owner.github.io/repo`
5. In GitHub Pages settings, set the source to GitHub Actions.
6. The workflow runs every day at 00:17 UTC.

Outputs:

- `data/opportunities.sqlite`
- `digests/latest.md`
- `site/index.html`
- `site/about.html`
- `site/payment.html`
- `site/app.js`
- `site/opportunities/*.html`
- `site/topics/*.html`
- `site/llms.txt`
- `site/feed.xml`
- `site/sitemap.xml`
- `site/opportunities.json`
- `site/payment-status.json`
- `site/payment-request.json`
- `site/payment-qr.svg`
- `logs/*.json`
- GitHub issue: `Five dollar milestone status`

## Option B: Local macOS Scheduler

Use this when the Mac should run the automation once per day.

Run:

```bash
npm run scheduler:install
```

The LaunchAgent runs:

```bash
npm run run:daily
```

Logs are written to:

- `logs/launchd.out.log`
- `logs/launchd.err.log`

Check scheduler status:

```bash
npm run scheduler:status
```

Run the scheduled job immediately:

```bash
npm run scheduler:run-now
```

Remove the scheduler:

```bash
npm run scheduler:uninstall
```

## Revenue Reality

The automation can generate and publish the product, check payment, and deliver email when configured. It cannot create a paying customer by itself without public distribution. The lowest-friction next move is to deploy `site/` publicly and let the daily workflow update it.
