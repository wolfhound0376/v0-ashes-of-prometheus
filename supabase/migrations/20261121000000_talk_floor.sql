-- ONE SPEAKER PER CONVERSATION (Sam, 2026-11-20: "Communication should be just like BG3. The principal character
-- communicates, others can watch and even suggest but not directly interact."). Rules: lib/talk-floor.ts.
--
-- One row per NPC who is in a conversation: who holds the floor with them, when their screen last beat, and what the
-- listeners have suggested. Additive: a new table and one function, nothing existing is touched.
-- Read by anyone (the same as dialogue); written only by the server (/api/talk-floor, service role).

create table if not exists public.talk_floor (
  npc         text primary key,                      -- the NPC's name, lowercased (lib/talk-floor.ts floorKey)
  npc_name    text not null,
  speaker     text not null,                         -- characters.name of the hero who holds the floor
  speaker_id  uuid,
  started_at  timestamptz not null default now(),
  beat_at     timestamptz not null default now(),    -- the speaker's screen is still there
  suggestions jsonb not null default '[]'::jsonb     -- [{from, text, at}] from the heroes listening in
);

alter table public.talk_floor enable row level security;
drop policy if exists "talk_floor is readable" on public.talk_floor;
create policy "talk_floor is readable" on public.talk_floor for select to anon, authenticated using (true);

-- Take the floor, or keep it. Atomic, so two screens that reach for the same NPC in the same instant cannot both
-- win: the row is taken only when it is free, already this speaker's, or gone stale. Always answers with the row
-- as it now stands, so the loser learns who holds it.
create or replace function public.talk_floor_claim(p_npc text, p_npc_name text, p_speaker text, p_speaker_id uuid, p_stale_secs integer default 45)
returns public.talk_floor
language plpgsql
security definer
set search_path = public
as $$
declare r public.talk_floor;
begin
  insert into public.talk_floor as f (npc, npc_name, speaker, speaker_id)
  values (p_npc, p_npc_name, p_speaker, p_speaker_id)
  on conflict (npc) do update set
    beat_at     = now(),
    npc_name    = excluded.npc_name,
    started_at  = case when lower(f.speaker) = lower(excluded.speaker) then f.started_at else now() end,
    suggestions = case when lower(f.speaker) = lower(excluded.speaker) then f.suggestions else '[]'::jsonb end,
    speaker_id  = excluded.speaker_id,
    speaker     = excluded.speaker
  where lower(f.speaker) = lower(excluded.speaker) or f.beat_at < now() - make_interval(secs => p_stale_secs)
  returning f.* into r;
  if r.npc is null then select * into r from public.talk_floor where npc = p_npc; end if;
  return r;
end $$;

revoke all on function public.talk_floor_claim(text, text, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.talk_floor_claim(text, text, text, uuid, integer) to service_role;
