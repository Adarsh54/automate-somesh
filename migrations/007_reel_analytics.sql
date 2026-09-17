CREATE TABLE IF NOT EXISTS reel_listens (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 opened_at timestamptz NOT NULL DEFAULT now(),
 user_agent text,
 referrer text
);
CREATE INDEX IF NOT EXISTS reel_listens_project_idx ON reel_listens(project_id, opened_at DESC);
CREATE TABLE IF NOT EXISTS reel_listen_tracks (
 listen_id uuid NOT NULL REFERENCES reel_listens(id) ON DELETE CASCADE,
 track_id uuid NOT NULL,
 track_title text NOT NULL,
 duration_seconds double precision,
 max_seconds double precision NOT NULL DEFAULT 0,
 completed boolean NOT NULL DEFAULT false,
 played_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (listen_id, track_id)
);
