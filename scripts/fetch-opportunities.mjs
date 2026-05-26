import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const nichePath = resolve(rootDir, "config/niches.json");
const dbPath = resolve(rootDir, "data/opportunities.sqlite");
const digestPath = resolve(rootDir, "digests/latest.md");
const runLogPath = resolve(rootDir, "logs/run-latest.json");

const nicheConfig = JSON.parse(await readFile(nichePath, "utf8"));
const niche = nicheConfig.primary;
const runStartedAt = new Date();

await mkdir(resolve(rootDir, "data"), { recursive: true });
await mkdir(resolve(rootDir, "digests"), { recursive: true });
await mkdir(resolve(rootDir, "logs"), { recursive: true });

const db = new DatabaseSync(dbPath);
initializeDatabase(db);

const grants = await fetchGrants(niche);
const sam = await fetchSam(niche);
const allOpportunities = [...grants, ...sam]
  .map((opportunity) => scoreOpportunity(opportunity, niche))
  .filter((opportunity) => opportunity.score > 0)
  .sort((a, b) => b.score - a.score || compareDates(a.closeDate, b.closeDate));

for (const opportunity of allOpportunities) {
  upsertOpportunity(db, opportunity);
}

const savedOpportunities = loadSavedOpportunities(db, niche.id);
const digest = renderDigest({
  niche,
  generatedAt: new Date(),
  opportunities: savedOpportunities.slice(0, 25),
  sourceCounts: {
    grants: grants.length,
    sam: sam.length,
  },
});

await writeFile(digestPath, digest);

const runLog = {
  startedAt: runStartedAt.toISOString(),
  finishedAt: new Date().toISOString(),
  niche: niche.id,
  fetched: {
    grants: grants.length,
    sam: sam.length,
    total: grants.length + sam.length,
  },
  matched: allOpportunities.length,
  savedDigest: digestPath,
  savedDatabase: dbPath,
  notes: sam.length === 0 && !process.env.SAM_API_KEY ? ["SAM.gov skipped because SAM_API_KEY is not set."] : [],
};

await writeFile(runLogPath, `${JSON.stringify(runLog, null, 2)}\n`);
db.close();

console.log(JSON.stringify(runLog, null, 2));

async function fetchGrants(activeNiche) {
  const opportunities = [];
  const seenIds = new Set();

  for (const keyword of activeNiche.keywords) {
    const response = await postJson("https://api.grants.gov/v1/api/search2", {
      rows: 10,
      keyword,
      oppStatuses: "forecasted|posted",
    });

    const hits = response?.data?.oppHits ?? [];

    for (const hit of hits) {
      if (!hit?.id || seenIds.has(hit.id)) {
        continue;
      }

      seenIds.add(hit.id);
      const detail = await fetchGrantDetail(hit.id).catch(() => null);
      opportunities.push(normalizeGrant(hit, detail, keyword));
    }
  }

  return opportunities;
}

async function fetchGrantDetail(opportunityId) {
  return postJson("https://api.grants.gov/v1/api/fetchOpportunity", {
    opportunityId: Number(opportunityId),
  });
}

function normalizeGrant(hit, detail, keyword) {
  const synopsis = detail?.data?.synopsis ?? {};
  const title = hit.title ?? detail?.data?.opportunityTitle ?? "Untitled grant opportunity";
  const closeDate = hit.closeDate || synopsis.responseDate || detail?.data?.originalDueDateDesc || "";
  const amount = formatGrantAmount(synopsis);
  const officialUrl = `https://www.grants.gov/search-results-detail/${hit.id}`;

  return {
    source: "Grants.gov",
    sourceId: String(hit.id),
    nicheId: niche.id,
    title,
    agency: hit.agency ?? hit.agencyName ?? synopsis.agencyName ?? "",
    opportunityNumber: hit.number ?? detail?.data?.opportunityNumber ?? "",
    status: hit.oppStatus ?? "",
    openDate: hit.openDate ?? "",
    closeDate,
    amount,
    summary: cleanText(synopsis.synopsisDesc) || `Matched Grants.gov keyword: ${keyword}.`,
    officialUrl,
    rawUrl: officialUrl,
  };
}

async function fetchSam(activeNiche) {
  if (!process.env.SAM_API_KEY) {
    return [];
  }

  const opportunities = [];
  const seenIds = new Set();
  const postedTo = formatSamDate(new Date());
  const postedFrom = formatSamDate(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));

  for (const keyword of activeNiche.keywords.slice(0, 5)) {
    const url = new URL("https://api.sam.gov/opportunities/v2/search");
    url.searchParams.set("api_key", process.env.SAM_API_KEY);
    url.searchParams.set("postedFrom", postedFrom);
    url.searchParams.set("postedTo", postedTo);
    url.searchParams.set("title", keyword);
    url.searchParams.set("limit", "10");
    url.searchParams.set("offset", "0");

    const response = await fetch(url);
    const body = await response.json();

    if (!response.ok) {
      continue;
    }

    for (const item of body.opportunitiesData ?? []) {
      const id = item.noticeId ?? item.solicitationNumber;
      if (!id || seenIds.has(id)) {
        continue;
      }

      seenIds.add(id);
      opportunities.push(normalizeSam(item, keyword));
    }
  }

  return opportunities;
}

