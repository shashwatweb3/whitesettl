# WhiteSETTL reference audit

Upstream reference reviewed: `github.com/Adityaakr/SETTL` (read-only technical reference, cloned on 2026-11-06). WhiteSETTL is independently named and implemented; no upstream branding, user assets, deployed addresses, or private infrastructure are reused.

## What the reference contains

- Vite + React + TypeScript app, Tailwind/Radix component primitives, React Router, React Query, and Recharts.
- Routes: landing, public `/pay/:invoiceId`, plus dashboard, invoices/detail/create, financing, vault, reputation, proof, activity, and settings screens.
- Privy embedded wallets wrapped around Wagmi; Mantle Sepolia was hard-coded in the Wagmi config.
- Contract modules: `InvoiceNFT`, `InvoiceRegistry`, `Vault`, receipt token, staking, `AdvanceEngine`, `SettlementRouter`, `Reputation`, and a demo USDC token.
- Deployment and diagnostic scripts use Mantle addresses and explorer verification configuration. The frontend consumes hand-maintained ABI/address modules and environment variables.

## WhiteSETTL decisions

| Reference concept | WhiteSETTL implementation |
| --- | --- |
| Invoice registry + NFT | Independent `InvoiceRegistry` and transfer-restricted `InvoiceNFT` with unique references and status lifecycle. |
| Pool + receipt token | Standards-based ERC-4626 `LiquidityVault`; its shares are the receipt token, removing a custom token. |
| Financing | `AdvanceEngine` enforces one active advance, 80% maximum LTV, time-based transparent cost, and repayment no greater than invoice value. |
| Waterfall | `SettlementRouter` collects exact payment, takes fee, repays vault first when financed, forwards the remainder, and marks settlement atomically. |
| Wallet layer | Native injected-wallet Wagmi configuration instead of an embedded-wallet dependency. |
| Network | Whitechain Sepolia (chain ID 1874), WBT gas denomination, Whitechain explorer/faucet links. |

## Deliberate exclusions for the MVP

The reference proof provider, demo token, customized staking layer, and unverified token addresses were not migrated. A production release needs an external security audit, governance/parameter controls, token allow-list governance, event indexer, metadata storage policy, and a verified Whitechain stablecoin address before enabling public payment or deployment.

## Whitechain source notes

Whitechain’s documentation describes Ethereum-compatible tooling and explorer verification, so Hardhat and standard OpenZeppelin primitives are appropriate. Its currently indexed public documentation has network/testnet values that differ from the project brief; WhiteSETTL deliberately uses the user-provided Sepolia configuration (1874 / `rpc.testnet.whitechain.io`) as the requested target. Stablecoin contracts were not discoverable as verified official deployment addresses, so no address has been guessed.
