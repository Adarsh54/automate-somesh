CREATE TABLE IF NOT EXISTS credit_profiles (
 user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 id text NOT NULL,
 name text NOT NULL,
 data jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,id)
);
