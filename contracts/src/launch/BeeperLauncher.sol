// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPonsFactory} from "./IPons.sol";
import {CreditRouter} from "./CreditRouter.sol";

/// @notice Launches a Pons V2 coin paired with LLM credits. Every coin trades against USDG on its curve; the creator
/// picks an AI model from Beeper's catalogue, and the coin's creator fees (in USDG) go to a CreditRouter that pays
/// its holders in Beeper credit. Model and router are fixed at launch. Routers are minimal-proxy clones (EIP-1167), which keeps each launch small.
contract BeeperLauncher {
    IPonsFactory public immutable pons;
    address public immutable routerImplementation;

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
        IPonsFactory.Socials socials;
        uint16 creatorTaxBps;
        uint256 launchConfigId;
        bytes32 expectedEconomics;
        bytes32 salt;
        string model; // Beeper model id, e.g. "venice/venice-uncensored-1-2"
    }

    Launch[] public launches;
    /// @notice Launch id + 1 (0 = not launched here).
    mapping(address token => uint256) public idPlusOne;

    event Launched(
        uint256 indexed id, address indexed creator, address indexed token, address curve, address router, string model
    );

    constructor(IPonsFactory pons_, address routerImplementation_) {
        pons = pons_;
        routerImplementation = routerImplementation_;
        require(
            address(CreditRouter(payable(routerImplementation_)).escrow()) == pons_.feeEscrow(), "router escrow"
        );
    }

    /// @notice msg.value must equal the Pons launch fee (read `pons.launchFee()`).
    function launch(LaunchParams calldata p) external payable returns (uint256 id) {
        uint256 len = bytes(p.model).length;
        require(len > 0 && len <= 128, "model");
        require(msg.value == pons.launchFee(), "wrong launch fee");

        CreditRouter router = CreditRouter(payable(_clone(routerImplementation)));
        router.initialize();

        (address token, address curve) = pons.launchToken{value: msg.value}(
            IPonsFactory.TokenParams({
                name: p.name,
                symbol: p.symbol,
                logo: p.logo,
                description: p.description,
                socials: p.socials,
                creatorFeeRecipient: address(router),
                creatorTaxBps: p.creatorTaxBps,
                buybackEnabled: false,
                expectedEconomics: p.expectedEconomics,
                salt: p.salt
            }),
            p.launchConfigId,
            router.quote() // paired with USDG; the Pons launch fee itself is still paid in ETH
        );
        router.setCoin(token, curve);

        id = launches.length;
        launches.push(Launch(token, curve, address(router), msg.sender, p.model));
        idPlusOne[token] = id + 1;
        emit Launched(id, msg.sender, token, curve, address(router), p.model);
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
