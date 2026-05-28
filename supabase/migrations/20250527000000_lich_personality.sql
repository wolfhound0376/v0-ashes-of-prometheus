-- Create lich_personality table for DM-controlled Malachar personality settings
CREATE TABLE IF NOT EXISTS lich_personality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snark int NOT NULL DEFAULT 5 CHECK (snark BETWEEN 0 AND 10),
  crassness int NOT NULL DEFAULT 3 CHECK (crassness BETWEEN 0 AND 10),
  cruelty int NOT NULL DEFAULT 4 CHECK (cruelty BETWEEN 0 AND 10),
  roast_target text NOT NULL DEFAULT 'even' CHECK (roast_target IN ('sam','kenta','fifi','scott','even','off')),
  swearing text NOT NULL DEFAULT 'mild' CHECK (swearing IN ('off','mild','unrestricted')),
  fourth_wall text NOT NULL DEFAULT 'occasionally' CHECK (fourth_wall IN ('off','occasionally','often')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE lich_personality ENABLE ROW LEVEL SECURITY;

-- Allow SELECT for all roles (single-user app)
CREATE POLICY "Allow select for all" ON lich_personality
  FOR SELECT USING (true);

-- Allow UPDATE for all roles
CREATE POLICY "Allow update for all" ON lich_personality
  FOR UPDATE USING (true);

-- Allow INSERT for all roles
CREATE POLICY "Allow insert for all" ON lich_personality
  FOR INSERT WITH CHECK (true);

-- Seed exactly one default row so the app always has settings
INSERT INTO lich_personality (snark, crassness, cruelty, roast_target, swearing, fourth_wall)
VALUES (5, 3, 4, 'even', 'mild', 'occasionally');
