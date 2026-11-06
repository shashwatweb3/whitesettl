// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Worthless WhiteSETTL testnet-only payment token. It is not USDC, USDT, or a production asset.
contract TestUSD is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant CLAIM_AMOUNT = 10_000 * 10 ** 6;
    uint256 public constant CLAIM_COOLDOWN = 24 hours;
    mapping(bytes32 => bool) public usedMintAllocations;
    mapping(address => uint256) public lastClaimAt;

    error ZeroAddress();
    error ClaimCooldownActive(uint256 availableAt);
    event TestTokensClaimed(address indexed claimant, uint256 amount, uint256 nextClaimAt);

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

    function mintOnce(bytes32 allocationId, address account, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(allocationId != bytes32(0) && !usedMintAllocations[allocationId], "allocation used");
        if (account == address(0)) revert ZeroAddress();
        usedMintAllocations[allocationId] = true;
        _mint(account, amount);
    }

    /// @notice Public testnet faucet. This token has no production value and is not USDC or USDT.
    function claim() external {
        uint256 availableAt = lastClaimAt[msg.sender] + CLAIM_COOLDOWN;
        if (block.timestamp < availableAt) revert ClaimCooldownActive(availableAt);
        lastClaimAt[msg.sender] = block.timestamp;
        _mint(msg.sender, CLAIM_AMOUNT);
        emit TestTokensClaimed(msg.sender, CLAIM_AMOUNT, block.timestamp + CLAIM_COOLDOWN);
    }
}