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

### TESTUSD Sepolia demo

`TestUSD` is named **WhiteSETTL Test USD**, symbol `TESTUSD`, and has 6 decimals. It is not USDC or USDT and has no production value. Minting requires `MINTER_ROLE`; only the deployer/admin receives that role initially. The deployment scripts are restricted to Whitechain Sepolia and never configure mainnet.

1. Get WBT for gas from the [Whitechain Sepolia faucet](https://faucet.testnet.whitechain.io/).
2. Create a local `.env` from `.env.example`. Set `DEPLOYER_PRIVATE_KEY` to a dedicated testnet-only wallet key, `TEST_WALLETS` to two distinct comma-separated seller and buyer addresses, and optionally `TESTUSD_MINT_AMOUNT` (human-readable token amount per wallet; default `10000`) and `TREASURY_ADDRESS`.
3. Review the target address and environment values carefully. The command below deploys and signs transactions; run it only after explicit approval:

```bash
npm run deploy:demo:testnet
```

The sequence deploys TESTUSD, mints the configured amount to each designated test wallet, deploys the protocol, grants and verifies roles, checks token decimals and contract bytecode, then writes `deployments/whitechain-sepolia.json` and `deployments/whitechain-sepolia.frontend.env`. Copy the generated frontend values into `.env.local` and restart Vite. `.env.local` is git-ignored.

To deploy TESTUSD alone, use `npm run deploy:testusd`; this still requires `TEST_WALLETS` and Sepolia WBT for gas. To deploy against a separately verified token instead, set its official `PAYMENT_TOKEN_ADDRESS`, `DEPLOYER_PRIVATE_KEY`, and optional `TREASURY_ADDRESS`, then explicitly run `npm run deploy:testnet`. The script reads token `decimals()` and `symbol()` from the deployed contract; it does not invent an address.

Deployment order is: `TestUSD` (demo flow only), `InvoiceNFT`, `LiquidityVault`, `InvoiceRegistry`, `AdvanceEngine`, `Reputation`, `SettlementRouter`, then role grants and role/dependency verification. The external-token flow starts at `InvoiceNFT` and otherwise follows the same order. No deployment command has been run as part of this development work.

Verify deployed bytecode and constructor arguments using the Whitechain Explorer's Standard JSON Input flow; no fabricated API key is needed.

The deployment script fails closed when signer/token configuration is missing, the network is not Whitechain Sepolia, or the token has no contract code. It does not mint a fake asset and it never targets mainnet. Running the deployment script requires explicit approval.

## Contract flow

`InvoiceRegistry` issues each invoice and mints an `InvoiceNFT`. It accepts only the verified `paymentAsset` chosen at deployment. `AdvanceEngine` locks financing status and lends ERC-4626 vault liquidity within protocol constraints. A buyer calls `SettlementRouter.pay`: it pulls the exact invoice asset, applies a bounded fee, repays an active advance, forwards seller proceeds, clears the invoice, and records a protocol-local reputation event in one transaction. Vault withdrawals are limited to cash currently held by the vault; lent liquidity cannot be withdrawn until repaid.

## Application status

With verified Sepolia addresses configured, invoice creation calls `InvoiceRegistry.issueInvoice`, waits for a successful receipt, and builds the share URL from the emitted `InvoiceIssued` event. The public payment route reads the invoice from the registry, verifies the configured asset and token decimals, requires the listed buyer wallet, requests an exact ERC-20 allowance, calls `SettlementRouter.pay`, and shows success only after checking the successful receipt, matching `InvoiceSettled` event, expected fee/proceeds arithmetic, and cleared invoice status at the receipt block. Explorer links use real transaction hashes. Seller and buyer wallet screens read real token balances. The dashboard reads seller-scoped issuance events in bounded RPC block ranges and fetches each invoice's current status; it refreshes every 12 seconds.

No live contract addresses or private keys are included in this repository. Therefore the Sepolia transaction flow still requires an explicitly approved deployment. The local two-wallet TESTUSD integration test uses two independent Hardhat signers and verifies invoice issuance, token approval, payment, fee, seller proceeds, buyer debit, cleared status, and duplicate-payment rejection. Financing and liquidity-provider transactions and live reputation-profile reads remain unconnected in the frontend; their screens state this limitation rather than displaying sample figures.

See [REFERENCE_AUDIT.md](REFERENCE_AUDIT.md) for the upstream assessment and migration rationale.
