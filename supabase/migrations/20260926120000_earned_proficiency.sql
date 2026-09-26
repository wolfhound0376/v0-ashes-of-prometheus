-- Earned skill proficiency — schema (PR 1 of docs/claude_Earned_Proficiency.md §8).
--
-- HOMEBREW, Sam's call 2026-09-26. 5e has no rule for earning a skill
-- proficiency through play; nothing here may be presented to players as a
-- book rule. Three paths: practice (8 meaningful successes), flash of talent
-- (2 natural 20s within 7 campaign days), teaching (40 campaign hours with a
-- proficient teacher, then a DC 12 check). Expertise is NOT on this ladder.
--
-- Requires 20260826230000_add_roll_request_ledger.sql (roll_requests) to have
-- been applied first. Everything below is additive and safe to re-run.
--
-- Row security is ON with NO policies on both new tables: only the service
-- role (server routes) can read or write them, the same posture as time_log.
-- The tally is hidden state, exactly like gravity.

-- ---------------------------------------------------------------------------
-- 1. roll_requests learns which skill a check was for and what the DC was.
--    Both nullable: every existing [[1d20+3]] request keeps working; only a
--    request written as [[1d20+3 | stealth | DC 15]] fills them.
-- ---------------------------------------------------------------------------
alter table public.roll_requests
  add column if not exists skill text null,
  add column if not exists dc integer null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roll_requests_skill_known') then
    alter table public.roll_requests
      add constraint roll_requests_skill_known check (skill is null or skill in (
        'athletics',
        'acrobatics', 'sleight_of_hand', 'stealth',
        'arcana', 'history', 'investigation', 'nature', 'religion',
        'animal_handling', 'insight', 'medicine', 'perception', 'survival',
        'deception', 'intimidation', 'performance', 'persuasion'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'roll_requests_dc_range') then
    alter table public.roll_requests
      add constraint roll_requests_dc_range check (dc is null or dc between 1 and 40);
  end if;
end $$;

comment on column public.roll_requests.skill is
  'snake_case SRD skill the check was for, parsed from [[dice | skill | DC n]]. Null for attacks, damage and untagged requests.';
comment on column public.roll_requests.dc is
  'The DC Malachar set in the tag. Server-only; never sent to the client. Null when he did not name one.';

-- ---------------------------------------------------------------------------
-- 2. Tunables. One row per path; Sam edits numbers here, never in code.
-- ---------------------------------------------------------------------------
create table if not exists public.skill_progress_rules (
  path         text primary key check (path in ('practice', 'talent', 'teaching')),
  threshold    integer not null check (threshold > 0),   -- 8 successes / 2 crits / 40 hours
  window_days  integer null check (window_days is null or window_days > 0), -- talent: 7
  min_dc       integer null check (min_dc is null or min_dc between 1 and 40), -- practice 10; teaching final check 12
  source       text not null
);

alter table public.skill_progress_rules enable row level security;

comment on table public.skill_progress_rules is
  'Earned-proficiency thresholds (homebrew, Sam 2026-09-26). practice: threshold successes at DC >= min_dc, one per stake per campaign day. talent: threshold natural 20s within window_days campaign days. teaching: threshold campaign hours with a proficient teacher, then one check at DC min_dc.';

insert into public.skill_progress_rules (path, threshold, window_days, min_dc, source) values
  ('practice', 8,  null, 10, 'homebrew — Sam''s call, 2026-09-26'),
  ('talent',   2,  7,    null, 'homebrew — Sam''s call, 2026-09-26'),
  ('teaching', 40, null, 12, 'homebrew — Sam''s call, 2026-09-26')
on conflict (path) do nothing;

-- ---------------------------------------------------------------------------
-- 3. The ledger. Append-only; the award is derived from it, never stored as a
--    counter. An award is the moment a kind='award' row is written and
--    characters.sheet_skill_proficiencies[skill] is set to 'proficient' in
--    the same transaction. Two writes, one truth.
-- ---------------------------------------------------------------------------
create table if not exists public.skill_progress (
  id               uuid primary key default gen_random_uuid(),
  character_id     uuid not null references public.characters(id) on delete cascade,
  skill            text not null check (skill in (
                     'athletics',
                     'acrobatics', 'sleight_of_hand', 'stealth',
                     'arcana', 'history', 'investigation', 'nature', 'religion',
                     'animal_handling', 'insight', 'medicine', 'perception', 'survival',
                     'deception', 'intimidation', 'performance', 'persuasion'
                   )),
  kind             text not null check (kind in ('success', 'crit', 'training_hours', 'award')),
  amount           integer not null default 1 check (amount > 0),  -- hours for training; 1 otherwise
  dc               integer null check (dc is null or dc between 1 and 40),
  stake_key        text null,            -- interaction key / roll purpose, for freshness
  teacher_id       uuid null references public.characters(id) on delete set null,
  campaign_day     integer not null check (campaign_day >= 0),  -- from game_clock at the time
  roll_request_id  uuid null references public.roll_requests(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists skill_progress_character_skill_kind_idx
  on public.skill_progress (character_id, skill, kind);
create index if not exists skill_progress_awards_created_idx
  on public.skill_progress (created_at desc) where kind = 'award';

alter table public.skill_progress enable row level security;

comment on table public.skill_progress is
  'Append-only earned-proficiency ledger (homebrew, Sam 2026-09-26). success/crit rows come from resolved skill checks; training_hours from camp; award is written once per (character, skill) the moment a path crosses its threshold. Service-role only — the tally is hidden from players and from Malachar.';
comment on column public.skill_progress.stake_key is
  'What the check was against (interaction key or roll purpose). Freshness rule: one success per stake per campaign day.';
