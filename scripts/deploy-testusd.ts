import { mkdirSync, writeFileSync } from "node:fs";
import { ethers } from "hardhat";
import { assertSepoliaDeploymentTarget, deployTestUsdAndMint } from "./deployment-utils";

async function main() {
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required. Deployment requires explicit user approval.");
  const target = await assertSepoliaDeploymentTarget();
  const recipients = (process.env.TEST_WALLETS || "").split(",").map(wallet => wallet.trim()).filter(Boolean);
  const amount = process.env.TESTUSD_MINT_AMOUNT || "10000";
  const { tokenAddress, decimals, recipients: wallets, mintAmount } = await deployTestUsdAndMint(recipients, amount);
  const [deployer] = await ethers.getSigners();
  const deployment = {
    ...target,
    nativeCurrency: "WBT",
    deploymentBlock: await ethers.provider.getBlockNumber(),
    contract: tokenAddress,
    name: "WhiteSETTL Test USD",
    symbol: "TESTUSD",
    decimals,
    testnetOnly: true,
    minter: deployer.address,
    mintedTo: wallets,
    mintedAmountEach: ethers.formatUnits(mintAmount, decimals),
  };
  mkdirSync("deployments", { recursive: true });
  const registryPath = "deployments/testusd-whitechain-sepolia.json";
  writeFileSync(registryPath, `${JSON.stringify(deployment, null, 2)}\n`);
  console.log(JSON.stringify({ deployment, registryPath }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
