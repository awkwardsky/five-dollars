import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const dbPath = resolve(rootDir, "data/opportunities.sqlite");
const projectPath = resolve(rootDir, "config/project.json");
const nichePath = resolve(rootDir, "config/niches.json");
const paymentLogPath = resolve(rootDir, "logs/payment-check-latest.json");
const siteDir = resolve(rootDir, "site");
const opportunitiesDir = resolve(siteDir, "opportunities");
const topicsDir = resolve(siteDir, "topics");

const project = JSON.parse(await readFile(projectPath, "utf8"));
const niche = JSON.parse(await readFile(nichePath, "utf8")).primary;
const paymentStatus = await readJsonIfExists(paymentLogPath);
const publicSiteUrl = normalizeSiteUrl(process.env.PUBLIC_SITE_URL ?? project.site?.publicUrl ?? "");
const siteTitle = "Government Opportunity Radar";
const siteDescription =
  "Searchable daily shortlist of U.S. government grants and contracts for software, AI, data, cybersecurity, automation, and cloud teams.";
const db = new DatabaseSync(dbPath);
const opportunities = db
  .prepare(`
    SELECT
      source,
      source_id as sourceId,
      title,
      agency,
      opportunity_number as opportunityNumber,
      status,
      open_date as openDate,
      close_date as closeDate,
      amount,
      score,
      summary,
      official_url as officialUrl
    FROM opportunities
    WHERE niche_id = ?
    ORDER BY score DESC, close_date = '', close_date ASC
    LIMIT 60
  `)
  .all(niche.id);
db.close();

const pages = opportunities.map(normalizeOpportunity).map((opportunity) => ({
  ...opportunity,
  slug: opportunitySlug(opportunity),
}));
const topOpportunities = pages.slice(0, 30);
const topics = buildTopics(pages, niche);
const paymentQrSvg = await QRCode.toString(project.payout.address, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 2,
  width: 256,
  color: {
    dark: "#17212b",
    light: "#ffffff",
  },
});
const paymentRequest = {
  network: project.network,
  token: project.token.symbol,
  standard: project.token.standard,
  contractAddress: project.token.contractAddress,
  amount: project.payout.minimumReceipt,
  address: project.payout.address,
  qrPayload: project.payout.address,
};

await mkdir(siteDir, { recursive: true });
await rm(opportunitiesDir, { recursive: true, force: true });
await rm(topicsDir, { recursive: true, force: true });
await mkdir(opportunitiesDir, { recursive: true });
await mkdir(topicsDir, { recursive: true });

await writeFile(resolve(siteDir, "index.html"), renderPage({ project, niche, opportunities: pages, topics, paymentStatus }));
await writeFile(
  resolve(siteDir, "about.html"),
  renderAboutPage({ project, niche, opportunities: pages, topics, paymentStatus }),
);
await writeFile(
  resolve(siteDir, "payment.html"),
  renderPaymentPage({ project, niche, opportunities: pages, paymentStatus, paymentRequest }),
);
await writeFile(resolve(siteDir, "styles.css"), renderStyles());
await writeFile(resolve(siteDir, "app.js"), renderAppScript());
await writeFile(resolve(siteDir, "opportunities.json"), `${JSON.stringify(pages, null, 2)}\n`);
await writeFile(resolve(siteDir, "payment-status.json"), `${JSON.stringify(paymentStatus ?? {}, null, 2)}\n`);
await writeFile(resolve(siteDir, "payment-request.json"), `${JSON.stringify(paymentRequest, null, 2)}\n`);
await writeFile(resolve(siteDir, "payment-qr.svg"), annotatePaymentQrSvg(paymentQrSvg, paymentRequest));
await writeFile(resolve(siteDir, "llms.txt"), renderLlmsTxt({ project, niche, opportunities: topOpportunities, topics, paymentStatus }));
await writeFile(resolve(siteDir, "feed.xml"), renderFeed({ niche, opportunities: topOpportunities, publicSiteUrl }));
await writeFile(resolve(siteDir, "sitemap.xml"), renderSitemap({ publicSiteUrl, opportunities: pages, topics }));
await writeFile(resolve(siteDir, "robots.txt"), renderRobots({ publicSiteUrl }));
await writeFile(resolve(siteDir, ".nojekyll"), "");

for (const opportunity of pages) {
  await writeFile(
    resolve(opportunitiesDir, `${opportunity.slug}.html`),
    renderOpportunityPage({ project, niche, opportunity, paymentStatus }),
  );
}

for (const topic of topics) {
  await writeFile(resolve(topicsDir, `${topic.slug}.html`), renderTopicPage({ project, niche, topic, paymentStatus }));
}

console.log(
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      output: resolve(siteDir, "index.html"),
      opportunities: pages.length,
      detailPages: pages.length,
      topicPages: topics.length,
    },
    null,
    2,
  ),
);

