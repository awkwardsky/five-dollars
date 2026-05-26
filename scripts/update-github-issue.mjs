import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const projectPath = resolve(rootDir, "config/project.json");
const nichePath = resolve(rootDir, "config/niches.json");
const paymentLogPath = resolve(rootDir, "logs/payment-check-latest.json");
const runLogPath = resolve(rootDir, "logs/run-latest.json");
const opportunitiesPath = resolve(rootDir, "site/opportunities.json");
const issueLogPath = resolve(rootDir, "logs/github-issue-latest.json");
const issueTitle = "Five dollar milestone status";
const issueMarker = "<!-- five-dollars-status-issue -->";

const checkedAt = new Date().toISOString();
const project = await readJson(projectPath);
const niche = (await readJson(nichePath)).primary;
const paymentStatus = await readJson(paymentLogPath);
const runLog = await readJson(runLogPath);
const opportunities = await readJson(opportunitiesPath);
const publicSiteUrl = normalizeSiteUrl(process.env.PUBLIC_SITE_URL ?? project.site?.publicUrl ?? "");

if (process.env.UPDATE_GITHUB_ISSUE === "0") {
  await writeLog({ checkedAt, skipped: true, reason: "UPDATE_GITHUB_ISSUE=0", issueUrl: null });
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
const repository = normalizeRepository(process.env.GITHUB_REPOSITORY ?? "");

if (!token || !repository) {
  const skipped = {
    checkedAt,
    skipped: true,
    reason: !token ? "GITHUB_TOKEN or GH_TOKEN is not set." : "GITHUB_REPOSITORY is not set.",
    issueUrl: null,
  };
  await writeLog(skipped);
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}

const body = renderIssueBody({
  project,
  niche,
  paymentStatus,
  runLog,
  opportunities,
  publicSiteUrl,
});
const existingIssue = await findStatusIssue({ repository, token });
const paymentReceived = Boolean(paymentStatus?.received);
const state = paymentReceived ? "closed" : "open";
const issue = existingIssue
  ? await updateIssue({ repository, token, number: existingIssue.number, body, state })
  : await createIssue({ repository, token, body, state });

const result = {
  checkedAt,
  skipped: false,
  action: existingIssue ? "updated" : "created",
  issueNumber: issue.number,
  issueUrl: issue.html_url,
  paymentReceived,
  matchingTransferCount: paymentStatus?.matchingTransferCount ?? 0,
};

await writeLog(result);
console.log(JSON.stringify(result, null, 2));

async function findStatusIssue({ repository, token }) {
  const issues = await githubRequest({
    repository,
    token,
    method: "GET",
    path: "/issues?state=all&per_page=100",
  });

  return issues.find((issue) => {
    if (issue.pull_request) {
      return false;
    }

    return issue.title === issueTitle || String(issue.body ?? "").includes(issueMarker);
  }) ?? null;
}

async function createIssue({ repository, token, body, state }) {
  const issue = await githubRequest({
    repository,
    token,
    method: "POST",
    path: "/issues",
    body: {
      title: issueTitle,
      body,
    },
  });

  if (state === "closed") {
    return updateIssue({ repository, token, number: issue.number, body, state });
  }

  return issue;
}

async function updateIssue({ repository, token, number, body, state }) {
  return githubRequest({
    repository,
    token,
    method: "PATCH",
    path: `/issues/${number}`,
    body: {
      title: issueTitle,
      body,
      state,
    },
  });
}

async function githubRequest({ repository, token, method, path, body }) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "five-dollars-automation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = responseBody.message ?? `GitHub API returned ${response.status}`;
    await writeLog({
      checkedAt,
      skipped: false,
      ok: false,
      error: message,
      status: response.status,
      issueUrl: null,
    });
    throw new Error(message);
  }

  return responseBody;
}

function renderIssueBody({ project: projectConfig, niche: activeNiche, paymentStatus: currentPaymentStatus, runLog: currentRunLog, opportunities: items, publicSiteUrl: baseUrl }) {
  const paymentReceived = Boolean(currentPaymentStatus?.received);
  const checked = currentPaymentStatus?.checkedAt ?? "not checked yet";
  const topItems = Array.isArray(items) ? items.slice(0, 10) : [];
  const topList = topItems
    .map((item, index) => {
      const pageUrl = absoluteUrl(baseUrl, `opportunities/${item.slug}.html`) || item.officialUrl;
      return `${index + 1}. [${escapeMarkdown(item.title)}](${pageUrl}) - ${escapeMarkdown(item.agency || "Unknown agency")} - deadline ${escapeMarkdown(item.closeDate || "not listed")}`;
    })
    .join("\n");

  return `${issueMarker}
# Five dollar milestone status

This issue is maintained automatically by the daily workflow. It keeps the public funding request and the latest opportunity scan visible in one stable GitHub surface.

## Payment

- Status: ${paymentReceived ? "received" : "waiting for first qualifying transfer"}
- Required first receipt: ${projectConfig.payout.minimumReceipt} ${projectConfig.token.symbol}
- Network: ${projectConfig.network} / ${projectConfig.token.standard}
- Receive address: \`${projectConfig.payout.address}\`
- Matching transfers: ${currentPaymentStatus?.matchingTransferCount ?? 0}
- Last checked: ${checked}
- Public status JSON: ${absoluteUrl(baseUrl, "payment-status.json") || "site/payment-status.json"}
- Payment request JSON: ${absoluteUrl(baseUrl, "payment-request.json") || "site/payment-request.json"}

## Product

- Public site: ${absoluteUrl(baseUrl, "") || "not configured"}
- RSS feed: ${absoluteUrl(baseUrl, "feed.xml") || "site/feed.xml"}
- Opportunity JSON: ${absoluteUrl(baseUrl, "opportunities.json") || "site/opportunities.json"}
- Niche: ${activeNiche.name}
- Latest run: ${currentRunLog?.finishedAt ?? "not run yet"}
- Sources checked: Grants.gov ${currentRunLog?.fetched?.grants ?? 0}, SAM.gov ${currentRunLog?.fetched?.sam ?? 0}
- Matched opportunities: ${currentRunLog?.matched ?? 0}

## Current top opportunities

${topList || "No opportunities generated yet."}

## Boundaries

No fake traffic, ad-click automation, spam, private keys, seed phrases, login-wall scraping, or revenue guarantees.
`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeLog(data) {
  await mkdir(dirname(issueLogPath), { recursive: true });
  await writeFile(issueLogPath, `${JSON.stringify(data, null, 2)}\n`);
}

function absoluteUrl(baseUrl, path) {
  if (!baseUrl) {
    return "";
  }

  const cleanedPath = String(path ?? "").replace(/^\/+/g, "");
  return cleanedPath ? `${baseUrl}/${cleanedPath}` : `${baseUrl}/`;
}

function escapeMarkdown(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function normalizeSiteUrl(value) {
  const url = String(value ?? "").trim().replace(/\/+$/, "");

  if (!url || !/^https:\/\//.test(url)) {
    return "";
  }

  return url;
}

function normalizeRepository(value) {
  const repository = String(value ?? "").trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ? repository : "";
}
