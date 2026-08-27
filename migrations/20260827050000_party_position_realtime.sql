-- Applied to production 2026-08-27. Recorded here so the schema has a history.
--
-- The party moving is a moment, not a fact you find out on refresh.
--
-- `party_position` carries row-level security and a read-for-everyone policy
-- already, but it was never added to the realtime publication, so every
-- `postgres_changes` subscription against it has been silently inert. The 3D
-- map has had one since it was written and has been getting by on its own
-- poll; the NPC window's backdrop has no poll to fall back on, and would sit
-- on the old room until someone reloaded.
--
-- Additive and reversible: `alter publication supabase_realtime drop table
-- public.party_position;` puts it back exactly as it was.
do $$
begin
  alter publication supabase_realtime add table public.party_position;
exception when duplicate_object then null;
end $$;
