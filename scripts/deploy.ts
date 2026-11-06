import { ethers } from "hardhat";
import { mkdirSync, writeFileSync } from "node:fs";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const paymentToken = process.env.PAYMENT_TOKEN_ADDRESS;
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required for an explicitly approved Whitechain Sepolia deployment.");
  if (!paymentToken || !ethers.isAddress(paymentToken) || paymentToken === ethers.ZeroAddress) throw new Error("PAYMENT_TOKEN_ADDRESS must be a verified Whitechain token address. Deployment intentionally refuses guessed addresses.");
  const network = await ethers.provider.getNetwork();
  if (network.chainId !== 1874n) throw new Error(`Refusing deployment on chain ${network.chainId}; only Whitechain Sepolia (1874) is allowed.`);
  if (await ethers.provider.getCode(paymentToken) === "0x") throw new Error("PAYMENT_TOKEN_ADDRESS has no contract code on Whitechain Sepolia.");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account is available. Check DEPLOYER_PRIVATE_KEY.");
  const NFT = await ethers.getContractFactory("InvoiceNFT"); const nft = await NFT.deploy(deployer.address); await nft.waitForDeployment();
  const Vault = await ethers.getContractFactory("LiquidityVault"); const vault = await Vault.deploy(paymentToken, deployer.address); await vault.waitForDeployment();
  const Registry = await ethers.getContractFactory("InvoiceRegistry"); const registry = await Registry.deploy(deployer.address, await nft.getAddress(), paymentToken); await registry.waitForDeployment();
  const Engine = await ethers.getContractFactory("AdvanceEngine"); const engine = await Engine.deploy(deployer.address, await registry.getAddress(), await vault.getAddress()); await engine.waitForDeployment();
  const Reputation = await ethers.getContractFactory("Reputation"); const reputation = await Reputation.deploy(deployer.address); await reputation.waitForDeployment();
  const Router = await ethers.getContractFactory("SettlementRouter"); const router = await Router.deploy(deployer.address, deployer.address, 50, await registry.getAddress(), await engine.getAddress(), await reputation.getAddress()); await router.waitForDeployment();
  await nft.grantRole(await nft.REGISTRY_ROLE(), await registry.getAddress());
  await registry.grantRole(await registry.FINANCER_ROLE(), await engine.getAddress()); await registry.grantRole(await registry.SETTLER_ROLE(), await router.getAddress());
  await vault.grantRole(await vault.ENGINE_ROLE(), await engine.getAddress()); await reputation.grantRole(await reputation.REPORTER_ROLE(), await router.getAddress());
  await engine.grantRole(await engine.SETTLER_ROLE(), await router.getAddress());
  const addresses = { chainId: 1874, deploymentBlock: await ethers.provider.getBlockNumber(), paymentToken, InvoiceNFT: await nft.getAddress(), InvoiceRegistry: await registry.getAddress(), LiquidityVault: await vault.getAddress(), AdvanceEngine: await engine.getAddress(), Reputation: await reputation.getAddress(), SettlementRouter: await router.getAddress() };
  mkdirSync("deployments", { recursive: true }); writeFileSync("deployments/whitechain-sepolia.json", JSON.stringify(addresses, null, 2)); console.log(addresses);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
