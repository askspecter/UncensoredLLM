// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

interface ICurveRegistry {
    function isCurve(address) external view returns (bool);
}

/// @notice Uniswap v4 hook used only by graduated Beeper coins. Its one permission is beforeInitialize, and it lets
/// only a Beeper curve create a pool. Without it, anyone could initialize the coin's pool first at a bad price and
/// take value from the liquidity the curve adds at graduation.
/// Must be deployed at an address whose low 14 bits equal BEFORE_INITIALIZE_FLAG (1 << 13), mined with CREATE2.
contract GraduationGuard {
    ICurveRegistry public immutable launcher;

    constructor(ICurveRegistry launcher_) {
        launcher = launcher_;
    }

    function beforeInitialize(address sender, PoolKey calldata, uint160) external view returns (bytes4) {
        require(launcher.isCurve(sender), "only a Beeper curve");
        return IHooks.beforeInitialize.selector;
    }
}
