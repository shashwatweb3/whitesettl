import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { ethers, network } from "hardhat";
import type { Contract, ContractFactory } from "ethers";

export const WHITECHAIN_SEPOLIA_CHAIN_ID = 1874n;
export const WHITECHAIN_SEPOLIA_RPC = "https://rpc.testnet.whitechain.io";
export const WHITECHAIN_NATIVE_SYMBOL = "WBT";
const progressPath = "deployments/.whitechain-sepolia-progress.json";

export type DeploymentProgress = {
  chainId: number;
  deployer: string;
  flow: string;
  paymentToken?: string;
  testWallets: string[];
  mintAmount?: string;
  contracts: Record<string, string>;
  runtimeCodeHashes: Record<string, string>;
  deploymentBlocks: Record<string, number>;
  completedRoles: string[];
};

export function loadDeploymentProgress(input: Omit<DeploymentProgress, "contracts" | "completedRoles" | "deploymentBlocks" | "runtimeCodeHashes">) {
  mkdirSync("deployments", { recursive: true });
  if (!existsSync(progressPath)) {
    const progress: DeploymentProgress = { ...input, contracts: {}, runtimeCodeHashes: {}, deploymentBlocks: {}, completedRoles: [] };
    saveDeploymentProgress(progress);
    return progress;
  }
  const progress = JSON.parse(readFileSync(progressPath, "utf8")) as DeploymentProgress;
  progress.runtimeCodeHashes ??= {};
  progress.deploymentBlocks ??= {};
  progress.contracts ??= {};
  progress.completedRoles ??= [];
  const normalized = (addresses: string[]) => addresses.map(address => address.toLowerCase());
  if (progress.chainId !== input.chainId || progress.deployer.toLowerCase() !== input.deployer.toLowerCase() || progress.flow !== input.flow || JSON.stringify(normalized(progress.testWallets)) !== JSON.stringify(normalized(input.testWallets)) || progress.mintAmount !== input.mintAmount) {
    throw new Error(`Existing deployment progress at ${progressPath} belongs to a different configuration. Review or archive it manually before starting another deployment.`);
  }
  if (input.paymentToken && progress.paymentToken && input.paymentToken.toLowerCase() !== progress.paymentToken.toLowerCase()) {
    throw new Error("Existing deployment progress uses a different payment token.");
  }
  if (input.paymentToken && !progress.paymentToken) progress.paymentToken = input.paymentToken;
  saveDeploymentProgress(progress);
  return progress;
}

export function saveDeploymentProgress(progress: DeploymentProgress) {
  mkdirSync("deployments", { recursive: true });
  const tempPath = `${progressPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(progress, null, 2)}\n`, { mode: 0o600 });
  renameSync(tempPath, progressPath);
}

function writeAtomic(path: string, content: string) {
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, content, { mode: 0o600 });
  renameSync(tempPath, path);
}

export async function deployOrReuseContract(name: string, factory: ContractFactory, args: unknown[], progress: DeploymentProgress): Promise<Contract> {
  const savedAddress = progress.contracts[name];
  if (savedAddress) {
    requireAddress(savedAddress, `${name} checkpoint`);
    await requireContractCode(savedAddress, `${name} checkpoint`);
    const expectedCodeHash = progress.runtimeCodeHashes[name];
    if (!expectedCodeHash) throw new Error(`Missing ${name} runtime code hash in deployment checkpoint; refusing unsafe reuse.`);
    await requireRuntimeCodeHash(savedAddress, expectedCodeHash, name);
    return factory.attach(savedAddress) as unknown as Contract;
  }
  const contract = await factory.deploy(...args) as unknown as Contract;
  await contract.waitForDeployment();
  const address = requireAddress(await contract.getAddress(), name);
  const runtimeCodeHash = await getRuntimeCodeHash(address, name);
  const receipt = await contract.deploymentTransaction()?.wait();
  if (!receipt) throw new Error(`Could not read the ${name} deployment receipt.`);
  progress.contracts[name] = address;
  progress.runtimeCodeHashes[name] = runtimeCodeHash;
  progress.deploymentBlocks[name] = receipt.blockNumber;
  saveDeploymentProgress(progress);
  return contract;
}

