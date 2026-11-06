// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {InvoiceRegistry} from "./InvoiceRegistry.sol";
import {LiquidityVault} from "./LiquidityVault.sol";
import {Reputation} from "./Reputation.sol";

contract AdvanceEngine is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    uint16 public constant MAX_LTV_BPS = 8_000;
    uint16 public constant ANNUAL_RATE_BPS = 1_200;
    struct Advance { uint128 principal; uint128 repayment; bool active; }
    InvoiceRegistry public immutable registry; LiquidityVault public immutable vault; Reputation public reputation;
    mapping(uint256 => Advance) public advances;
    event Advanced(uint256 indexed invoiceId, address indexed seller, uint256 principal, uint256 repayment);
    event Repaid(uint256 indexed invoiceId, uint256 amount);
    constructor(address admin, InvoiceRegistry registry_, LiquidityVault vault_) { require(admin != address(0) && address(registry_).code.length > 0 && address(vault_).code.length > 0, "invalid config"); require(address(vault_.asset()) == registry_.paymentAsset(), "asset mismatch"); _grantRole(DEFAULT_ADMIN_ROLE, admin); registry = registry_; vault = vault_; }
    function setReputation(Reputation reputation_) external onlyRole(DEFAULT_ADMIN_ROLE) { require(address(reputation) == address(0) && address(reputation_).code.length > 0, "invalid reputation"); reputation = reputation_; }
    function requestAdvance(uint256 id, uint16 ltvBps) external nonReentrant {
        require(address(reputation).code.length > 0, "reputation unset");
        require(ltvBps > 0 && ltvBps <= MAX_LTV_BPS && !advances[id].active, "invalid advance");
        InvoiceRegistry.Invoice memory i = registry.getInvoice(id); require(i.seller == msg.sender && i.status == InvoiceRegistry.Status.Issued && block.timestamp < i.dueDate, "not eligible");
        uint256 principal = uint256(i.amount) * ltvBps / 10_000; uint256 daysToDue = i.dueDate - block.timestamp;
        uint256 repayment = principal + (principal * ANNUAL_RATE_BPS * daysToDue / 365 days / 10_000);
        require(repayment <= i.amount, "repayment exceeds invoice"); require(principal <= type(uint128).max && repayment <= type(uint128).max, "advance overflow"); advances[id] = Advance(uint128(principal), uint128(repayment), true); registry.markFinanced(id); vault.lend(msg.sender, principal); reputation.reportAdvance(msg.sender, uint128(principal)); emit Advanced(id, msg.sender, principal, repayment);
    }
    function repay(uint256 id) external onlyRole(SETTLER_ROLE) nonReentrant returns (uint256 repayment, uint256 principal) { Advance memory a = advances[id]; require(a.active, "no advance"); delete advances[id]; IERC20(address(vault.asset())).forceApprove(address(vault), a.repayment); vault.receiveRepayment(a.principal, a.repayment); emit Repaid(id, a.repayment); return (a.repayment, a.principal); }
}
