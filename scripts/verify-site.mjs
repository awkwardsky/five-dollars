import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const siteDir = resolve(rootDir, "site");
const paymentLogPath = resolve(rootDir, "logs/payment-check-latest.json");
const paymentStatusPath = resolve(siteDir, "payment-status.json");

const requiredFiles = [
  "index.html",
  "about.html",
  "payment.html",
  "styles.css",
  "app.js",
  "feed.xml",
  "llms.txt",
  "sitemap.xml",
  "robots.txt",
  "opportunities.json",
  "payment-status.json",
  "payment-request.json",
  "payment-qr.svg",
  ".nojekyll",
];

const errors = [];

for (const file of requiredFiles) {
  await assertFile(resolve(siteDir, file));
}

const paymentLog = await readJson(paymentLogPath);
const paymentStatus = await readJson(paymentStatusPath);
const paymentRequest = await readJson(resolve(siteDir, "payment-request.json"));

if (paymentLog.checkedAt !== paymentStatus.checkedAt || paymentLog.received !== paymentStatus.received) {
  errors.push("site/payment-status.json is not synchronized with logs/payment-check-latest.json");
}

if (paymentRequest?.address !== paymentStatus.address || paymentRequest?.amount !== String(paymentStatus.minimumReceipt)) {
  errors.push("site/payment-request.json does not match the configured public payment status");
}

const paymentQr = await readFile(resolve(siteDir, "payment-qr.svg"), "utf8");
if (!paymentQr.includes("<svg") || !paymentQr.includes("</svg>")) {
  errors.push("site/payment-qr.svg is not a valid SVG document");
}

if (!paymentQr.includes(paymentStatus.address)) {
  errors.push("site/payment-qr.svg does not reference the current payout address");
}

const llmsTxt = await readFile(resolve(siteDir, "llms.txt"), "utf8");
if (!llmsTxt.includes(paymentStatus.address) || !llmsTxt.includes("Government Opportunity Radar")) {
  errors.push("site/llms.txt does not include the product name and payout address");
}

const opportunities = await readJson(resolve(siteDir, "opportunities.json"));
if (!Array.isArray(opportunities) || opportunities.length < 30) {
  errors.push("site/opportunities.json should contain at least 30 opportunities");
}

const opportunityPages = await listFiles(resolve(siteDir, "opportunities"), ".html");
if (opportunityPages.length < 30) {
  errors.push("site/opportunities should contain at least 30 detail pages");
}

const topicPages = await listFiles(resolve(siteDir, "topics"), ".html");
if (topicPages.length < 3) {
  errors.push("site/topics should contain at least 3 topic pages");
}

const htmlFiles = [
  resolve(siteDir, "index.html"),
  resolve(siteDir, "about.html"),
  resolve(siteDir, "payment.html"),
  ...opportunityPages,
  ...topicPages,
];

for (const htmlFile of htmlFiles) {
  const html = await readFile(htmlFile, "utf8");
  assertNoBadContent(htmlFile, html);
  assertMetadata(htmlFile, html);
  await assertLocalLinks(htmlFile, html);
  await assertLocalAssetLinks(htmlFile, html);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`verify-site: ${error}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      htmlFiles: htmlFiles.length,
      opportunityPages: opportunityPages.length,
      topicPages: topicPages.length,
      paymentCheckedAt: paymentStatus.checkedAt,
      paymentReceived: paymentStatus.received,
      paymentQr: true,
      llmsTxt: true,
    },
    null,
    2,
  ),
);

async function assertFile(path) {
  try {
    await stat(path);
  } catch {
    errors.push(`missing required file: ${path}`);
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    errors.push(`failed to read JSON ${path}: ${error.message}`);
    return null;
  }
}

async function listFiles(dir, extension) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && extname(entry.name) === extension)
      .map((entry) => resolve(dir, entry.name));
  } catch {
    return [];
  }
}

function assertNoBadContent(path, html) {
  const badPatterns = [/href="#"/, /&amp;#/, /&nbsp;/, /&rsquo;/, /&ldquo;/, /&rdquo;/, /¿/];

  for (const pattern of badPatterns) {
    if (pattern.test(html)) {
      errors.push(`${path} contains bad content pattern ${pattern}`);
    }
  }
}

function assertMetadata(path, html) {
  const requiredPatterns = [
    /<meta property="og:title"/,
    /<meta property="og:description"/,
    /<meta name="twitter:card"/,
    /<script type="application\/ld\+json">/,
  ];

  for (const pattern of requiredPatterns) {
    if (!pattern.test(html)) {
      errors.push(`${path} is missing metadata pattern ${pattern}`);
    }
  }
}

async function assertLocalLinks(path, html) {
  const hrefPattern = /href="([^"]+)"/g;
  const localLinks = [...html.matchAll(hrefPattern)]
    .map((match) => match[1])
    .filter((href) => !href.startsWith("https://"))
    .filter((href) => !href.startsWith("http://"))
    .filter((href) => !href.startsWith("mailto:"))
    .filter((href) => !href.startsWith("#"));

  for (const href of localLinks) {
    const linkPath = resolve(dirname(path), href.split("#")[0]);
    try {
      await stat(linkPath);
    } catch {
      errors.push(`${path} links to missing local file: ${href}`);
    }
  }
}

async function assertLocalAssetLinks(path, html) {
  const srcPattern = /src="([^"]+)"/g;
  const localSources = [...html.matchAll(srcPattern)]
    .map((match) => match[1])
    .filter((src) => !src.startsWith("https://"))
    .filter((src) => !src.startsWith("http://"))
    .filter((src) => !src.startsWith("data:"));

  for (const src of localSources) {
    const assetPath = resolve(dirname(path), src.split("#")[0]);
    try {
      await stat(assetPath);
    } catch {
      errors.push(`${path} references missing local asset: ${src}`);
    }
  }
}
