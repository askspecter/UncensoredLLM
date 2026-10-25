// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";
import {BeeperHook} from "../src/BeeperHook.sol";

/// Runs against a fork of Robinhood Chain mainnet: the real PoolManager, $BEEP and USDG.
contract BeeperHookForkTest is Test {
    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant BEEP = 0x316353b8Ab5f1375e59C793D5903dAdEcF0f817e;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant VAULT = address(0xB0C4ED17);

    uint24 constant LP_FEE = 3000; // 0.30% to liquidity providers
    int24 constant SPACING = 200;
    uint160 constant START_PRICE = 433950517987477946368; // $0.00003 per BEEP
    uint256 constant WINDOW = 1 hours;
    uint256 constant CAP = 500e6; // 500 USDG per swap during launch

    BeeperHook hook;
    PoolKey key;
    PoolSwapTest swapper;
    PoolModifyLiquidityTest lp;
    address trader = address(0x7EAD);

    function setUp() public {
        vm.createSelectFork("robinhood");
        swapper = new PoolSwapTest(PM);
        lp = new PoolModifyLiquidityTest(PM);

        uint160 flags = uint160(Hooks.BEFORE_INITIALIZE_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG);
        bytes memory args = abi.encode(PM, BEEP, USDG, VAULT, uint256(100), uint256(500), WINDOW, CAP, address(lp));
        (address predicted, bytes32 salt) = HookMiner.find(address(this), flags, type(BeeperHook).creationCode, args);
        hook = new BeeperHook{salt: salt}(PM, BEEP, USDG, VAULT, 100, 500, WINDOW, CAP, address(lp));
        assertEq(address(hook), predicted);

        key = PoolKey(Currency.wrap(BEEP), Currency.wrap(USDG), LP_FEE, SPACING, IHooks(address(hook)));
        vm.prank(address(lp));
        PM.initialize(key, START_PRICE);

        // Seed full-range liquidity: 100M BEEP and the USDG to match (~$3,000).
        deal(BEEP, address(this), 100_000_000e18);
        deal(USDG, address(this), 10_000e6);
        IERC20(BEEP).approve(address(lp), type(uint256).max);
        IERC20(USDG).approve(address(lp), type(uint256).max);
        int24 lo = TickMath.minUsableTick(SPACING);
        int24 hi = TickMath.maxUsableTick(SPACING);
        uint128 liq = LiquidityAmounts.getLiquidityForAmounts(
            START_PRICE, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), 100_000_000e18, 3_000e6
        );
        lp.modifyLiquidity(key, ModifyLiquidityParams(lo, hi, int256(uint256(liq)), 0), "");

        deal(BEEP, trader, 50_000_000e18);
        deal(USDG, trader, 100_000e6);
        vm.startPrank(trader);
        IERC20(BEEP).approve(address(swapper), type(uint256).max);
        IERC20(USDG).approve(address(swapper), type(uint256).max);
        vm.stopPrank();
    }

    function swap(bool buy, bool exactIn, uint256 amount) internal returns (BalanceDelta d) {
        // currency0 = BEEP, currency1 = USDG. Buying BEEP is oneForZero.
        bool zeroForOne = !buy;
        vm.prank(trader);
        d = swapper.swap(
            key,
            SwapParams(zeroForOne, exactIn ? -int256(amount) : int256(amount), zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(false, false),
            ""
        );
    }

    function test_buyExactIn_burnsBeepFee() public {
        uint256 dead0 = IERC20(BEEP).balanceOf(DEAD);
        BalanceDelta d = swap(true, true, 100e6);
        uint256 burned = IERC20(BEEP).balanceOf(DEAD) - dead0;
        uint256 got = uint256(int256(d.amount0()));
        assertGt(burned, 0);
        // trader receives output minus the 5% launch fee, which is exactly what got burned
        assertApproxEqAbs(burned * 10_000, (got + burned) * 500, (got + burned));
        assertEq(IERC20(USDG).balanceOf(VAULT), 0);
    }

    function test_sellExactIn_feeToVault() public {
        BalanceDelta d = swap(false, true, 1_000_000e18);
        uint256 vault = IERC20(USDG).balanceOf(VAULT);
        uint256 got = uint256(int256(d.amount1()));
        assertGt(vault, 0);
        assertApproxEqAbs(vault * 10_000, (got + vault) * 500, 10_000);
    }

    function test_exactOut_chargesInputSide() public {
        // exact-out buy: unspecified side is the USDG input, so the fee goes to the vault
        BalanceDelta d = swap(true, false, 1_000_000e18);
        assertEq(uint256(int256(d.amount0())), 1_000_000e18);
        assertGt(IERC20(USDG).balanceOf(VAULT), 0);
    }

    function test_launchCap_refusesWhale_thenOpens() public {
        vm.expectRevert();
        swap(true, true, 600e6);
        assertTrue(hook.capActive());
        vm.warp(block.timestamp + WINDOW);
        assertFalse(hook.capActive());
        assertEq(hook.feeBps(), 100);
        swap(true, true, 600e6);
    }

    function test_feeDecays() public {
        assertEq(hook.feeBps(), 500);
        vm.warp(block.timestamp + WINDOW / 2);
        assertEq(hook.feeBps(), 300);
        vm.warp(block.timestamp + WINDOW);
        assertEq(hook.feeBps(), 100);
    }

    function test_onlyInitializerCanCreatePool() public {
        PoolKey memory other = PoolKey(Currency.wrap(BEEP), Currency.wrap(USDG), 500, 10, IHooks(address(hook)));
        vm.expectRevert();
        PM.initialize(other, START_PRICE);
    }

    /// Ten swaps over the launch window, logged for the website simulator to replay.
    function test_replayLog() public {
        uint256 t0 = block.timestamp;
        bool[10] memory buys = [true, false, true, false, true, true, false, false, true, false];
        uint256[10] memory amts = [uint256(50e6), 400_000e18, 120e6, 2_000_000e18, 499e6, 800e6, 900_000e18, 3_000_000e18, 1_500e6, 10_000_000e18];
        uint256[10] memory at = [uint256(30), 300, 600, 900, 1500, 1800, 2400, 3000, 3600, 5400];
        for (uint256 i; i < 10; i++) {
            vm.warp(t0 + at[i]);
            uint256 bps = hook.feeBps();
            uint256 dead0 = IERC20(BEEP).balanceOf(DEAD);
            uint256 vault0 = IERC20(USDG).balanceOf(VAULT);
            try this.doSwap(buys[i], amts[i]) returns (int128 d0, int128 d1) {
                console2.log(string.concat("SWAP|", vm.toString(i), "|", vm.toString(at[i]), "|", buys[i] ? "buy" : "sell", "|", vm.toString(amts[i]), "|", vm.toString(bps)));
                console2.log(string.concat("RES|", vm.toString(int256(d0)), "|", vm.toString(int256(d1)), "|", vm.toString(IERC20(BEEP).balanceOf(DEAD) - dead0), "|", vm.toString(IERC20(USDG).balanceOf(VAULT) - vault0)));
            } catch {
                console2.log(string.concat("SWAP|", vm.toString(i), "|", vm.toString(at[i]), "|", buys[i] ? "buy" : "sell", "|", vm.toString(amts[i]), "|", vm.toString(bps)));
                console2.log("RES|refused");
            }
        }
    }

    function doSwap(bool buy, uint256 amt) external returns (int128, int128) {
        BalanceDelta d = swap(buy, true, amt);
        return (d.amount0(), d.amount1());
    }
}
