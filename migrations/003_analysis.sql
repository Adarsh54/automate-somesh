CREATE TABLE IF NOT EXISTS analysis_assets (
  id uuid PRIMARY KEY,
  owner text NOT NULL,
  pathname text NOT NULL UNIQUE,
  filename text NOT NULL,
  content_type text NOT NULL,
  size bigint NOT NULL,
  metadata jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS analysis_assets_expiry ON analysis_assets(expires_at);
CREATE TABLE IF NOT EXISTS analysis_limits (
  key text PRIMARY KEY,
  count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS analysis_leases (
  owner text PRIMARY KEY,
  token uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
