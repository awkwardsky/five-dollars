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
const releaseLogPath = resolve(rootDir, "logs/github-release-latest.json");
const releaseTag = "five-dollar-status";
const releaseName = "Five dollar status";
const releaseMarker = "<!-- five-dollars-status-release -->";

const checkedAt = new Date().toISOString();
const project = await readJson(projectPath);
const niche = (await readJson(nichePath)).primary;
const paymentStatus = await readJson(paymentLogPath);
const runLog = await readJson(runLogPath);
const opportunities = await readJson(opportunitiesPath);
const publicSiteUrl = normalizeSiteUrl(process.env.PUBLIC_SITE_URL ?? project.site?.publicUrl ?? "");

if (process.env.UPDATE_GITHUB_RELEASE === "0") {
  await writeLog({ checkedAt, skipped: true, reason: "UPDATE_GITHUB_RELEASE=0", releaseUrl: null });
  process.exit(0);
}

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
const repository = normalizeRepository(process.env.GITHUB_REPOSITORY ?? "");

if (!token || !repository) {
  const skipped = {
    checkedAt,
    skipped: true,
    reason: !token ? "GITHUB_TOKEN or GH_TOKEN is not set." : "GITHUB_REPOSITORY is not set.",
    releaseUrl: null,
  };
  await writeLog(skipped);
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}

const body = renderReleaseBody({
  project,
  niche,
  paymentStatus,
  runLog,
  opportunities,
  publicSiteUrl,
});
const existingRelease = await findStatusRelease({ repository, token });
const release = existingRelease
  ? await updateRelease({ repository, token, id: existingRelease.id, body })
  : await createRelease({ repository, token, body });

const result = {
  checkedAt,
  skipped: false,
  action: existingRelease ? "updated" : "created",
  releaseId: release.id,
  releaseUrl: release.html_url,
  tagName: release.tag_name,
  paymentReceived: Boolean(paymentStatus?.received),
  matchingTransferCount: paymentStatus?.matchingTransferCount ?? 0,
};

await writeLog(result);
console.log(JSON.stringify(result, null, 2));

async function findStatusRelease({ repository, token }) {
  const release = await githubRequest({
    repository,
    token,
    method: "GET",
    path: `/releases/tags/${encodeURIComponent(releaseTag)}`,
    allowNotFound: true,
  });

  return release?.id ? release : null;
}

async function createRelease({ repository, token, body }) {
  return githubRequest({
    repository,
    token,
    method: "POST",
    path: "/releases",
    body: {
      tag_name: releaseTag,
      target_commitish: "main",
      name: releaseName,
      body,
      draft: false,
      prerelease: false,
      make_latest: "true",
    },
  });
}

async function updateRelease({ repository, token, id, body }) {
  return githubRequest({
    repository,
    token,
    method: "PATCH",
    path: `/releases/${id}`,
    body: {
      name: releaseName,
      body,
      draft: false,
      prerelease: false,
      make_latest: "true",
    },
  });
}

async function githubRequest({ repository, token, method, path, body, allowNotFound = false }) {
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

  if (allowNotFound && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const message = responseBody.message ?? `GitHub API returned ${response.status}`;
    await writeLog({
      checkedAt,
      skipped: false,
      ok: false,
      error: message,
      status: response.status,
      releaseUrl: null,
    });
    throw new Error(message);
  }

  return responseBody;
}

function renderReleaseBody({ project: projectConfig, niche: activeNiche, paymentStatus: currentPaymentStatus, runLog: currentRunLog, opportunities: items, publicSiteUrl: baseUrl }) {
  const paymentReceived = Boolean(currentPaymentStatus?.received);
  const checked = currentPaymentStatus?.checkedAt ?? "not checked yet";
  const topItems = Array.isArray(items) ? items.slice(0, 8) : [];
  const topList = topItems
    .map((item, index) => {
      const pageUrl = absoluteUrl(baseUrl, `opportunities/${item.slug}.html`) || item.officialUrl;
      return `${index + 1}. [${escapeMarkdown(item.title)}](${pageUrl}) - ${escapeMarkdown(item.agency || "Unknown agency")} - deadline ${escapeMarkdown(item.closeDate || "not listed")}`;
    })
    .join("\n");

  return `${releaseMarker}
# Five dollar status

This release is updated automatically from the daily workflow. It is a stable, non-spam public status surface for the Government Opportunity Radar and the optional 5 USDT support target.

## Who it helps

Grant writers, business development teams, proposal teams, software companies, AI labs, cybersecurity teams, data teams, cloud teams, and research groups can use this as a daily shortlist of relevant U.S. government grants and contracts.

## Optional support

- Status: ${paymentReceived ? "received" : "not received yet"}
- Support target: ${projectConfig.payout.minimumReceipt} ${projectConfig.token.symbol}
- Network: ${projectConfig.network} / ${projectConfig.token.standard}
- Receive address: \`${projectConfig.payout.address}\`
- Matching transfers: ${currentPaymentStatus?.matchingTransferCount ?? 0}
- Last checked: ${checked}
- Public support page: ${absoluteUrl(baseUrl, "payment.html") || "site/payment.html"}
- Public status JSON: ${absoluteUrl(baseUrl, "payment-status.json") || "site/payment-status.json"}

## Product links

- Public site: ${absoluteUrl(baseUrl, "") || "not configured"}
- RSS feed: ${absoluteUrl(baseUrl, "feed.xml") || "site/feed.xml"}
- Opportunity JSON: ${absoluteUrl(baseUrl, "opportunities.json") || "site/opportunities.json"}
- LLM summary: ${absoluteUrl(baseUrl, "llms.txt") || "site/llms.txt"}
- Niche: ${activeNiche.name}
- Latest run: ${currentRunLog?.finishedAt ?? "not run yet"}
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
  await mkdir(dirname(releaseLogPath), { recursive: true });
  await writeFile(releaseLogPath, `${JSON.stringify(data, null, 2)}\n`);
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
