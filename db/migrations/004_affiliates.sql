-- Affiliates, public handles, and generalized payouts.

ALTER TABLE users
  ADD COLUMN ref_code    text UNIQUE,
  ADD COLUMN referred_by text REFERENCES users(id),
  ADD COLUMN referred_at timestamptz;
ALTER TABLE users ADD CONSTRAINT users_handle_format CHECK (handle IS NULL OR handle ~ '^[a-z0-9_]{3,20}$');

-- Commission on each paid order from a referred buyer; withdrawable after a hold.
CREATE TABLE referral_earnings (
  id            bigserial PRIMARY KEY,
  affiliate_id  text NOT NULL REFERENCES users(id),
  order_id      text NOT NULL UNIQUE REFERENCES orders(id),
  amount_micros bigint NOT NULL CHECK (amount_micros > 0),
  available_at  timestamptz NOT NULL,
  payout_id     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referral_earnings_affiliate_idx ON referral_earnings (affiliate_id, created_at DESC);

-- Payouts now cover both seller sales and affiliate withdrawals.
ALTER TABLE payouts ALTER COLUMN offer_id DROP NOT NULL;
ALTER TABLE payouts ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE payouts ADD COLUMN kind text NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale', 'affiliate'));
