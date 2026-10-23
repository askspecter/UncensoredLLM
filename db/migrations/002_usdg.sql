-- Direct USDG payments on Robinhood Chain (+ card via Whop, which reuses provider_ref/checkout_url).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('crypto', 'card', 'usdg'));

ALTER TABLE orders
  ADD COLUMN pay_units   numeric(38, 0),   -- exact USDG amount (6 decimals) incl. a unique dust suffix
  ADD COLUMN pay_to      text,
  ADD COLUMN start_block bigint,
  ADD COLUMN tx_hash     text UNIQUE,
  ADD COLUMN payer       text;

-- Two open orders never ask for the same amount, so a transfer maps to exactly one order.
CREATE UNIQUE INDEX orders_pending_units ON orders (pay_units) WHERE status = 'pending' AND pay_units IS NOT NULL;
