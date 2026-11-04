// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BeeperCurve} from "../src/launch/BeeperCurve.sol";
import {BeeperCurveLauncher} from "../src/launch/BeeperCurveLauncher.sol";
import {GraduationGuard, ICurveRegistry} from "../src/launch/GraduationGuard.sol";
import {CreditRouter} from "../src/launch/CreditRouter.sol";
import {IPonsFeeEscrow} from "../src/launch/IPons.sol";

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// Swaps USDG for a coin on its graduated pool, to prove the pool trades.
contract Swapper is IUnlockCallback {
    IPoolManager immutable pm;
    constructor(IPoolManager pm_) { pm = pm_; }

    function buy(PoolKey memory key, address usdg, uint256 amountIn) external returns (uint256 out) {
        return abi.decode(pm.unlock(abi.encode(key, usdg, amountIn, msg.sender)), (uint256));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory key, address usdg, uint256 amountIn, address to) = abi.decode(data, (PoolKey, address, uint256, address));
        bool zeroForOne = Currency.unwrap(key.currency0) == usdg;
        BalanceDelta d = pm.swap(key, SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        }), "");
        Currency inC = zeroForOne ? key.currency0 : key.currency1;
        Currency outC = zeroForOne ? key.currency1 : key.currency0;
        int128 outAmt = zeroForOne ? d.amount1() : d.amount0();
        pm.sync(inC);
        IERC20(usdg).transfer(address(pm), amountIn);
        pm.settle();
        pm.take(outC, to, uint256(uint128(outAmt)));
        return abi.encode(uint256(uint128(outAmt)));
    }
}

