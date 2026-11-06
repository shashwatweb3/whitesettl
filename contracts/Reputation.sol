// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract Reputation is AccessControl {
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");
    struct Profile { uint64 paidInvoices; uint64 latePayments; uint128 settledVolume; uint128 outstandingFinanced; }
    mapping(address => Profile) public profiles;
    event ReputationUpdated(address indexed business, uint256 volume, bool late, uint256 outstanding);
    event FinancingUpdated(address indexed business, uint256 principal, uint256 outstanding);
    constructor(address admin) { require(admin != address(0), "zero admin"); _grantRole(DEFAULT_ADMIN_ROLE, admin); }
    function reportAdvance(address business, uint128 principal) external onlyRole(REPORTER_ROLE) {
        require(business != address(0) && principal > 0, "invalid advance");
        Profile storage p = profiles[business];
        p.outstandingFinanced += principal;
        emit FinancingUpdated(business, principal, p.outstandingFinanced);
    }
    function reportSettlement(address business, uint128 amount, bool late, uint128 principalRepaid) external onlyRole(REPORTER_ROLE) {
        require(business != address(0), "invalid business");
        Profile storage p = profiles[business];
        p.paidInvoices++;
        p.settledVolume += amount;
        if (late) p.latePayments++;
        if (principalRepaid > 0) {
            require(principalRepaid <= p.outstandingFinanced, "principal exceeds outstanding");
            p.outstandingFinanced -= principalRepaid;
        }
        emit ReputationUpdated(business, amount, late, p.outstandingFinanced);
    }
    function tier(address business) external view returns (uint8) { Profile memory p = profiles[business]; if (p.paidInvoices >= 20 && p.latePayments == 0) return 3; if (p.paidInvoices >= 5) return 2; return 1; }
}
