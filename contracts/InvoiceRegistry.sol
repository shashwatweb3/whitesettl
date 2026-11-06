// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {InvoiceNFT} from "./InvoiceNFT.sol";

contract InvoiceRegistry is AccessControl, Pausable {
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant FINANCER_ROLE = keccak256("FINANCER_ROLE");
    enum Status { Draft, Issued, Financed, PartiallyPaid, Paid, Overdue, Cleared }
    struct Invoice { address seller; address buyer; address asset; uint128 amount; uint64 issueDate; uint64 dueDate; Status status; bytes32 metadataHash; }
    InvoiceNFT public immutable invoiceNFT;
    address public immutable paymentAsset;
    uint256 public nextInvoiceId = 1;
    mapping(uint256 => Invoice) private invoices;
    mapping(bytes32 => bool) public usedReferences;
    event InvoiceIssued(uint256 indexed invoiceId, address indexed seller, address indexed buyer, address asset, uint256 amount, uint64 dueDate, bytes32 reference, bytes32 metadataHash);
    event InvoiceStatusChanged(uint256 indexed invoiceId, Status status);

    constructor(address admin, InvoiceNFT nft, address paymentAsset_) { require(paymentAsset_ != address(0), "zero asset"); _grantRole(DEFAULT_ADMIN_ROLE, admin); invoiceNFT = nft; paymentAsset = paymentAsset_; }
    function issueInvoice(address buyer, address asset, uint128 amount, uint64 dueDate, bytes32 reference, bytes32 metadataHash) external whenNotPaused returns (uint256 invoiceId) {
        require(buyer != address(0) && asset == paymentAsset, "unsupported asset"); require(amount > 0 && dueDate > block.timestamp, "invalid terms"); require(!usedReferences[reference], "reference used");
        invoiceId = nextInvoiceId++; usedReferences[reference] = true;
        invoices[invoiceId] = Invoice(msg.sender, buyer, asset, amount, uint64(block.timestamp), dueDate, Status.Issued, metadataHash);
        invoiceNFT.mint(msg.sender, invoiceId); emit InvoiceIssued(invoiceId, msg.sender, buyer, asset, amount, dueDate, reference, metadataHash);
    }
    function getInvoice(uint256 id) external view returns (Invoice memory) { return invoices[id]; }
    function markFinanced(uint256 id) external onlyRole(FINANCER_ROLE) { Invoice storage i = invoices[id]; require(i.status == Status.Issued, "not eligible"); i.status = Status.Financed; invoiceNFT.setFinanced(id, true); emit InvoiceStatusChanged(id, Status.Financed); }
    function settle(uint256 id) external onlyRole(SETTLER_ROLE) { Invoice storage i = invoices[id]; require(i.status == Status.Issued || i.status == Status.Financed, "not payable"); i.status = Status.Cleared; invoiceNFT.setFinanced(id, false); emit InvoiceStatusChanged(id, Status.Cleared); }
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
