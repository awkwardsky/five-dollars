import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findQualifyingTransfers, isValidTronAddress } from "./payment-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const configPath = resolve(rootDir, "config/project.json");
const logPath = resolve(rootDir, "logs/payment-check-latest.json");
const receiptPath = resolve(rootDir, "logs/payment-received.json");

const config = JSON.parse(await readFile(configPath, "utf8"));
const payoutAddress = config.payout.address;
const token = config.token;
const minimumReceipt = Number(config.payout.minimumReceipt);

if (!isValidTronAddress(payoutAddress)) {
  throw new Error(`Invalid TRON address: ${payoutAddress}`);
}

const result = await checkPayment();
await mkdir(dirname(logPath), { recursive: true });
await writeJson(logPath, result);

if (result.received) {
  await writeJson(receiptPath, result);
}

console.log(JSON.stringify(result, null, 2));

async function checkPayment() {
  const checkedAt = new Date().toISOString();

  const providers = [
    { name: "TronGrid", fetchTransfers: fetchTronGridTransfers },
    { name: "TronScan", fetchTransfers: fetchTronScanTransfers },
  ];
  const providerResults = await Promise.allSettled(
    providers.map(async (provider) => ({
      provider: provider.name,
      transfers: await provider.fetchTransfers(payoutAddress),
    })),
  );
  const successfulResults = providerResults.filter((result) => result.status === "fulfilled");
  const failedResults = providerResults.filter((result) => result.status === "rejected");

  if (successfulResults.length === 0) {
    return {
      checkedAt,
      received: false,
      address: payoutAddress,
      network: config.network,
      token: token.symbol,
      minimumReceipt,
      errors: failedResults.map((result) => result.reason?.message ?? String(result.reason)),
      sources: ["TronGrid", "TronScan"],
    };
  }

  const dedupedTransfers = findQualifyingTransfers({
    transfers: successfulResults.flatMap((result) => result.value.transfers),
    payoutAddress,
    token,
    minimumReceipt,
  });
  const firstReceipt = dedupedTransfers[0] ?? null;

  return {
    checkedAt,
    received: Boolean(firstReceipt),
    address: payoutAddress,
    network: config.network,
    token: token.symbol,
    minimumReceipt,
    matchingTransferCount: dedupedTransfers.length,
    firstReceipt,
    sources: successfulResults.map((result) => result.value.provider),
    errors: failedResults.map((result) => result.reason?.message ?? String(result.reason)),
  };
}

async function fetchTronGridTransfers(address) {
  const url = new URL(`https://api.trongrid.io/v1/accounts/${address}/transactions/trc20`);
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("only_to", "true");
  url.searchParams.set("limit", "200");
  url.searchParams.set("contract_address", token.contractAddress);

  const headers = {
    accept: "application/json",
  };

  if (process.env.TRONGRID_API_KEY) {
    headers["TRON-PRO-API-KEY"] = process.env.TRONGRID_API_KEY;
  }

  const response = await fetch(url, { headers });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(`TronGrid returned ${response.status}: ${JSON.stringify(body)}`);
  }

  if (!Array.isArray(body.data)) {
    throw new Error("TronGrid response did not include a data array");
  }

  return body.data.map((transfer) => ({
    ...transfer,
    provider: "TronGrid",
  }));
}

async function fetchTronScanTransfers(address) {
  const url = new URL("https://apilist.tronscanapi.com/api/token_trc20/transfers");
  url.searchParams.set("limit", "50");
  url.searchParams.set("start", "0");
  url.searchParams.set("contract_address", token.contractAddress);
  url.searchParams.set("toAddress", address);
  url.searchParams.set("relatedAddress", address);
  url.searchParams.set("confirm", "0");
  url.searchParams.set("filterTokenValue", "0");

  const headers = {
    accept: "application/json",
  };

  if (process.env.TRONSCAN_API_KEY) {
    headers["TRON-PRO-API-KEY"] = process.env.TRONSCAN_API_KEY;
  }

  const response = await fetch(url, {
    headers,
    redirect: "follow",
  });
  const body = await readJsonResponse(response, "TronScan");

  if (!response.ok) {
    throw new Error(`TronScan returned ${response.status}: ${JSON.stringify(body)}`);
  }

  if (!Array.isArray(body.token_transfers)) {
    throw new Error("TronScan response did not include a token_transfers array");
  }

  return body.token_transfers.map((transfer) => ({
    ...transfer,
    provider: "TronScan",
  }));
}

async function readJsonResponse(response, provider) {
  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${provider} returned non-JSON response ${response.status}: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(`${provider} returned ${response.status}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
}
