import { ethers } from "hardhat";
import { assertSepoliaDeploymentTarget, deployProtocol, deployTestUsdAndMint, loadDeploymentProgress, requireAddress, requireDistinctDemoWallets, saveDeploymentProgress, saveDeploymentRegistry } from "./deployment-utils";

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required. Deployment requires explicit user approval.");
  const target = await assertSepoliaDeploymentTarget();
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment account is available.");
  const wallets = requireDistinctDemoWallets(deployer.address, (process.env.TEST_WALLETS || "").split(",").map(wallet => wallet.trim()).filter(Boolean));
  const mintAmount = process.env.TESTUSD_MINT_AMOUNT || "10000";
  const progress = loadDeploymentProgress({ chainId: target.chainId, deployer: deployer.address, flow: "demo", testWallets: wallets, mintAmount });
  const tokenResult = await deployTestUsdAndMint(wallets, mintAmount, progress);
  if (progress.paymentToken && progress.paymentToken.toLowerCase() !== tokenResult.tokenAddress.toLowerCase()) throw new Error("Recovered TESTUSD address differs from the progress journal.");
  progress.paymentToken = tokenResult.tokenAddress;
  saveDeploymentProgress(progress);
  const treasury = requireAddress(process.env.TREASURY_ADDRESS || deployer.address, "TREASURY_ADDRESS");
  const protocol = await deployProtocol(tokenResult.tokenAddress, treasury, progress);
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
