# BeeperHook

A Uniswap v4 hook for a single **$BEEP / USDG** pool on Robinhood Chain (4663).

| What | How |
| --- | --- |
| Hook fee | Charged on the unspecified side of every swap (output of exact-in, input of exact-out) |
| USDG fees | Sent to the bCREDIT vault, shared with $BEEP holders as AI credit |
| $BEEP fees | Burned (sent to `0x…dEaD`) |
| Launch window | Fee decays linearly from `LAUNCH_FEE_BPS` to `BASE_FEE_BPS`; swaps moving more than `MAX_SWAP_USDG` are refused |
| Admin | None. Every parameter is immutable. Only the deployer can create the pool |

Defaults: 1% base fee, 5% at launch, 1 hour window, 500 USDG cap, 0.30% LP fee.

## Setup

```bash
./setup.sh          # pinned Uniswap v4 + forge-std into lib/
forge test          # forks Robinhood Chain mainnet: real PoolManager, $BEEP and USDG
```

## Deploy

Your wallet needs the $BEEP and USDG for the first liquidity, plus a little ETH for gas.
The starting price is `BEEP_AMOUNT : USDG_AMOUNT`, so match the market price.

```bash
cast wallet import beeper --interactive   # stores your key encrypted, once

VAULT=0xYourBcreditVault \
BEEP_AMOUNT=10000000000000000000000000 \
USDG_AMOUNT=300000000 \
forge script script/DeployBeeperHook.s.sol --rpc-url robinhood --account beeper --broadcast
```

`BEEP_AMOUNT` has 18 decimals (the example is 10M BEEP), `USDG_AMOUNT` has 6 (the example is 300 USDG, so $0.00003 per BEEP).
Optional: `BASE_FEE_BPS`, `LAUNCH_FEE_BPS`, `LAUNCH_WINDOW` (seconds), `MAX_SWAP_USDG` (6 decimals), `LP_FEE` (hundredths of a bip).

The script prints the hook address, pool id and the position NFT, which is owned by your wallet.
Run it without `--broadcast` first to simulate.

## Launchpad (`src/launch`)

Coins launched on Pons V2 from launch.usebeeper.io, each paired with USDG and with an AI model the creator picks.

- `BeeperLauncher.launch(params)` creates the coin on Pons (pair token USDG, launch fee in ETH), clones a `CreditRouter` as its creator-fee recipient and records the model. Model, pairing and router are fixed for good.
- `CreditRouter.harvest()` (anyone can call it) sweeps the curve fees, claims them from the Pons escrow in USDG and sends 80% to Beeper's credit wallet and 20% to the treasury, emitting `Harvested(toCredit, toTreasury)`.
- Beeper reads each `Harvested` event and pays `toCredit` to the coin's holders as API credit (1 USDG = $1), pro rata to their balance at that block, rebuilt from the token's Transfer events. Contracts (curve, pools, routers) are excluded. Wallets linked to an account are credited at once; the rest wait until the wallet is linked.

Deploy from `/admin/launch` (two CREATE2 transactions from the admin wallet; addresses are deterministic). Tests run against a mainnet fork with the real Pons contracts:

```sh
forge test --match-contract BeeperLauncherForkTest -vv
```

After changing the contracts, refresh the bytecode the admin page deploys: `forge build && node ../scripts/export-launch-artifacts.mjs`.
