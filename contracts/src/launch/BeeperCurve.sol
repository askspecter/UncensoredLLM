// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {FixedPointMathLib} from "solmate/src/utils/FixedPointMathLib.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

interface IERC20Lite {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

interface IGuardSource {
    function guard() external view returns (address);
}

/// @notice Beeper's own bonding curve, paired with USDG, with anti sniper protection built in.
///
/// Pricing is constant product over virtual reserves (VIRTUAL_QUOTE USDG, VIRTUAL_TOKENS coins). The curve sells
/// CURVE_SUPPLY coins; once they are all sold it completes, and anyone can call graduate() to move every USDG it
/// raised plus the remaining LP_SUPPLY coins into a full range Uniswap v4 pool at the same price. That position has
/// no withdraw function: the liquidity is locked for good, and its swap fees keep flowing to the coin's holders.
///
/// Protection, for `protectFor` seconds after launch (set by the creator, 0 to switch it off):
///  - each buy may leave the recipient holding at most maxWalletBps of supply;
///  - buys pay an extra sniper fee that starts at sniperStartBps and falls linearly to zero.
/// All fees (the base fee, the sniper fee and, after graduation, the pool's fees in USDG) go to the coin's
/// CreditRouter, which pays 80% to holders as AI credit. Snipers end up paying the holders.
///
/// Deployed once as an implementation; each coin is an EIP-1167 clone initialized by the launcher.
contract BeeperCurve is IUnlockCallback {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant CURVE_SUPPLY = 793_100_000 ether;
    uint256 public constant LP_SUPPLY = TOTAL_SUPPLY - CURVE_SUPPLY;
    uint256 public constant VIRTUAL_QUOTE = 6_000e6;
    uint256 public constant VIRTUAL_TOKENS = 1_073_000_000 ether;
    uint24 public constant POOL_FEE = 10_000;
    int24 public constant TICK_SPACING = 200;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    /// @notice USDG, 6 decimals.
    address public immutable quote;

    address public launcher;
    address public token;
    address public router;
    address public creator;
    uint16 public feeBps;
    uint16 public sniperStartBps;
    uint16 public maxWalletBps;
    uint64 public launchedAt;
    uint64 public protectUntil;

    uint256 public tokensSold;
    /// @notice USDG the curve holds against coins sold (fees excluded).
    uint256 public quoteReserve;
    /// @notice USDG fees waiting to be swept to the router.
    uint256 public feesAccrued;
    bool public complete;
    bool public graduated;
    PoolKey internal poolKey;

    event Trade(address indexed trader, address indexed recipient, bool isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 fee);
    event Completed();
    event Graduated(bytes32 indexed poolId, uint256 quoteAmount, uint256 tokenAmount, uint128 liquidity);
    event FeesSwept(uint256 amount);

    constructor(IPoolManager poolManager_, address quote_) {
        poolManager = poolManager_;
        quote = quote_;
        launcher = address(1); // the implementation itself is never used directly
    }

    struct Config {
        address token;
        address router;
        address creator;
        uint16 feeBps;
        uint32 protectFor;
        uint16 sniperStartBps;
        uint16 maxWalletBps;
    }

    function initialize(Config calldata c) external {
        require(launcher == address(0), "initialized");
        require(c.feeBps >= 50 && c.feeBps <= 500, "fee");
        require(c.protectFor <= 3600 && c.sniperStartBps <= 5000, "protection");
        require(c.maxWalletBps >= 10 && c.maxWalletBps <= 10_000, "max wallet");
        launcher = msg.sender;
        token = c.token;
        router = c.router;
        creator = c.creator;
        feeBps = c.feeBps;
        sniperStartBps = c.sniperStartBps;
        maxWalletBps = c.maxWalletBps;
        launchedAt = uint64(block.timestamp);
        protectUntil = uint64(block.timestamp) + c.protectFor;
    }

    // ---- views ----

    function protectionActive() public view returns (bool) {
        return block.timestamp < protectUntil;
    }

    /// @notice Extra fee on buys right now, in bps. Falls to zero when protection ends.
    function sniperFeeBps() public view returns (uint256) {
        if (!protectionActive()) return 0;
        return uint256(sniperStartBps) * (protectUntil - block.timestamp) / (protectUntil - launchedAt);
    }

    function maxWallet() public view returns (uint256) {
        return protectionActive() ? TOTAL_SUPPLY * maxWalletBps / 10_000 : TOTAL_SUPPLY;
    }

    /// @notice Spot price in USDG (6 decimals) per whole coin.
    function price() external view returns (uint256) {
        return (VIRTUAL_QUOTE + quoteReserve) * 1 ether / (VIRTUAL_TOKENS - tokensSold);
    }

    /// @notice Coins out, USDG actually charged and the fee in it, for a buy of up to `quoteIn`.
    function quoteBuy(uint256 quoteIn, bool exemptSniperFee) public view returns (uint256 tokensOut, uint256 charged, uint256 fee) {
        uint256 bps = feeBps + (exemptSniperFee ? 0 : sniperFeeBps());
        uint256 x = VIRTUAL_QUOTE + quoteReserve;
        uint256 y = VIRTUAL_TOKENS - tokensSold;
        uint256 net = quoteIn - quoteIn * bps / 10_000;
        tokensOut = y * net / (x + net);
        charged = quoteIn;
        uint256 left = CURVE_SUPPLY - tokensSold;
        if (tokensOut >= left) {
            // Last buy: sell exactly what is left and charge only what that costs.
            tokensOut = left;
            net = FullMath.mulDivRoundingUp(x, left, y - left);
            charged = FullMath.mulDivRoundingUp(net, 10_000, 10_000 - bps);
        }
        fee = charged - net;
    }

    /// @notice USDG out after fee, and the fee, for selling `tokensIn`.
    function quoteSell(uint256 tokensIn) public view returns (uint256 quoteOut, uint256 fee) {
        uint256 x = VIRTUAL_QUOTE + quoteReserve;
        uint256 y = VIRTUAL_TOKENS - tokensSold;
        uint256 gross = x * tokensIn / (y + tokensIn);
        if (gross > quoteReserve) gross = quoteReserve;
        fee = gross * feeBps / 10_000;
        quoteOut = gross - fee;
    }

    // ---- trading (same signatures as a Pons curve, so wallets and UIs treat both alike) ----

    function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) external returns (uint256 tokensOut) {
        return _buy(msg.sender, quoteIn, minTokensOut, recipient, false);
    }

