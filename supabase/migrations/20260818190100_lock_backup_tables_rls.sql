-- LOCK BACKUP TABLES RLS (2026-08-18)
-- Nine backup/quarantine tables were created by data operations during the
-- 2026-08-17/18 scene-key and item-key work with RLS disabled, leaving them
-- fully readable AND writable by anyone holding the anon key. This enables
-- RLS with no policies: service-role only, the same pattern as
-- character_secrets, enable_rls_confiscation_backup (20260817022559) and
-- enable_rls_on_backup_tables (20260817075532).
--
-- Guarded with to_regclass because these tables are data artifacts, not
-- schema: on a rebuild from migrations they may not exist, and this file
-- must then be a clean no-op rather than an error.

do $$
declare
  t text;
begin
  foreach t in array array[
    'public.environments_backup_20260817',
    'public.environments_backup_scenekey_20260818',
    'public.environments_quarantine_scenekey',
    'public.items_backup_itemkey_20260818',
    'public.inventory_items_backup_itemkey_20260818',
    'public.equipment_items_backup_itemkey_20260818',
    'public.dashboard_assets_backup_itemkey_20260818',
    'public.npc_asset_url_backup_20260818',
    'public.characters_loop_url_backup_20260818'
  ] loop
    if to_regclass(t) is not null then
      execute format('alter table %s enable row level security', t);
    end if;
  end loop;
end $$;