function renderPage({ project: projectConfig, niche: activeNiche, opportunities: items, topics: topicItems, paymentStatus: currentPaymentStatus }) {
  const visibleItems = items.slice(0, 30);
  const priorityPicks = buildPriorityPicks(items, topicItems);
  const nextDeadline = findNextDeadline(items);
  const generatedAt = new Date().toISOString();
  const paymentReceived = Boolean(currentPaymentStatus?.received);

  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  title: siteTitle,
  description: siteDescription,
  cssPath: "styles.css",
  feedPath: "feed.xml",
  canonicalPath: "",
  jsonLd: renderHomeStructuredData({ activeNiche, items, topicItems, generatedAt }),
})}
  </head>
  <body>
    <main class="page">
      ${renderTopNav(".", "index")}
      <section class="masthead" aria-labelledby="page-title">
        <div class="masthead-copy">
          <p class="eyebrow">Government Opportunity Radar</p>
          <h1 id="page-title">Government funding opportunities, shortlisted daily.</h1>
          <p class="summary">Search current U.S. grant and contract opportunities for software, AI, cybersecurity, data, automation, and cloud work without checking multiple government portals by hand.</p>
        </div>
        <div class="status-panel" aria-label="Current scan status">
          <div>
            <span>Listings found</span>
            <strong>${items.length}</strong>
          </div>
          <div>
            <span>Topics</span>
            <strong>${topicItems.length}</strong>
          </div>
          <div>
            <span>Next deadline</span>
            <strong>${escapeHtml(nextDeadline)}</strong>
          </div>
        </div>
      </section>

      <section class="audience-section" aria-labelledby="audience-title">
        <div>
          <h2 id="audience-title">Built for teams that need a shorter research list.</h2>
          <p>Each run turns public Grants.gov records, plus SAM.gov records when available, into searchable matches, topic pages, RSS, JSON, and direct source links.</p>
        </div>
        <ul class="audience-list">
          <li><strong>Business development and proposal teams</strong><span>Find relevant grant and contract leads before writing a bid.</span></li>
          <li><strong>Software, AI, cyber, data, and cloud teams</strong><span>Track public-sector demand in areas your team can serve.</span></li>
          <li><strong>Grant writers and researchers</strong><span>Start from a ranked shortlist instead of a broad keyword search.</span></li>
        </ul>
      </section>

      <section class="priority-section" aria-labelledby="priority-title">
        <div class="section-heading">
          <h2 id="priority-title">Start with these ${priorityPicks.length} leads</h2>
          <span>ranked by fit, deadline, and useful details</span>
        </div>
        <p class="section-note">These are not guaranteed wins. They are the current opportunities with the clearest reasons to inspect first.</p>
        <div class="priority-grid">
          ${priorityPicks.map(renderPriorityPick).join("\n")}
        </div>
      </section>

      <section class="topic-section" aria-labelledby="topics-title">
        <div class="section-heading">
          <h2 id="topics-title">Topics covered</h2>
          <span>${topicItems.length} topics</span>
        </div>
        <div class="topic-grid">
          ${topicItems.map(renderTopicCard).join("\n")}
        </div>
      </section>

      <section class="search-section" aria-labelledby="search-title">
        <div class="section-heading">
          <h2 id="search-title">Search this shortlist</h2>
          <span id="search-count">${items.length} opportunities</span>
        </div>
        <div class="search-controls">
          <label>
            <span>Search</span>
            <input id="opportunity-search" type="search" autocomplete="off" placeholder="title, agency, keyword" />
          </label>
          <label>
            <span>Topic</span>
            <select id="topic-filter">
              <option value="">All topics</option>
              ${topicItems.map((topic) => `<option value="${escapeAttribute(topic.name)}">${escapeHtml(topic.name)}</option>`).join("\n")}
            </select>
          </label>
        </div>
        <div id="search-results" class="search-results" aria-live="polite"></div>
      </section>

      <section class="opportunity-list" aria-labelledby="opportunities-title">
        <div class="section-heading">
          <h2 id="opportunities-title">Today's opportunity shortlist</h2>
          <span>${visibleItems.length} opportunities</span>
        </div>
        ${visibleItems.map(renderOpportunity).join("\n")}
      </section>

      <section class="support-inline" aria-labelledby="support-inline-title">
        <div>
          <h2 id="support-inline-title">${paymentReceived ? "Support target received." : "If this shortlist saved research time, support the next run."}</h2>
          <p>${paymentReceived ? "The 5 USDT support target has been received and recorded by the automated checker." : "Use the shortlist for free. A 5 USDT contribution helps keep the daily scan running and is verified automatically on-chain."}</p>
        </div>
        <div class="support-inline-actions">
          <a class="primary-link" href="payment.html">${paymentReceived ? "View receipt status" : "Support this scan"}</a>
          <a class="text-link" href="payment.html">Support status</a>
          <a class="text-link" href="feed.xml">RSS</a>
          <a class="text-link" href="opportunities.json">JSON</a>
        </div>
      </section>
    </main>
    ${renderOpportunityDataScript({ opportunities: items, topics: topicItems })}
    <script src="app.js"></script>
    ${renderCopyScript()}
  </body>
</html>
`;
}

function renderAboutPage({ project: projectConfig, niche: activeNiche, opportunities: items, topics: topicItems, paymentStatus: currentPaymentStatus }) {
  const generatedAt = new Date().toISOString();
  const paymentReceived = Boolean(currentPaymentStatus?.received);

  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  title: `About | ${siteTitle}`,
  description:
    "Who Government Opportunity Radar helps, what the daily shortlist includes, and how support receipts are verified.",
  cssPath: "styles.css",
  feedPath: "feed.xml",
  canonicalPath: "about.html",
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${siteTitle}`,
    description: siteDescription,
    dateModified: generatedAt,
    isPartOf: {
      "@type": "WebSite",
      name: siteTitle,
      url: absoluteUrl(publicSiteUrl, "") || "index.html",
    },
  },
})}
  </head>
  <body>
    <main class="page detail-page">
      ${renderTopNav(".", "about")}
      <section class="masthead compact-masthead" aria-labelledby="about-title">
        <div class="masthead-copy">
          <p class="eyebrow">Government Opportunity Radar</p>
          <h1 id="about-title">What this shortlist does</h1>
          <p class="summary">A daily public data product for teams that need a faster way to review software, AI, automation, cybersecurity, data, and cloud opportunities from U.S. government sources.</p>
        </div>
        <div class="status-panel" aria-label="Product status">
          <div>
            <span>Opportunity pages</span>
            <strong>${items.length}</strong>
          </div>
          <div>
            <span>Topics</span>
            <strong>${topicItems.length}</strong>
          </div>
          <div>
            <span>Support</span>
            <strong>${paymentReceived ? "Received" : "Not yet"}</strong>
          </div>
        </div>
      </section>

      <section class="content-section" aria-labelledby="product-title">
        <h2 id="product-title">What you can use it for</h2>
        <p>Government Opportunity Radar converts broad public opportunity records into a focused, searchable shortlist for grant writers, business development teams, proposal teams, software companies, AI labs, cybersecurity teams, data teams, cloud teams, and research groups.</p>
      </section>

      <section class="content-section" aria-labelledby="value-title">
        <h2 id="value-title">What it saves</h2>
        <p>The shortlist reduces daily manual checking across government portals. It publishes topic pages, individual opportunity pages, RSS, JSON, sitemap, source links, and a public support status from the same automated run.</p>
      </section>

      <section class="content-section" aria-labelledby="automation-title">
        <h2 id="automation-title">Automation</h2>
        <ul class="plain-list">
          <li>Collects public opportunity data for the selected topics.</li>
          <li>Builds the static site, feed, sitemap, JSON exports, and support QR code.</li>
          <li>Checks the public TRON address for an inbound transfer of at least ${escapeHtml(projectConfig.payout.minimumReceipt)} ${escapeHtml(projectConfig.token.symbol)}.</li>
          <li>Runs locally through the macOS scheduler or remotely through GitHub Actions.</li>
        </ul>
      </section>

      <section class="content-section" aria-labelledby="limits-title">
        <h2 id="limits-title">Operating rules</h2>
        <p>The project does not use fake traffic, ad-click automation, spam, private keys, seed phrases, login-wall scraping, or revenue guarantees. Support is optional, and the public status changes only after the chain checker sees an inbound transfer of at least ${escapeHtml(projectConfig.payout.minimumReceipt)} ${escapeHtml(projectConfig.token.symbol)}.</p>
        <div class="resource-links">
          <a href="payment.html">Support status</a>
          <a href="opportunities.json">Opportunity JSON</a>
          <a href="llms.txt">LLM summary</a>
        </div>
      </section>
    </main>
  </body>
