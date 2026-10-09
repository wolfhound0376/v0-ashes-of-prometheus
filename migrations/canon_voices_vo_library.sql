-- Canon voices = the VO library (lib/data/vo-manifest.json). Sam, 2026-10-09.
-- DATA ONLY, no schema change. Already applied to the live project by the
-- session that wrote it; kept here as the record and the rollback.
--
-- Why rows and not just code: /api/npc-tts uses npc_encounters.voice_id when it
-- is set, ahead of NAMED_NPC_VOICES in lib/tts.ts. Every named NPC already had
-- a voice_id from earlier backfills, so changing the code alone changed nothing.

update npc_encounters set voice_id = 'ROkSP7oeR0SRS2aHJXMo' where name = 'Ilvara Mizzrym';
update npc_encounters set voice_id = 'FCYF8vBfwu11whOhvb94' where name = 'Asha Vandree';
update npc_encounters set voice_id = 'cYFZSlrM2dt21SlCIokN' where name = 'Shoor Vandree';
update npc_encounters set voice_id = 'cymHWdiF8WjUCg6vvFxx' where name = 'Jorlan Duskryn';
update npc_encounters set voice_id = 'DGzg6RaUqxGRTHSBjfgF' where name = 'Drow Guard';
update npc_encounters set voice_id = 'QzD8JR9v8A4kqCDL8XD4' where name = 'Ront';
update npc_encounters set voice_id = 'ouL9IsyrSnUkCmfnD02u' where name = 'Buppido';
update npc_encounters set voice_id = 'MjEQaRiSe6jP1b0vagRU' where name = 'Jimjar';
update npc_encounters set voice_id = 'YHcCpa6SBWnKDaCPZJQR' where name = 'Eldeth Feldrun';
update npc_encounters set voice_id = 'M5E055lOUxMi0kJpGyE9' where name = 'Sarith Kzekarit';
update npc_encounters set voice_id = 'OKqOM06abBsLyb8k3fXw' where name = 'Shuushar the Awakened';
update npc_encounters set voice_id = 'jhBzyKbsdeM6F66SZCaK' where name = 'Prince Derendil';
update npc_encounters set voice_id = 'fjgAVa6FpNYGo4UpjqML' where name = 'Stool';
update npc_encounters set voice_id = 'acrqYoDVmcpJemOxjC39' where name = 'Malachar';
update npc_encounters set voice_id = '9k8qSCg5OCUsf7lkNEc8' where name = 'Topsy';
update npc_encounters set voice_id = 'PpgkkvljpSnwEaGm6ybH' where name = 'Turvy';

update characters set voice_id = 'xHxp1c5pQOzhWjBqV78M' where id = 'be060806-9938-4afd-9cf6-ad298d9eaa97'; -- Samson
update characters set voice_id = 'Qgg2Tb3UNSkQVZcrV4H0' where id = '51e4202d-b4d5-4658-a9c1-6102713e77f1'; -- Kenta
update characters set voice_id = 'o9B86nZP8mMLaT5FBEzP' where id = 'd00aa5b8-ced1-477d-9ec8-0861cca55498'; -- Fifi
update characters set voice_id = 'jiJOsq5SEyngSDmtW0UP' where id = '88cc9dd1-b0fe-4e62-9829-f84aafe3c066'; -- Scott

-- ROLLBACK — the values these rows held before (measured 2026-10-09):
-- Ilvara Qbw4VpyUrHEG7NigKzty · Asha fgDJOgmENIR82PueQrVs · Shoor SOYHLrjzK2X1ezoPC6cr
-- Jorlan IKne3meq5aSn9XLyUdCD · Drow Guard ttNi9wVM8M97tsxE7PFZ · Ront HPNUUUFNQiMEJN5oqMLX
-- Buppido PpgkkvljpSnwEaGm6ybH · Jimjar JBFqnCBsd6RMkjVDRZzb · Eldeth yZt09SSNiK1Vhjbf8Peq
-- Sarith cjVigY5qzO86Huf0OWal · Shuushar nPczCjzI2devNBz1zQrb · Derendil JwgGi9aLSpBIW7pVE2A8
-- Stool EXAVITQu4vr4xnSDxMaL · Malachar NULL · Topsy w03vWgAq1QMOM3DaeWzB · Turvy 21m00Tcm4TlvDq8ikWAM
-- Samson uIyyEzVnE1YV2AEF55B7 · Kenta CmPJSgS8eysQjjc65BUe · Fifi 18wg9KD0IXuWezuJNyJV
-- Scott xe2eWMCGG8JtZEOkNNhG
