# WhiteSETTL

WhiteSETTL is an independent Whitechain-native receivables protocol MVP: businesses issue token-denominated invoices, share simple payment links, optionally request an invoice advance, and accrue transparent protocol-local settlement reputation.

It is not affiliated with, endorsed by, or a product of Whitechain/WhiteBIT. WBT is the gas token; invoices use separately configured, verified ERC-20 payment assets.

## Start locally

```bash
cp .env.example .env
npm install
npm run compile
npm run test
npm run typecheck
npm run dev
```

`npm run build` compiles contracts and builds the frontend. Test coverage uses an internal `MockStablecoin`; it is not a public payment-token recommendation.

## Whitechain Sepolia configuration

- Chain ID: `1874`
- RPC: `https://rpc.testnet.whitechain.io`
- Gas token: `WBT`
- Explorer: `https://explorer.testnet.whitechain.io/`
- Faucet: `https://faucet.testnet.whitechain.io/`

Mainnet is intentionally absent from Hardhat configuration. Never add a production deployer key to `.env` or deploy without a reviewed, verified payment-token address.

## Deployment

1. Obtain a verified Whitechain Sepolia ERC-20 address from an official Whitechain source.
2. Set `PAYMENT_TOKEN_ADDRESS` and `DEPLOYER_PRIVATE_KEY` only in your local `.env`.
3. Run `npm run deploy:testnet`.
4. Copy the emitted `deployments/whitechain-sepolia.json` addresses into the corresponding `VITE_*` values, including `VITE_CONTRACT_DEPLOYMENT_BLOCK`.
5. Verify using the Whitechain Explorer’s Standard JSON Input flow; its verifier does not require a fabricated API key.

The deployment script fails closed when signer/token configuration is missing, the network is not Whitechain Sepolia, or the token has no contract code. It does not mint a fake asset and it never targets mainnet. Running the deployment script requires explicit approval.

## Contract flow

`InvoiceRegistry` issues each invoice and mints an `InvoiceNFT`. It accepts only the verified `paymentAsset` chosen at deployment. `AdvanceEngine` locks financing status and lends ERC-4626 vault liquidity within protocol constraints. A buyer calls `SettlementRouter.pay`: it pulls the exact invoice asset, applies a bounded fee, repays an active advance, forwards seller proceeds, clears the invoice, and records a protocol-local reputation event in one transaction. Vault withdrawals are limited to cash currently held by the vault; lent liquidity cannot be withdrawn until repaid.

## Application status

With verified Sepolia addresses configured, invoice creation calls `InvoiceRegistry.issueInvoice`, waits for a successful receipt, and builds the share URL from the emitted `InvoiceIssued` event. The public payment route reads the invoice from the registry, verifies the configured asset and token decimals, requires the listed buyer wallet, requests an exact ERC-20 allowance, calls `SettlementRouter.pay`, and shows success only after the receipt is confirmed. Explorer links use the real transaction hash. The dashboard reads seller-scoped issuance events from the configured deployment block and fetches each invoice's current status; it refreshes every 12 seconds.

No contract addresses or verified payment-token address are included in this repository. Therefore the live Whitechain transaction flow cannot be exercised until an approved Sepolia deployment and official token address are supplied. Local contract tests use only `MockStablecoin` and `MockStablecoin18`. Financing, liquidity-provider actions, and reputation reads are implemented in contracts but are not yet connected to frontend transactions or live profile data; their screens identify this limitation rather than displaying sample figures.

See [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md) for the upstream assessment and migration rationale.
