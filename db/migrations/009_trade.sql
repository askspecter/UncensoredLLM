-- beeper.trade: swap fees paid back as credit, and the Hook Scan of every stock/USDG pool.
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_kind_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK (kind IN ('topup', 'usage', 'refund', 'adjust', 'escrow', 'unescrow', 'bcredit', 'cashback'));

-- One id per swap the terminal builds; it rides in the swap's hookData so only this account can claim it.
CREATE TABLE trade_intents (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trade_cashback (
  tx_hash    text PRIMARY KEY,
  intent_id  text NOT NULL UNIQUE REFERENCES trade_intents(id),
  user_id    text NOT NULL REFERENCES users(id),
  wallet     text NOT NULL,
  symbol     text NOT NULL,
  side       text NOT NULL CHECK (side IN ('sell', 'buy')),
  fee_micros bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_cashback_user_idx ON trade_cashback(user_id, created_at DESC);

CREATE TABLE pool_scans (
  pool_id      text PRIMARY KEY,
  symbol       text NOT NULL,
  fee          integer NOT NULL,
  tick_spacing integer NOT NULL,
  hooks        text NOT NULL,
  liquidity    numeric NOT NULL DEFAULT 0,
  declared_bps numeric,
  cost_bps     numeric,
  impact_bps   numeric,
  hidden_bps   numeric,
  status       text NOT NULL DEFAULT 'new',
  scanned_at   timestamptz
);
CREATE INDEX pool_scans_symbol_idx ON pool_scans(symbol);
