import { ethers } from "hardhat";
import { assertSepoliaDeploymentTarget, deployProtocol, deployTestUsdAndMint, requireAddress, saveDeploymentRegistry } from "./deployment-utils";

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required. Deployment requires explicit user approval.");
  const target = await assertSepoliaDeploymentTarget();
  const wallets = (process.env.TEST_WALLETS || "").split(",").map(wallet => wallet.trim()).filter(Boolean);
  const distinctWallets = new Set(wallets.map(wallet => wallet.toLowerCase()));
  if (distinctWallets.size < 2) throw new Error("TEST_WALLETS must include two distinct seller and buyer wallet addresses.");
  const tokenResult = await deployTestUsdAndMint(wallets, process.env.TESTUSD_MINT_AMOUNT || "10000");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment account is available.");
  const treasury = requireAddress(process.env.TREASURY_ADDRESS || deployer.address, "TREASURY_ADDRESS");
  const protocol = await deployProtocol(tokenResult.tokenAddress, treasury);
  const registry = {
    ...target,
    nativeCurrency: "WBT",
    deploymentBlock: protocol.deploymentBlock,
    paymentToken: tokenResult.tokenAddress,
    paymentTokenName: "WhiteSETTL Test USD",
    paymentTokenSymbol: "TESTUSD",
    paymentTokenDecimals: tokenResult.decimals,
    testnetOnly: true,
    testWallets: tokenResult.recipients,
    testWalletMintAmountEach: ethers.formatUnits(tokenResult.mintAmount, tokenResult.decimals),
    deployer: protocol.admin,
    treasury: protocol.treasury,
    feeBps: 50,
    InvoiceNFT: protocol.addresses.InvoiceNFT,
    InvoiceRegistry: protocol.addresses.InvoiceRegistry,
    LiquidityVault: protocol.addresses.LiquidityVault,
    AdvanceEngine: protocol.addresses.AdvanceEngine,
    Reputation: protocol.addresses.Reputation,
    SettlementRouter: protocol.addresses.SettlementRouter,
    rolesVerified: true,
  };
  const files = await saveDeploymentRegistry(registry);
  console.log(JSON.stringify({ registry, files }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
