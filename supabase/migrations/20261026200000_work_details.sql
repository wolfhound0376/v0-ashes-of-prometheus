-- work_details — Hard Labor: the work details that take prisoners out of the Velkynvelve slave pen.
--
-- Sam, 2026-10-26: "a module for how guards who come by for labor duties to the pen coordinate this".
-- One row per crew per shift. lib/labor.ts plans them (planDay); a service-role route writes them; the walk and the
-- chat read them. Design of record: project doc claude/Hard_Labor_Module_2026-10-26.md.
--
-- [BOOK] OotA Encounters ch.1 "Hard Labor" p.12: three groups, a third of the day each, two or three per task.
-- [SAM]  all the heroes go on one detail together, plus 0–2 prisoner NPCs.
--
-- One run's rows go with the run (on delete cascade), so a New Game starts with no rota.
--
-- NEW TABLE. NOT applied by deploy — this repo's .sql files do not run on push. Apply via the Supabase MCP
-- (apply_migration) on Sam's "run the work details migration". When the sandbox schema lands, it needs a copy there.

create table if not exists public.work_details (
  id              uuid primary key default gen_random_uuid(),
  campaign_run_id uuid not null references public.campaign_runs (id) on delete cascade,
  day             integer  not null check (day >= 1),
  shift           smallint not null check (shift between 1 and 3),
  task            text     not null check (task in (
                    'water','lift','clean','pots','kitchen','dishes','laundry','rocks','rope','supplies',
                    'lift-trouble','quaggoth-hair')),
  area_no         integer  not null,                       -- the book area the work happens in
  party           boolean  not null default false,         -- true = the heroes' own detail; false = NPCs, off-screen
  crew            jsonb    not null default '[]'::jsonb,   -- [{kind:'pc'|'npc', id, name}]
  escort          jsonb    not null default '[]'::jsonb,   -- [{bestiary:'drow'|'quaggoth'|..., name}]
  status          text     not null default 'scheduled'
                    check (status in ('scheduled','called','escorting','working','returning','done','aborted')),
  events          jsonb    not null default '[]'::jsonb,   -- pockets, redos, searches, warnings, defusals, volleys
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (campaign_run_id, day, shift, task)
);

create index if not exists work_details_run_day on public.work_details (campaign_run_id, day, shift);

-- Read for everyone (the walk and the dashboard use the anon key); NO insert/update/delete policy —
-- writes go only through the service-role route. RLS and the read policy in one block (learnings: never split them).
alter table public.work_details enable row level security;
drop policy if exists work_details_read on public.work_details;
create policy work_details_read on public.work_details for select to anon, authenticated using (true);

-- The walk watches the rota so every seated player sees the escort arrive at the same moment.
do $$ begin
  alter publication supabase_realtime add table public.work_details;
exception when duplicate_object then null; end $$;
