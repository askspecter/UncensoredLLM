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
