import assert from "node:assert/strict";
import { findQualifyingTransfers, isValidTronAddress } from "../scripts/payment-core.mjs";

const payoutAddress = "TW4aVr9dQa4eAEyMmqfwYSyjs8Woq4aBgZ";
const token = {
  symbol: "USDT",
  contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  decimals: 6,
};

assert.equal(isValidTronAddress(payoutAddress), true, "configured payout address should be valid");
assert.equal(isValidTronAddress("not-a-tron-address"), false, "invalid address should fail validation");

const transfers = [
  {
    provider: "TronGrid",
    transaction_id: "too-small",
    from: "TA111111111111111111111111111111111",
    to: payoutAddress,
    value: "4999999",
    block_timestamp: 1000,
    token_info: {
      address: token.contractAddress,
      symbol: "USDT",
      decimals: 6,
    },
  },
  {
    provider: "TronGrid",
    transaction_id: "qualifies",
    from: "TB222222222222222222222222222222222",
    to: payoutAddress,
    value: "5000000",
    block_timestamp: 2000,
    token_info: {
      address: token.contractAddress,
      symbol: "USDT",
      decimals: 6,
    },
  },
  {
    provider: "TronScan",
    transaction_id: "qualifies",
    from_address: "TB222222222222222222222222222222222",
    to_address: payoutAddress,
    quant: "5000000",
    block_ts: 2000,
    contract_address: token.contractAddress,
    tokenInfo: {
      tokenId: token.contractAddress,
      tokenAbbr: "USDT",
      tokenDecimal: 6,
    },
  },
  {
    provider: "TronGrid",
    transaction_id: "wrong-token",
    from: "TC333333333333333333333333333333333",
    to: payoutAddress,
    value: "10000000",
    block_timestamp: 3000,
    token_info: {
      address: "TWrongToken11111111111111111111111111",
      symbol: "FAKE",
      decimals: 6,
    },
  },
  {
    provider: "TronGrid",
    transaction_id: "wrong-recipient",
    from: "TD444444444444444444444444444444444",
    to: "TE555555555555555555555555555555555",
    value: "10000000",
    block_timestamp: 4000,
    token_info: {
      address: token.contractAddress,
      symbol: "USDT",
      decimals: 6,
    },
  },
  {
    provider: "TronGrid",
    transaction_id: "reverted",
    from: "TF666666666666666666666666666666666",
    to: payoutAddress,
    value: "10000000",
    block_timestamp: 5000,
    token_info: {
      address: token.contractAddress,
      symbol: "USDT",
      decimals: 6,
    },
    revert: true,
  },
];

const matches = findQualifyingTransfers({
  transfers,
  payoutAddress,
  token,
  minimumReceipt: 5,
});

assert.equal(matches.length, 1, "only one unique qualifying transfer should remain");
assert.equal(matches[0].txid, "qualifies");
assert.equal(matches[0].amount, 5);
assert.equal(matches[0].explorerUrl, "https://tronscan.org/#/transaction/qualifies");

console.log("payment-core tests passed");
