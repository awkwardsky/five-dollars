import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const digestPath = resolve(rootDir, "digests/latest.md");
const subscribersPath = resolve(rootDir, "config/subscribers.json");
const deliveryLogPath = resolve(rootDir, "logs/delivery-latest.json");

const checkedAt = new Date().toISOString();
const digest = await readFile(digestPath, "utf8");
const subscribers = await loadSubscribers();

if (!process.env.RESEND_API_KEY || !process.env.DIGEST_FROM_EMAIL || subscribers.length === 0) {
  const skipped = {
    checkedAt,
    delivered: false,
    skipped: true,
    reason: buildSkipReason(subscribers),
    subscriberCount: subscribers.length,
  };

  await writeJson(deliveryLogPath, skipped);
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}

const results = [];

for (const subscriber of subscribers) {
  const result = await sendEmail({
    to: subscriber.email,
    subject: "Software, AI, and Automation Opportunities",
    text: digest,
  });

  results.push({
    email: subscriber.email,
    ok: result.ok,
    status: result.status,
    id: result.id ?? null,
    error: result.error ?? null,
  });
}

const log = {
  checkedAt,
  delivered: results.some((result) => result.ok),
  skipped: false,
  subscriberCount: subscribers.length,
  results,
};

await writeJson(deliveryLogPath, log);
console.log(JSON.stringify(log, null, 2));

async function loadSubscribers() {
  try {
    await access(subscribersPath);
  } catch {
    return [];
  }

  const config = JSON.parse(await readFile(subscribersPath, "utf8"));
  return (config.subscribers ?? []).filter(
    (subscriber) => subscriber.status === "active" && subscriber.email,
  );
}

function buildSkipReason(activeSubscribers) {
  if (!process.env.RESEND_API_KEY) {
    return "RESEND_API_KEY is not set.";
  }

  if (!process.env.DIGEST_FROM_EMAIL) {
    return "DIGEST_FROM_EMAIL is not set.";
  }

  if (activeSubscribers.length === 0) {
    return "No active subscribers in config/subscribers.json.";
  }

  return "Delivery skipped.";
}

async function sendEmail({ to, subject, text }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM_EMAIL,
      to,
      subject,
      text,
    }),
  });

  const body = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    id: body.id,
    error: body.message ?? body.error,
  };
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}
