import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const readmePath = resolve(rootDir, "README.md");
const projectPath = resolve(rootDir, "config/project.json");
const nichePath = resolve(rootDir, "config/niches.json");
const paymentLogPath = resolve(rootDir, "logs/payment-check-latest.json");
const runLogPath = resolve(rootDir, "logs/run-latest.json");
const issueLogPath = resolve(rootDir, "logs/github-issue-latest.json");
const releaseLogPath = resolve(rootDir, "logs/github-release-latest.json");
const opportunitiesPath = resolve(rootDir, "site/opportunities.json");
const markerStart = "<!-- five-dollars-status:start -->";
const markerEnd = "<!-- five-dollars-status:end -->";

const project = await readJson(projectPath);
const niche = (await readJson(nichePath)).primary;
const paymentStatus = await readJson(paymentLogPath);
const runLog = await readJson(runLogPath);
const issueLog = await readJsonIfExists(issueLogPath);
const releaseLog = await readJsonIfExists(releaseLogPath);
const opportunities = await readJson(opportunitiesPath);
const publicSiteUrl = normalizeSiteUrl(process.env.PUBLIC_SITE_URL ?? project.site?.publicUrl ?? "");
const repository = normalizeRepository(process.env.GITHUB_REPOSITORY ?? "awkwardsky/five-dollars");
const currentReadme = await readFile(readmePath, "utf8");
const block = renderStatusBlock({
  project,
  niche,
  paymentStatus,
  runLog,
  issueLog,
  releaseLog,
  opportunities,
  publicSiteUrl,
  repository,
});
const nextReadme = upsertBlock(currentReadme, block);

await writeFile(readmePath, nextReadme);

console.log(
  JSON.stringify(
    {
      updatedAt: new Date().toISOString(),
      paymentReceived: Boolean(paymentStatus?.received),
      matchingTransferCount: paymentStatus?.matchingTransferCount ?? 0,
      readme: readmePath,
    },
    null,
    2,
  ),
);

function renderStatusBlock({ project: projectConfig, niche: activeNiche, paymentStatus: currentPaymentStatus, runLog: currentRunLog, issueLog: currentIssueLog, releaseLog: currentReleaseLog, opportunities: items, publicSiteUrl: baseUrl, repository: repo }) {
  const paymentReceived = Boolean(currentPaymentStatus?.received);
  const status = paymentReceived ? "Received" : "Waiting for first qualifying transfer";
  const issueUrl = currentIssueLog?.issueUrl || (repo ? `https://github.com/${repo}/issues/1` : "");
  const releaseUrl = currentReleaseLog?.releaseUrl || (repo ? `https://github.com/${repo}/releases/tag/five-dollar-status` : "");
  const topItems = Array.isArray(items) ? items.slice(0, 5) : [];
  const topList = topItems
    .map((item, index) => {
      const pageUrl = absoluteUrl(baseUrl, `opportunities/${item.slug}.html`) || item.officialUrl;
      return `${index + 1}. [${escapeMarkdown(item.title)}](${pageUrl}) - ${escapeMarkdown(item.agency || "Unknown agency")} - deadline ${escapeMarkdown(item.closeDate || "not listed")}`;
    })
    .join("\n");

  return `${markerStart}
## Live Status

- Product: ${activeNiche.name}
- Public site: ${absoluteUrl(baseUrl, "") || "https://awkwardsky.github.io/five-dollars/"}
- Payment page: ${absoluteUrl(baseUrl, "payment.html") || "https://awkwardsky.github.io/five-dollars/payment.html"}
- Payment status JSON: ${absoluteUrl(baseUrl, "payment-status.json") || "https://awkwardsky.github.io/five-dollars/payment-status.json"}
- GitHub status issue: ${issueUrl || "not configured"}
- GitHub status release: ${releaseUrl || "not configured"}
- RSS feed: ${absoluteUrl(baseUrl, "feed.xml") || "https://awkwardsky.github.io/five-dollars/feed.xml"}
- Funding metadata: \`.github/FUNDING.yml\`

### Payment

- Status: ${status}
- Required first receipt: ${projectConfig.payout.minimumReceipt} ${projectConfig.token.symbol}
- Network: ${projectConfig.network} / ${projectConfig.token.standard}
- Receive address: \`${projectConfig.payout.address}\`
- Matching transfers: ${currentPaymentStatus?.matchingTransferCount ?? 0}
- Last checked: ${currentPaymentStatus?.checkedAt ?? "not checked yet"}
- Latest run: ${currentRunLog?.finishedAt ?? "not run yet"}

### Current Top Opportunities

${topList || "No opportunities generated yet."}
${markerEnd}`;
}

function upsertBlock(readme, block) {
  if (readme.includes(markerStart) && readme.includes(markerEnd)) {
    return readme.replace(new RegExp(`${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}`), block);
  }

  const insertionPoint = "\n## Current Product";
  if (readme.includes(insertionPoint)) {
    return readme.replace(insertionPoint, `\n${block}\n${insertionPoint}`);
  }

  return `${readme.trimEnd()}\n\n${block}\n`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
