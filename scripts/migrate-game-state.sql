-- Migration: Add conditions column and npc_encounters table for structured game state

-- Add conditions JSONB column to characters table (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'characters' AND column_name = 'conditions'
  ) THEN
    ALTER TABLE characters ADD COLUMN conditions JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create npc_encounters table for tracking active NPCs/monsters
CREATE TABLE IF NOT EXISTS npc_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  portrait_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_npc_encounters_character_active 
  ON npc_encounters(character_id, is_active) 
  WHERE is_active = true;

-- Enable RLS on npc_encounters
ALTER TABLE npc_encounters ENABLE ROW LEVEL SECURITY;

-- Permissive RLS policies (matching the existing pattern)
CREATE POLICY IF NOT EXISTS "npc_encounters_select" ON npc_encounters
  FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "npc_encounters_insert" ON npc_encounters
  FOR INSERT WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "npc_encounters_update" ON npc_encounters
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "npc_encounters_delete" ON npc_encounters
  FOR DELETE USING (true);