</html>
`;
}

function renderPaymentPage({ project: projectConfig, niche: activeNiche, opportunities: items, paymentStatus: currentPaymentStatus, paymentRequest: request }) {
  const paymentReceived = Boolean(currentPaymentStatus?.received);
  const checkedAt = currentPaymentStatus?.checkedAt ?? "not checked yet";
  const matchingTransferCount = currentPaymentStatus?.matchingTransferCount ?? 0;

  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  title: `Support | ${siteTitle}`,
  description: `Optional ${projectConfig.token.symbol} ${projectConfig.token.standard} support request and latest automated receipt status.`,
  cssPath: "styles.css",
  feedPath: "feed.xml",
  canonicalPath: "payment.html",
  jsonLd: renderPaymentStructuredData({ project: projectConfig, paymentStatus: currentPaymentStatus, paymentRequest: request }),
})}
  </head>
  <body>
    <main class="page detail-page">
      ${renderTopNav(".", "payment")}
      <section class="masthead compact-masthead" aria-labelledby="payment-title">
        <div class="masthead-copy">
          <p class="eyebrow">Optional support</p>
          <h1 id="payment-title">Support this daily shortlist</h1>
          <p class="summary">Use the opportunity shortlist for free. If it saves research time, you can support the next automated run with 5 USDT on TRON / TRC20. The receipt status is checked automatically on-chain.</p>
        </div>
        <div class="status-panel" aria-label="Support status">
          <div>
            <span>Receipt status</span>
            <strong>${paymentReceived ? "Received" : "Not yet"}</strong>
          </div>
          <div>
            <span>Transfers found</span>
            <strong>${matchingTransferCount}</strong>
          </div>
          <div>
            <span>Listings</span>
            <strong>${items.length}</strong>
          </div>
        </div>
      </section>

      <section class="payment-page-grid" aria-label="Support request">
        ${renderPaymentCard({ project: projectConfig, paymentStatus: currentPaymentStatus })}
        <div class="content-section">
          <h2>Receipt check</h2>
          <dl class="detail-grid">
            <div>
              <dt>Received</dt>
              <dd>${paymentReceived ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt>Last checked</dt>
              <dd>${escapeHtml(checkedAt)}</dd>
            </div>
            <div>
              <dt>Support target</dt>
              <dd>${escapeHtml(projectConfig.payout.minimumReceipt)} ${escapeHtml(projectConfig.token.symbol)}</dd>
            </div>
            <div>
              <dt>Request JSON</dt>
              <dd><a href="payment-request.json">payment-request.json</a></dd>
            </div>
            <div>
              <dt>Status JSON</dt>
              <dd><a href="payment-status.json">payment-status.json</a></dd>
            </div>
            <div>
              <dt>Explorer</dt>
              <dd><a href="${escapeAttribute(tronScanAddressUrl(projectConfig.payout.address))}">TronScan</a></dd>
            </div>
          </dl>
          <p class="payment-note">Send only ${escapeHtml(projectConfig.token.symbol)} on ${escapeHtml(projectConfig.network)} / ${escapeHtml(projectConfig.token.standard)}. The checker watches this public receive address only and updates the status after an inbound transfer of at least ${escapeHtml(projectConfig.payout.minimumReceipt)} ${escapeHtml(projectConfig.token.symbol)}.</p>
        </div>
      </section>
    </main>
    ${renderCopyScript()}
  </body>
</html>
`;
}

function renderPriorityPick(pick, index) {
  const detailUrl = `opportunities/${pick.slug}.html`;
  const topics = pick.topics.length > 0 ? pick.topics.join(", ") : "General match";

  return `<article class="priority-card">
  <div class="priority-card-header">
    <span class="priority-rank">${index + 1}</span>
    <div>
      <p class="eyebrow">${escapeHtml(pick.priorityLabel)}</p>
      <h3><a href="${escapeAttribute(detailUrl)}">${escapeHtml(pick.title)}</a></h3>
    </div>
  </div>
  <dl class="priority-details">
    <div>
      <dt>Agency</dt>
      <dd>${escapeHtml(pick.agency || "Unknown")}</dd>
    </div>
    <div>
      <dt>Deadline</dt>
      <dd>${escapeHtml(pick.closeDate || "Not listed")}</dd>
    </div>
    <div>
      <dt>Topics</dt>
      <dd>${escapeHtml(topics)}</dd>
    </div>
  </dl>
  <ul class="priority-reasons">
    ${pick.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("\n")}
  </ul>
  <div class="resource-links">
    <a href="${escapeAttribute(detailUrl)}">View details</a>
    <a href="${escapeAttribute(pick.officialUrl)}">Official source</a>
  </div>
</article>`;
}

function renderOpportunity(item, index) {
  const detailUrl = `opportunities/${item.slug}.html`;
  return `<article class="opportunity">
  <div class="opportunity-rank">${index + 1}</div>
  <div class="opportunity-body">
    <div class="opportunity-meta">
      <span>${escapeHtml(item.source)}</span>
      <span>${escapeHtml(item.status || "Unknown status")}</span>
      <span>Fit score ${escapeHtml(String(item.score))}</span>
    </div>
    <h3><a href="${escapeAttribute(detailUrl)}">${escapeHtml(item.title)}</a></h3>
    <dl>
      <div>
        <dt>Agency</dt>
        <dd>${escapeHtml(item.agency || "Unknown")}</dd>
      </div>
      <div>
        <dt>Deadline</dt>
        <dd>${escapeHtml(item.closeDate || "Not listed")}</dd>
      </div>
      <div>
        <dt>Amount</dt>
        <dd>${escapeHtml(item.amount || "Not listed")}</dd>
      </div>
    </dl>
    <p>${escapeHtml(trimText(item.summary, 360))}</p>
    <div class="resource-links">
      <a href="${escapeAttribute(detailUrl)}">View details</a>
      <a href="${escapeAttribute(item.officialUrl)}">Official source</a>
    </div>
  </div>
</article>`;
}