function normalizeSam(item, keyword) {
  return {
    source: "SAM.gov",
    sourceId: String(item.noticeId ?? item.solicitationNumber),
    nicheId: niche.id,
    title: item.title ?? "Untitled contract opportunity",
    agency: item.fullParentPathName ?? item.department ?? item.subTier ?? "",
    opportunityNumber: item.solicitationNumber ?? "",
    status: item.type ?? "",
    openDate: item.postedDate ?? "",
    closeDate: item.responseDeadLine ?? "",
    amount: item.award?.amount ? `$${item.award.amount}` : "",
    summary: `Matched SAM.gov title keyword: ${keyword}.`,
    officialUrl: item.uiLink && item.uiLink !== "null" ? item.uiLink : "https://sam.gov/content/opportunities",
    rawUrl: item.description && item.description !== "null" ? item.description : "",
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${JSON.stringify(data)}`);
  }

  return data;
}

function initializeDatabase(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      niche_id TEXT NOT NULL,
      title TEXT NOT NULL,
      agency TEXT,
      opportunity_number TEXT,
      status TEXT,
      open_date TEXT,
      close_date TEXT,
      amount TEXT,
      score INTEGER NOT NULL,
      summary TEXT,
      official_url TEXT,
      raw_url TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (source, source_id)
    );

    CREATE INDEX IF NOT EXISTS opportunities_niche_score
      ON opportunities (niche_id, score DESC, close_date);
  `);
}

function upsertOpportunity(database, opportunity) {
  database
    .prepare(`
      INSERT INTO opportunities (
        source,
        source_id,
        niche_id,
        title,
        agency,
        opportunity_number,
        status,
        open_date,
        close_date,
        amount,
        score,
        summary,
        official_url,
        raw_url,
        first_seen_at,
        last_seen_at
      )
      VALUES (
        :source,
        :sourceId,
        :nicheId,
        :title,
        :agency,
        :opportunityNumber,
        :status,
        :openDate,
        :closeDate,
        :amount,
        :score,
        :summary,
        :officialUrl,
        :rawUrl,
        :now,
        :now
      )
      ON CONFLICT(source, source_id) DO UPDATE SET
        title = excluded.title,
        agency = excluded.agency,
        opportunity_number = excluded.opportunity_number,
        status = excluded.status,
        open_date = excluded.open_date,
        close_date = excluded.close_date,
        amount = excluded.amount,
        score = excluded.score,
        summary = excluded.summary,
        official_url = excluded.official_url,
        raw_url = excluded.raw_url,
        last_seen_at = excluded.last_seen_at
    `)
    .run({
      ...opportunity,
      now: new Date().toISOString(),
    });
}

function loadSavedOpportunities(database, nicheId) {
  return database
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
      LIMIT 50
    `)
    .all(nicheId);
}

function scoreOpportunity(opportunity, activeNiche) {
  const haystack = [
    opportunity.title,
    opportunity.agency,
    opportunity.status,
    opportunity.summary,
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const term of activeNiche.positiveTerms) {
    if (haystack.includes(term.toLowerCase())) {
      score += term.length > 3 ? 2 : 1;
    }
  }

  if (/small business|startup|commercial|technology|research|innovation/i.test(haystack)) {
    score += 2;
  }

  if (/closed|archived/i.test(opportunity.status)) {
    score -= 5;
  }

  return {
    ...opportunity,
    score,
  };
}

function renderDigest({ niche: activeNiche, generatedAt, opportunities, sourceCounts }) {
  const lines = [
    `# ${activeNiche.name}`,
    "",
    `Generated: ${generatedAt.toISOString()}`,
    "",
    `Sources checked: Grants.gov ${sourceCounts.grants}, SAM.gov ${sourceCounts.sam}`,
    "",
    "## Top Opportunities",
    "",
  ];

  if (opportunities.length === 0) {
    lines.push("No matching opportunities found in this run.", "");
    return lines.join("\n");
  }

  opportunities.forEach((opportunity, index) => {
    lines.push(`### ${index + 1}. ${opportunity.title}`);
    lines.push("");
    lines.push(`- Source: ${opportunity.source}`);
    lines.push(`- Agency: ${opportunity.agency || "Unknown"}`);
    lines.push(`- Status: ${opportunity.status || "Unknown"}`);
    lines.push(`- Close date: ${opportunity.closeDate || "Not listed"}`);
    lines.push(`- Amount: ${opportunity.amount || "Not listed"}`);
    lines.push(`- Fit score: ${opportunity.score}`);
    lines.push(`- Official link: ${opportunity.officialUrl}`);
    lines.push("");
    lines.push(trimForDigest(opportunity.summary));
    lines.push("");
  });

  return lines.join("\n");
}

function formatGrantAmount(synopsis) {
  const ceiling = normalizeAmount(synopsis.awardCeilingFormatted ?? synopsis.awardCeiling);
  const floor = normalizeAmount(synopsis.awardFloorFormatted ?? synopsis.awardFloor);

  if (ceiling && floor) {
    return `$${floor} - $${ceiling}`;
  }

  if (ceiling) {
    return `Up to $${ceiling}`;
  }

  return "";
}

function normalizeAmount(value) {
  const text = String(value ?? "").trim();

  if (!text || /^none$/i.test(text) || /^0$/.test(text)) {
    return "";
  }

  return text.replace(/^\$/, "");
}

function formatSamDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function compareDates(left, right) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return new Date(left).getTime() - new Date(right).getTime();
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
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
    .replace(/¿s/g, "'s")
    .replace(/¿/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trimForDigest(value) {
  const text = cleanText(value);

  if (text.length <= 700) {
    return text || "No summary provided by the source.";
  }

  return `${text.slice(0, 697).trim()}...`;
}
