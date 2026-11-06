// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {InvoiceRegistry} from "./InvoiceRegistry.sol";
import {AdvanceEngine} from "./AdvanceEngine.sol";
import {Reputation} from "./Reputation.sol";

contract SettlementRouter is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint16 public immutable feeBps; address public treasury; InvoiceRegistry public immutable registry; AdvanceEngine public immutable engine; Reputation public immutable reputation;
    event InvoiceSettled(uint256 indexed invoiceId, address indexed buyer, uint256 fee, uint256 repayment, uint256 sellerProceeds);
    constructor(address admin, address treasury_, uint16 feeBps_, InvoiceRegistry registry_, AdvanceEngine engine_, Reputation reputation_) { require(admin != address(0) && treasury_ != address(0) && feeBps_ <= 1_000 && address(registry_).code.length > 0 && address(engine_).code.length > 0 && address(reputation_).code.length > 0, "invalid config"); require(address(engine_.registry()) == address(registry_) && address(engine_.reputation()) == address(reputation_), "dependency mismatch"); require(address(engine_.vault().asset()) == registry_.paymentAsset(), "asset mismatch"); _grantRole(DEFAULT_ADMIN_ROLE, admin); treasury = treasury_; feeBps = feeBps_; registry = registry_; engine = engine_; reputation = reputation_; }
    function pay(uint256 id) external nonReentrant {
        InvoiceRegistry.Invoice memory i = registry.getInvoice(id); require(i.buyer == msg.sender, "buyer only"); require(i.status == InvoiceRegistry.Status.Issued || i.status == InvoiceRegistry.Status.Financed, "not payable");
        IERC20 token = IERC20(i.asset); token.safeTransferFrom(msg.sender, address(this), i.amount); uint256 fee = uint256(i.amount) * feeBps / 10_000; uint256 repayment;
        uint256 principalRepaid;
        if (i.status == InvoiceRegistry.Status.Financed) { (uint128 advancePrincipal, uint128 advanceRepayment, bool active) = engine.advances(id); require(active, "no advance"); repayment = advanceRepayment; principalRepaid = advancePrincipal; require(repayment <= uint256(i.amount) - fee, "waterfall deficit"); token.safeTransfer(address(engine), repayment); engine.repay(id); }
        token.safeTransfer(treasury, fee); uint256 proceeds = uint256(i.amount) - fee - repayment; token.safeTransfer(i.seller, proceeds); registry.settle(id); reputation.reportSettlement(i.seller, i.amount, block.timestamp > i.dueDate, uint128(principalRepaid)); emit InvoiceSettled(id, msg.sender, fee, repayment, proceeds);
    }
}
