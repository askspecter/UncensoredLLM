-- Small key/value settings written from the admin page (e.g. the deployed BeeperHook).
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