    /// @notice The creator's first buy, made by the launcher in the launch transaction: no sniper fee, and no bot
    /// can land before it. It is still bound by the max wallet limit.
    function creatorBuy(uint256 quoteIn, uint256 minTokensOut) external returns (uint256) {
        require(msg.sender == launcher && tokensSold == 0, "launch only");
        return _buy(msg.sender, quoteIn, minTokensOut, creator, true);
    }

    function _buy(address payer, uint256 quoteIn, uint256 minTokensOut, address recipient, bool exempt)
        internal
        returns (uint256 tokensOut)
    {
        require(!complete, "curve complete");
        require(recipient != address(0) && quoteIn > 0, "bad buy");
        uint256 charged;
        uint256 fee;
        (tokensOut, charged, fee) = quoteBuy(quoteIn, exempt);
        require(tokensOut >= minTokensOut && tokensOut > 0, "slippage");
        if (protectionActive()) {
            require(IERC20Lite(token).balanceOf(recipient) + tokensOut <= maxWallet(), "max wallet during protection");
        }

        require(IERC20Lite(quote).transferFrom(payer, address(this), charged), "usdg in");
        tokensSold += tokensOut;
        quoteReserve += charged - fee;
        feesAccrued += fee;
        require(IERC20Lite(token).transfer(recipient, tokensOut), "token out");
        emit Trade(payer, recipient, true, charged, tokensOut, fee);

        if (tokensSold == CURVE_SUPPLY) {
            complete = true;
            emit Completed();
        }
    }

    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256 quoteOut) {
        require(!complete, "curve complete");
        require(recipient != address(0) && tokensIn > 0, "bad sell");
        uint256 fee;
        (quoteOut, fee) = quoteSell(tokensIn);
        require(quoteOut >= minQuoteOut && quoteOut > 0, "slippage");

        require(IERC20Lite(token).transferFrom(msg.sender, address(this), tokensIn), "token in");
        tokensSold -= tokensIn;
        quoteReserve -= quoteOut + fee;
        feesAccrued += fee;
        require(IERC20Lite(quote).transfer(recipient, quoteOut), "usdg out");
        emit Trade(msg.sender, recipient, false, quoteOut, tokensIn, fee);
    }

    // ---- fees ----

    /// @notice Sends accrued USDG fees (and, after graduation, the pool's fees) to the router. Anyone may call;
    /// the router calls it on harvest. The argument mirrors Pons' sweepFees and is unused.
    function sweepFees(uint256) external {
        if (graduated) poolManager.unlock(abi.encode(uint8(2), uint128(0)));
        uint256 amount = feesAccrued;
        if (amount == 0) return;
        feesAccrued = 0;
        require(IERC20Lite(quote).transfer(router, amount), "fee transfer");
        emit FeesSwept(amount);
    }

    // ---- graduation ----

    function poolId() public view returns (bytes32) {
        return keccak256(abi.encode(poolKey));
    }

    function graduate() external {
        require(complete && !graduated, "not ready");
        graduated = true;

        address t = token;
        (Currency c0, Currency c1) = t < quote ? (Currency.wrap(t), Currency.wrap(quote)) : (Currency.wrap(quote), Currency.wrap(t));
        poolKey = PoolKey(c0, c1, POOL_FEE, TICK_SPACING, IHooks(IGuardSource(launcher).guard()));

        uint256 amountQuote = quoteReserve;
        uint256 amountToken = IERC20Lite(t).balanceOf(address(this));
        (uint256 a0, uint256 a1) = t < quote ? (amountToken, amountQuote) : (amountQuote, amountToken);
        // sqrt(a1 / a0) in Q64.96, the price the curve ended at.
        uint160 sqrtPrice = uint160(FixedPointMathLib.sqrt(FullMath.mulDiv(a1, 1 << 192, a0)));
        poolManager.initialize(poolKey, sqrtPrice);

        int24 lo = TickMath.minUsableTick(TICK_SPACING);
        int24 hi = TickMath.maxUsableTick(TICK_SPACING);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPrice, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), a0, a1
        );
        liquidity = liquidity - liquidity / 10_000 - 1; // headroom for rounding up on the way in
        poolManager.unlock(abi.encode(uint8(1), liquidity));

        // Dust the pool did not take: USDG goes to holders with the fees, coins are burned.
        quoteReserve = 0;
        uint256 quoteLeft = IERC20Lite(quote).balanceOf(address(this)) - feesAccrued;
        feesAccrued += quoteLeft;
        uint256 tokenLeft = IERC20Lite(t).balanceOf(address(this));
        if (tokenLeft > 0) require(IERC20Lite(t).transfer(DEAD, tokenLeft), "burn");
        emit Graduated(poolId(), amountQuote - quoteLeft, amountToken - tokenLeft, liquidity);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "pool manager only");
        (uint8 action, uint128 liquidity) = abi.decode(data, (uint8, uint128));
        ModifyLiquidityParams memory p = ModifyLiquidityParams({
            tickLower: TickMath.minUsableTick(TICK_SPACING),
            tickUpper: TickMath.maxUsableTick(TICK_SPACING),
            liquidityDelta: action == 1 ? int256(uint256(liquidity)) : int256(0),
            salt: bytes32(0)
        });
        (BalanceDelta delta,) = poolManager.modifyLiquidity(poolKey, p, "");
        _resolve(poolKey.currency0, delta.amount0());
        _resolve(poolKey.currency1, delta.amount1());
        return "";
    }

    /// @dev Pays what this contract owes the pool, or takes what it is owed (collected fees).
    function _resolve(Currency c, int128 amount) internal {
        address a = Currency.unwrap(c);
        if (amount < 0) {
            poolManager.sync(c);
            require(IERC20Lite(a).transfer(address(poolManager), uint256(uint128(-amount))), "settle");
            poolManager.settle();
        } else if (amount > 0) {
            if (a == quote) {
                poolManager.take(c, address(this), uint256(uint128(amount)));
                feesAccrued += uint256(uint128(amount));
            } else {
                poolManager.take(c, DEAD, uint256(uint128(amount))); // coin side of pool fees is burned
            }
        }
    }
}
