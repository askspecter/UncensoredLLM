-- Beeper launchpad: Pons coins paired with USDG whose creator fees (80%) are paid to holders as AI credit.
ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_kind_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK (kind IN ('topup', 'usage', 'refund', 'adjust', 'escrow', 'unescrow', 'bcredit', 'cashback', 'launch'));

CREATE TABLE launch_coins (
  id            integer PRIMARY KEY,          -- launch id on the BeeperLauncher
  token         text NOT NULL UNIQUE,         -- checksummed addresses
  curve         text NOT NULL,
  router        text NOT NULL UNIQUE,
  creator       text NOT NULL,
  model         text NOT NULL,                -- Beeper model id the creator picked
  name          text NOT NULL DEFAULT '',
  symbol        text NOT NULL DEFAULT '',
  logo          text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  socials       jsonb NOT NULL DEFAULT '{}',
  tax_bps       integer NOT NULL DEFAULT 0,
  created_block bigint NOT NULL,
  tx_hash       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per Harvested event: the USDG that became credit for that coin's holders at that block.
CREATE TABLE launch_harvests (
  tx_hash       text NOT NULL,
  log_index     integer NOT NULL,
  token         text NOT NULL REFERENCES launch_coins(token),
  block_number  bigint NOT NULL,
  credit_micros bigint NOT NULL,              -- USDG has 6 decimals: units are micro-dollars
  paid_micros   bigint NOT NULL DEFAULT 0,    -- what reached holders after rounding
  holders       integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX launch_harvests_token_idx ON launch_harvests (token, block_number DESC);

-- Each holder's share of a harvest. Wallets linked to an account are credited at once; the rest wait here
-- until the wallet is linked (same signed-message link as bCREDIT).
CREATE TABLE launch_rewards (
  tx_hash       text NOT NULL,
  log_index     integer NOT NULL,
  wallet        text NOT NULL,                -- lowercase
  token         text NOT NULL,
  amount_micros bigint NOT NULL,
  user_id       text REFERENCES users(id),
  claimed_at    timestamptz,
  PRIMARY KEY (tx_hash, log_index, wallet),
  FOREIGN KEY (tx_hash, log_index) REFERENCES launch_harvests(tx_hash, log_index)
);
CREATE INDEX launch_rewards_wallet_idx ON launch_rewards (wallet) WHERE claimed_at IS NULL;
CREATE INDEX launch_rewards_user_idx ON launch_rewards (user_id, claimed_at DESC);
