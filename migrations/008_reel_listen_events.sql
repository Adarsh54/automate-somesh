ALTER TABLE reel_listens ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE reel_listens ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE reel_listens ADD COLUMN IF NOT EXISTS country text;
CREATE TABLE IF NOT EXISTS reel_listen_events (
 id uuid PRIMARY KEY,
 listen_id uuid NOT NULL REFERENCES reel_listens(id) ON DELETE CASCADE,
 type text NOT NULL CHECK (type IN ('play','pause','seek','stop','ended')),
 track_id uuid NOT NULL,
 track_title text NOT NULL,
 position double precision,
 seek_from double precision,
 seek_to double precision,
 duration_seconds double precision,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_listen_events_listen_idx ON reel_listen_events(listen_id, created_at);
