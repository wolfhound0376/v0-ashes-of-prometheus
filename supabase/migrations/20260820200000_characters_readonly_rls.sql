-- ============================================================================
-- Step 3 of the 2026-08-20 security pass (Sam's order: revoke, fail-closed,
-- then this).
--
-- ⚠ APPLY ONLY AFTER the code in this PR is deployed. The browser used to
-- write characters directly with the anon key (admin panel, party seating,
-- level-up) and the chat route wrote HP/conditions with the anon server
-- client. This PR moves every one of those writes to the service-role key
-- (/api/dm/characters and createAdminClient in the chat route). Running this
-- migration before that code is live breaks those features.
--
-- What it does: replaces the wide-open "Allow all access to characters"
-- policy (ALL commands, every role, USING true — any anon-key holder could
-- rewrite any character row) with read-only public access. Reads everywhere
-- keep working; writes now require the service-role key.
-- ============================================================================

drop policy if exists "Allow all access to characters" on public.characters;
drop policy if exists "anon can read characters" on public.characters;

create policy "characters are publicly readable" on public.characters
  for select to anon, authenticated using (true);
