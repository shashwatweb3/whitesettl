import { expect } from "chai";
import { ethers } from "hardhat";

describe("WhiteSETTL settlement", function () {
  async function fixture() {
    const [admin, seller, buyer, lp, treasury, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockStablecoin"); const token = await Token.deploy();
    const NFT = await ethers.getContractFactory("InvoiceNFT"); const nft = await NFT.deploy(admin.address);
    const Vault = await ethers.getContractFactory("LiquidityVault"); const vault = await Vault.deploy(await token.getAddress(), admin.address);
    const Registry = await ethers.getContractFactory("InvoiceRegistry"); const registry = await Registry.deploy(admin.address, await nft.getAddress(), await token.getAddress());
    const Engine = await ethers.getContractFactory("AdvanceEngine"); const engine = await Engine.deploy(admin.address, await registry.getAddress(), await vault.getAddress());
    const Rep = await ethers.getContractFactory("Reputation"); const reputation = await Rep.deploy(admin.address);
    const Router = await ethers.getContractFactory("SettlementRouter"); const router = await Router.deploy(admin.address, treasury.address, 50, await registry.getAddress(), await engine.getAddress(), await reputation.getAddress());
    await nft.grantRole(await nft.REGISTRY_ROLE(), await registry.getAddress()); await registry.grantRole(await registry.FINANCER_ROLE(), await engine.getAddress()); await registry.grantRole(await registry.SETTLER_ROLE(), await router.getAddress()); await vault.grantRole(await vault.ENGINE_ROLE(), await engine.getAddress()); await reputation.grantRole(await reputation.REPORTER_ROLE(), await router.getAddress()); await engine.grantRole(await engine.SETTLER_ROLE(), await router.getAddress());
    const amount = 1_000_000n; await token.mint(buyer.address, amount); await token.mint(lp.address, 10_000_000n); await token.connect(lp).approve(await vault.getAddress(), 10_000_000n); await vault.connect(lp).deposit(10_000_000n, lp.address);
    return { admin, seller, buyer, lp, treasury, other, token, nft, registry, vault, engine, reputation, router, amount };
  }
  async function issue(f: Awaited<ReturnType<typeof fixture>>) { const due = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 30 * 86400); await f.registry.connect(f.seller).issueInvoice(f.buyer.address, await f.token.getAddress(), f.amount, due, ethers.keccak256(ethers.toUtf8Bytes("INV-2026-001")), ethers.keccak256(ethers.toUtf8Bytes("metadata"))); return 1n; }
  it("issues and settles an invoice atomically", async () => { const f = await fixture(); const id = await issue(f); await f.token.connect(f.buyer).approve(await f.router.getAddress(), f.amount); await expect(f.router.connect(f.buyer).pay(id)).to.changeTokenBalances(f.token, [f.seller, f.treasury], [995_000n, 5_000n]); expect((await f.registry.getInvoice(id)).status).eq(6); expect((await f.reputation.profiles(f.seller.address)).paidInvoices).eq(1); });
  it("routes a financed payment to the vault and prevents double financing", async () => { const f = await fixture(); const id = await issue(f); await f.engine.connect(f.seller).requestAdvance(id, 7_000); await expect(f.engine.connect(f.seller).requestAdvance(id, 7_000)).reverted; await f.token.connect(f.buyer).approve(await f.router.getAddress(), f.amount); await f.router.connect(f.buyer).pay(id); expect((await f.engine.advances(id)).active).eq(false); expect((await f.registry.getInvoice(id)).status).eq(6); });
  it("blocks unauthorized payment", async () => { const f = await fixture(); const id = await issue(f); await expect(f.router.connect(f.other).pay(id)).revertedWith("buyer only"); });
  it("rejects an invoice denominated in an unapproved asset", async () => { const f = await fixture(); const OtherToken = await ethers.getContractFactory("MockStablecoin"); const otherToken = await OtherToken.deploy(); const due = BigInt((await ethers.provider.getBlock("latest"))!.timestamp + 30 * 86400); await expect(f.registry.connect(f.seller).issueInvoice(f.buyer.address, await otherToken.getAddress(), f.amount, due, ethers.keccak256(ethers.toUtf8Bytes("INV-OTHER-ASSET")), ethers.keccak256(ethers.toUtf8Bytes("metadata")))).revertedWith("unsupported asset"); });
});
