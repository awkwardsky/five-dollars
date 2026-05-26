import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const fundingPath = resolve(rootDir, ".github/FUNDING.yml");
const workflowPath = resolve(rootDir, ".github/workflows/daily.yml");
const packagePath = resolve(rootDir, "package.json");
const projectPath = resolve(rootDir, "config/project.json");
const readmePath = resolve(rootDir, "README.md");
const errors = [];

const funding = await readText(fundingPath);
const workflow = await readText(workflowPath);
const packageConfig = await readJson(packagePath);
const project = await readJson(projectPath);
const readme = await readText(readmePath);
const paymentPageUrl = "https://awkwardsky.github.io/five-dollars/payment.html";

if (!funding.includes("custom:") || !funding.includes(paymentPageUrl)) {
  errors.push(".github/FUNDING.yml must expose the public payment page as a custom funding URL");
}

if (funding.includes(project.payout.address)) {
  errors.push(".github/FUNDING.yml should link to the public payment page, not embed a raw wallet address");
}

for (const requiredPermission of ["contents: write", "issues: write", "pages: write", "id-token: write"]) {
  if (!workflow.includes(requiredPermission)) {
    errors.push(`.github/workflows/daily.yml is missing permission ${requiredPermission}`);
  }
}

for (const requiredCommand of ["npm run update:readme", "npm run update:issue", "npm run update:release"]) {
  if (!packageConfig.scripts?.["run:daily"]?.includes(requiredCommand)) {
    errors.push(`package.json run:daily must include ${requiredCommand}`);
  }
}

for (const requiredReadmeText of [
  "<!-- five-dollars-status:start -->",
  "<!-- five-dollars-status:end -->",
  paymentPageUrl,
  project.payout.address,
  "https://github.com/awkwardsky/five-dollars/issues/1",
  "https://github.com/awkwardsky/five-dollars/releases/tag/five-dollar-status",
]) {
  if (!readme.includes(requiredReadmeText)) {
    errors.push(`README.md live status block is missing ${requiredReadmeText}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`verify-repo: ${error}`);
  }
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      fundingUrl: paymentPageUrl,
      readmeStatusBlock: true,
      dailyIssueUpdate: true,
      dailyReleaseUpdate: true,
    },
    null,
    2,
  ),
);

async function readText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    errors.push(`failed to read ${path}: ${error.message}`);
    return "";
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    errors.push(`failed to read JSON ${path}: ${error.message}`);
    return {};
  }
}
