-- campaign_runs.game_context — where the party actually is, in the state
-- machine's terms (lib/game-context.ts: overworld | exploration | combat | camp).
--
-- The machine has existed since 2026-09-25 and has never been persisted, so
-- `applyTransition` had nothing to validate against. Lane C calls it when the
-- party enters a great place (/api/travel action "enter"); this column is where
-- the answer is remembered.
--
-- Paste into Supabase -> SQL Editor. Does not run on deploy. Read best-effort:
-- without it the edge is still validated, just not remembered across requests.

alter table public.campaign_runs
  add column if not exists game_context text not null default 'overworld'
  check (game_context in ('overworld','exploration','combat','camp'));

-- The Shrine of Ibrandul's node is a road marker (road-05), so its painted
-- entrance plate cannot be derived from the node key. Name it explicitly; the
-- other seven plates are named after their own nodes.
update public.travel_nodes
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('entrance_plate', 'shrine-of-ibrandul')
 where node_key = 'road-05';

-- Check it took:
--   select id, status, game_context from public.campaign_runs;
--   select node_key, metadata->>'entrance_plate' from public.travel_nodes where node_key='road-05';