function renderOpportunityPage({ project: projectConfig, niche: activeNiche, opportunity, paymentStatus: currentPaymentStatus }) {
  const paymentReceived = Boolean(currentPaymentStatus?.received);

  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  title: `${opportunity.title} | ${siteTitle}`,
  description: trimText(opportunity.summary, 150),
  cssPath: "../styles.css",
  feedPath: "../feed.xml",
  canonicalPath: `opportunities/${opportunity.slug}.html`,
  type: "article",
  jsonLd: renderOpportunityStructuredData(opportunity),
})}
  </head>
  <body>
    <main class="page detail-page">
      ${renderTopNav("..", "opportunity")}
      <article class="detail-article">
        <p class="eyebrow">${escapeHtml(activeNiche.name)}</p>
        <h1>${escapeHtml(opportunity.title)}</h1>
        <div class="opportunity-meta detail-meta">
          <span>${escapeHtml(opportunity.source)}</span>
          <span>${escapeHtml(opportunity.status || "Unknown status")}</span>
          <span>Fit score ${escapeHtml(String(opportunity.score))}</span>
        </div>
        <dl class="detail-grid">
          <div>
            <dt>Agency</dt>
            <dd>${escapeHtml(opportunity.agency || "Unknown")}</dd>
          </div>
          <div>
            <dt>Opportunity number</dt>
            <dd>${escapeHtml(opportunity.opportunityNumber || "Not listed")}</dd>
          </div>
          <div>
            <dt>Open date</dt>
            <dd>${escapeHtml(opportunity.openDate || "Not listed")}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>${escapeHtml(opportunity.closeDate || "Not listed")}</dd>
          </div>
          <div>
            <dt>Amount</dt>
            <dd>${escapeHtml(opportunity.amount || "Not listed")}</dd>
          </div>
          <div>
            <dt>Source ID</dt>
            <dd>${escapeHtml(opportunity.sourceId || "Not listed")}</dd>
          </div>
        </dl>
        <section class="detail-summary" aria-labelledby="summary-title">
          <h2 id="summary-title">Source summary</h2>
          <p>${escapeHtml(trimText(opportunity.summary, 1800))}</p>
        </section>
        <div class="resource-links detail-links">
          <a href="${escapeAttribute(opportunity.officialUrl)}">Open official source</a>
          <a href="../index.html">Back to opportunities</a>
          <a href="../payment.html">Support status</a>
        </div>
      </article>
      <section class="payment-strip detail-payment" aria-label="Optional support">
        <div>
          <span>${paymentReceived ? "Support target received" : "Useful? Support the scan"}</span>
          <strong>${paymentReceived ? "Received" : "5 USDT"}</strong>
        </div>
        <code>${escapeHtml(projectConfig.payout.address)}</code>
        <span>${escapeHtml(projectConfig.network)} / ${escapeHtml(projectConfig.token.standard)}</span>
      </section>
    </main>
  </body>
</html>
`;
}

function renderTopicPage({ project: projectConfig, niche: activeNiche, topic, paymentStatus: currentPaymentStatus }) {
  const paymentReceived = Boolean(currentPaymentStatus?.received);

  return `<!doctype html>
<html lang="en">
  <head>
${renderHead({
  title: `${topic.name} | ${siteTitle}`,
  description: `Daily ${topic.name} grant and contract shortlist from public U.S. government sources.`,
  cssPath: "../styles.css",
  feedPath: "../feed.xml",
  canonicalPath: `topics/${topic.slug}.html`,
  jsonLd: renderTopicStructuredData(topic),
})}
  </head>
  <body>
    <main class="page">
      ${renderTopNav("..", "topic")}
      <section class="masthead compact-masthead" aria-labelledby="topic-title">
        <div class="masthead-copy">
          <p class="eyebrow">Topic shortlist</p>
          <h1 id="topic-title">${escapeHtml(topic.name)}</h1>
          <p class="summary">${escapeHtml(topic.items.length)} current public opportunities matched this topic in the latest shortlist.</p>
        </div>
        <div class="status-panel" aria-label="Topic status">
          <div>
            <span>Matches</span>
            <strong>${topic.items.length}</strong>
          </div>
          <div>
            <span>Support</span>
            <strong>${paymentReceived ? "Received" : "Not yet"}</strong>
          </div>
          <div>
            <span>Source links</span>
            <strong>Yes</strong>
          </div>
        </div>
      </section>
      <section class="opportunity-list" aria-labelledby="topic-opportunities">
        <div class="section-heading">
          <h2 id="topic-opportunities">Topic matches</h2>
          <span>${topic.items.length} opportunities</span>
        </div>
        ${topic.items.map((item, index) => renderTopicOpportunity(item, index)).join("\n")}
      </section>
    </main>
  </body>
</html>
`;
}

function renderTopicOpportunity(item, index) {
  return `<article class="opportunity">
  <div class="opportunity-rank">${index + 1}</div>
  <div class="opportunity-body">
    <div class="opportunity-meta">
      <span>${escapeHtml(item.source)}</span>
      <span>${escapeHtml(item.status || "Unknown status")}</span>
      <span>Fit score ${escapeHtml(String(item.score))}</span>
    </div>
    <h3><a href="../opportunities/${escapeAttribute(item.slug)}.html">${escapeHtml(item.title)}</a></h3>
    <dl>
      <div>
        <dt>Agency</dt>
        <dd>${escapeHtml(item.agency || "Unknown")}</dd>
      </div>
      <div>
        <dt>Deadline</dt>
        <dd>${escapeHtml(item.closeDate || "Not listed")}</dd>
      </div>
      <div>
        <dt>Amount</dt>
        <dd>${escapeHtml(item.amount || "Not listed")}</dd>
      </div>
    </dl>
  </div>
</article>`;
}

function renderTopicCard(topic) {
  return `<a class="topic-card" href="topics/${escapeAttribute(topic.slug)}.html">
  <span>${escapeHtml(topic.name)}</span>
  <strong>${topic.items.length}</strong>
</a>`;
}

function renderPaymentCard({ project: projectConfig, paymentStatus: currentPaymentStatus, qrPath = "payment-qr.svg" }) {
  const paymentReceived = Boolean(currentPaymentStatus?.received);
  const paymentCheckedAt = currentPaymentStatus?.checkedAt ?? "not checked yet";

  return `<div class="payment-card">
  <dl>
    <div>
      <dt>Support target</dt>
      <dd>${escapeHtml(projectConfig.payout.minimumReceipt)} ${escapeHtml(projectConfig.token.symbol)}</dd>
    </div>
    <div>
      <dt>Network</dt>
      <dd>${escapeHtml(projectConfig.network)} / ${escapeHtml(projectConfig.token.standard)}</dd>
    </div>
    <div>
      <dt>USDT contract</dt>
      <dd><code>${escapeHtml(projectConfig.token.contractAddress)}</code></dd>
    </div>
    <div>
      <dt>Status</dt>
      <dd>${paymentReceived ? "Received" : "Not received yet"}</dd>
    </div>
    <div>
      <dt>Last checked</dt>
      <dd>${escapeHtml(paymentCheckedAt)}</dd>
    </div>
  </dl>
  <figure class="payment-qr">
    <img src="${escapeAttribute(qrPath)}" width="160" height="160" alt="QR code for the USDT TRC20 receive address" />
    <figcaption>Scan or copy this receive address only. Confirm ${escapeHtml(projectConfig.network)} / ${escapeHtml(projectConfig.token.standard)} before sending.</figcaption>
  </figure>
  <div class="payment-actions">
    <button class="copy-button" type="button" data-copy="${escapeAttribute(projectConfig.payout.address)}">Copy address</button>
    <a class="text-link" href="${escapeAttribute(tronScanAddressUrl(projectConfig.payout.address))}">View on TronScan</a>
    <a class="text-link" href="payment-request.json">Request JSON</a>
  </div>
  <p class="payment-note">This is a receive-only public address. Do not send private keys, seed phrases, exchange credentials, or non-TRC20 assets.</p>
