-- DRAFT — Road Marker 09: the dive. Sam's numbers needed before this is applied.
--
-- The first authored node option, written to exercise the options card. Every
-- FACT here already exists in travel_nodes; only the DC, the hour and the prose
-- are new, and all three are homebrew:
--
--   road-09    "A dead-end ledge below Velkynvelve with a glowing pool fed by
--               the falls."
--   pool-cave  "An air pocket and passage beneath the glowing pool at Road
--               Marker 09. Reached only by diving. Contents: Sam to decide."
--
-- So the option reveals a node that already says it is reached by diving. What
-- is INSIDE the cave is still "Sam to decide" — nothing here invents it.
--
-- SAM SETS THESE THREE (the proposals are a starting point, not a ruling):
--   check.dc   12   — Athletics, a cold deep dive, nothing chasing them
--   cost.hours  1   — swimming down, looking, coming back up
--   hidden_until_noticed  false — the pool is plainly there; it is what is
--                   UNDER it that is hidden, and the dive is how you find out.
--                   Set true instead if the party should need the passive roll
--                   to even think of diving.
--
-- Paste into Supabase -> SQL Editor once the numbers are settled.

insert into public.travel_node_events (node_id, kind, title, body, payload, fires_once, priority)
select id, 'authored', 'The glowing pool',
       'The falls feed a pool at the end of the ledge, lit from somewhere below.',
       jsonb_build_object(
         'options', jsonb_build_array(
           jsonb_build_object(
             'key', 'dive',
             'label', 'Dive into the pool',
             'detail', 'The glow does not come from the surface.',
             'cost', jsonb_build_object('hours', 1),
             'check', jsonb_build_object('skill', 'athletics', 'dc', 12),
             'hidden_until_noticed', false,
             'outcome', jsonb_build_object(
               'success', 'Below the cold there is a gap in the rock, and above it air. The pool has a cave under it.',
               'failure', 'The cold drives them back up with nothing but the taste of the falls.',
               'reveals', 'pool-cave'
             )
           )
         )
       ),
       false, 10
  from public.travel_nodes where node_key = 'road-09';

-- Check it took:
--   select n.node_key, e.title, jsonb_pretty(e.payload)
--     from public.travel_node_events e join public.travel_nodes n on n.id = e.node_id;