export async function getRuntimeCodeHash(address: string, label: string) {
  const code = await ethers.provider.getCode(address);
  if (code === "0x") throw new Error(`${label} (${address}) has no deployed bytecode on Whitechain Sepolia.`);
  return ethers.keccak256(code);
}

export async function requireRuntimeCodeHash(address: string, expectedHash: string, label: string) {
  if (!ethers.isHexString(expectedHash, 32)) throw new Error(`${label} checkpoint has an invalid runtime code hash.`);
  const actualHash = await getRuntimeCodeHash(address, label);
  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(`${label} runtime bytecode changed since the deployment checkpoint; refusing reuse.`);
  }
  return actualHash;
}

export async function assertSepoliaDeploymentTarget() {
  if (network.name !== "whitechainSepolia") {
    throw new Error(`Refusing deployment on network '${network.name}'. Use Whitechain Sepolia only.`);
  }
  const chain = await ethers.provider.getNetwork();
  if (chain.chainId !== WHITECHAIN_SEPOLIA_CHAIN_ID) {
    throw new Error(`Refusing deployment on chain ${chain.chainId}; Whitechain Sepolia is 1874.`);
  }
  const rpcUrl = "url" in network.config ? network.config.url : "";
  let parsedRpc: URL;
  try {
    parsedRpc = new URL(rpcUrl);
  } catch {
    throw new Error("Whitechain Sepolia RPC URL is missing or invalid.");
  }
  if (parsedRpc.protocol !== "https:" || parsedRpc.hostname !== "rpc.testnet.whitechain.io" || parsedRpc.pathname !== "/") {
    throw new Error(`Refusing non-Whitechain Sepolia RPC '${rpcUrl}'.`);
  }
  if (WHITECHAIN_NATIVE_SYMBOL !== "WBT") throw new Error("Whitechain Sepolia native currency must be WBT.");
  return { chainId: Number(chain.chainId), rpcUrl: parsedRpc.origin };
}

export function requireAddress(value: string | undefined, label: string) {
  if (!value || !ethers.isAddress(value) || value.toLowerCase() === ethers.ZeroAddress) {
    throw new Error(`${label} must be a non-zero EVM address.`);
  }
  return ethers.getAddress(value);
}

export function requireDistinctDemoWallets(deployerAddress: string, wallets: string[]) {
  const deployer = requireAddress(deployerAddress, "deployer");
  if (wallets.length !== 2) throw new Error("TEST_WALLETS must contain exactly two addresses: seller and buyer.");
  const recipients = wallets.map((wallet, index) => requireAddress(wallet, `TEST_WALLETS[${index}]`));
  if (recipients[0].toLowerCase() === recipients[1].toLowerCase()) {
    throw new Error("Seller and buyer wallets must be distinct.");
  }
  if (recipients.some(wallet => wallet.toLowerCase() === deployer.toLowerCase())) {
    throw new Error("Deployer, seller, and buyer must be three distinct wallets.");
  }
  return recipients;
}

export async function requireContractCode(value: string, label: string) {
  if (await ethers.provider.getCode(value) === "0x") {
    throw new Error(`${label} (${value}) has no deployed bytecode on Whitechain Sepolia.`);
  }
  return value;
}

