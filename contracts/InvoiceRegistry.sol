// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {InvoiceNFT} from "./InvoiceNFT.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract InvoiceRegistry is AccessControl, Pausable {
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");
    bytes32 public constant FINANCER_ROLE = keccak256("FINANCER_ROLE");
    bytes32 public constant INVOICE_NFT_ROLE = keccak256("INVOICE_NFT_ROLE");
    enum Status { Draft, Issued, Financed, PartiallyPaid, Paid, Overdue, Cleared }
    struct Invoice { address seller; address buyer; address asset; uint128 amount; uint64 issueDate; uint64 dueDate; Status status; bytes32 metadataHash; }
    InvoiceNFT public immutable invoiceNFT;
    address public immutable paymentAsset;
    uint256 public nextInvoiceId = 1;
    mapping(uint256 => Invoice) private invoices;
    mapping(bytes32 => bool) public usedReferences;
    event InvoiceIssued(uint256 indexed invoiceId, address indexed seller, address indexed buyer, address asset, uint256 amount, uint64 dueDate, bytes32 invoiceReference, bytes32 metadataHash);
    event InvoiceStatusChanged(uint256 indexed invoiceId, Status status);
    event InvoiceSellerChanged(uint256 indexed invoiceId, address indexed from, address indexed to);

    constructor(address admin, InvoiceNFT nft, address paymentAsset_) {
        require(admin != address(0), "zero admin");
        require(address(nft) != address(0) && address(nft).code.length > 0, "invalid nft");
        require(paymentAsset_ != address(0) && paymentAsset_.code.length > 0, "invalid asset");
        try IERC20Metadata(paymentAsset_).decimals() returns (uint8 tokenDecimals) {
            require(tokenDecimals <= 36, "invalid asset decimals");
        } catch {
            revert("invalid asset decimals");
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        invoiceNFT = nft;
        paymentAsset = paymentAsset_;
    }
    function issueInvoice(address buyer, address asset, uint128 amount, uint64 dueDate, bytes32 invoiceReference, bytes32 metadataHash) external whenNotPaused returns (uint256 invoiceId) {
        require(buyer != address(0) && asset == paymentAsset, "unsupported asset"); require(amount > 0 && dueDate > block.timestamp, "invalid terms"); require(invoiceReference != bytes32(0), "zero reference"); require(!usedReferences[invoiceReference], "reference used");
        invoiceId = nextInvoiceId++; usedReferences[invoiceReference] = true;
        invoices[invoiceId] = Invoice(msg.sender, buyer, asset, amount, uint64(block.timestamp), dueDate, Status.Issued, metadataHash);
        invoiceNFT.mint(msg.sender, invoiceId); emit InvoiceIssued(invoiceId, msg.sender, buyer, asset, amount, dueDate, invoiceReference, metadataHash);
    }
    function getInvoice(uint256 id) external view returns (Invoice memory) { return invoices[id]; }
    function onInvoiceNFTTransfer(uint256 id, address from, address to) external onlyRole(INVOICE_NFT_ROLE) {
        Invoice storage i = invoices[id];
        require(i.status == Status.Issued && i.seller == from && to != address(0), "invoice not transferable");
        i.seller = to;
        emit InvoiceSellerChanged(id, from, to);
    }
    function markFinanced(uint256 id) external onlyRole(FINANCER_ROLE) { Invoice storage i = invoices[id]; require(i.status == Status.Issued, "not eligible"); i.status = Status.Financed; invoiceNFT.setFinanced(id, true); emit InvoiceStatusChanged(id, Status.Financed); }
    function settle(uint256 id) external onlyRole(SETTLER_ROLE) { Invoice storage i = invoices[id]; require(i.status == Status.Issued || i.status == Status.Financed, "not payable"); i.status = Status.Cleared; invoiceNFT.setFinanced(id, false); emit InvoiceStatusChanged(id, Status.Cleared); }
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
