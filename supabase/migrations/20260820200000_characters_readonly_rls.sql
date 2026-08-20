-- ============================================================================
-- Step 3 of the 2026-08-20 security pass (Sam's order: revoke, fail-closed,
-- then this).
--
-- ⚠ APPLY ONLY AFTER the code in PR #169 is deployed. The browser used to
-- write characters directly with the anon key (admin panel, party seating,
-- level-up) and the chat route wrote HP/XP/conditions with the anon server
-- client. The PR moves every one of those writes to the service-role key
-- (/api/dm/characters and createAdminClient in the chat route). Running this
-- migration before that code is live breaks those features.
--
-- What it does: replaces the wide-open "Allow all access to characters"
-- policy (ALL commands, every role, USING true — any anon-key holder could
-- rewrite any character row: level, ability scores, HP) with read-only
-- public access. Reads everywhere keep working, including realtime, which
-- delivers a row only to subscribers whose role passes a SELECT policy;
-- writes now require the service-role key, which bypasses RLS.
--
-- Per project rule, enabling row level security and creating the read policy
-- happen in the same block, so no ordering of statements can leave the table
-- enabled-but-unreadable or readable-but-unenabled.
-- ============================================================================

do $$
begin
  alter table public.characters enable row level security;

  drop policy if exists "Allow all access to characters" on public.characters;
  drop policy if exists "anon can read characters" on public.characters;

  create policy "characters are publicly readable" on public.characters
    for select to anon, authenticated using (true);
end $$;

-- Belt and braces: with no write policy the anon/authenticated roles already
-- cannot write, but removing the underlying table grants means even a future
-- accidentally-permissive policy cannot reopen writes without also restoring
-- a grant. The service role keeps its own grants and bypasses RLS.
revoke insert, update, delete, truncate on public.characters from anon, authenticated;
