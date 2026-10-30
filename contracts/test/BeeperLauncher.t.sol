// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {BeeperLauncher} from "../src/launch/BeeperLauncher.sol";
import {CreditRouter} from "../src/launch/CreditRouter.sol";
import {IPonsFactory, IPonsFeeEscrow, IPonsCurve} from "../src/launch/IPons.sol";

interface IERC20 {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

/// Runs against a fork of Robinhood Chain mainnet with the real Pons V2 contracts.
contract BeeperLauncherForkTest is Test {
    IPonsFactory constant PONS = IPonsFactory(0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e);
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    string constant MODEL = "venice/venice-uncensored-1-2";

    address creditSink = makeAddr("creditSink");
    address treasury = makeAddr("treasury");
    CreditRouter impl;
    BeeperLauncher launcher;

    event Harvested(uint256 toCredit, uint256 toTreasury);

    function setUp() public {
        vm.createSelectFork("robinhood");
        impl = new CreditRouter(IPonsFeeEscrow(PONS.feeEscrow()), USDG, creditSink, treasury);
        launcher = new BeeperLauncher(PONS, address(impl));
    }

    function _params(string memory model) internal view returns (BeeperLauncher.LaunchParams memory p) {
        p.name = "Beeper Fork Test";
        p.symbol = "BFT";
        p.creatorTaxBps = 100;
        p.expectedEconomics = PONS.previewLaunchEconomics(0, USDG);
        p.salt = keccak256(abi.encode("beeper-launch-fork", model));
        p.model = model;
    }

    function _launch() internal returns (address token, address curve, CreditRouter router) {
        address creator = makeAddr("creator");
        vm.deal(creator, 1 ether);
        uint256 fee = PONS.launchFee();
        BeeperLauncher.LaunchParams memory p = _params(MODEL); // reads Pons, so before the prank
        vm.prank(creator);
        uint256 g = gasleft();
        launcher.launch{value: fee}(p);
        emit log_named_uint("launch gas", g - gasleft());
        address routerAddr;
        string memory model;
        address who;
        (token, curve, routerAddr, who, model) = launcher.launches(0);
        assertEq(who, creator);
        assertEq(model, MODEL);
        router = CreditRouter(payable(routerAddr));
    }

    function test_launchTradeHarvestSplitsToCreditAndTreasury() public {
        (address token, address curve, CreditRouter router) = _launch();
        assertTrue(token.code.length > 0 && curve.code.length > 0, "pons deployed token and curve");
        assertEq(address(router).code.length, 45, "router is an EIP-1167 clone");
        assertEq(router.token(), token);
        assertEq(router.curve(), curve);
        assertEq(router.creditSink(), creditSink);
        assertEq(launcher.idPlusOne(token), 1);
        assertEq(launcher.launchCount(), 1);

        // Trade on the real curve so Pons accrues creator fees for the router.
        _buy(curve, 1_000e6);

        vm.prank(makeAddr("anyone"));
        router.harvest();
        uint256 total = IERC20(USDG).balanceOf(creditSink) + IERC20(USDG).balanceOf(treasury);
        emit log_named_decimal_uint("creator fees harvested (USDG)", total, 6);
        assertGt(total, 0, "fees harvested");
        assertEq(IERC20(USDG).balanceOf(creditSink), total * 8_000 / 10_000, "80% to holders credit");
        assertEq(IERC20(USDG).balanceOf(treasury), total - total * 8_000 / 10_000, "20% to treasury");
        assertEq(router.pending(), 0);

        // A second harvest with nothing new is a no-op.
        router.harvest();
        assertEq(IERC20(USDG).balanceOf(creditSink) + IERC20(USDG).balanceOf(treasury), total);
    }

    function test_harvestEmitsSplit() public {
        (, address curve, CreditRouter router) = _launch();
        _buy(curve, 500e6);
        vm.recordLogs();
        router.harvest();
        uint256 toCredit = IERC20(USDG).balanceOf(creditSink);
        uint256 toTreasury = IERC20(USDG).balanceOf(treasury);
        bool found;
        bytes32 sig = keccak256("Harvested(uint256,uint256)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(router) && logs[i].topics[0] == sig) {
                (uint256 a, uint256 b) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(a, toCredit);
                assertEq(b, toTreasury);
                found = true;
            }
        }
        assertTrue(found, "Harvested event carries the split");
    }

    /// Gives a trader USDG (balances mapping at slot 1) and buys on the curve, past the launch snipe window.
    function _buy(address curve, uint256 usdg) internal {
        address trader = makeAddr("trader");
        vm.store(USDG, keccak256(abi.encode(trader, uint256(1))), bytes32(usdg));
        vm.roll(block.number + 100);
        skip(1 hours);
        vm.startPrank(trader);
        IERC20(USDG).approve(curve, type(uint256).max);
        IPonsCurve(curve).buy(usdg, 0, trader);
        vm.stopPrank();
    }

    function test_routerIsLockedAfterLaunch() public {
        (address token, address curve, CreditRouter router) = _launch();
        vm.expectRevert("initialized");
        router.initialize();
        vm.expectRevert("coin set");
        router.setCoin(token, curve);
        vm.prank(address(launcher));
        vm.expectRevert("coin set");
        router.setCoin(address(1), address(2));
        vm.expectRevert("initialized");
        impl.initialize();
    }

    function test_rejectsBadLaunches() public {
        uint256 fee = PONS.launchFee();
        vm.deal(address(this), 1 ether);
        BeeperLauncher.LaunchParams memory empty = _params("");
        BeeperLauncher.LaunchParams memory ok = _params(MODEL);
        bytes memory longModel = new bytes(129);
        for (uint256 i; i < 129; i++) longModel[i] = "a";
        BeeperLauncher.LaunchParams memory tooLong = _params(string(longModel));
        vm.expectRevert("model");
        launcher.launch{value: fee}(empty);
        vm.expectRevert("wrong launch fee");
        launcher.launch{value: fee + 1}(ok);
        vm.expectRevert("model");
        launcher.launch{value: fee}(tooLong);
    }

    function test_constructorChecksEscrow() public {
        CreditRouter wrong = new CreditRouter(IPonsFeeEscrow(address(0xdead)), USDG, creditSink, treasury);
        vm.expectRevert("router escrow");
        new BeeperLauncher(PONS, address(wrong));
    }
}
