// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BeeperCurve} from "./BeeperCurve.sol";
import {BeeperToken} from "./BeeperToken.sol";
import {CreditRouter} from "./CreditRouter.sol";
import {GraduationGuard, ICurveRegistry} from "./GraduationGuard.sol";

interface IERC20Approve {
    function transferFrom(address, address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

/// @notice Launches Beeper coins on Beeper's own bonding curve (see BeeperCurve), paired with USDG and an AI
/// model. Each coin gets a curve clone, a CreditRouter clone that pays its fees to holders as AI credit, and a
/// fixed supply token. The creator can make the first buy in the same transaction, so no bot lands before them.
contract BeeperCurveLauncher {
    address public immutable curveImplementation;
    address public immutable routerImplementation;
    address public immutable quote;
    /// @notice The GraduationGuard hook, deployed once by deployGuard.
    address public guard;

    struct Launch {
        address token;
        address curve;
        address router;
        address creator;
        string model;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string logo;
        string description;
        string twitter;
        string telegram;
        string website;
        string model;
        uint16 feeBps; // 50 to 500
        uint32 protectFor; // seconds of anti sniper protection, 0 to 3600
        uint16 sniperStartBps; // extra buy fee at launch, falling to 0, up to 5000
        uint16 maxWalletBps; // max holding per wallet while protected
        uint256 creatorBuy; // USDG the creator spends in the launch tx, 0 for none
        uint256 minCreatorTokens;
    }

    Launch[] public launches;
    mapping(address token => uint256) public idPlusOne;
    mapping(address => bool) public isCurve;

    event Launched(
        uint256 indexed id, address indexed creator, address indexed token, address curve, address router, string model
    );
    event Protection(address indexed token, uint32 protectFor, uint16 sniperStartBps, uint16 maxWalletBps, uint256 creatorTokens);

    constructor(address curveImplementation_, address routerImplementation_) {
        curveImplementation = curveImplementation_;
        routerImplementation = routerImplementation_;
        quote = CreditRouter(routerImplementation_).quote();
        require(BeeperCurve(curveImplementation_).quote() == quote, "quote mismatch");
    }

    /// @notice Deploys the GraduationGuard from this contract with CREATE2. The salt is mined off chain so the guard
    /// lands on an address whose hook flags are exactly beforeInitialize. Anyone may call it, once: the guard's
    /// code and registry are fixed, so the caller only chooses where it lands.
    function deployGuard(bytes32 salt) external returns (address g) {
        require(guard == address(0), "guard set");
        g = address(new GraduationGuard{salt: salt}(ICurveRegistry(address(this))));
        require(uint160(g) & ((1 << 14) - 1) == 1 << 13, "guard flags");
        guard = g;
    }

    function launch(LaunchParams calldata p) external returns (uint256 id) {
        require(guard != address(0), "not ready");
        uint256 len = bytes(p.model).length;
        require(len > 0 && len <= 128, "model");
        require(bytes(p.name).length > 0 && bytes(p.name).length <= 64 && bytes(p.symbol).length > 0 && bytes(p.symbol).length <= 16, "name");

        BeeperCurve curve = BeeperCurve(_clone(curveImplementation));
        CreditRouter router = CreditRouter(payable(_clone(routerImplementation)));
        router.initialize();
        BeeperToken token = new BeeperToken(p.name, p.symbol, address(curve));
        curve.initialize(BeeperCurve.Config({
            token: address(token),
            router: address(router),
            creator: msg.sender,
            feeBps: p.feeBps,
            protectFor: p.protectFor,
            sniperStartBps: p.sniperStartBps,
            maxWalletBps: p.maxWalletBps
        }));
        router.setCoin(address(token), address(curve));
        isCurve[address(curve)] = true;

        uint256 creatorTokens;
        if (p.creatorBuy > 0) {
            require(IERC20Approve(quote).transferFrom(msg.sender, address(this), p.creatorBuy), "usdg in");
            require(IERC20Approve(quote).approve(address(curve), p.creatorBuy), "approve");
            creatorTokens = curve.creatorBuy(p.creatorBuy, p.minCreatorTokens);
        }

        id = launches.length;
        launches.push(Launch(address(token), address(curve), address(router), msg.sender, p.model));
        idPlusOne[address(token)] = id + 1;
        emit Launched(id, msg.sender, address(token), address(curve), address(router), p.model);
        emit Protection(address(token), p.protectFor, p.sniperStartBps, p.maxWalletBps, creatorTokens);
    }

    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    /// @dev EIP-1167 minimal proxy, same bytecode as OpenZeppelin's Clones.clone.
    function _clone(address implementation) private returns (address instance) {
        assembly ("memory-safe") {
            mstore(0x00, or(shr(0xe8, shl(0x60, implementation)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            mstore(0x20, or(shl(0x78, implementation), 0x5af43d82803e903d91602b57fd5bf3))
            instance := create(0, 0x09, 0x37)
        }
        require(instance != address(0), "clone failed");
    }
}
