import { expect } from "chai";
import { ethers } from "hardhat";
import { getRuntimeCodeHash, requireDistinctDemoWallets, requireRuntimeCodeHash } from "../scripts/deployment-utils";

describe("Whitechain Sepolia deployment preflight", function () {
  it("accepts exactly two distinct test wallets separate from the deployer", async () => {
    const [deployer, seller, buyer] = await ethers.getSigners();
    expect(requireDistinctDemoWallets(deployer.address, [seller.address, buyer.address]))
      .deep.eq([seller.address, buyer.address]);
  });

  it("rejects duplicate, deployer-alias, invalid, and extra test wallets", async () => {
    const [deployer, seller, buyer] = await ethers.getSigners();
    expect(() => requireDistinctDemoWallets(deployer.address, [seller.address, seller.address]))
      .to.throw("Seller and buyer wallets must be distinct.");
    expect(() => requireDistinctDemoWallets(deployer.address, [deployer.address, buyer.address]))
      .to.throw("Deployer, seller, and buyer must be three distinct wallets.");
    expect(() => requireDistinctDemoWallets(deployer.address, [seller.address, buyer.address, ethers.Wallet.createRandom().address]))
      .to.throw("TEST_WALLETS must contain exactly two addresses: seller and buyer.");
    expect(() => requireDistinctDemoWallets(deployer.address, ["not-an-address", buyer.address]))
      .to.throw("TEST_WALLETS[0] must be a non-zero EVM address.");
  });

  it("only reuses deployment addresses when the runtime bytecode hash matches", async () => {
    const [admin] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("TestUSD")).deploy(admin.address);
    await token.waitForDeployment();
    const address = await token.getAddress();
    const runtimeHash = await getRuntimeCodeHash(address, "TestUSD");
    expect(await requireRuntimeCodeHash(address, runtimeHash, "TestUSD")).eq(runtimeHash);
    await expect(requireRuntimeCodeHash(address, ethers.keccak256("0x1234"), "TestUSD"))
      .to.be.rejectedWith("runtime bytecode changed since the deployment checkpoint");
    await expect(requireRuntimeCodeHash(address, "0x1234", "TestUSD"))
      .to.be.rejectedWith("checkpoint has an invalid runtime code hash");
  });
});
