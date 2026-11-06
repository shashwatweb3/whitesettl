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
] as const;

export const routerAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
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