</div>`;
}

function renderOpportunityDataScript({ opportunities: items, topics: topicItems }) {
  const topicBySlug = new Map();
  for (const topic of topicItems) {
    for (const item of topic.items) {
      const existing = topicBySlug.get(item.slug) ?? [];
      existing.push(topic.name);
      topicBySlug.set(item.slug, existing);
    }
  }

  const searchItems = items.map((item) => ({
    title: item.title,
    agency: item.agency,
    source: item.source,
    status: item.status,
    score: item.score,
    closeDate: item.closeDate,
    amount: item.amount,
    summary: trimText(item.summary, 420),
    url: `opportunities/${item.slug}.html`,
    officialUrl: item.officialUrl,
    topics: topicBySlug.get(item.slug) ?? [],
  }));

  return `<script type="application/json" id="opportunity-data">${escapeScriptJson(searchItems)}</script>`;
}

function renderTopNav(rootPath, current) {
  return `<nav class="top-nav" aria-label="Site">
  <a class="${current === "index" ? "active" : ""}" href="${escapeAttribute(`${rootPath}/index.html`)}">Opportunities</a>
  <a class="${current === "payment" ? "active" : ""}" href="${escapeAttribute(`${rootPath}/payment.html`)}">Support</a>
  <a class="${current === "about" ? "active" : ""}" href="${escapeAttribute(`${rootPath}/about.html`)}">About</a>
  <a href="${escapeAttribute(`${rootPath}/feed.xml`)}">RSS</a>
  <a href="${escapeAttribute(`${rootPath}/opportunities.json`)}">JSON</a>
</nav>`;
}

function renderHead({ title, description, cssPath, feedPath, canonicalPath, type = "website", jsonLd }) {
  const canonicalUrl = absoluteUrl(publicSiteUrl, canonicalPath);
  const canonicalTag = canonicalUrl ? `\n    <link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />` : "";
  const urlTags = canonicalUrl
    ? `\n    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`
    : "";
  const jsonLdTag = jsonLd
    ? `\n    <script type="application/ld+json">${renderJsonLd(jsonLd)}</script>`
    : "";

  return `    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="${escapeHtml(type)}" />${urlTags}
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />${canonicalTag}
    <link rel="stylesheet" href="${escapeAttribute(cssPath)}" />
    <link rel="alternate" type="application/rss+xml" title="${escapeAttribute(siteTitle)}" href="${escapeAttribute(feedPath)}" />${jsonLdTag}`;
}

function renderJsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/&/g, "\\u0026");
}

function renderHomeStructuredData({ activeNiche, items, topicItems, generatedAt }) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteTitle,
      description: siteDescription,
      url: absoluteUrl(publicSiteUrl, "") || "index.html",
      dateModified: generatedAt,
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${siteTitle} opportunities`,
      description: activeNiche.name,
      dateModified: generatedAt,
      distribution: [
        {
          "@type": "DataDownload",
          encodingFormat: "application/json",
          contentUrl: absoluteUrl(publicSiteUrl, "opportunities.json") || "opportunities.json",
        },
        {
          "@type": "DataDownload",
          encodingFormat: "application/rss+xml",
          contentUrl: absoluteUrl(publicSiteUrl, "feed.xml") || "feed.xml",
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Top government opportunity matches",
      numberOfItems: items.length,
      itemListElement: items.slice(0, 20).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(publicSiteUrl, `opportunities/${item.slug}.html`) || `opportunities/${item.slug}.html`,
        name: item.title,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Tracked topic pages",
      numberOfItems: topicItems.length,
      itemListElement: topicItems.map((topic, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(publicSiteUrl, `topics/${topic.slug}.html`) || `topics/${topic.slug}.html`,
        name: topic.name,
      })),
    },
  ];
}

function renderOpportunityStructuredData(opportunity) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opportunity.title,
    description: trimText(opportunity.summary, 240),
    url: absoluteUrl(publicSiteUrl, `opportunities/${opportunity.slug}.html`) || `opportunities/${opportunity.slug}.html`,
    isBasedOn: opportunity.officialUrl,
    about: {
      "@type": "Thing",
      name: opportunity.agency || opportunity.source,
    },
  };
}

function renderTopicStructuredData(topic) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${topic.name} | ${siteTitle}`,
    description: `Daily ${topic.name} grant and contract shortlist from public U.S. government sources.`,
    url: absoluteUrl(publicSiteUrl, `topics/${topic.slug}.html`) || `topics/${topic.slug}.html`,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: topic.items.length,
      itemListElement: topic.items.slice(0, 20).map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(publicSiteUrl, `opportunities/${item.slug}.html`) || `opportunities/${item.slug}.html`,
        name: item.title,
      })),
    },
  };
}

function renderPaymentStructuredData({ project: projectConfig, paymentStatus: currentPaymentStatus, paymentRequest }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Support | ${siteTitle}`,
    description: `Optional ${projectConfig.token.symbol} ${projectConfig.token.standard} support request and receipt status.`,
    url: absoluteUrl(publicSiteUrl, "payment.html") || "payment.html",
    dateModified: currentPaymentStatus?.checkedAt ?? new Date().toISOString(),
    potentialAction: {
      "@type": "DonateAction",
      price: paymentRequest.amount,
      priceCurrency: paymentRequest.token,
      recipient: paymentRequest.address,
    },
  };
}

