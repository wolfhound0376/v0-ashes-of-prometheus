-- ============================================================================
-- NPC AGENTS — "The Cast" (Sam, 2026-11-23: "make Malachar and the main NPCs smarter and interactive but not
-- obtrusive… make them like agents and train them; this way they can help me when they are not cosplaying their
-- characters"). Design of record: project doc claude/NPC_Agents_The_Cast_2026-11-23.md.
--
-- THREE TABLES, AND WHY THEY LIVE DIFFERENT LIVES (Sam ruled the split 2026-11-23: "That split sounds good"):
--
--   npc_agents    the CARD: who they are (bible), what drives them (agenda), how they talk. LIBRARY: shared by
--                 every save and kept by New Game — it is the actor's script, not the run.
--   npc_memories  what they lived through THIS run, one line each with its gravity (0-100, Sam's scale). STATE:
--                 a saved game keeps it, New Game wipes it (lib/restart-campaign.ts).
--   npc_coaching  Sam's notes on how to PLAY them ("Eldeth talks too much at camp"). LIBRARY: survives New Game,
--                 because it is about the actor, not what the character lived through.
--
-- WHO MAY READ: nobody but the service role. RLS on, NO policies (the walk_log pattern). An agenda holds DM
-- secrets (Buppido thinks he is a god, Sarith carries Zuggtmoy's spores) and the anon key ships in the page
-- bundle, so a read policy would hand them to every player. The Cast page reads through a DM-only route.
--
-- An agent is keyed by a short slug, not a characters id: Malachar has no characters row, and the card must
-- outlive any one row. `character_id` links the card to the NPC's own row where there is one (relationships
-- hang off it).
-- ============================================================================

create table if not exists public.npc_agents (
  key            text primary key check (key ~ '^[a-z][a-z0-9-]{1,30}$'),
  name           text not null,                         -- the canonical speaker name, as dialogue writes it
  aliases        text[] not null default '{}',          -- other names the log uses ("Eldeth", "Prince Derendil")
  role           text not null check (role in ('dm', 'companion', 'antagonist')),
  character_id   uuid references public.characters(id) on delete set null,
  sprite_slug    text,                                  -- public/sprites/<slug>/ on the Underwalk
  bible          text not null default '',              -- who they are
  agenda         jsonb not null default '{}'::jsonb,    -- {wants, fears, secret, turns}
  voice_note     text not null default '',              -- how they speak
  sources        text not null default '',              -- where the card came from; invented parts flagged
  chattiness     smallint not null default 3 check (chattiness between 0 and 10), -- the attention budget's dial
  remembered_through timestamptz,                       -- the Rememberer's watermark
  updated_at     timestamptz not null default now()
);

create table if not exists public.npc_memories (
  id             uuid primary key default gen_random_uuid(),
  agent_key      text not null references public.npc_agents(key) on delete cascade,
  about_id       uuid references public.characters(id) on delete cascade, -- who it is about; null = the world
  line           text not null check (length(line) between 3 and 300),
  gravity        smallint not null check (gravity between 0 and 100),
  run_id         uuid,
  source         text not null default 'rememberer',     -- rememberer | dm
  created_at     timestamptz not null default now(),
  last_recalled_at timestamptz,
  recalled       integer not null default 0
);
create index if not exists npc_memories_agent_about_idx on public.npc_memories (agent_key, about_id);

create table if not exists public.npc_coaching (
  id             uuid primary key default gen_random_uuid(),
  agent_key      text not null references public.npc_agents(key) on delete cascade,
  note           text not null check (length(note) between 3 and 500),
  scope          text not null default 'both' check (scope in ('stage', 'offstage', 'both')),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists npc_coaching_agent_idx on public.npc_coaching (agent_key) where active;

alter table public.npc_agents   enable row level security;
alter table public.npc_memories enable row level security;
alter table public.npc_coaching enable row level security;
-- No policies, on purpose (see the header).

-- A saved game keeps what the NPCs remember. MUST equal WHOLE_TABLES in lib/saves.ts (lib/saves.test.ts reads the
-- array from migrations/20261110230000_campaign_saves.sql, which carries the same list). npc_memories goes beside
-- the relationship tables it travels with.
create or replace function public.campaign_save_whole_tables() returns text[]
language sql immutable as $$
  select array[
    'sessions', 'game_clock', 'time_log', 'world_flags',
    'party_position', 'party_situation', 'party_vessels', 'party_supplies',
    'subnodal_party_position', 'subnodal_visibility', 'travel_march', 'travel_arrivals',
    'walk_world', 'walk_events', 'work_details',
    'dialogue', 'session_beats', 'session_telemetry', 'story_dialogue', 'cinematic_views',
    'journal_entries', 'journal_offers',
    'character_known_recipes', 'character_known_runes', 'character_known_effects', 'character_known_weaknesses',
    'inventory_items', 'item_events', 'equipment_items', 'vtt_ground_items', 'combat_state',
    'roll_requests', 'roll_attempts', 'skill_progress',
    'relationship_events', 'character_relationships', 'npc_knowledge', 'npc_memories',
    'character_faith', 'faith_events', 'prayers', 'rest_events', 'crafting_projects', 'magical_resources'
  ]::text[]
$$;
revoke all on function public.campaign_save_whole_tables() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- THE EIGHT CARDS. Sources: the OotA prisoner agendas (our guide pp. 5-10, as recorded in project doc
-- claude/Camp_Company_Agendas_Hunger_2026-11-15.md), the drow roster (guide p. 7, campaign_chunks 16-17) and Sam's
-- rulings. Anything that is neither is marked "Claude's wording" in `sources`. Sam edits these in The Cast.
-- `on conflict do nothing`: re-running never overwrites a card Sam has edited.
-- ---------------------------------------------------------------------------------------------------------------
insert into public.npc_agents (key, name, aliases, role, character_id, sprite_slug, bible, agenda, voice_note, sources, chattiness) values
('malachar', 'Malachar', '{}', 'dm', null, null,
 'A lich, and the Dungeon Master. He is trying to kill or torment the party for reasons he never gives, but he is bound by the rules of D&D 5E and keeps them exactly. Cruelty in delivery, never in facts.',
 '{"wants":"the party broken, slowly, by their own choices","fears":"nothing he will admit","secret":"why he wants them dead (unknown, even to Claude)","turns":"angrier when the party does too well"}',
 'Terse. A D&D lich, not a game master: few words, old, dry, contemptuous. Never talks rules or dice in his own voice. Eyes glow red when angry.',
 'Sam''s rulings 2026-11-10 (adversary, terse lich, PR #1230) and 2026-11-17 (word cap, voice). Agenda wording: Claude''s.', 2),
('eldeth', 'Eldeth Feldrun', '{"Eldeth"}', 'companion', '05b65375-f25e-4773-bf41-641be0f12b86', 'eldeth',
 'A shield dwarf of Gauntlgrym, a fighter. Defiant and proud; she wants to go home.',
 '{"wants":"home to Gauntlgrym","fears":"dying far from home with her task undone","secret":"if dying, she will ask the heroes to carry her shield and warhammer home","turns":"warms to those who stand up to the drow; flirts with one hero"}',
 'Blunt, proud, dwarven. Short sentences.',
 'OotA guide pp. 5-10 (agendas). Fears wording: Claude''s.', 3),
('ront', 'Ront', '{}', 'companion', '2f539d01-6259-4beb-a685-4bd009f03f0d', 'ront',
 'An orc, a barbarian, and a bully. He hates Eldeth. He cannot stand close quarters and berates whoever leads.',
 '{"wants":"to be the one in charge","fears":"tight tunnels","secret":"","turns":"respects strength; picks on weakness; rages"}',
 'Loud, crude, short.',
 'OotA guide pp. 5-10 (agendas). Wants/fears wording: Claude''s reading of "can''t stand close quarters".', 3),
('derendil', 'Prince Derendil', '{"Derendil"}', 'companion', 'e0c652fe-2f68-40ff-823d-bb7ac34f529f', 'derendil',
 'A quaggoth who believes he is a cursed elf prince. Courtly in speech. Rages under stress, or when his story is questioned.',
 '{"wants":"to be believed, and his curse lifted","fears":"that the story is not true","secret":"he is a quaggoth, and nothing more","turns":"rages when grilled on his story"}',
 'Courtly, formal, a prince''s manners in a beast''s throat.',
 'OotA guide pp. 5-10 (agendas). Wants/fears wording: Claude''s.', 3),
('jimjar', 'Jimjar', '{}', 'companion', 'ffcd12e5-ccdc-4126-954b-bfabb8d083de', 'jimjar',
 'A deep gnome rogue and a gambler who loves money. He can guide the party to Blingdenstone. Not a god (Sam''s ruling).',
 '{"wants":"coin, and a good bet","fears":"losing a bet he cannot cover","secret":"","turns":"helps those he likes on locks and traps; bets rations he can out-forage a hero"}',
 'Quick, chatty, small high voice (gnome).',
 'OotA guide pp. 5-10 (agendas); Sam 2026-11-15 (not a god); voice size rule. Fears wording: Claude''s.', 4),
('sarith', 'Sarith Kzekarit', '{"Sarith"}', 'companion', 'cc309888-e98d-4cfe-8bf1-d75787b8ec8e', 'sarith',
 'A drow prisoner, a ranger who knows the Underdark. He does not remember whether he murdered.',
 '{"wants":"to know what he did","fears":"that he did it","secret":"Zuggtmoy''s spores are in him (DM secret)","turns":"withdrawn; opens up to patience"}',
 'Quiet, haunted, few words.',
 'OotA guide pp. 5-10 (agendas). Wants/fears/turns wording: Claude''s.', 2),
('buppido', 'Buppido', '{}', 'companion', '1c5161a5-b0be-4f39-bb6f-8b1b0486120e', 'buppido',
 'A derro who secretly thinks he is a god. After the escape he means to kill the heroes one by one, and shoves a lone hero off a ledge if he can, calling it an accident. Rises as a zombie wherever he dies.',
 '{"wants":"the heroes dead, one at a time","fears":"being found out","secret":"he is the killer, and believes himself a god","turns":"friendly face; waits for a hero alone on a ledge"}',
 'Cheerful, helpful, a little off.',
 'OotA guide pp. 5-10 (agendas); Sam 2026-11-15 (ledge shove, zombie). Voice wording: Claude''s.', 3),
('jorlan', 'Jorlan Duskryn', '{"Jorlan"}', 'antagonist', '5c3ce3b1-4991-485d-965c-3765d92665c4', 'jorlan',
 'A drow elite warrior of the Velkynvelve garrison. A black ooze scarred his face and hand; Ilvara cast him aside for it and took Shoor. He hates Ilvara and Shoor, and may unlock the pen to embarrass her.',
 '{"wants":"Ilvara humiliated","fears":"being seen as weak","secret":"he will betray the outpost to shame Ilvara","turns":"keeps his word once given (Sam)"}',
 'Cold, clipped, proud; Elvish to drow.',
 'OotA guide p. 7 (campaign_chunks 16-17); Sam 2026-10-26 (arrives at the 2nd/3rd watch, stat block) and PR #1324 (kept word). Fears wording: Claude''s.', 2)
on conflict (key) do nothing;
