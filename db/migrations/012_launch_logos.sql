-- Coin logos uploaded on the launch form. The id is the content hash, so the same image is stored once
-- and its URL never changes (it is written onchain at launch).
CREATE TABLE launch_logos (
  id          text PRIMARY KEY,                -- first 32 hex chars of sha256(data)
  mime        text NOT NULL,
  data        bytea NOT NULL,
  uploaded_by text REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
