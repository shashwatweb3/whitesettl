import { getAddress, isAddress, zeroAddress } from "viem";

export function getOptionalAddress(value: string | undefined) {
  if (!value || !isAddress(value) || value.toLowerCase() === zeroAddress) return undefined;
  return getAddress(value);
}

const components = [
  { name: "seller", type: "address" },
  { name: "buyer", type: "address" },
  { name: "asset", type: "address" },
  { name: "amount", type: "uint128" },
  { name: "issueDate", type: "uint64" },
  { name: "dueDate", type: "uint64" },
  { name: "status", type: "uint8" },
  { name: "metadataHash", type: "bytes32" },
] as const;

export const invoiceIssuedEvent = {
  type: "event",
  name: "InvoiceIssued",
  anonymous: false,
  inputs: [
    { indexed: true, name: "invoiceId", type: "uint256" },
    { indexed: true, name: "seller", type: "address" },
    { indexed: true, name: "buyer", type: "address" },
    { indexed: false, name: "asset", type: "address" },
    { indexed: false, name: "amount", type: "uint256" },
    { indexed: false, name: "dueDate", type: "uint64" },
    { indexed: false, name: "invoiceReference", type: "bytes32" },
    { indexed: false, name: "metadataHash", type: "bytes32" },
  ],
} as const;

export const invoiceSellerChangedEvent = {
  type: "event",
  name: "InvoiceSellerChanged",
  anonymous: false,
  inputs: [
    { indexed: true, name: "invoiceId", type: "uint256" },
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
  ],
} as const;

export const registryAbi = [
  {
    type: "function",
    name: "issueInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint128" },
      { name: "dueDate", type: "uint64" },
      { name: "invoiceReference", type: "bytes32" },
      { name: "metadataHash", type: "bytes32" },
    ],
    outputs: [{ name: "invoiceId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getInvoice",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components }],
  },
  {
    type: "function",
    name: "paymentAsset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  invoiceIssuedEvent,
  invoiceSellerChangedEvent,
] as const;

export const routerAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "event",
    name: "InvoiceSettled",
    anonymous: false,
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "fee", type: "uint256" },
      { indexed: false, name: "repayment", type: "uint256" },
      { indexed: false, name: "sellerProceeds", type: "uint256" },
    ],
  },
] as const;

export const advanceEngineAbi = [
  {
    type: "function",
    name: "requestAdvance",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "ltvBps", type: "uint16" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "advances",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "principal", type: "uint128" },
      { name: "repayment", type: "uint128" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "MAX_LTV_BPS",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "event",
    name: "Advanced",
    anonymous: false,
    inputs: [
      { indexed: true, name: "invoiceId", type: "uint256" },
      { indexed: true, name: "seller", type: "address" },
      { indexed: false, name: "principal", type: "uint256" },
      { indexed: false, name: "repayment", type: "uint256" },
    ],
  },
] as const;

export const vaultAbi = [
  {
    type: "function",
    name: "asset",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "outstandingLoans",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "maxWithdraw",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "previewDeposit",
    stateMutability: "view",
    inputs: [{ name: "assets", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    outputs: [{ name: "shares", type: "uint256" }],
  },
] as const;

export const reputationAbi = [
  {
    type: "function",
    name: "profiles",
    stateMutability: "view",
    inputs: [{ name: "business", type: "address" }],
    outputs: [
      { name: "paidInvoices", type: "uint64" },
      { name: "latePayments", type: "uint64" },
      { name: "settledVolume", type: "uint128" },
      { name: "outstandingFinanced", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "tier",
    stateMutability: "view",
    inputs: [{ name: "business", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const decimalsValue = import.meta.env.VITE_PAYMENT_TOKEN_DECIMALS;
const parsedDecimals = decimalsValue ? Number(decimalsValue) : undefined;
export const expectedTokenDecimals = Number.isInteger(parsedDecimals) && parsedDecimals! >= 0 && parsedDecimals! <= 36
  ? parsedDecimals
  : undefined;
export const invalidTokenDecimalsConfig = Boolean(decimalsValue && expectedTokenDecimals === undefined);
export const tokenSymbol = import.meta.env.VITE_PAYMENT_TOKEN_SYMBOL?.trim() || "payment token";
const deploymentBlockValue = import.meta.env.VITE_CONTRACT_DEPLOYMENT_BLOCK;
export const contractDeploymentBlock = deploymentBlockValue && /^\d+$/.test(deploymentBlockValue)
  ? BigInt(deploymentBlockValue)
  : undefined;
