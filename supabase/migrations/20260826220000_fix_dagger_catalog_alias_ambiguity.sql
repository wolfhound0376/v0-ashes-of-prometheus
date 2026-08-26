-- Remove the ordinary "dagger" lookup key from the distinct obsidian-flake
-- weapon and repair any inventory links created while that alias was present.
--
-- Live audit on 2026-08-26:
--   * one canonical items row exists with item_key = 'dagger'
--   * five inventory rows named Dagger already point to it
--   * Obsidian flake dagger still lists "dagger" as an alias
--
-- item_catalog_lookup emits one row per normalized name/asset_name/alias key.
-- Leaving the alias in place makes two catalog rows compete for the same
-- 'dagger' key, with updated_at acting as an accidental tie-breaker. This
-- migration makes the distinction explicit and is safe to run repeatedly.

begin;

do $$
declare
  canonical_dagger_count integer;
begin
  select count(*)
    into canonical_dagger_count
    from public.items
   where item_key = 'dagger';

  if canonical_dagger_count <> 1 then
    raise exception
      'Expected exactly one canonical dagger catalog row; found %',
      canonical_dagger_count;
  end if;
end
$$;

update public.items as item
   set aliases = coalesce(
         (
           select array_agg(alias.value order by alias.ordinality)
             from unnest(item.aliases) with ordinality as alias(value, ordinality)
            where public.item_key(alias.value) <> 'dagger'
         ),
         '{}'::text[]
       ),
       updated_at = now()
 where item.item_key = 'obsidian-flake-dagger'
   and exists (
         select 1
           from unnest(item.aliases) as alias(value)
          where public.item_key(alias.value) = 'dagger'
       );

update public.inventory_items as inventory
   set item_id = dagger.id,
       updated_at = now()
  from public.items as dagger
 where dagger.item_key = 'dagger'
   and inventory.item_key = 'dagger'
   and inventory.item_id is distinct from dagger.id;

commit;

-- Post-run verification (expected: zero rows):
-- select item_key, catalog_id, catalog_name
--   from public.item_catalog_lookup
--  where item_key = 'dagger'
--    and catalog_name <> 'Dagger';
--
-- select id, name, item_key, item_id
--   from public.inventory_items
--  where item_key = 'dagger'
--    and item_id is distinct from (
--          select id from public.items where item_key = 'dagger'
--        );
