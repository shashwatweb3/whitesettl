import { expect } from "chai";
import { ethers } from "hardhat";

describe("WhiteSETTL TestUSD (testnet only)", function () {
  it("has an explicit TESTUSD identity, six decimals, and role-controlled minting", async () => {
    const [admin, seller, buyer, unauthorized] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestUSD");
    const token = await Token.deploy(admin.address);

    expect(await token.name()).eq("WhiteSETTL Test USD");
    expect(await token.symbol()).eq("TESTUSD");
    expect(await token.decimals()).eq(6);
    expect(await token.hasRole(await token.MINTER_ROLE(), admin.address)).eq(true);
    expect(await token.hasRole(await token.MINTER_ROLE(), seller.address)).eq(false);

    await token.mint(buyer.address, 25_000_000n);
    expect(await token.balanceOf(buyer.address)).eq(25_000_000n);
    await expect(token.connect(unauthorized).mint(seller.address, 1n)).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    await expect(token.mint(ethers.ZeroAddress, 1n)).to.be.revertedWithCustomError(token, "ZeroAddress");
  });

  it("supports the complete two-wallet invoice payment and rejects duplicate payment", async () => {
    const [admin, seller, buyer, treasury] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("TestUSD");
    const token = await Token.deploy(admin.address);
    const NFT = await ethers.getContractFactory("InvoiceNFT");
    const nft = await NFT.deploy(admin.address);
    const Vault = await ethers.getContractFactory("LiquidityVault");
    const vault = await Vault.deploy(await token.getAddress(), admin.address);
    const Registry = await ethers.getContractFactory("InvoiceRegistry");
    const registry = await Registry.deploy(admin.address, await nft.getAddress(), await token.getAddress());
    const Engine = await ethers.getContractFactory("AdvanceEngine");
    const engine = await Engine.deploy(admin.address, await registry.getAddress(), await vault.getAddress());
    const Reputation = await ethers.getContractFactory("Reputation");
    const reputation = await Reputation.deploy(admin.address);
    const Router = await ethers.getContractFactory("SettlementRouter");
    const router = await Router.deploy(admin.address, treasury.address, 50, await registry.getAddress(), await engine.getAddress(), await reputation.getAddress());

    await nft.grantRole(await nft.REGISTRY_ROLE(), await registry.getAddress());
    await registry.grantRole(await registry.FINANCER_ROLE(), await engine.getAddress());
    await registry.grantRole(await registry.SETTLER_ROLE(), await router.getAddress());
    await vault.grantRole(await vault.ENGINE_ROLE(), await engine.getAddress());
    await reputation.grantRole(await reputation.REPORTER_ROLE(), await router.getAddress());
    await engine.grantRole(await engine.SETTLER_ROLE(), await router.getAddress());

    const invoiceAmount = 12_480_000_000n;
    await token.mint(buyer.address, invoiceAmount + 2_000_000n);
    const dueDate = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 14 * 86400);
    const invoiceReference = ethers.keccak256(ethers.toUtf8Bytes("TWO-WALLET-TEST-001"));
    const issueReceipt = await (await registry.connect(seller).issueInvoice(
      buyer.address,
      await token.getAddress(),
      invoiceAmount,
      dueDate,
      invoiceReference,
      ethers.keccak256(ethers.toUtf8Bytes("Two-wallet TESTUSD integration")),
    )).wait();
    const issued = issueReceipt!.logs.map(log => {
      try { return registry.interface.parseLog(log); } catch { return null; }
    }).find(event => event?.name === "InvoiceIssued");
    expect(issued).not.eq(undefined);
    const invoiceId = issued!.args.invoiceId as bigint;
    expect((await registry.getInvoice(invoiceId)).seller).eq(seller.address);

    await token.connect(buyer).approve(await router.getAddress(), invoiceAmount);
    const sellerBefore = await token.balanceOf(seller.address);
    const buyerBefore = await token.balanceOf(buyer.address);
    const treasuryBefore = await token.balanceOf(treasury.address);
    const paymentReceipt = await (await router.connect(buyer).pay(invoiceId)).wait();
    expect(paymentReceipt!.status).eq(1);

    const settled = paymentReceipt!.logs.map(log => {
      try { return router.interface.parseLog(log); } catch { return null; }
    }).find(event => event?.name === "InvoiceSettled");
    expect(settled).not.eq(undefined);
    const expectedFee = invoiceAmount * 50n / 10_000n;
    const expectedSellerProceeds = invoiceAmount - expectedFee;
    expect(settled!.args.invoiceId).eq(invoiceId);
    expect(settled!.args.buyer).eq(buyer.address);
    expect(settled!.args.fee).eq(expectedFee);
    expect(settled!.args.sellerProceeds).eq(expectedSellerProceeds);
    expect(await token.balanceOf(seller.address) - sellerBefore).eq(expectedSellerProceeds);
    expect(buyerBefore - await token.balanceOf(buyer.address)).eq(invoiceAmount);
    expect(await token.balanceOf(treasury.address) - treasuryBefore).eq(expectedFee);
    expect((await registry.getInvoice(invoiceId)).status).eq(6);

    await expect(router.connect(buyer).pay(invoiceId)).to.be.revertedWith("not payable");
    expect((await registry.getInvoice(invoiceId)).status).eq(6);
  });
});
