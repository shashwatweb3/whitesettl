import { defineChain } from "viem";
import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { getOptionalAddress } from "./contracts";

export const whitechainSepolia = defineChain({
  id: 1874, name: "Whitechain Sepolia", nativeCurrency: { name: "WhiteBIT Token", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [import.meta.env.VITE_WHITECHAIN_RPC_URL || "https://rpc.testnet.whitechain.io"] } },
  blockExplorers: { default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" } }, testnet: true
});
export const config = createConfig({ chains: [whitechainSepolia], connectors: [injected()], transports: { [whitechainSepolia.id]: http() } });
export const explorerTx = (hash: string) => `${whitechainSepolia.blockExplorers.default.url}/tx/${hash}`;
export const contracts = {
  registry: getOptionalAddress(import.meta.env.VITE_INVOICE_REGISTRY_ADDRESS),
  router: getOptionalAddress(import.meta.env.VITE_SETTLEMENT_ROUTER_ADDRESS),
  paymentToken: getOptionalAddress(import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS),
  invoiceNft: getOptionalAddress(import.meta.env.VITE_INVOICE_NFT_ADDRESS),
  vault: getOptionalAddress(import.meta.env.VITE_VAULT_ADDRESS),
  advanceEngine: getOptionalAddress(import.meta.env.VITE_ADVANCE_ENGINE_ADDRESS),
  reputation: getOptionalAddress(import.meta.env.VITE_REPUTATION_ADDRESS),
};