export async function deployTestUsdAndMint(wallets: string[], amount: string, progress: DeploymentProgress) {
  if (wallets.length === 0) throw new Error("TEST_WALLETS must list at least one designated Whitechain Sepolia wallet.");
  const recipients = wallets.map((wallet, index) => requireAddress(wallet, `TEST_WALLETS[${index}]`));
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment signer is available.");
  const Token = await ethers.getContractFactory("TestUSD");
  const token = await deployOrReuseContract("TestUSD", Token, [deployer.address], progress);
  const tokenAddress = requireAddress(await token.getAddress(), "TESTUSD");
  await requireContractCode(tokenAddress, "TESTUSD");
  const decimals = Number(await token.decimals());
  if (await token.name() !== "WhiteSETTL Test USD" || await token.symbol() !== "TESTUSD" || decimals !== 6) {
    throw new Error("Deployed TESTUSD metadata did not match the test-token specification.");
  }
  const mintAmount = ethers.parseUnits(amount, decimals);
  if (mintAmount <= 0n) throw new Error("TESTUSD_MINT_AMOUNT must be greater than zero.");
  for (const recipient of recipients) {
    const allocationId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "address", "uint256"],
      [WHITECHAIN_SEPOLIA_CHAIN_ID, tokenAddress, recipient, mintAmount],
    ));
    if (!await token.usedMintAllocations(allocationId)) {
      const tx = await token.mintOnce(allocationId, recipient, mintAmount);
      await tx.wait();
    }
    if (await token.balanceOf(recipient) < mintAmount) throw new Error(`TESTUSD mint verification failed for ${recipient}.`);
  }
  return { token, tokenAddress, decimals, recipients, mintAmount };
}

