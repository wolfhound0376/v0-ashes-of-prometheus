-- ITEM KEY REGISTRY + ICON RESOLVER (2026-08-18)
-- Applied to production 2026-08-18. Companion to the scene_key registry:
-- display names are for humans, machines join on a slug from ONE function.
--
-- Problem: uploaded item art lived in items.icon_url and dashboard_assets
-- while the UI read only inventory_items.icon_url — NULL on all 53 rows.
-- The art was never wrong; nothing ever joined it.
--
-- Parentheticals are deliberately KEPT: "Gaming Set (Cards)" and
-- "Gaming Set (Dice)" are different items, so the key must tell them apart.

create or replace function public.item_key(p_name text)
returns text language sql immutable set search_path to 'public' as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ),
  '');
$$;

alter table public.items            add column if not exists item_key text;
alter table public.inventory_items  add column if not exists item_key text;
alter table public.equipment_items  add column if not exists item_key text;
alter table public.dashboard_assets add column if not exists item_key text;

create or replace function public.set_item_key_from_name()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.item_key := public.item_key(new.name);
  return new;
end $$;

drop trigger if exists trg_items_item_key on public.items;
create trigger trg_items_item_key before insert or update of name
  on public.items for each row execute function public.set_item_key_from_name();

drop trigger if exists trg_inventory_items_item_key on public.inventory_items;
create trigger trg_inventory_items_item_key before insert or update of name
  on public.inventory_items for each row execute function public.set_item_key_from_name();

drop trigger if exists trg_equipment_items_item_key on public.equipment_items;
create trigger trg_equipment_items_item_key before insert or update of name
  on public.equipment_items for each row execute function public.set_item_key_from_name();

drop trigger if exists trg_dashboard_assets_item_key on public.dashboard_assets;
create trigger trg_dashboard_assets_item_key before insert or update of name
  on public.dashboard_assets for each row execute function public.set_item_key_from_name();

update public.items            set item_key = public.item_key(name);
update public.inventory_items  set item_key = public.item_key(name);
update public.equipment_items  set item_key = public.item_key(name);
update public.dashboard_assets set item_key = public.item_key(name);

create index if not exists items_item_key_idx            on public.items (item_key);
create index if not exists inventory_items_item_key_idx  on public.inventory_items (item_key);
create index if not exists equipment_items_item_key_idx  on public.equipment_items (item_key);
create index if not exists dashboard_assets_item_key_idx on public.dashboard_assets (item_key);

-- Catalogue lookup: key OR alias OR asset_name. The aliases[] and asset_name
-- columns already existed and were unused — this is what finally reads them.
create or replace view public.item_catalog_lookup
with (security_invoker = true) as
  select distinct on (k.key)
         k.key as item_key, i.id as catalog_id, i.name as catalog_name,
         i.icon_url as catalog_icon_url, i.item_type as catalog_item_type,
         i.equippable_slot as catalog_equippable_slot
  from public.items i
  cross join lateral (
    select public.item_key(i.name) as key
    union select public.item_key(i.asset_name) where i.asset_name is not null
    union select public.item_key(a) from unnest(coalesce(i.aliases, '{}')) as a
  ) k
  where k.key is not null
  order by k.key, (i.icon_url is not null) desc, i.updated_at desc nulls last;

create or replace view public.item_asset_lookup
with (security_invoker = true) as
  select distinct on (item_key)
         item_key, file_url as asset_icon_url, name as asset_name
  from public.dashboard_assets
  where asset_type in ('item_icon', 'icon') and file_url is not null and item_key is not null
  order by item_key, updated_at desc nulls last, created_at desc;

-- THE RESOLVER. Four tiers, first hit wins. A null result is a genuine
-- "no art exists yet" — the UI draws a type silhouette, never a broken image.
create or replace view public.inventory_items_resolved
with (security_invoker = true) as
  select ii.*,
         coalesce(ii.icon_url, direct.icon_url, cat.catalog_icon_url, ast.asset_icon_url) as resolved_icon_url,
         case
           when ii.icon_url          is not null then 'row'
           when direct.icon_url      is not null then 'catalog_link'
           when cat.catalog_icon_url is not null then 'catalog_key'
           when ast.asset_icon_url   is not null then 'asset_library'
           else 'none'
         end as icon_source,
         coalesce(ii.item_type, direct.item_type, cat.catalog_item_type) as resolved_item_type
  from public.inventory_items ii
  left join public.items               direct on direct.id = ii.item_id
  left join public.item_catalog_lookup cat    on cat.item_key = ii.item_key
  left join public.item_asset_lookup   ast    on ast.item_key = ii.item_key;

create or replace view public.equipment_items_resolved
with (security_invoker = true) as
  select ei.*,
         coalesce(ei.icon_url, cat.catalog_icon_url, ast.asset_icon_url) as resolved_icon_url,
         case
           when ei.icon_url          is not null then 'row'
           when cat.catalog_icon_url is not null then 'catalog_key'
           when ast.asset_icon_url   is not null then 'asset_library'
           else 'none'
         end as icon_source,
         cat.catalog_item_type as resolved_item_type
  from public.equipment_items ei
  left join public.item_catalog_lookup cat on cat.item_key = ei.item_key
  left join public.item_asset_lookup   ast on ast.item_key = ei.item_key;

grant select on public.item_catalog_lookup      to anon, authenticated;
grant select on public.item_asset_lookup        to anon, authenticated;
grant select on public.inventory_items_resolved to anon, authenticated;
grant select on public.equipment_items_resolved to anon, authenticated;

-- Repair the real links where the key/alias identifies a catalogue entry.
update public.inventory_items ii
   set item_id = cat.catalog_id
  from public.item_catalog_lookup cat
 where ii.item_id is null and cat.item_key = ii.item_key;

-- Gap report: what players actually carry that still has no art.
create or replace view public.item_icon_gaps
with (security_invoker = true) as
  select item_key, min(name) as example_name, count(*) as rows_wanting_icon
  from public.inventory_items_resolved
  where resolved_icon_url is null
  group by item_key
  order by count(*) desc, min(name);

grant select on public.item_icon_gaps to anon, authenticated;
