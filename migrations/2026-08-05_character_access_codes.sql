-- ===========================================================================
-- Access codes for the /join gate  +  moving claim credentials out of reach
-- of the public anon key.  2026-08-05
--
-- REMINDER: migrations in this repo do NOT run on deploy. Paste them into the
-- Supabase SQL Editor by hand.
--
-- STEPS 1 and 2 HAVE ALREADY BEEN APPLIED to project ppadxmvvvxmnnejeaoer.
-- They are recorded here so the repo tells the truth about the schema.
--
-- STEP 3 IS NOT YET APPLIED. Run it only AFTER the new code is deployed —
-- the currently-live build still reads characters.claim_token, and dropping
-- the column before it ships would break every claim link mid-session.
-- Step 3 is the step that actually closes the hole.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 — APPLIED. Human-typeable code column (later relocated by step 2).
-- ---------------------------------------------------------------------------
alter table public.characters
  add column if not exists claim_code text;

create unique index if not exists characters_claim_code_unique
  on public.characters (lower(claim_code))
  where claim_code is not null;


-- ---------------------------------------------------------------------------
-- STEP 2 — APPLIED. Credentials move to their own table.
--
-- WHY: `characters` has RLS enabled but its policies are
--   "Allow all access to characters"  ALL  to public  using(true) with check(true)
--   "anon can read characters"        SELECT to anon   using(true)
-- and the column grants include claim_token/claim_code. The anon key ships to
-- every player's browser, so ANY column on `characters` is effectively public.
--
-- Revoking the two columns instead would break the many `select('*')` calls the
-- dashboard and admin panels make through the anon client. So the secrets move.
-- ---------------------------------------------------------------------------
create table if not exists public.character_secrets (
  character_id uuid primary key references public.characters(id) on delete cascade,
  claim_token  uuid not null default gen_random_uuid(),
  claim_code   text,
  created_at   timestamptz not null default now()
);

create unique index if not exists character_secrets_claim_code_unique
  on public.character_secrets (lower(claim_code))
  where claim_code is not null;

-- RLS on with NO policies at all: anon and authenticated get zero rows, always.
-- The service role bypasses RLS, so the server routes still read it.
alter table public.character_secrets enable row level security;
revoke all on public.character_secrets from anon, authenticated;

insert into public.character_secrets (character_id, claim_token, claim_code)
select id, claim_token, claim_code
from public.characters
where claim_token is not null
on conflict (character_id) do update
  set claim_token = excluded.claim_token,
      claim_code  = excluded.claim_code;

-- New characters get a secrets row automatically, so nothing that creates a
-- character (admin panel, /forge, SQL by hand) has to know this table exists.
create or replace function public.create_character_secrets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.character_secrets (character_id)
  values (new.id)
  on conflict (character_id) do nothing;
  return new;
end;
$$;

drop trigger if exists characters_create_secrets on public.characters;
create trigger characters_create_secrets
  after insert on public.characters
  for each row execute function public.create_character_secrets();


-- ---------------------------------------------------------------------------
-- STEP 3 — *** NOT YET APPLIED. RUN ONLY AFTER THE NEW CODE IS DEPLOYED. ***
--
-- Until this runs, the tokens and codes are still sitting in `characters` where
-- any browser holding the anon key can read them. This is the step that closes it.
--
-- Verify first (should return 30 / 30 / 0):
--   select (select count(*) from characters)        as characters,
--          (select count(*) from character_secrets)  as secrets,
--          (select count(*) from characters c join character_secrets s
--             on s.character_id = c.id
--            where s.claim_token is distinct from c.claim_token) as mismatches;
-- ---------------------------------------------------------------------------
-- drop index if exists public.characters_claim_code_unique;
-- alter table public.characters drop column if exists claim_code;
-- alter table public.characters drop column if exists claim_token;


-- ---------------------------------------------------------------------------
-- Setting or rotating a player's code later
-- ---------------------------------------------------------------------------
-- update character_secrets set claim_code = 'some-three-word-code-123'
--   where character_id = (select id from characters where name = 'Kenta');
--
-- Codes are stored lowercase; the server normalises input before lookup, so
-- capitals, spaces and underscores in what a player types are all forgiven.

