// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPonsFeeEscrow, IPonsCurve} from "./IPons.sol";

interface IERC20Min {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
}

/// @notice A Beeper launchpad coin's creator-fee recipient on Pons. Coins are paired with USDG, so fees arrive in
/// USDG. Anyone can call `harvest`, which sweeps the coin's curve fees into the Pons escrow, claims them, and sends
/// CREDIT_BPS to Beeper's credit wallet (paid out to the coin's holders as AI credit, 1 USDG = $1, pro rata to their
/// balance at the harvest block) and the rest to the treasury.
/// It has no function to change the Pons fee recipient or either destination, so the pairing is permanent.
/// Deployed once as an implementation; each coin gets a minimal-proxy clone sharing these immutables.
contract CreditRouter {
    uint256 public constant CREDIT_BPS = 8_000;

    IPonsFeeEscrow public immutable escrow;
    /// @notice The coin's pair token (USDG) and the currency fees are paid in.
    address public immutable quote;
    /// @notice Receives the holders' share; Beeper credits it to holders off chain from the Harvested event.
    address public immutable creditSink;
    address public immutable treasury;

    address public launcher;
    address public token;
    address public curve;

    event Harvested(uint256 toCredit, uint256 toTreasury);

    constructor(IPonsFeeEscrow escrow_, address quote_, address creditSink_, address treasury_) {
        require(quote_ != address(0) && creditSink_ != address(0) && treasury_ != address(0), "zero address");
        escrow = escrow_;
        quote = quote_;
        creditSink = creditSink_;
        treasury = treasury_;
        launcher = address(1); // the implementation itself is never used directly
    }

    /// @dev Called by the launcher in the same transaction that creates the clone.
    function initialize() external {
        require(launcher == address(0), "initialized");
        launcher = msg.sender;
    }

    /// @dev The coin and its curve only exist after Pons launches it, so the launcher sets them once.
    function setCoin(address token_, address curve_) external {
        require(msg.sender == launcher && curve == address(0), "coin set");
        token = token_;
        curve = curve_;
    }

    /// @notice Fees claimable or already here; curve fees not yet swept are not counted.
    function pending() external view returns (uint256) {
        return escrow.balanceOfToken(address(this), quote) + IERC20Min(quote).balanceOf(address(this));
    }

    function harvest() external {
        // Before graduation fees sit on the curve until swept. After graduation the curve rejects this and
        // Pons' sweep operator credits pool fees to the escrow, so a failed sweep is ignored.
        if (curve != address(0)) {
            (bool swept,) = curve.call(abi.encodeCall(IPonsCurve.sweepFees, (0)));
            swept;
        }
        if (escrow.balanceOfToken(address(this), quote) > 0) escrow.claimToken(quote);

        uint256 amount = IERC20Min(quote).balanceOf(address(this));
        if (amount == 0) return;
        uint256 toCredit = amount * CREDIT_BPS / 10_000;
        uint256 toTreasury = amount - toCredit;

        require(IERC20Min(quote).transfer(creditSink, toCredit), "credit transfer failed");
        require(IERC20Min(quote).transfer(treasury, toTreasury), "treasury transfer failed");
        emit Harvested(toCredit, toTreasury);
    }
}
