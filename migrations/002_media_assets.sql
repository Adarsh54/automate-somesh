CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  pathname text UNIQUE NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  size bigint NOT NULL CHECK (size > 0 AND size <= 2147483648),
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_user_idx ON media_assets(user_id);
