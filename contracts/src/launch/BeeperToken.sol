// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "solmate/src/tokens/ERC20.sol";

/// @notice A Beeper launchpad coin: fixed supply of 1 billion, all minted to its bonding curve. No owner, no mint.
contract BeeperToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

    constructor(string memory name_, string memory symbol_, address curve) ERC20(name_, symbol_, 18) {
        _mint(curve, TOTAL_SUPPLY);
    }
}
