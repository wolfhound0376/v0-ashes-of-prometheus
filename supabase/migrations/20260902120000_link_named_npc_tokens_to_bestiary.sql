-- Link named NPC tokens to the stat block of the same name.
--
-- The Velkynvelve prisoners — Ront, Eldeth Feldrun, Prince Derendil, Sarith
-- Kzekarit and the rest — each have their own row in `bestiary`, with hit
-- points, AC and attacks copied from the book. Their tokens were placed with
-- `bestiary_id` NULL, so on the board they had hit points but no stat block:
-- the NPC turn found no attacks to parse and narrated "has no attack it knows
-- how to make" every round.
--
-- Data only. No schema change. Idempotent: a token that already points at a
-- stat block is left alone, and a PC token (character_id set) is never
-- touched — a player's numbers come from the sheet, not the bestiary.
--
-- Matched on an exact, case-insensitive name so a token labelled "Drow" does
-- not silently become a Drow Elite Warrior. On 2026-09-02 this links ten
-- tokens, all on the Velkynvelve map, all to the row bearing their own name.
update public.vtt_tokens t
   set bestiary_id = b.id,
       updated_at  = now()
  from public.bestiary b
 where t.bestiary_id  is null
   and t.character_id is null
   and lower(t.label) = lower(b.name);
