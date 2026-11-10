-- ITEM HISTORY, step 1 of claude/Item_Identity_Design_2026-11-10.md (Sam, 2026-11-10: "go with recommendation").
--
-- item_events was built for CONDITION changes only: its kind check allows degrade, maintain, mend, repair, upgrade,
-- break, destroy, salvage. An item's history also needs where it came from and whose hands it passed through, so this
-- widens the check with five movement kinds. Nothing else changes: no column, no row, no policy.
--
--   acquire  taken out of a chest, off a body, out of a pocket, or back from the confiscation stash
--   pickup   picked up off the floor
--   give     handed from one character to another (detail.from / detail.to)
--   drop     put down or thrown (only recorded while the row survives: part of a stack)
--   consume  one used off a stack (drunk, eaten, thrown)
--
-- SAFE TO RUN TWICE. Until it is run, /api/walk-loot and /api/walk-items try to write these kinds, the check refuses
-- them, and the routes carry on (lib/item-history.ts is best effort): the game is unaffected, the history just stays empty.
--
-- Precheck (expect 0 rows today, and no kind outside the list):
--   select kind, count(*) from public.item_events group by 1;

alter table public.item_events drop constraint if exists item_events_kind_check;
alter table public.item_events add constraint item_events_kind_check check (kind = any (array[
  'degrade', 'maintain', 'mend', 'repair', 'upgrade', 'break', 'destroy', 'salvage',
  'acquire', 'pickup', 'give', 'drop', 'consume'
]));
