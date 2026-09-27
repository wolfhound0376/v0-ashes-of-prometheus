-- crafting_projects.copies — Two-Parts' "two copies of a consumable"
-- (docs/claude_Camp_Module.md §18). SCHEMA CHANGE, said out loud.
--
-- Sam, 2026-09-27: "Take 10 and make two copies; build them." A consumable
-- normally takes half the time for one copy; the crafter may instead spend
-- the full time and make two, paying both copies' materials. The choice is
-- made when the project starts, so the project has to remember it: 1 or 2.
-- Every existing row is a one-copy project, which the default keeps true.
--
-- APPLIED to Supabase 2026-09-27. Idempotent.

alter table public.crafting_projects
  add column if not exists copies smallint not null default 1;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crafting_projects_copies_check'
      and conrelid = 'public.crafting_projects'::regclass
  ) then
    alter table public.crafting_projects
      add constraint crafting_projects_copies_check check (copies in (1, 2));
  end if;
end $$;
