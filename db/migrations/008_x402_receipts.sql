-- Proof of Bill: every completion gets a signed receipt; each UTC day's receipts are committed on chain as one Merkle root.
ALTER TABLE usage_logs ADD COLUMN output_hash text;   -- keccak256 of the generated text, never the text itself
ALTER TABLE usage_logs ADD COLUMN receipt_sig text;   -- server wallet signature over the receipt leaf

CREATE TABLE bill_roots (
  day        date PRIMARY KEY,
  root       text NOT NULL,
  leaves     integer NOT NULL,
  tx_hash    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- x402: one row per signed USDG authorization, so a payment header can't be used twice.
CREATE TABLE x402_payments (
  nonce        text PRIMARY KEY,
  payer        text NOT NULL,
  value_micros bigint NOT NULL,
  tx_hash      text,
  status       text NOT NULL,          -- settled | prepaid
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX x402_payments_payer_idx ON x402_payments (payer, created_at DESC);