export async function saveDeploymentRegistry(registry: Record<string, unknown>) {
  if (registry.chainId !== Number(WHITECHAIN_SEPOLIA_CHAIN_ID) || registry.rpcUrl !== WHITECHAIN_SEPOLIA_RPC || registry.nativeCurrency !== WHITECHAIN_NATIVE_SYMBOL) {
    throw new Error("Refusing to generate frontend config for a non-Whitechain Sepolia deployment.");
  }
  if (registry.paymentTokenDecimals === undefined || !Number.isInteger(Number(registry.paymentTokenDecimals)) || Number(registry.paymentTokenDecimals) < 0 || Number(registry.paymentTokenDecimals) > 36) {
    throw new Error("Refusing to generate frontend config with invalid payment-token decimals.");
  }
  if (!Number.isSafeInteger(Number(registry.deploymentBlock)) || Number(registry.deploymentBlock) < 0) {
    throw new Error("Refusing to generate frontend config with an invalid deployment block.");
  }
  if (typeof registry.paymentTokenSymbol !== "string" || registry.paymentTokenSymbol.length === 0 || registry.paymentTokenSymbol.length > 64 || /[\r\n]/.test(registry.paymentTokenSymbol)) {
    throw new Error("Refusing to generate frontend config with an invalid payment-token symbol.");
  }
  const contractFields = ["paymentToken", "InvoiceNFT", "InvoiceRegistry", "LiquidityVault", "AdvanceEngine", "Reputation", "SettlementRouter"];
  for (const field of contractFields) {
    const address = requireAddress(String(registry[field] ?? ""), field);
    await requireContractCode(address, field);
  }
  const deploymentDirectory = "deployments";
  mkdirSync(deploymentDirectory, { recursive: true });
  const registryPath = `${deploymentDirectory}/whitechain-sepolia.json`;
  const frontendEnvPath = `${deploymentDirectory}/whitechain-sepolia.frontend.env`;
  writeAtomic(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const frontendValues = [
    `VITE_WHITECHAIN_RPC_URL=${WHITECHAIN_SEPOLIA_RPC}`,
    `VITE_PAYMENT_TOKEN_ADDRESS=${registry.paymentToken}`,
    `VITE_PAYMENT_TOKEN_SYMBOL=${registry.paymentTokenSymbol}`,
    `VITE_PAYMENT_TOKEN_DECIMALS=${registry.paymentTokenDecimals}`,
    `VITE_INVOICE_REGISTRY_ADDRESS=${registry.InvoiceRegistry}`,
    `VITE_INVOICE_NFT_ADDRESS=${registry.InvoiceNFT}`,
    `VITE_SETTLEMENT_ROUTER_ADDRESS=${registry.SettlementRouter}`,
    `VITE_VAULT_ADDRESS=${registry.LiquidityVault}`,
    `VITE_ADVANCE_ENGINE_ADDRESS=${registry.AdvanceEngine}`,
    `VITE_REPUTATION_ADDRESS=${registry.Reputation}`,
    `VITE_CONTRACT_DEPLOYMENT_BLOCK=${registry.deploymentBlock}`,
  ];
  writeAtomic(frontendEnvPath, `${frontendValues.join("\n")}\n`);
  return { registryPath, frontendEnvPath };
}

export async function deployProtocol(paymentToken: string, treasury: string, progress: DeploymentProgress) {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment signer is available.");
  const admin = requireAddress(deployer.address, "deployer");
  const paymentAsset = requireAddress(paymentToken, "payment token");
  const treasuryAddress = requireAddress(treasury, "treasury");
  await requireContractCode(paymentAsset, "payment token");
  const token = new ethers.Contract(paymentAsset, [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ], ethers.provider);
  const paymentTokenDecimals = Number(await token.decimals());
  const paymentTokenSymbol = await token.symbol();
  if (!Number.isInteger(paymentTokenDecimals) || paymentTokenDecimals < 0 || paymentTokenDecimals > 36) {
    throw new Error(`Unsupported payment token decimals: ${paymentTokenDecimals}.`);
  }

  const NFT = await ethers.getContractFactory("InvoiceNFT");
  const nft = await deployOrReuseContract("InvoiceNFT", NFT, [admin], progress);
  const Vault = await ethers.getContractFactory("LiquidityVault");
  const vault = await deployOrReuseContract("LiquidityVault", Vault, [paymentAsset, admin], progress);
  const Registry = await ethers.getContractFactory("InvoiceRegistry");
  const registry = await deployOrReuseContract("InvoiceRegistry", Registry, [admin, await nft.getAddress(), paymentAsset], progress);
  const configuredNftRegistry = await nft.registry();
  if (configuredNftRegistry === ethers.ZeroAddress) await (await nft.setRegistry(await registry.getAddress())).wait();
  else if (configuredNftRegistry.toLowerCase() !== (await registry.getAddress()).toLowerCase()) throw new Error("InvoiceNFT is initialized to a different registry; refusing to reconfigure.");
  const Engine = await ethers.getContractFactory("AdvanceEngine");
  const engine = await deployOrReuseContract("AdvanceEngine", Engine, [admin, await registry.getAddress(), await vault.getAddress()], progress);
  const Reputation = await ethers.getContractFactory("Reputation");
  const reputation = await deployOrReuseContract("Reputation", Reputation, [admin], progress);
  const configuredEngineReputation = await engine.reputation();
  if (configuredEngineReputation === ethers.ZeroAddress) await (await engine.setReputation(await reputation.getAddress())).wait();
  else if (configuredEngineReputation.toLowerCase() !== (await reputation.getAddress()).toLowerCase()) throw new Error("AdvanceEngine is initialized to a different reputation contract; refusing to reconfigure.");
  const Router = await ethers.getContractFactory("SettlementRouter");
  const router = await deployOrReuseContract("SettlementRouter", Router, [admin, treasuryAddress, 50, await registry.getAddress(), await engine.getAddress(), await reputation.getAddress()], progress);

  const ensureRole = async (label: string, contract: Contract, role: string, account: string) => {
    if (!await contract.hasRole(role, account)) await (await contract.grantRole(role, account)).wait();
    if (!await contract.hasRole(role, account)) throw new Error(`Could not verify role ${label}.`);
    if (!progress.completedRoles.includes(label)) progress.completedRoles.push(label);
    saveDeploymentProgress(progress);
  };
  await ensureRole("invoice-nft.registry-minter", nft, await nft.REGISTRY_ROLE(), await registry.getAddress());
  await ensureRole("registry.invoice-nft-callback", registry, await registry.INVOICE_NFT_ROLE(), await nft.getAddress());
  await ensureRole("registry.advance-financer", registry, await registry.FINANCER_ROLE(), await engine.getAddress());
  await ensureRole("registry.router-settler", registry, await registry.SETTLER_ROLE(), await router.getAddress());
  await ensureRole("vault.advance-engine", vault, await vault.ENGINE_ROLE(), await engine.getAddress());
  await ensureRole("reputation.router-reporter", reputation, await reputation.REPORTER_ROLE(), await router.getAddress());
  await ensureRole("reputation.engine-reporter", reputation, await reputation.REPORTER_ROLE(), await engine.getAddress());
  await ensureRole("engine.router-settler", engine, await engine.SETTLER_ROLE(), await router.getAddress());

  if ((await vault.asset()).toLowerCase() !== paymentAsset.toLowerCase()) throw new Error("LiquidityVault payment asset verification failed.");
  if ((await registry.paymentAsset()).toLowerCase() !== paymentAsset.toLowerCase()) throw new Error("InvoiceRegistry payment asset verification failed.");
  if ((await registry.invoiceNFT()).toLowerCase() !== (await nft.getAddress()).toLowerCase()) throw new Error("InvoiceRegistry NFT dependency verification failed.");
  if ((await nft.registry()).toLowerCase() !== (await registry.getAddress()).toLowerCase()) throw new Error("InvoiceNFT registry callback verification failed.");
  if ((await engine.registry()).toLowerCase() !== (await registry.getAddress()).toLowerCase()) throw new Error("AdvanceEngine registry dependency verification failed.");
  if ((await engine.vault()).toLowerCase() !== (await vault.getAddress()).toLowerCase()) throw new Error("AdvanceEngine vault dependency verification failed.");
  if ((await router.registry()).toLowerCase() !== (await registry.getAddress()).toLowerCase()) throw new Error("SettlementRouter registry dependency verification failed.");
  if ((await router.engine()).toLowerCase() !== (await engine.getAddress()).toLowerCase()) throw new Error("SettlementRouter engine dependency verification failed.");
  if ((await router.reputation()).toLowerCase() !== (await reputation.getAddress()).toLowerCase()) throw new Error("SettlementRouter reputation dependency verification failed.");
  if ((await engine.reputation()).toLowerCase() !== (await reputation.getAddress()).toLowerCase()) throw new Error("AdvanceEngine reputation dependency verification failed.");
  if ((await router.treasury()).toLowerCase() !== treasuryAddress.toLowerCase() || await router.feeBps() !== 50n) throw new Error("SettlementRouter treasury/fee configuration verification failed.");

  const roleChecks = [
    nft.hasRole(await nft.REGISTRY_ROLE(), await registry.getAddress()),
    registry.hasRole(await registry.FINANCER_ROLE(), await engine.getAddress()),
    registry.hasRole(await registry.SETTLER_ROLE(), await router.getAddress()),
    registry.hasRole(await registry.INVOICE_NFT_ROLE(), await nft.getAddress()),
    vault.hasRole(await vault.ENGINE_ROLE(), await engine.getAddress()),
    reputation.hasRole(await reputation.REPORTER_ROLE(), await router.getAddress()),
    reputation.hasRole(await reputation.REPORTER_ROLE(), await engine.getAddress()),
    engine.hasRole(await engine.SETTLER_ROLE(), await router.getAddress()),
    nft.hasRole(await nft.DEFAULT_ADMIN_ROLE(), admin),
    vault.hasRole(await vault.DEFAULT_ADMIN_ROLE(), admin),
    registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin),
    engine.hasRole(await engine.DEFAULT_ADMIN_ROLE(), admin),
    reputation.hasRole(await reputation.DEFAULT_ADMIN_ROLE(), admin),
    router.hasRole(await router.DEFAULT_ADMIN_ROLE(), admin),
  ];
  if ((await Promise.all(roleChecks)).some(granted => !granted)) throw new Error("Protocol role verification failed.");

  const addresses = {
    paymentToken: paymentAsset,
    InvoiceNFT: await nft.getAddress(),
    LiquidityVault: await vault.getAddress(),
    InvoiceRegistry: await registry.getAddress(),
    AdvanceEngine: await engine.getAddress(),
    Reputation: await reputation.getAddress(),
    SettlementRouter: await router.getAddress(),
  };
  for (const [label, address] of Object.entries(addresses)) {
    requireAddress(address, label);
    await requireContractCode(address, label);
  }
  const deploymentBlock = progress.deploymentBlocks.InvoiceRegistry;
  if (deploymentBlock === undefined) throw new Error("Could not recover the InvoiceRegistry deployment block.");
  return { addresses, paymentTokenDecimals, paymentTokenSymbol, admin, treasury: treasuryAddress, deploymentBlock };
}
