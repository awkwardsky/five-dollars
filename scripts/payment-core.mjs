import { createHash } from "node:crypto";

export const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function findQualifyingTransfers({ transfers, payoutAddress, token, minimumReceipt }) {
  return dedupeTransfers(
    transfers
      .map((transfer) => normalizeTransfer(transfer, token))
      .filter(Boolean)
      .filter((transfer) => transfer.to === payoutAddress)
      .filter((transfer) => transfer.contractAddress === token.contractAddress)
      .filter((transfer) => transfer.confirmed)
      .filter((transfer) => transfer.amount >= minimumReceipt)
      .sort((a, b) => a.timestamp - b.timestamp),
  );
}

export function normalizeTransfer(transfer, token) {
  const tokenInfo = transfer.token_info ?? transfer.tokenInfo ?? {};
  const contractAddress =
    tokenInfo.address ?? tokenInfo.tokenId ?? transfer.contract_address ?? transfer.contractAddress;
  const rawValue = transfer.value ?? transfer.amount ?? transfer.quant;
  const decimals = Number(tokenInfo.decimals ?? tokenInfo.tokenDecimal ?? token.decimals);
  const amount = Number(rawValue) / 10 ** decimals;
  const txid = transfer.transaction_id ?? transfer.transactionId ?? transfer.txid ?? null;
  const timestamp = Number(transfer.block_timestamp ?? transfer.block_ts ?? transfer.timestamp ?? 0);

  if (!contractAddress || !Number.isFinite(amount)) {
    return null;
  }

  return {
    txid,
    from: transfer.from ?? transfer.from_address ?? null,
    to: transfer.to ?? transfer.to_address ?? null,
    amount,
    rawValue: String(rawValue),
    symbol: tokenInfo.symbol ?? tokenInfo.tokenAbbr ?? token.symbol,
    contractAddress,
    timestamp,
    timestampIso: timestamp ? new Date(timestamp).toISOString() : null,
    confirmed:
      transfer.confirmed !== false &&
      transfer.revert !== true &&
      !["REVERT", "FAILED"].includes(String(transfer.contractRet ?? transfer.finalResult ?? "").toUpperCase()),
    provider: transfer.provider ?? "unknown",
    explorerUrl: txid ? `https://tronscan.org/#/transaction/${txid}` : null,
  };
}

export function dedupeTransfers(transfers) {
  const seen = new Set();
  const deduped = [];

  for (const transfer of transfers) {
    const key = transfer.txid ?? `${transfer.provider}:${transfer.from}:${transfer.to}:${transfer.rawValue}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(transfer);
  }

  return deduped;
}

export function isValidTronAddress(address) {
  if (typeof address !== "string" || !address.startsWith("T")) {
    return false;
  }

  const decoded = base58Decode(address);
  if (!decoded || decoded.length !== 25 || decoded[0] !== 0x41) {
    return false;
  }

  const payload = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);
  const expected = sha256(sha256(payload)).subarray(0, 4);

  return checksum.every((byte, index) => byte === expected[index]);
}

export function base58Decode(value) {
  let bytes = [0];

  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index === -1) {
      return null;
    }

    let carry = index;
    for (let i = 0; i < bytes.length; i += 1) {
      const next = bytes[i] * 58 + carry;
      bytes[i] = next & 0xff;
      carry = next >> 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== "1") {
      break;
    }
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest();
}
