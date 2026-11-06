// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Receipt of an issued invoice. The registry is its sole minter/status controller.
contract InvoiceNFT is ERC721, AccessControl {
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");
    mapping(uint256 => bool) public financed;

    error InvoiceFinanced();
    constructor(address admin) ERC721("WhiteSETTL Invoice", "WSI") { _grantRole(DEFAULT_ADMIN_ROLE, admin); }

    function mint(address seller, uint256 invoiceId) external onlyRole(REGISTRY_ROLE) { _safeMint(seller, invoiceId); }
    function setFinanced(uint256 invoiceId, bool value) external onlyRole(REGISTRY_ROLE) { financed[invoiceId] = value; }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (financed[tokenId] && ownerOf(tokenId) != address(0) && to != address(0)) revert InvoiceFinanced();
        return super._update(to, tokenId, auth);
    }
}
