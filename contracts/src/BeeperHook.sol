// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title BeeperHook
/// @notice Uniswap v4 hook for a single $BEEP / USDG pool.
///  - Every swap pays a hook fee on its unspecified side (the output of an exact-in swap, the input of an exact-out swap).
///  - Fees taken in USDG go to the bCREDIT vault and are shared with $BEEP holders as AI credit.
///  - Fees taken in $BEEP are burned (sent to 0x...dEaD).
///  - For the first `launchWindow` seconds the fee decays linearly from `launchFeeBps` to `baseFeeBps`,
///    and any swap moving more than `maxSwapUsdg` USDG is refused.
/// Everything is immutable: no owner, no admin, no upgrade path.
contract BeeperHook is IHooks {
    using SafeCast for uint256;
    using PoolIdLibrary for PoolKey;

    error NotPoolManager();
    error HookNotImplemented();
    error WrongPool();
    error NotInitializer();
    error AlreadyInitialized();
    error SwapTooLarge(uint256 usdgAmount, uint256 cap);

    event HookFee(PoolId indexed poolId, address indexed currency, uint256 amount, uint256 feeBps, bool burned);

    uint256 public constant BPS = 10_000;
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    IPoolManager public immutable poolManager;
    Currency public immutable beep;
    Currency public immutable usdg;
    address public immutable vault;
    uint256 public immutable baseFeeBps;
    uint256 public immutable launchFeeBps;
    uint256 public immutable launchWindow;
    uint256 public immutable maxSwapUsdg;
    /// @notice Only this address may create the pool, so nobody can front-run it with a different price or fee tier.
    address public immutable initializer;

    /// @notice The one pool this hook serves, and when it opened.
    PoolId public poolId;
    uint256 public launchedAt;

    constructor(
        IPoolManager _poolManager,
        address _beep,
        address _usdg,
        address _vault,
        uint256 _baseFeeBps,
        uint256 _launchFeeBps,
        uint256 _launchWindow,
        uint256 _maxSwapUsdg,
        address _initializer
    ) {
        require(_vault != address(0), "vault");
        require(_baseFeeBps <= 500 && _launchFeeBps >= _baseFeeBps && _launchFeeBps <= 2_500, "fees");
        poolManager = _poolManager;
        beep = Currency.wrap(_beep);
        usdg = Currency.wrap(_usdg);
        vault = _vault;
        baseFeeBps = _baseFeeBps;
        launchFeeBps = _launchFeeBps;
        launchWindow = _launchWindow;
        maxSwapUsdg = _maxSwapUsdg;
        initializer = _initializer;
        Hooks.validateHookPermissions(this, getHookPermissions());
    }

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory p) {
        p.beforeInitialize = true;
        p.afterSwap = true;
        p.afterSwapReturnDelta = true;
    }

    /// @notice Current hook fee in basis points.
    function feeBps() public view returns (uint256) {
        if (launchedAt == 0) return launchFeeBps;
        uint256 elapsed = block.timestamp - launchedAt;
        if (elapsed >= launchWindow) return baseFeeBps;
        return launchFeeBps - ((launchFeeBps - baseFeeBps) * elapsed) / launchWindow;
    }

    /// @notice True while the launch cap applies.
    function capActive() public view returns (bool) {
        return launchedAt == 0 || block.timestamp - launchedAt < launchWindow;
    }

    function beforeInitialize(address sender, PoolKey calldata key, uint160) external onlyPoolManager returns (bytes4) {
        if (sender != initializer) revert NotInitializer();
        if (launchedAt != 0) revert AlreadyInitialized();
        bool pair = (key.currency0 == beep && key.currency1 == usdg) || (key.currency0 == usdg && key.currency1 == beep);
        if (!pair || address(key.hooks) != address(this)) revert WrongPool();
        poolId = key.toId();
        launchedAt = block.timestamp;
        return IHooks.beforeInitialize.selector;
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        if (PoolId.unwrap(key.toId()) != PoolId.unwrap(poolId)) revert WrongPool();

        int128 usdgDelta = key.currency0 == usdg ? delta.amount0() : delta.amount1();
        if (capActive()) {
            // forge-lint: disable-next-line(unsafe-typecast) non-negative after the sign flip
            uint256 usdgMoved = uint256(uint128(usdgDelta < 0 ? -usdgDelta : usdgDelta));
            if (usdgMoved > maxSwapUsdg) revert SwapTooLarge(usdgMoved, maxSwapUsdg);
        }

        // The fee is charged on the unspecified side of the swap.
        bool specifiedTokenIs0 = (params.amountSpecified < 0 == params.zeroForOne);
        (Currency feeCurrency, int128 amount) = specifiedTokenIs0 ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());
        if (amount < 0) amount = -amount;

        uint256 bps = feeBps();
        // forge-lint: disable-next-line(unsafe-typecast) non-negative after the sign flip
        uint256 fee = (uint256(uint128(amount)) * bps) / BPS;
        if (fee == 0) return (IHooks.afterSwap.selector, 0);

        bool burned = feeCurrency == beep;
        poolManager.take(feeCurrency, burned ? BURN : vault, fee);
        emit HookFee(poolId, Currency.unwrap(feeCurrency), fee, bps, burned);
        return (IHooks.afterSwap.selector, fee.toInt128());
    }

    // Unused callbacks. Their permission bits are off, so the PoolManager never calls them.
    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        external
        pure
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
