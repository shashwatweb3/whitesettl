import { mkdirSync, writeFileSync } from "node:fs";
import { ethers, network } from "hardhat";

export const WHITECHAIN_SEPOLIA_CHAIN_ID = 1874n;
export const WHITECHAIN_SEPOLIA_RPC = "https://rpc.testnet.whitechain.io";
export const WHITECHAIN_NATIVE_SYMBOL = "WBT";

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

export async function deployTestUsdAndMint(wallets: string[], amount: string) {
  if (wallets.length === 0) throw new Error("TEST_WALLETS must list at least one designated Whitechain Sepolia wallet.");
  const recipients = wallets.map((wallet, index) => requireAddress(wallet, `TEST_WALLETS[${index}]`));
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment signer is available.");
  const Token = await ethers.getContractFactory("TestUSD");
  const token = await Token.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = requireAddress(await token.getAddress(), "TESTUSD");
  await requireContractCode(tokenAddress, "TESTUSD");
  const decimals = Number(await token.decimals());
  if (await token.name() !== "WhiteSETTL Test USD" || await token.symbol() !== "TESTUSD" || decimals !== 6) {
    throw new Error("Deployed TESTUSD metadata did not match the test-token specification.");
  }
  const mintAmount = ethers.parseUnits(amount, decimals);
  if (mintAmount <= 0n) throw new Error("TESTUSD_MINT_AMOUNT must be greater than zero.");
  for (const recipient of recipients) {
    const tx = await token.mint(recipient, mintAmount);
    await tx.wait();
    if (await token.balanceOf(recipient) < mintAmount) throw new Error(`TESTUSD mint verification failed for ${recipient}.`);
  }
  return { token, tokenAddress, decimals, recipients, mintAmount };
}

export async function saveDeploymentRegistry(registry: Record<string, unknown>) {
  const deploymentDirectory = "deployments";
  mkdirSync(deploymentDirectory, { recursive: true });
  const registryPath = `${deploymentDirectory}/whitechain-sepolia.json`;
  const frontendEnvPath = `${deploymentDirectory}/whitechain-sepolia.frontend.env`;
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

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
  writeFileSync(frontendEnvPath, `${frontendValues.join("\n")}\n`);
  return { registryPath, frontendEnvPath };
}

export async function deployProtocol(paymentToken: string, treasury: string) {
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
  const nft = await NFT.deploy(admin);
  await nft.waitForDeployment();
  const Vault = await ethers.getContractFactory("LiquidityVault");
  const vault = await Vault.deploy(paymentAsset, admin);
  await vault.waitForDeployment();
  const Registry = await ethers.getContractFactory("InvoiceRegistry");
  const registry = await Registry.deploy(admin, await nft.getAddress(), paymentAsset);
  await registry.waitForDeployment();
  const Engine = await ethers.getContractFactory("AdvanceEngine");
  const engine = await Engine.deploy(admin, await registry.getAddress(), await vault.getAddress());
  await engine.waitForDeployment();
  const Reputation = await ethers.getContractFactory("Reputation");
  const reputation = await Reputation.deploy(admin);
  await reputation.waitForDeployment();
  const Router = await ethers.getContractFactory("SettlementRouter");
  const router = await Router.deploy(admin, treasuryAddress, 50, await registry.getAddress(), await engine.getAddress(), await reputation.getAddress());
  await router.waitForDeployment();

  await (await nft.grantRole(await nft.REGISTRY_ROLE(), await registry.getAddress())).wait();
  await (await registry.grantRole(await registry.FINANCER_ROLE(), await engine.getAddress())).wait();
  await (await registry.grantRole(await registry.SETTLER_ROLE(), await router.getAddress())).wait();
  await (await vault.grantRole(await vault.ENGINE_ROLE(), await engine.getAddress())).wait();
  await (await reputation.grantRole(await reputation.REPORTER_ROLE(), await router.getAddress())).wait();
  await (await engine.grantRole(await engine.SETTLER_ROLE(), await router.getAddress())).wait();

  if ((await vault.asset()).toLowerCase() !== paymentAsset.toLowerCase()) throw new Error("LiquidityVault payment asset verification failed.");
  if ((await registry.paymentAsset()).toLowerCase() !== paymentAsset.toLowerCase()) throw new Error("InvoiceRegistry payment asset verification failed.");
  if ((await registry.invoiceNFT()).toLowerCase() !== (await nft.getAddress()).toLowerCase()) throw new Error("InvoiceRegistry NFT dependency verification failed.");
  if ((await engine.registry()).toLowerCase() !== (await registry.getAddress()).toLowerCase()) throw new Error("AdvanceEngine registry dependency verification failed.");
  if ((await engine.vault()).toLowerCase() !== (await vault.getAddress()).toLowerCase()) throw new Error("AdvanceEngine vault dependency verification failed.");
  if ((await router.registry()).toLowerCase() !== (await registry.getAddress()).toLowerCase()) throw new Error("SettlementRouter registry dependency verification failed.");
  if ((await router.engine()).toLowerCase() !== (await engine.getAddress()).toLowerCase()) throw new Error("SettlementRouter engine dependency verification failed.");
  if ((await router.reputation()).toLowerCase() !== (await reputation.getAddress()).toLowerCase()) throw new Error("SettlementRouter reputation dependency verification failed.");
  if ((await router.treasury()).toLowerCase() !== treasuryAddress.toLowerCase() || await router.feeBps() !== 50n) throw new Error("SettlementRouter treasury/fee configuration verification failed.");

  const roleChecks = [
    nft.hasRole(await nft.REGISTRY_ROLE(), await registry.getAddress()),
    registry.hasRole(await registry.FINANCER_ROLE(), await engine.getAddress()),
    registry.hasRole(await registry.SETTLER_ROLE(), await router.getAddress()),
    vault.hasRole(await vault.ENGINE_ROLE(), await engine.getAddress()),
    reputation.hasRole(await reputation.REPORTER_ROLE(), await router.getAddress()),
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
  const registryReceipt = await registry.deploymentTransaction()?.wait();
  if (!registryReceipt) throw new Error("Could not verify the registry deployment receipt.");
  return { addresses, paymentTokenDecimals, paymentTokenSymbol, admin, treasury: treasuryAddress, deploymentBlock: registryReceipt.blockNumber };
}
