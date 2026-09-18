CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_user_idx ON folders(user_id, name);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS projects_folder_idx ON projects(folder_id);
