-- Player-character ElevenLabs voices (applied to ppadxmvvvxmnnejeaoer on
-- 2026-08-17 via MCP; kept here as the schema record). Same two columns NPCs
-- carry on npc_encounters.
alter table public.characters
  add column if not exists voice_id text,
  add column if not exists voice_description text;
