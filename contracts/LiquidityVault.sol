// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract LiquidityVault is ERC4626, AccessControl, Pausable {
    using SafeERC20 for ERC20;
    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");
    constructor(ERC20 asset_, address admin) ERC20("WhiteSETTL Liquidity Share", "wsLQ") ERC4626(asset_) { _grantRole(DEFAULT_ADMIN_ROLE, admin); }
    /// @dev ERC-4626's default limit uses total assets, which includes outstanding advances.
    /// Cap redemptions to idle funds so withdrawals cannot promise lent-out liquidity.
    function maxWithdraw(address owner) public view override returns (uint256) { return _convertToAssets(balanceOf(owner), Math.Rounding.Floor) < ERC20(asset()).balanceOf(address(this)) ? _convertToAssets(balanceOf(owner), Math.Rounding.Floor) : ERC20(asset()).balanceOf(address(this)); }
    function maxRedeem(address owner) public view override returns (uint256) { uint256 cashShares = _convertToShares(ERC20(asset()).balanceOf(address(this)), Math.Rounding.Floor); return balanceOf(owner) < cashShares ? balanceOf(owner) : cashShares; }
    function lend(address recipient, uint256 assets) external onlyRole(ENGINE_ROLE) whenNotPaused { require(assets <= totalAssets(), "insufficient liquidity"); ERC20(asset()).safeTransfer(recipient, assets); }
    function receiveRepayment(uint256 assets) external onlyRole(ENGINE_ROLE) { ERC20(asset()).safeTransferFrom(msg.sender, address(this), assets); }
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }
}
