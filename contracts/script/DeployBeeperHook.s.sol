// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {BeeperHook} from "../src/BeeperHook.sol";

interface IPermit2 {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IPositionManager {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
}

/// Deploys BeeperHook, creates the $BEEP / USDG pool and seeds full-range liquidity, all from your wallet.
/// The starting price is BEEP_AMOUNT : USDG_AMOUNT, so set them to match the market price.
///
/// forge script script/DeployBeeperHook.s.sol --rpc-url robinhood --account <your-keystore> --broadcast
contract DeployBeeperHook is Script {
    using PoolIdLibrary for PoolKey;

    // Robinhood Chain (4663)
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    IPositionManager constant POSM = IPositionManager(0x58daec3116aae6D93017bAAea7749052E8a04fA7);
    IPermit2 constant PERMIT2 = IPermit2(0x000000000022D473030F116dDEE9F6B43aC78BA3);
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address constant BEEP = 0x316353b8Ab5f1375e59C793D5903dAdEcF0f817e;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    int24 constant SPACING = 200;

    function run() external {
        address vault = vm.envAddress("VAULT");
        uint256 beepAmount = vm.envUint("BEEP_AMOUNT"); // 18 decimals
        uint256 usdgAmount = vm.envUint("USDG_AMOUNT"); // 6 decimals
        uint256 baseFee = vm.envOr("BASE_FEE_BPS", uint256(100));
        uint256 launchFee = vm.envOr("LAUNCH_FEE_BPS", uint256(500));
        uint256 window = vm.envOr("LAUNCH_WINDOW", uint256(1 hours));
        uint256 cap = vm.envOr("MAX_SWAP_USDG", uint256(500e6));
        uint24 lpFee = uint24(vm.envOr("LP_FEE", uint256(3000)));

        vm.startBroadcast();
        (, address me,) = vm.readCallers();

        // 1. Hook at an address whose low bits encode its permissions.
        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG);
        bytes memory args = abi.encode(PM, BEEP, USDG, vault, baseFee, launchFee, window, cap, me);
        (address predicted, bytes32 salt) = HookMiner.find(CREATE2_DEPLOYER, flags, type(BeeperHook).creationCode, args);
        BeeperHook hook = new BeeperHook{salt: salt}(PM, BEEP, USDG, vault, baseFee, launchFee, window, cap, me);
        require(address(hook) == predicted, "hook address mismatch");

        // 2. Pool at the price implied by the two amounts (currency0 = BEEP, currency1 = USDG).
        PoolKey memory key = PoolKey(Currency.wrap(BEEP), Currency.wrap(USDG), lpFee, SPACING, IHooks(address(hook)));
        uint160 sqrtPrice = uint160(FixedPointMathLib.sqrt((usdgAmount << 192) / beepAmount));
        PM.initialize(key, sqrtPrice);

        // 3. Full-range position, owned by you, through the Uniswap PositionManager.
        int24 lo = TickMath.minUsableTick(SPACING);
        int24 hi = TickMath.maxUsableTick(SPACING);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPrice, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), beepAmount, usdgAmount
        );
        for (uint256 i; i < 2; i++) {
            address token = i == 0 ? BEEP : USDG;
            IERC20(token).approve(address(PERMIT2), type(uint256).max);
            PERMIT2.approve(token, address(POSM), type(uint160).max, uint48(block.timestamp + 1 days));
        }
        uint256 tokenId = POSM.nextTokenId();
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(key, lo, hi, uint256(liq), uint128(beepAmount + 1), uint128(usdgAmount + 1), me, bytes(""));
        params[1] = abi.encode(key.currency0, key.currency1);
        POSM.modifyLiquidities(abi.encode(abi.encodePacked(uint8(0x02), uint8(0x0d)), params), block.timestamp + 600);
        vm.stopBroadcast();

        console2.log("hook        ", address(hook));
        console2.log("pool id");
        console2.logBytes32(PoolId.unwrap(key.toId()));
        console2.log("position NFT", tokenId);
        console2.log("sqrtPriceX96", sqrtPrice);
    }
}
