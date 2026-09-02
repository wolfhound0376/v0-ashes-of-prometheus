-- ============================================================================
-- CHARACTER RELATIONSHIPS — the thing that lets an NPC hold a grudge.
--
-- Sam's model, six dimensions, one row per (who feels it → who it is about):
--
--   trust       do I believe what you say and rely on you
--   fear        do I expect you to hurt me
--   respect     do I rate you, whatever else I feel
--   affection   do I like you
--   debt        BIDIRECTIONAL and signed: positive = you owe me,
--               negative = I owe you. The only dimension where the sign
--               carries meaning rather than magnitude.
--   resentment  what I have not forgiven
--
-- TWO TABLES, DELIBERATELY.
--
-- `character_relationships` is the CURRENT state — what the DM reads at a
-- glance and what an NPC's disposition is computed from.
--
-- `relationship_events` is the LEDGER — what actually happened, one row per
-- act, with the gravity it carried. State without a ledger cannot answer
-- "why does Buppido hate me", and that answer is the whole point: an NPC who
-- can say "you shot me at Velkynvelve" is the feature. A number that drifted
-- with no record behind it is not.
--
-- DIRECTION. subject FEELS, object is FELT ABOUT. Buppido resenting Kenta is
-- (subject: Buppido, object: Kenta). The reverse is a separate row and may
-- hold entirely different numbers, because relationships are not symmetric.
--
-- WRITES ARE SERVICE-ROLE ONLY. RLS is enabled with a read policy in the same
-- block — enabling RLS alone silently blacks out the dashboard, which this
-- project has already learned once from scene_effects. Nothing anon may write
-- here: a browser that could edit how an NPC feels about it is not a game.
-- ============================================================================

create table if not exists public.character_relationships (
  id           uuid primary key default gen_random_uuid(),

  -- Both sides are characters. NPCs live in `characters` alongside the PCs,
  -- so this one table covers NPC→PC, PC→NPC and NPC→NPC without a second
  -- shape for each.
  subject_id   uuid not null references public.characters(id) on delete cascade,
  object_id    uuid not null references public.characters(id) on delete cascade,

  -- -100..100. Neutral is 0, and a fresh pair simply has no row rather than
  -- a row full of zeros — absence means "we have no history", which is a
  -- different thing from "we are indifferent".
  trust        integer not null default 0 check (trust      between -100 and 100),
  fear         integer not null default 0 check (fear       between -100 and 100),
  respect      integer not null default 0 check (respect    between -100 and 100),
  affection    integer not null default 0 check (affection  between -100 and 100),
  debt         integer not null default 0 check (debt       between -100 and 100),
  resentment   integer not null default 0 check (resentment between -100 and 100),

  -- The last thing that moved these numbers, for the DM panel to show without
  -- joining the ledger.
  last_reason  text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- One row per direction per pair.
  constraint character_relationships_pair unique (subject_id, object_id),
  -- Nobody has a relationship with themselves.
  constraint character_relationships_not_self check (subject_id <> object_id)
);

create index if not exists character_relationships_subject_idx
  on public.character_relationships (subject_id);
create index if not exists character_relationships_object_idx
  on public.character_relationships (object_id);

-- ---------------------------------------------------------------------------

create table if not exists public.relationship_events (
  id           uuid primary key default gen_random_uuid(),

  subject_id   uuid not null references public.characters(id) on delete cascade,
  object_id    uuid not null references public.characters(id) on delete cascade,

  -- What happened. Free text rather than an enum: the campaign will invent
  -- kinds faster than a migration can be written, and an unrecognised kind
  -- should record rather than fail.
  kind         text not null,

  -- 0..100, Sam's gravity scale: immediate impact plus near-future weight
  -- plus how far it echoes toward the end of the campaign.
  gravity      integer not null default 0 check (gravity between 0 and 100),

  -- The deltas this event applied, AFTER weighting — so the ledger records
  -- what actually moved, not what was proposed. {"resentment": 12, "trust": -8}
  deltas       jsonb not null default '{}'::jsonb,

  -- One line, in the fiction's own words. This is what Malachar reads back.
  note         text,

  -- Where it came from: 'player-cast', 'dm', 'narrator', a session id.
  source       text,

  created_at   timestamptz not null default now()
);

create index if not exists relationship_events_pair_idx
  on public.relationship_events (subject_id, object_id, created_at desc);
create index if not exists relationship_events_recent_idx
  on public.relationship_events (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS. Read policy ships in the SAME block as the enable, deliberately:
-- turning RLS on without one silently empties every surface that reads it.

alter table public.character_relationships enable row level security;
alter table public.relationship_events     enable row level security;

drop policy if exists "relationships are publicly readable" on public.character_relationships;
create policy "relationships are publicly readable"
  on public.character_relationships for select
  to anon, authenticated
  using (true);

drop policy if exists "relationship events are publicly readable" on public.relationship_events;
create policy "relationship events are publicly readable"
  on public.relationship_events for select
  to anon, authenticated
  using (true);

-- No INSERT, UPDATE or DELETE policy for anon or authenticated, and that is
-- the point. Every write goes through a service-role API route.
