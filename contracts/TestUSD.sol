// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice WhiteSETTL testnet-only payment token. This token is not USDC, USDT, or a production asset.
contract TestUSD is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error ZeroAddress();

    constructor(address admin) ERC20("WhiteSETTL Test USD", "TESTUSD") {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address account, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        _mint(account, amount);
    }
}