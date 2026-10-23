-- Resale marketplace: users list their Beeper credit at a discount; buyers' orders reserve
-- fills against those offers (deepest discount first) and the house covers the rest.

ALTER TABLE ledger DROP CONSTRAINT IF EXISTS ledger_kind_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK (kind IN ('topup', 'usage', 'refund', 'adjust', 'escrow', 'unescrow'));

CREATE TABLE offers (
  id               text PRIMARY KEY,
  user_id          text NOT NULL REFERENCES users(id),
  credit_micros    bigint NOT NULL CHECK (credit_micros > 0),        -- amount escrowed at listing
  remaining_micros bigint NOT NULL CHECK (remaining_micros >= 0),    -- not yet reserved or sold
  discount_bps     integer NOT NULL CHECK (discount_bps BETWEEN 100 AND 9000),
  payout_address   text NOT NULL,
  status           text NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'filled', 'cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offers_book_idx ON offers (discount_bps DESC, created_at) WHERE status = 'live';
CREATE INDEX offers_user_idx ON offers (user_id, created_at DESC);

-- How each order is filled. offer_id NULL = house liquidity.
CREATE TABLE order_fills (
  id            bigserial PRIMARY KEY,
  order_id      text NOT NULL REFERENCES orders(id),
  offer_id      text REFERENCES offers(id),
  credit_micros bigint NOT NULL CHECK (credit_micros > 0),
  price_micros  bigint NOT NULL CHECK (price_micros >= 0),            -- what the buyer pays for this fill, before fee
  discount_bps  integer NOT NULL,
  status        text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'settled', 'released'))
);
CREATE INDEX order_fills_order_idx ON order_fills (order_id);

-- USDG owed to sellers for sold credit; paid out from the treasury.
CREATE TABLE payouts (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id),
  offer_id      text NOT NULL REFERENCES offers(id),
  order_id      text NOT NULL REFERENCES orders(id),
  amount_micros bigint NOT NULL CHECK (amount_micros > 0),
  address       text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  tx_hash       text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);
CREATE INDEX payouts_status_idx ON payouts (status, created_at);

ALTER TABLE orders ADD COLUMN expires_at timestamptz;
