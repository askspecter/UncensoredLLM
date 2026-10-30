-- Trades on each coin's Pons curve, rebuilt from Transfer logs: USDG in and tokens out is a buy, the reverse a sell.
-- Feeds the price chart and the recent trades list.
CREATE TABLE launch_trades (
  tx_hash      text NOT NULL,
  token        text NOT NULL,
  block_number bigint NOT NULL,
  ts           timestamptz NOT NULL,
  side         text NOT NULL CHECK (side IN ('buy', 'sell')),
  wallet       text NOT NULL,                  -- lowercase; who received (buy) or sent (sell) the tokens
  usdg_micros  bigint NOT NULL,
  tokens       numeric NOT NULL,               -- 18 decimals, raw units
  PRIMARY KEY (tx_hash, token)
);
CREATE INDEX launch_trades_token_idx ON launch_trades (token, block_number);
