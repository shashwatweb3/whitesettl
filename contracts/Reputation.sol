// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Reputation is AccessControl {
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");
    struct Profile { uint64 paidInvoices; uint64 latePayments; uint128 settledVolume; uint128 outstandingFinanced; }
    mapping(address => Profile) public profiles;
    event ReputationUpdated(address indexed business, uint256 volume, bool late, uint256 outstanding);
    constructor(address admin) { _grantRole(DEFAULT_ADMIN_ROLE, admin); }
    function reportSettlement(address business, uint128 amount, bool late, uint128 outstanding) external onlyRole(REPORTER_ROLE) { Profile storage p = profiles[business]; p.paidInvoices++; p.settledVolume += amount; if (late) p.latePayments++; p.outstandingFinanced = outstanding; emit ReputationUpdated(business, amount, late, outstanding); }
    function tier(address business) external view returns (uint8) { Profile memory p = profiles[business]; if (p.paidInvoices >= 20 && p.latePayments == 0) return 3; if (p.paidInvoices >= 5) return 2; return 1; }
}
