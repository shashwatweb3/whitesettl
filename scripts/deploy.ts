import { ethers } from "hardhat";
import { assertSepoliaDeploymentTarget, deployProtocol, requireAddress, saveDeploymentRegistry } from "./deployment-utils";

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) throw new Error("DEPLOYER_PRIVATE_KEY is required. Deployment requires explicit user approval.");
  const target = await assertSepoliaDeploymentTarget();
  const paymentToken = requireAddress(process.env.PAYMENT_TOKEN_ADDRESS, "PAYMENT_TOKEN_ADDRESS");
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account is available. Check DEPLOYER_PRIVATE_KEY.");
  const treasury = requireAddress(process.env.TREASURY_ADDRESS || deployer.address, "TREASURY_ADDRESS");
  const protocol = await deployProtocol(paymentToken, treasury);
  const registry = {
    ...target,
    nativeCurrency: "WBT",
    deploymentBlock: protocol.deploymentBlock,
    paymentToken: protocol.addresses.paymentToken,
    paymentTokenSymbol: protocol.paymentTokenSymbol,
    paymentTokenDecimals: protocol.paymentTokenDecimals,
    InvoiceNFT: protocol.addresses.InvoiceNFT,
    InvoiceRegistry: protocol.addresses.InvoiceRegistry,
    LiquidityVault: protocol.addresses.LiquidityVault,
    AdvanceEngine: protocol.addresses.AdvanceEngine,
    Reputation: protocol.addresses.Reputation,
    SettlementRouter: protocol.addresses.SettlementRouter,
    treasury: protocol.treasury,
    feeBps: 50,
    rolesVerified: true,
    paymentTokenSource: "externally verified token",
  };
  const files = await saveDeploymentRegistry(registry);
  console.log(JSON.stringify({ registry, files }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
