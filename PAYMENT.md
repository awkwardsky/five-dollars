# Payment

## First Milestone

The first milestone is reached when this public USDT-TRC20 address receives one inbound transfer of at least 5 USDT:

```text
TW4aVr9dQa4eAEyMmqfwYSyjs8Woq4aBgZ
```

## Network

- Network: TRON
- Token: USDT
- Standard: TRC20
- Minimum qualifying amount: 5 USDT
- USDT TRC20 contract: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`

## Verification

Run:

```bash
npm run check:payment
```

The checker only reads public chain data. It does not require private keys or wallet access.

## Product Access Note

A single public crypto address can confirm that money arrived, but it cannot reliably identify which customer paid unless a separate checkout flow, unique deposit address, or off-chain order record is added.

For fully automated paid access, use Stripe subscriptions or generate unique crypto payment addresses per customer.
