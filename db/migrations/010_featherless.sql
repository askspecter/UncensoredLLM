-- "Connect Featherless": a user's own Featherless account, linked over OAuth, pays for long-tail models.
-- Tokens are stored encrypted (AES-256-GCM, lib/featherless.ts).
CREATE TABLE featherless_links (
  user_id     text PRIMARY KEY REFERENCES users(id),
  access_enc  text NOT NULL,
  refresh_enc text,
  expires_at  timestamptz NOT NULL,
  scope       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One-time `state` values for the authorize redirect; a callback without a matching, fresh row is refused.
CREATE TABLE oauth_states (
  state      text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
