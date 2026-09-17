CREATE TABLE IF NOT EXISTS reel_audio (
 asset_id uuid PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
 pathname text,
 duration double precision,
 peaks jsonb,
 lease uuid,
 lease_until timestamptz
);
CREATE TABLE IF NOT EXISTS reel_publications (
 project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 token uuid UNIQUE NOT NULL,
 manifest jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
