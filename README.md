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

`npm run build` type-checks the frontend, compiles contracts, and creates the production frontend bundle. Local tests use `MockStablecoin`, `MockStablecoin18`, and `TestUSD`; these are test assets, not public stablecoins.

## Whitechain Sepolia configuration

- Chain ID: `1874`
- RPC: `https://rpc.testnet.whitechain.io`
- Gas token: `WBT`
- Explorer: `https://explorer.testnet.whitechain.io/`
- Faucet: `https://faucet.testnet.whitechain.io/`

Mainnet is intentionally absent from Hardhat configuration. Deployment scripts additionally require the named `whitechainSepolia` network, chain ID 1874, and the official HTTPS Sepolia RPC host. WBT is configured as the native gas currency. Never use a production key or deploy this test setup to mainnet.

## Deployment

### Public TESTUSD Sepolia launch

`TestUSD` is named **WhiteSETTL Test USD**, symbol `TESTUSD`, and has 6 decimals. It is a worthless testnet-only token, not USDC or USDT. Any wallet may claim 10,000 TESTUSD once every 24 hours per address. The cooldown is not Sybil-resistant: people can create multiple wallets, so this is a hackathon testnet faucet, not a scarcity or identity mechanism. Administrative `mint` and `mintOnce` remain restricted to `MINTER_ROLE`; only the deployer/admin receives that role initially. Deployment scripts are restricted to Whitechain Sepolia and never configure mainnet.

1. Get WBT for gas from the [Whitechain Sepolia faucet](https://faucet.testnet.whitechain.io/).
2. Create a local `.env` from `.env.example`. Set only `DEPLOYER_PRIVATE_KEY` to a fresh, dedicated testnet-only wallet key. `TREASURY_ADDRESS` is optional and defaults to the deployer. Public deployment does not require `TEST_WALLETS`, seller/buyer addresses, or a token mint amount. Keep the key private and local; never paste it into chat or commit it.
3. Review the target and environment values carefully. The command below deploys and signs transactions; run it only after explicit approval:

```bash
npm run deploy:public:testnet
```

The public sequence deploys TESTUSD with the faucet, deploys the six protocol contracts, initializes dependencies, grants and verifies roles, checks token metadata and bytecode, then writes `deployments/whitechain-sepolia.json` and `deployments/whitechain-sepolia.frontend.env`. It makes no initial TESTUSD mints. Copy the generated frontend values into `.env.local` and restart Vite. `.env.local` is git-ignored. Every wallet still needs WBT for its own gas transactions; TESTUSD cannot pay gas.

The old optional prefunded two-wallet flow remains available as `npm run deploy:demo:testnet` for backward compatibility. It requires `TEST_WALLETS` and `TESTUSD_MINT_AMOUNT`; those variables are not used by the public launch command.

Each completed contract deployment and role grant is checkpointed in the ignored `deployments/.whitechain-sepolia-progress.json` file, including the deployed runtime-code hash. TESTUSD allocations use on-chain idempotency IDs, so restarting the same command after an interruption will not mint the same allocation twice. The helper verifies saved bytecode hashes and initialization before reusing a checkpoint and stops if environment inputs differ. If interruption occurs between a chain receipt and local checkpoint write, inspect the deployer's recent Sepolia transactions before deciding whether to resume; do not delete/restart the journal blindly.

To deploy TESTUSD alone, use `npm run deploy:testusd`; this still requires `TEST_WALLETS` and Sepolia WBT for gas. To deploy against a separately verified token instead, set its official `PAYMENT_TOKEN_ADDRESS`, `DEPLOYER_PRIVATE_KEY`, and optional `TREASURY_ADDRESS`, then explicitly run `npm run deploy:testnet`. The script reads token `decimals()` and `symbol()` from the deployed contract; it does not invent an address.

Deployment order is: `TestUSD`, `InvoiceNFT`, `LiquidityVault`, `InvoiceRegistry`, `AdvanceEngine`, `Reputation`, `SettlementRouter`, then dependency initialization, role grants, and role/dependency verification. The external-token and optional prefunded-demo flows use the same protocol order. No deployment command has been run as part of this development work.

The current source includes constructor and interface changes for invoice ownership callbacks, principal-aware repayment accounting, and cumulative financed reputation. Do not point the updated frontend at an older deployment: these changes require a fresh deployment or a separately reviewed migration. The deployment scripts never modify existing contracts and are guarded to Whitechain Sepolia only.

Verify deployed bytecode and constructor arguments using the Whitechain Explorer's Standard JSON Input flow; no fabricated API key is needed.

The deployment script fails closed when signer/token configuration is missing, the network is not Whitechain Sepolia, or the token has no contract code. It does not mint a fake asset and it never targets mainnet. Running the deployment script requires explicit approval.

## Contract flow

`InvoiceRegistry` issues each invoice and mints an `InvoiceNFT`. It accepts only the verified `paymentAsset` chosen at deployment. `AdvanceEngine` locks financing status and lends ERC-4626 vault liquidity within protocol constraints. A buyer calls `SettlementRouter.pay`: it pulls the exact invoice asset, applies a bounded fee, repays an active advance, forwards seller proceeds, clears the invoice, and records a protocol-local reputation event in one transaction. Vault withdrawals are limited to cash currently held by the vault; lent liquidity cannot be withdrawn until repaid.

## Application status

With verified Sepolia addresses configured, invoice creation calls `InvoiceRegistry.issueInvoice`, waits for a successful receipt, and builds the share URL from the emitted `InvoiceIssued` event. The public payment route reads the invoice from the registry, verifies the configured asset and token decimals, requires the listed buyer wallet, requests an exact ERC-20 allowance, calls `SettlementRouter.pay`, and shows success only after checking the successful receipt, matching `InvoiceSettled` event, expected fee/proceeds arithmetic, and cleared invoice status at the receipt block. Explorer links use real transaction hashes. Seller and buyer wallet screens read real token balances. The dashboard reads issuance and seller-transfer events in bounded RPC block ranges, sorts newest events first, and fetches each invoice's current owner/status. Financing requests, advance positions, vault deposits/withdrawals and balances, and reputation profiles read from deployed contracts and require confirmed wallet transactions.

No live contract addresses or private keys are included in this repository. Therefore the Sepolia transaction flow still requires an explicitly approved deployment. The local two-wallet TESTUSD integration test uses two independent Hardhat signers and verifies invoice issuance, token approval, payment, fee, seller proceeds, buyer debit, cleared status, and duplicate-payment rejection. CI runs dependency installation, compilation, tests, both TypeScript checks, and the production build.

## License

This repository is independently implemented. The upstream SETTL GitHub repository reports no declared license, and its raw `LICENSE` file is absent; no upstream code or assets are licensed or copied by this project. WhiteSETTL source is licensed under the MIT License included in this repository.

See [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md) for the upstream assessment and migration rationale.
