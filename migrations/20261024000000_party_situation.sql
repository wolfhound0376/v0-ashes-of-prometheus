-- NOT YET APPLIED. Paste into the Supabase SQL Editor (migrations in this folder do not run on deploy).
--
-- party_situation: what the party is in the middle of, as the painted walk (/velkynvelve) sees it.
--
-- Why a table and not another world flag. Malachar learns where the party is from
-- party_location_label(): the travel node, plus the subnodal node when the party holds one. The walk
-- never writes either — it moves the party between Velkynvelve's fourteen plates on its own, so the
-- database still says "Slave Pen" while the party stands in Shoor's quarters talking to Jorlan. A map
-- talk hands the dashboard only an area name and an NPC (?area=…&talk=…); who walks with the party,
-- who else is on the plate, whether a fight just ended, whether the gate is open — none of that
-- reaches the DM core. This row is that account, written by the walk on every change and read by
-- anyone (the players can see the room; nothing here is secret).
--
-- One row per campaign run, like party_position: a restart opens a new run and the old row simply
-- stops being the active one (readers go through subnodal_active_run()). Deleting a run takes its
-- situation with it. The walk only ever upserts.
--
-- The activity vocabulary (exploring, travelling, talking, fighting, interacting) is validated in
-- lib/situation.ts, not by a CHECK, so a new activity never needs a second migration.
--
-- Additive and reversible: `drop table public.party_situation;` puts everything back.

create table if not exists public.party_situation (
  campaign_run_id uuid primary key references public.campaign_runs(id) on delete cascade,
  source      text        not null default 'walk',       -- which surface wrote it ("walk")
  place       text,                                      -- "Velkynvelve"
  area_key    text,                                      -- plate slug: "node-11-slave-pen"
  area_no     integer,                                   -- the book's area number: 11
  area_name   text,                                      -- "Slave Pen"
  activity    text        not null default 'exploring',  -- exploring | travelling | talking | fighting | interacting
  talking_to  text,                                      -- the NPC's name while activity = talking
  leader      text,                                      -- the character walking in front
  party       jsonb       not null default '[]'::jsonb,  -- [{slug, name, characterId, down}]
  company     jsonb       not null default '[]'::jsonb,  -- NPCs walking WITH the party: [{slug, name}]
  nearby      jsonb       not null default '[]'::jsonb,  -- everyone else on the plate: [{slug, name, hostile, down, body}]
  flags       jsonb       not null default '{}'::jsonb,  -- {gateOpen, clearedHere, penKey}
  note        text,                                      -- the last thing that happened, one line
  updated_at  timestamptz not null default now()
);

alter table public.party_situation enable row level security;

-- Same shape as party_position and world_flags: everyone reads, only the server (service role) writes.
drop policy if exists party_situation_read on public.party_situation;
create policy party_situation_read on public.party_situation
  for select to anon, authenticated using (true);

-- The party moving, or a fight starting, is a moment: every screen should change at once.
do $$
begin
  alter publication supabase_realtime add table public.party_situation;
exception when duplicate_object then null;
end $$;
