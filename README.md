# WhiteSETTL

WhiteSETTL is an independent Whitechain-native receivables protocol MVP: businesses issue token-denominated invoices, share simple payment links, optionally request an invoice advance, and accrue transparent protocol-local settlement reputation.

It is not affiliated with, endorsed by, or a product of Whitechain/WhiteBIT. WBT is the gas token; invoices use separately configured, verified ERC-20 payment assets.

## Start locally

```bash
cp .env.example .env
npm install
npm run compile
npm run test
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
4. Copy the emitted `deployments/whitechain-sepolia.json` addresses into the corresponding `VITE_*` values.
5. Verify using the Whitechain Explorer’s Standard JSON Input flow; its verifier does not require a fabricated API key.

The deployment script fails closed when `PAYMENT_TOKEN_ADDRESS` is missing or invalid. It does not mint a fake asset and it never targets mainnet.

## Contract flow

`InvoiceRegistry` issues each invoice and mints an `InvoiceNFT`. It accepts only the verified `paymentAsset` chosen at deployment. `AdvanceEngine` locks financing status and lends ERC-4626 vault liquidity within protocol constraints. A buyer calls `SettlementRouter.pay`: it pulls the exact invoice asset, applies a bounded fee, repays an active advance, forwards seller proceeds, clears the invoice, and records a protocol-local reputation event in one transaction. Vault withdrawals are limited to cash currently held by the vault; lent liquidity cannot be withdrawn until repaid.

## Current application status

The screens are a connected-wallet UI shell and accurately label invoice/payment actions as previews while no verified token or deployed contract addresses are configured. They do not fabricate a transaction, payment confirmation, or invoice issuance. After deployment, the remaining frontend milestone is binding form and payment inputs to the generated contract addresses and ABI calls.

See [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md) for the upstream assessment and migration rationale.
