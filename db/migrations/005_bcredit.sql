-- bCREDIT: a share of Beeper's daily revenue, credited to $BEEP holders who linked a wallet.
-- 1 bCREDIT = $1 of API balance once activated.

ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_kind_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK (kind IN ('topup', 'usage', 'refund', 'adjust', 'escrow', 'unescrow', 'bcredit'));

ALTER TABLE users ADD COLUMN bcredit_micros bigint NOT NULL DEFAULT 0 CHECK (bcredit_micros >= 0);

-- Wallets a user proved they control (signed message). One wallet belongs to one account.
CREATE TABLE holder_wallets (
  address    text PRIMARY KEY,           -- lowercase 0x address
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  linked_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX holder_wallets_user_idx ON holder_wallets (user_id);

-- One row per daily distribution (UTC day of the revenue it shares).
CREATE TABLE bcredit_epochs (
  day          date PRIMARY KEY,
  revenue_micros bigint NOT NULL,        -- gross margin earned that day
  pool_micros  bigint NOT NULL,          -- share distributed to holders
  total_beep   numeric(78, 0) NOT NULL,  -- eligible $BEEP (wei) across linked wallets
  holders      integer NOT NULL,
  block_number bigint,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bcredit_rewards (
  day          date NOT NULL REFERENCES bcredit_epochs(day),
  user_id      text NOT NULL REFERENCES users(id),
  beep_balance numeric(78, 0) NOT NULL,
  amount_micros bigint NOT NULL,
  PRIMARY KEY (day, user_id)
);
CREATE INDEX bcredit_rewards_user_idx ON bcredit_rewards (user_id, day DESC);