function renderFeed({ niche: activeNiche, opportunities: items, publicSiteUrl: baseUrl }) {
  const siteLink = baseUrl || "/";
  const generatedAt = new Date().toUTCString();
  const itemXml = items
    .slice(0, 20)
    .map((item) => {
      const link = absoluteUrl(baseUrl, `opportunities/${item.slug}.html`) || item.officialUrl || siteLink;
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(`${item.source}:${item.title}:${item.closeDate}`)}</guid>
      <description>${escapeXml(trimText(item.summary, 500))}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Government Opportunity Radar</title>
    <link>${escapeXml(siteLink)}</link>
    <description>${escapeXml(activeNiche.name)}</description>
    <lastBuildDate>${escapeXml(generatedAt)}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;
}

function renderSitemap({ publicSiteUrl: baseUrl, opportunities: items, topics }) {
  const entries = [
    { path: "", changefreq: "daily" },
    { path: "about.html", changefreq: "weekly" },
    { path: "payment.html", changefreq: "daily" },
    { path: "feed.xml", changefreq: "daily" },
    { path: "llms.txt", changefreq: "daily" },
    { path: "opportunities.json", changefreq: "daily" },
    { path: "payment-status.json", changefreq: "daily" },
    { path: "payment-request.json", changefreq: "monthly" },
    { path: "payment-qr.svg", changefreq: "monthly" },
    ...topics.map((topic) => ({ path: `topics/${topic.slug}.html`, changefreq: "daily" })),
    ...items.map((item) => ({ path: `opportunities/${item.slug}.html`, changefreq: "weekly" })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => renderSitemapEntry(baseUrl, entry)).join("\n")}
</urlset>
`;
}

function renderSitemapEntry(baseUrl, entry) {
  const loc = absoluteUrl(baseUrl, entry.path) || `/${entry.path}`;

  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${new Date().toISOString()}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
  </url>`;
}

function renderRobots({ publicSiteUrl: baseUrl }) {
  const sitemap = baseUrl ? `\nSitemap: ${baseUrl}/sitemap.xml` : "";

  return `User-agent: *
Allow: /
${sitemap}
`;
}

function renderLlmsTxt({ project: projectConfig, niche: activeNiche, opportunities: items, topics: topicItems, paymentStatus: currentPaymentStatus }) {
  const siteUrl = absoluteUrl(publicSiteUrl, "") || "index.html";
  const paymentUrl = absoluteUrl(publicSiteUrl, "payment.html") || "payment.html";
  const dataUrl = absoluteUrl(publicSiteUrl, "opportunities.json") || "opportunities.json";
  const feedUrl = absoluteUrl(publicSiteUrl, "feed.xml") || "feed.xml";
  const paymentReceived = Boolean(currentPaymentStatus?.received);
  const checkedAt = currentPaymentStatus?.checkedAt ?? "not checked yet";
  const topItems = items
    .slice(0, 12)
    .map((item, index) => `${index + 1}. ${item.title} - ${item.agency || "Unknown agency"} - deadline ${item.closeDate || "not listed"}`)
    .join("\n");

  return `# ${siteTitle}

${siteDescription}

Audience: grant writers, business development teams, proposal teams, software companies, AI labs, cybersecurity teams, data teams, cloud teams, and research groups that need a faster shortlist of public-sector opportunities.

Homepage use: start with the priority picks. Each pick explains fit, deadline, topic match, and whether a funding amount is listed before the full opportunity list.

## Canonical resources

- Site: ${siteUrl}
- Support status: ${paymentUrl}
- JSON data: ${dataUrl}
- RSS feed: ${feedUrl}

## Optional support

- Network: ${projectConfig.network}
- Token: ${projectConfig.token.symbol} ${projectConfig.token.standard}
- Receive address: ${projectConfig.payout.address}
- Support target: ${projectConfig.payout.minimumReceipt} ${projectConfig.token.symbol}
- Current status: ${paymentReceived ? "received" : "not received"}
- Last checked: ${checkedAt}

## Topics

${topicItems.map((topic) => `- ${topic.name}: ${topic.items.length} current matches`).join("\n")}

## Current top opportunities

${topItems}

## Operating rules

No fake traffic, ad-click automation, spam, private keys, seed phrases, login-wall scraping, or revenue guarantees.
`;
}

function annotatePaymentQrSvg(svg, paymentRequest) {
  const title = `USDT TRC20 receive address`;
  const description = `${paymentRequest.address} on ${paymentRequest.network} ${paymentRequest.standard}`;
  return svg.replace(
    /(<svg\b[^>]*>)/,
    `$1<title>${escapeXml(title)}</title><desc>${escapeXml(description)}</desc>`,
  );
}

function findNextDeadline(items) {
  const dates = items
    .map((item) => item.closeDate)
    .filter((value) => /^\d{2}\/\d{2}\/\d{4}$/.test(value))
    .sort((left, right) => new Date(left) - new Date(right));

  return dates[0] ?? "rolling";
}

function buildTopics(items, activeNiche) {
  const topicTerms = [
    "software",
    "artificial intelligence",
    "automation",
    "cybersecurity",
    "data science",
    "cloud",
  ];

  return topicTerms
    .map((term) => {
      const matchedItems = items
        .filter((item) => opportunityContains(item, term))
        .slice(0, 20);

      return {
        name: titleCase(term),
        slug: slugify(term),
        items: matchedItems,
      };
    })
    .filter((topic) => topic.items.length > 0 || activeNiche.keywords.includes(topic.name.toLowerCase()));
}

function buildPriorityPicks(items, topicItems) {
  const topicMap = buildTopicMap(topicItems);

  return items
    .map((item) => {
      const topics = topicMap.get(item.slug) ?? [];
      const deadline = deadlineSignal(item.closeDate);
      const priorityScore = calculatePriorityScore(item, topics, deadline);
      const reasons = buildPriorityReasons(item, topics, deadline);

      return {
        ...item,
        topics,
        priorityScore,
        priorityLabel: priorityLabel(item, deadline),
        reasons,
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 8);
}

function buildTopicMap(topicItems) {
  const topicMap = new Map();

  for (const topic of topicItems) {
    for (const item of topic.items) {
      const topics = topicMap.get(item.slug) ?? [];
      topics.push(topic.name);
      topicMap.set(item.slug, topics);
    }
  }

  return topicMap;
}

function calculatePriorityScore(item, topics, deadline) {
  let score = Number(item.score || 0) * 10;

  score += Math.min(topics.length, 4) * 5;

  if (item.amount) {
    score += 8;
  }

  if (/posted|forecasted/i.test(item.status)) {
    score += 4;
  }

  if (deadline.type === "soon") {
    score += 18;
  } else if (deadline.type === "scheduled") {
    score += 10;
  } else if (deadline.type === "rolling") {
    score += 6;
  } else if (deadline.type === "past") {
    score -= 25;
  }

  return score;
}

function buildPriorityReasons(item, topics, deadline) {
  const reasons = [];

  if (item.score >= 9) {
    reasons.push(`Strong fit score for the ${siteTitle} scan.`);
  } else {
    reasons.push("Relevant match for the selected software, AI, data, cyber, automation, or cloud topics.");
  }

  if (topics.length > 0) {
    reasons.push(`Matched topic${topics.length > 1 ? "s" : ""}: ${topics.slice(0, 3).join(", ")}.`);
  }

  if (deadline.message) {
    reasons.push(deadline.message);
  }

  if (item.amount) {
    reasons.push(`Funding amount listed: ${item.amount}.`);
  }

  reasons.push("Direct official source link is available.");

  return reasons.slice(0, 4);
}

function priorityLabel(item, deadline) {
  if (deadline.type === "soon") {
    return "Time-sensitive lead";
  }

  if (item.amount) {
    return "Funding amount listed";
  }

  if (item.score >= 9) {
    return "Strong fit";
  }

  return "Worth reviewing";
}

function deadlineSignal(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return { type: "unknown", message: "Deadline is not listed; check the official source before planning." };
  }

  if (/rolling|anytime|accepted anytime/i.test(text)) {
    return { type: "rolling", message: "Rolling or anytime deadline means it can be reviewed without a fixed date." };
  }

  const date = parseUsDate(text);

  if (!date) {
    return { type: "unknown", message: `Deadline needs review: ${text}.` };
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.ceil((date.getTime() - todayUtc) / 86400000);

  if (days < 0) {
    return { type: "past", message: `Listed deadline passed ${Math.abs(days)} days ago; verify status before using.` };
  }

  if (days <= 14) {
    return { type: "soon", message: `Deadline is in ${days} day${days === 1 ? "" : "s"}; review quickly.` };
  }

  return { type: "scheduled", message: `Deadline is in ${days} days.` };
}

function parseUsDate(value) {
  const match = String(value ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, month, day, year] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function opportunityContains(item, term) {
  const haystack = `${item.title} ${item.summary} ${item.agency}`.toLowerCase();
  const loweredTerm = term.toLowerCase();

  if (loweredTerm === "artificial intelligence") {
    return haystack.includes("artificial intelligence") || /\bai\b/.test(haystack);
  }

  if (loweredTerm === "data science") {
    return haystack.includes("data science") || haystack.includes("data-enabled") || haystack.includes("analytics");
  }

  return haystack.includes(loweredTerm);
}

function opportunitySlug(opportunity) {
  const source = slugify(opportunity.source || "source");
  const id = slugify(opportunity.sourceId || opportunity.opportunityNumber || opportunity.title);
  const title = slugify(opportunity.title).slice(0, 70);
  return `${source}-${id}-${title}`.replace(/-+$/g, "");
}

function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "item";
}

function titleCase(value) {
  return String(value)
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeOpportunity(opportunity) {
  return {
    ...opportunity,
    title: cleanFullText(opportunity.title),
    agency: cleanFullText(opportunity.agency),
    opportunityNumber: cleanFullText(opportunity.opportunityNumber),
    status: cleanFullText(opportunity.status),
    openDate: cleanFullText(opportunity.openDate),
    closeDate: cleanFullText(opportunity.closeDate),
    amount: cleanFullText(opportunity.amount),
    summary: cleanFullText(opportunity.summary),
  };
}

function renderStyles() {
  return `:root {
  color-scheme: light;
  --bg: #eef2f4;
  --ink: #17212b;
  --muted: #61717f;
  --line: #d5dde1;
  --surface: #ffffff;
  --green: #1f7f5d;
  --blue: #246b8f;
  --gold: #b98525;
  --red: #a64a4d;
}

* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;
}

a {
  color: inherit;
}

.page {
  width: min(1180px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px 0 52px;
}

.top-nav {
  min-height: 44px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.top-nav a,
.resource-links a,
.text-link,
.copy-button {
  min-height: 36px;
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 760;
  text-decoration: none;
}

.top-nav a.active {
  border-color: var(--blue);
  color: var(--blue);
}

.masthead {
  min-height: 280px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 420px);
  gap: 24px;
  align-items: end;
  border-bottom: 1px solid var(--line);
}

.eyebrow {
  margin: 0 0 10px;
  color: var(--blue);
  font-size: 0.8rem;
  font-weight: 800;
  text-transform: uppercase;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1 {
  max-width: 760px;
  font-size: 4.25rem;
  line-height: 0.96;
}

.summary {
  max-width: 680px;
  margin-top: 18px;
  color: var(--muted);
  font-size: 1.05rem;
  line-height: 1.65;
}

.status-panel {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.status-panel div {
  min-height: 116px;
  padding: 16px;
  display: grid;
  align-content: space-between;
  border-left: 1px solid var(--line);
}

.status-panel div:first-child {
  border-left: 0;
}

.status-panel span,
.payment-strip span,
.section-heading span,
dt {
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 750;
}

.status-panel strong {
  font-size: 1.7rem;
}

.audience-section {
  padding: 26px 0;
  display: grid;
  grid-template-columns: minmax(260px, 0.7fr) minmax(0, 1.3fr);
  gap: 24px;
  align-items: start;
  border-bottom: 1px solid var(--line);
}

.audience-section h2 {
  max-width: 520px;
  font-size: 1.45rem;
  line-height: 1.2;
}

.audience-section p {
  max-width: 560px;
  margin-top: 12px;
  color: var(--muted);
  line-height: 1.6;
}

.audience-list {
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  list-style: none;
}

.audience-list li {
  min-height: 132px;
  padding: 16px;
  display: grid;
  align-content: start;
  gap: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.audience-list strong {
  font-size: 0.98rem;
}

.audience-list span {
  color: var(--muted);
  line-height: 1.5;
}

.priority-section {
  margin: 28px 0;
  padding: 24px 0;
  border-bottom: 1px solid var(--line);
}

.section-note {
  max-width: 740px;
  margin: 8px 0 16px;
  color: var(--muted);
  line-height: 1.6;
}

.priority-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.priority-card {
  min-height: 318px;
  padding: 18px;
  display: grid;
  align-content: start;
  gap: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.priority-card-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.priority-rank {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #e5edf5;
  color: var(--blue);
  font-weight: 900;
}

.priority-card .eyebrow {
  margin-bottom: 6px;
}

.priority-card h3 {
  margin-top: 0;
}

.priority-details {
  margin: 0;
  grid-template-columns: 1.1fr 0.8fr 1fr;
}

.priority-reasons {
  margin: 0;
  padding-left: 18px;
  color: #344653;
  line-height: 1.55;
}

.priority-reasons li + li {
  margin-top: 6px;
}

.section-heading h2 {
  font-size: 1.25rem;
}

.payment-strip {
  min-height: 84px;
  margin: 22px 0;
  padding: 16px;
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  border-left: 6px solid var(--gold);
  background: #fff8e8;
}

.support-inline {
  margin: 24px 0;
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  border: 1px solid var(--line);
  border-left: 6px solid var(--gold);
  border-radius: 8px;
  background: #fff8e8;
}

.support-inline h2 {
  font-size: 1.2rem;
}

.support-inline p {
  margin-top: 6px;
  color: var(--muted);
  line-height: 1.55;
}

.support-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.primary-link {
  min-height: 38px;
  padding: 9px 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ink);
  border-radius: 8px;
  background: var(--ink);
  color: #ffffff;
  font-size: 0.88rem;
  font-weight: 780;
  text-decoration: none;
}

.payment-card {
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fbfc;
}

.payment-card dl {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.payment-qr {
  margin: 16px 0 0;
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
}

.payment-qr img {
  width: 160px;
  height: 160px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #ffffff;
}

.payment-qr figcaption {
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 720;
  line-height: 1.55;
}

.payment-note {
  margin-top: 16px;
  color: var(--muted);
  line-height: 1.55;
}

.payment-actions {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.copy-button {
  cursor: pointer;
}

.payment-strip div {
  display: grid;
  gap: 4px;
}

.payment-strip strong {
  font-size: 1.5rem;
}

code {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 0.95rem;
}

.section-heading {
  min-height: 44px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
}

.topic-section {
  margin: 24px 0;
  padding-bottom: 8px;
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.topic-card {
  min-height: 86px;
  padding: 16px;
  display: grid;
  align-content: space-between;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  text-decoration: none;
}

.topic-card span {
  color: var(--muted);
  font-weight: 760;
}

.topic-card strong {
  font-size: 2rem;
}

.search-section {
  margin: 24px 0;
  padding: 24px 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.search-controls {
  margin: 12px 0 16px;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(180px, 260px);
  gap: 12px;
}

.search-controls label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 760;
}

.search-controls input,
.search-controls select {
  width: 100%;
  min-height: 42px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
}

.search-results {
  display: grid;
  gap: 12px;
}

.search-result {
  min-height: 160px;
}

.empty-state {
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font-weight: 760;
}

.opportunity-list {
  display: grid;
  gap: 12px;
}

.opportunity {
  min-height: 186px;
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.opportunity-rank {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: #e3f1eb;
  color: var(--green);
  font-weight: 900;
}

.opportunity-body {
  min-width: 0;
}

.opportunity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.opportunity-meta span {
  padding: 5px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 750;
}

h3 {
  margin-top: 10px;
  font-size: 1.18rem;
  line-height: 1.35;
}

dl {
  margin: 14px 0;
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 0.8fr;
  gap: 12px;
}

dt,
dd {
  margin: 0;
}

dd {
  margin-top: 3px;
  font-weight: 760;
}

.opportunity p {
  color: #344653;
  line-height: 1.58;
}

.resource-links {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.content-section {
  padding: 24px 0;
  border-top: 1px solid var(--line);
}

.content-section h2 {
  margin-bottom: 12px;
  font-size: 1.3rem;
}

.content-section p,
.plain-list {
  color: #344653;
  line-height: 1.68;
}

.plain-list {
  margin: 0;
  padding-left: 20px;
}

.plain-list li + li {
  margin-top: 8px;
}

.payment-page-grid {
  margin-top: 24px;
  display: grid;
  grid-template-columns: minmax(320px, 0.95fr) minmax(0, 1.05fr);
  gap: 24px;
  align-items: start;
}

.detail-page {
  width: min(980px, calc(100% - 32px));
}

.detail-article {
  margin-top: 24px;
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
}

.detail-article h1 {
  font-size: 3rem;
}

.detail-meta {
  margin-top: 16px;
}

.detail-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.detail-summary {
  margin-top: 22px;
  padding-top: 22px;
  border-top: 1px solid var(--line);
}

.detail-summary h2 {
  margin-bottom: 10px;
  font-size: 1.15rem;
}

.detail-summary p {
  color: #344653;
  line-height: 1.68;
}

.compact-masthead {
  min-height: 220px;
}

@media (max-width: 820px) {
  .masthead,
  .audience-section,
  .payment-strip,
  .support-inline,
  .priority-grid,
  .payment-page-grid {
    grid-template-columns: 1fr;
  }

  h1 {
    font-size: 3rem;
  }

  .status-panel {
    grid-template-columns: 1fr;
  }

  .status-panel div {
    min-height: 82px;
    border-left: 0;
    border-top: 1px solid var(--line);
  }

  .status-panel div:first-child {
    border-top: 0;
  }

  dl {
    grid-template-columns: 1fr;
  }

  .payment-card dl {
    grid-template-columns: 1fr;
  }

  .payment-qr {
    grid-template-columns: 1fr;
  }

  .topic-grid,
  .audience-list,
  .search-controls,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .support-inline-actions {
    justify-content: flex-start;
  }
}

@media (max-width: 480px) {
  .page {
    width: min(100% - 24px, 420px);
    padding-top: 18px;
  }

  h1 {
    font-size: 2.4rem;
  }

  .opportunity {
    grid-template-columns: 1fr;
  }
}
`;
}

function renderAppScript() {
  return `(function () {
  const dataNode = document.getElementById("opportunity-data");
  const searchInput = document.getElementById("opportunity-search");
  const topicFilter = document.getElementById("topic-filter");
  const results = document.getElementById("search-results");
  const count = document.getElementById("search-count");

  if (!dataNode || !searchInput || !topicFilter || !results || !count) {
    return;
  }

  let opportunities = [];
  try {
    opportunities = JSON.parse(dataNode.textContent || "[]");
  } catch {
    return;
  }

  function updateResults() {
    const query = normalize(searchInput.value);
    const topic = topicFilter.value;
    const filtered = opportunities.filter((item) => {
      const matchesTopic = !topic || item.topics.includes(topic);
      const haystack = normalize([
        item.title,
        item.agency,
        item.source,
        item.status,
        item.summary,
        item.topics.join(" "),
      ].join(" "));
      return matchesTopic && (!query || haystack.includes(query));
    });

    count.textContent = filtered.length + " opportunities";
    results.innerHTML = filtered.slice(0, 12).map(renderResult).join("") || '<p class="empty-state">No matches</p>';
  }

  function renderResult(item, index) {
    return '<article class="opportunity search-result">' +
      '<div class="opportunity-rank">' + String(index + 1) + '</div>' +
      '<div class="opportunity-body">' +
      '<div class="opportunity-meta">' +
      '<span>' + escapeHtml(item.source || "Source") + '</span>' +
      '<span>' + escapeHtml(item.status || "Unknown status") + '</span>' +
      '<span>Fit score ' + escapeHtml(String(item.score || 0)) + '</span>' +
      '</div>' +
      '<h3><a href="' + escapeAttribute(item.url) + '">' + escapeHtml(item.title || "Untitled") + '</a></h3>' +
      '<dl>' +
      '<div><dt>Agency</dt><dd>' + escapeHtml(item.agency || "Unknown") + '</dd></div>' +
      '<div><dt>Deadline</dt><dd>' + escapeHtml(item.closeDate || "Not listed") + '</dd></div>' +
      '<div><dt>Amount</dt><dd>' + escapeHtml(item.amount || "Not listed") + '</dd></div>' +
      '</dl>' +
      '<p>' + escapeHtml(item.summary || "No source summary listed.") + '</p>' +
      '</div>' +
      '</article>';
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/\\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    const url = String(value || "");
    if (!url || /^\\s*javascript:/i.test(url)) {
      return "#";
    }
    return escapeHtml(url);
  }

  searchInput.addEventListener("input", updateResults);
  topicFilter.addEventListener("change", updateResults);
  updateResults();
}());
`;
}

function trimText(value, maxLength) {
  const text = cleanFullText(value);

  if (text.length <= maxLength) {
    return text || "No source summary listed.";
  }

  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function cleanFullText(value) {
  return String(value ?? "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, "\"")
    .replace(/&ldquo;/g, "\"")
    .replace(/&mdash;/g, "-")
    .replace(/&ndash;/g, "-")
    .replace(/\u200b/g, "")
    .replace(/¿s/g, "'s")
    .replace(/¿/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeXml(value) {
  return escapeHtml(value);
}

function escapeAttribute(value) {
  const url = String(value ?? "");

  if (!url || /^\s*javascript:/i.test(url)) {
    return "#";
  }

  return escapeHtml(url);
}

function absoluteUrl(baseUrl, path) {
  if (!baseUrl) {
    return "";
  }

  const cleanedPath = String(path ?? "").replace(/^\/+/g, "");
  return cleanedPath ? `${baseUrl}/${cleanedPath}` : `${baseUrl}/`;
}

function tronScanAddressUrl(address) {
  return `https://tronscan.org/#/address/${address}`;
}

function renderCopyScript() {
  return `<script>
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const text = button.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = text;
    }
  });
});
</script>`;
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function normalizeSiteUrl(value) {
  const url = String(value ?? "").trim().replace(/\/+$/, "");

  if (!url) {
    return "";
  }

  if (!/^https:\/\//.test(url)) {
    return "";
  }

  return url;
}
