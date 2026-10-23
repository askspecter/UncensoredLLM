-- Money is stored as integer micro-dollars (1 USD = 1_000_000) for credit/usage,
-- and integer cents for amounts charged to a payment provider.

CREATE TABLE users (
  id            text PRIMARY KEY,               -- Privy DID
  handle        text UNIQUE,
  balance_micros bigint NOT NULL DEFAULT 0 CHECK (balance_micros >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  key_hash      text NOT NULL UNIQUE,
  prefix        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX api_keys_user_idx ON api_keys(user_id);

CREATE TABLE orders (
  id             text PRIMARY KEY,
  user_id        text NOT NULL REFERENCES users(id),
  credit_micros  bigint NOT NULL CHECK (credit_micros > 0),
  subtotal_cents integer NOT NULL,
  fee_cents      integer NOT NULL,
  total_cents    integer NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('crypto', 'card')),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'refunded')),
  provider_ref   text,
  checkout_url   text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz
);
CREATE INDEX orders_user_idx ON orders(user_id, created_at DESC);

-- Append-only record of every balance change; users.balance_micros is its running sum.
CREATE TABLE ledger (
  id            bigserial PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id),
  amount_micros bigint NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('topup', 'usage', 'refund', 'adjust')),
  ref           text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ledger_user_idx ON ledger(user_id, created_at DESC);
CREATE UNIQUE INDEX ledger_topup_once ON ledger(ref) WHERE kind = 'topup';

CREATE TABLE usage_logs (
  id                bigserial PRIMARY KEY,
  user_id           text NOT NULL REFERENCES users(id),
  api_key_id        text REFERENCES api_keys(id),
  model             text NOT NULL,
  prompt_tokens     integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_micros       bigint NOT NULL DEFAULT 0,
  latency_ms        integer,
  status            integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_user_idx ON usage_logs(user_id, created_at DESC);

CREATE TABLE listings (
  id            text PRIMARY KEY,
  user_id       text NOT NULL REFERENCES users(id),
  source        text NOT NULL,
  credit_cents  integer NOT NULL CHECK (credit_cents >= 5000),
  discount_bps  integer NOT NULL CHECK (discount_bps BETWEEN 500 AND 7000),
  payout        text NOT NULL,
  status        text NOT NULL DEFAULT 'pending_verification'
                CHECK (status IN ('pending_verification', 'live', 'sold', 'rejected', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX listings_user_idx ON listings(user_id);
