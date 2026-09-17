ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES media_assets(id);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES media_assets(id);
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS edit_recipe jsonb;
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES media_assets(id);
