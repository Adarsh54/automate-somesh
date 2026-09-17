CREATE TABLE IF NOT EXISTS reel_share_links (
 id uuid PRIMARY KEY,
 project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 token uuid UNIQUE NOT NULL,
 name text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reel_share_links_project_idx ON reel_share_links(project_id, created_at DESC);
ALTER TABLE reel_listens ADD COLUMN IF NOT EXISTS link_id uuid REFERENCES reel_share_links(id) ON DELETE CASCADE;
ALTER TABLE reel_listens ADD COLUMN IF NOT EXISTS embed boolean NOT NULL DEFAULT false;
ALTER TABLE reel_listen_events DROP CONSTRAINT IF EXISTS reel_listen_events_type_check;
ALTER TABLE reel_listen_events ADD CONSTRAINT reel_listen_events_type_check CHECK (type IN ('play','pause','seek','stop','switch','close','ended'));
