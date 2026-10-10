-- Darklake encounter tables, transcribed from Out of the Abyss - D&D Encounters,
-- ch.3 (The Darklake). Applied to production 2026-10-10 via execute_sql; kept
-- here so the data has a home in the repo.
--
-- "Every 4 hours that the characters are on the Darklake, roll a d20 and
-- consult the Darklake Random Encounters table."
--
-- The Darklake Terrain Encounters table (d10) is NOT transcribed: the indexed
-- copy of the book carries only some of its rows. Terrain results therefore
-- tell the DM to roll it by hand rather than invent the missing rows.

insert into encounter_tables (table_key, die, title, source) values
 ('darklake_random', 20, 'Darklake Random Encounters', 'Out of the Abyss — D&D Encounters, ch.3 (The Darklake)'),
 ('darklake_creature', 12, 'Darklake Creature Encounters', 'Out of the Abyss — D&D Encounters, ch.3 (The Darklake)');

insert into encounter_table_rows (table_key, roll_min, roll_max, result, detail) values
 ('darklake_random',1,13,'No encounter','{"rolls":[]}'),
 ('darklake_random',14,15,'Terrain (roll a d10 on the Darklake Terrain Encounters table)','{"rolls":[]}'),
 ('darklake_random',16,17,'One or more creatures','{"rolls":["darklake_creature"]}'),
 ('darklake_random',18,20,'Terrain encounter featuring one or more creatures (roll a d10 on the Darklake Terrain Encounters table)','{"rolls":["darklake_creature"]}'),
 ('darklake_creature',1,1,'1 aquatic troll','{}'),
 ('darklake_creature',2,2,'2d4 darkmantles','{}'),
 ('darklake_creature',3,3,'1d4 + 2 duergar in a keelboat','{}'),
 ('darklake_creature',4,4,'1 green hag','{"bestiary":"Green Hag"}'),
 ('darklake_creature',5,5,'1 grell','{"bestiary":"Grell"}'),
 ('darklake_creature',6,7,'1d6 + 2 ixitxachitl (see appendix C)','{"bestiary":"Ixitxachitl"}'),
 ('darklake_creature',8,8,'1d4 kuo-toa in a keelboat','{"bestiary":"Kuo-toa"}'),
 ('darklake_creature',9,9,'1d4 merrow','{}'),
 ('darklake_creature',10,10,'3d6 stirges','{}'),
 ('darklake_creature',11,11,'1 swarm of quippers','{}'),
 ('darklake_creature',12,12,'1 water weird','{}');
