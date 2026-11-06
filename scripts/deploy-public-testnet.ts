import { ethers } from "hardhat";
import { assertSepoliaDeploymentTarget, deployProtocol, deployPublicTestUsd, loadDeploymentProgress, requireAddress, saveDeploymentProgress, saveDeploymentRegistry } from "./deployment-utils";

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required. Keep it local; deployment requires explicit approval.");
  const target = await assertSepoliaDeploymentTarget();
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployment account is available.");

  const progress = loadDeploymentProgress({
    chainId: target.chainId,
    deployer: deployer.address,
    flow: "public-faucet",
    testWallets: [],
  });
  const token = await deployPublicTestUsd(progress);
  if (progress.paymentToken && progress.paymentToken.toLowerCase() !== token.tokenAddress.toLowerCase()) {
    throw new Error("Recovered TESTUSD address differs from the deployment checkpoint.");
  }
  progress.paymentToken = token.tokenAddress;
  saveDeploymentProgress(progress);

  const treasury = requireAddress(process.env.TREASURY_ADDRESS || deployer.address, "TREASURY_ADDRESS");
  const protocol = await deployProtocol(token.tokenAddress, treasury, progress);
  const registry = {
    ...target,
    nativeCurrency: "WBT",
    deploymentBlock: protocol.deploymentBlock,
    paymentToken: token.tokenAddress,
    paymentTokenName: token.name,
    paymentTokenSymbol: token.symbol,
    paymentTokenDecimals: token.decimals,
    testnetOnly: true,
    faucetEnabled: true,
    faucetClaimAmountRaw: token.claimAmount.toString(),
    faucetCooldownSeconds: Number(token.claimCooldown),
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
    prefundedWallets: [],
  };
  const files = await saveDeploymentRegistry(registry);
  console.log(JSON.stringify({ registry, files }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