/// Runs against a fork of Robinhood Chain mainnet: the real USDG and Uniswap v4 PoolManager.
contract BeeperCurveForkTest is Test {
    using StateLibrary for IPoolManager;

    IPoolManager constant PM = IPoolManager(0x8366a39CC670B4001A1121B8F6A443A643e40951);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant PONS_ESCROW = 0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e;
    string constant MODEL = "venice/venice-uncensored-1-2";

    address creditSink = makeAddr("creditSink");
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    BeeperCurveLauncher launcher;
    address guard;

    function setUp() public {
        vm.createSelectFork("robinhood");
        CreditRouter routerImpl = new CreditRouter(IPonsFeeEscrow(PONS_ESCROW), USDG, creditSink, treasury);
        BeeperCurve curveImpl = new BeeperCurve(PM, USDG);
        launcher = new BeeperCurveLauncher(address(curveImpl), address(routerImpl));
        // Mine a salt so the guard lands on an address whose hook flags are exactly beforeInitialize.
        bytes32 initHash = keccak256(abi.encodePacked(type(GraduationGuard).creationCode, abi.encode(address(launcher))));
        bytes32 salt;
        for (uint256 i;; i++) {
            salt = bytes32(i);
            address a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(launcher), salt, initHash)))));
            if (uint160(a) & 0x3fff == 1 << 13) break;
        }
        guard = launcher.deployGuard(salt);
        vm.expectRevert(bytes("guard set"));
        launcher.deployGuard(salt);
    }

    function _usdg(address who, uint256 amount) internal {
        vm.store(USDG, keccak256(abi.encode(who, uint256(1))), bytes32(amount));
    }

    function _params(uint32 protectFor, uint256 creatorBuy) internal pure returns (BeeperCurveLauncher.LaunchParams memory p) {
        p.name = "Beeper Curve Test";
        p.symbol = "BCT";
        p.model = MODEL;
        p.feeBps = 100;
        p.protectFor = protectFor;
        p.sniperStartBps = 3000;
        p.maxWalletBps = 100; // 1% of supply while protected
        p.creatorBuy = creatorBuy;
    }

    function _launch(uint32 protectFor, uint256 creatorBuy) internal returns (BeeperCurve curve, address token, CreditRouter router) {
        _usdg(creator, creatorBuy);
        vm.startPrank(creator);
        IERC20(USDG).approve(address(launcher), creatorBuy);
        uint256 g = gasleft();
        launcher.launch(_params(protectFor, creatorBuy));
        emit log_named_uint("launch gas", g - gasleft());
        vm.stopPrank();
        (address t, address c, address r,,) = launcher.launches(0);
        return (BeeperCurve(c), t, CreditRouter(payable(r)));
    }

    function _buy(BeeperCurve curve, address who, uint256 amount) internal returns (uint256) {
        _usdg(who, amount);
        vm.startPrank(who);
        IERC20(USDG).approve(address(curve), amount);
        uint256 out = curve.buy(amount, 0, who);
        vm.stopPrank();
        return out;
    }

    function test_creatorBuysFirstInTheLaunchTxWithoutSniperFee() public {
        (BeeperCurve curve, address token,) = _launch(300, 50e6);
        uint256 got = IERC20(token).balanceOf(creator);
        assertGt(got, 0, "creator holds coins after launch");
        // Charged only the base 1% fee, no sniper fee.
        assertEq(curve.feesAccrued(), 50e6 / 100);
        assertEq(curve.tokensSold(), got);
    }

    function test_sniperPaysDecayingFeeAndIsCappedByMaxWallet() public {
        (BeeperCurve curve, address token,) = _launch(300, 0);
        address sniper = makeAddr("sniper");

        // Right at launch the sniper fee is the full 30% on top of the 1% base fee.
        assertEq(curve.sniperFeeBps(), 3000);
        uint256 before = curve.feesAccrued();
        _buy(curve, sniper, 20e6);
        assertEq(curve.feesAccrued() - before, 20e6 * 3100 / 10_000);

        // A buy that would put the wallet above 1% of supply reverts while protected.
        _usdg(sniper, 5_000e6);
        vm.startPrank(sniper);
        IERC20(USDG).approve(address(curve), 5_000e6);
        vm.expectRevert(bytes("max wallet during protection"));
        curve.buy(5_000e6, 0, sniper);
        vm.stopPrank();

        // Halfway through, the sniper fee has halved.
        vm.warp(block.timestamp + 150);
        assertEq(curve.sniperFeeBps(), 1500);

        // After protection: base fee only, no wallet cap.
        vm.warp(block.timestamp + 151);
        assertFalse(curve.protectionActive());
        before = curve.feesAccrued();
        uint256 big = _buy(curve, sniper, 5_000e6);
        assertEq(curve.feesAccrued() - before, 5_000e6 / 100);
        assertGt(IERC20(token).balanceOf(sniper), 10_000_000 ether, "above the old 1% cap");
        assertGt(big, 0);
    }

    function test_sellReturnsUsdgAndHarvestPaysHoldersAndTreasury() public {
        (BeeperCurve curve, address token, CreditRouter router) = _launch(0, 0);
        address trader = makeAddr("trader");
        uint256 got = _buy(curve, trader, 1_000e6);
        vm.startPrank(trader);
        IERC20(token).approve(address(curve), got);
        uint256 back = curve.sell(got, 0, trader);
        vm.stopPrank();
        assertApproxEqRel(back, 980e6, 0.001e18, "round trip loses about two 1% fees");

        uint256 fees = curve.feesAccrued();
        router.harvest();
        assertEq(IERC20(USDG).balanceOf(creditSink), fees * 8000 / 10_000);
        assertEq(IERC20(USDG).balanceOf(treasury), fees - fees * 8000 / 10_000);
        assertEq(curve.feesAccrued(), 0);
    }

    function test_nobodyCanCreateTheGraduationPoolFirst() public {
        (BeeperCurve curve, address token,) = _launch(0, 0);
        (address a, address b) = token < USDG ? (token, USDG) : (USDG, token);
        PoolKey memory key = PoolKey(Currency.wrap(a), Currency.wrap(b), curve.POOL_FEE(), curve.TICK_SPACING(), IHooks(guard));
        vm.expectRevert();
        PM.initialize(key, TickMath.getSqrtPriceAtTick(0));
    }

    function test_fillsTheCurveGraduatesToALockedV4PoolThatTradesAndEarns() public {
        (BeeperCurve curve, address token, CreditRouter router) = _launch(0, 0);
        address whale = makeAddr("whale");
        uint256 got = _buy(curve, whale, 30_000e6); // more than enough: the last buy is trimmed
        assertTrue(curve.complete(), "complete");
        assertEq(got, curve.CURVE_SUPPLY());
        assertLt(IERC20(USDG).balanceOf(whale), 30_000e6, "unused USDG stays with the buyer");
        emit log_named_uint("USDG raised", curve.quoteReserve());

        vm.expectRevert(bytes("curve complete"));
        curve.buy(1e6, 0, whale);

        uint256 fees = curve.feesAccrued();
        uint256 g = gasleft();
        curve.graduate();
        emit log_named_uint("graduate gas", g - gasleft());
        assertTrue(curve.graduated());

        PoolId id = PoolId.wrap(curve.poolId());
        uint128 liq = PM.getLiquidity(id);
        assertGt(liq, 0, "pool has liquidity");
        (uint160 sqrtP,,,) = PM.getSlot0(id);
        assertGt(sqrtP, 0);
        assertLt(IERC20(token).balanceOf(address(curve)), 1 ether, "no coins left on the curve");

        // The pool prices the coin where the curve ended.
        uint256 curvePrice = (curve.VIRTUAL_QUOTE() + 17_000e6) * 1 ether / (curve.VIRTUAL_TOKENS() - curve.CURVE_SUPPLY());
        emit log_named_uint("approx end price, micro USDG per coin", curvePrice);

        // Someone buys on the pool; the swap fee later flows to the router as USDG.
        Swapper s = new Swapper(PM);
        address buyer = makeAddr("buyer");
        _usdg(address(s), 1_000e6);
        (Currency c0, Currency c1, uint24 fee, int24 ts, IHooks h) = (
            Currency.wrap(token < USDG ? token : USDG), Currency.wrap(token < USDG ? USDG : token), curve.POOL_FEE(), curve.TICK_SPACING(), IHooks(guard)
        );
        vm.prank(buyer);
        uint256 coins = s.buy(PoolKey(c0, c1, fee, ts, h), USDG, 1_000e6);
        assertGt(coins, 0, "pool sells coins");
        emit log_named_uint("coins for 1,000 USDG on the pool", coins / 1 ether);

        router.harvest();
        uint256 paid = IERC20(USDG).balanceOf(creditSink) + IERC20(USDG).balanceOf(treasury);
        assertGe(paid, fees + 9e6, "curve fees plus about 1% of the pool swap reach the router split");
    }
}
