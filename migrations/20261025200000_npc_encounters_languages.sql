-- npc_encounters.languages — the tongues a named NPC speaks (lib/npc-languages.ts).
-- SCHEMA CHANGE: one nullable text column. Same comma format as characters.languages
-- and bestiary.languages ("Elvish, Undercommon"; "—" = none). Read by the server only
-- (service role), so no new RLS policy is needed; the table's existing policies apply.
--
-- Why an own column rather than the bestiary link: several named NPCs point at the wrong
-- bestiary row (Eldeth → deep-gnome, Topsy/Turvy → quaggoth), and npc_encounters.character_id
-- is the PLAYER who met them, not the NPC's sheet. Until this column exists the language
-- system is dormant and scrambles nothing.

alter table public.npc_encounters add column if not exists languages text;

-- SOURCED: OotA ch.1 "Prisoners of the Drow" (campaign_chunks 1176) — "only Eldeth and Jimjar
-- speak fluent Common. The others speak Undercommon (or at least understand it). Ront knows some
-- Common, while Derendil speaks Elvish. Stool's rapport spores ... allow everyone to speak freely."
-- The race tongues beside it are each creature's MM/SRD stat block (drow, deep gnome, derro,
-- kuo-toa, orc). Eldeth's Dwarvish is her race (her sheet is the MM Scout, "any one language").
update public.npc_encounters set languages = 'Common, Dwarvish'                          where name = 'Eldeth Feldrun';
update public.npc_encounters set languages = 'Common, Gnomish, Terran, Undercommon'      where name = 'Jimjar';
update public.npc_encounters set languages = 'Gnomish, Terran, Undercommon'             where name in ('Topsy', 'Turvy');
update public.npc_encounters set languages = 'Common, Orc, Undercommon'                 where name = 'Ront';
update public.npc_encounters set languages = 'Elvish, Undercommon'                      where name = 'Prince Derendil';
update public.npc_encounters set languages = 'Dwarvish, Undercommon'                    where name = 'Buppido';
update public.npc_encounters set languages = 'Undercommon'                              where name = 'Shuushar the Awakened';
update public.npc_encounters set languages = '—'                                        where name = 'Stool';   -- rapport spores: telepathic, never scrambled
update public.npc_encounters set languages = 'Elvish, Undercommon'
  where name in ('Sarith Kzekarit', 'Jorlan Duskryn', 'Ilvara Mizzrym', 'Shoor Vandree', 'Asha Vandree', 'Drow Guard');
-- SAM'S RULING (The Drow Surgeon, 2026-10-25): Liana speaks only Elvish.
update public.npc_encounters set languages = 'Elvish'                                   where name = 'Liana';
