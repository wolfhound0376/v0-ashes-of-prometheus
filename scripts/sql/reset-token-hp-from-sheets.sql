-- Reconcile player token HP with the character sheets.
--
-- WHY THIS EXISTS
--
-- Until the change in this PR, a resolved cast wrote hp_current to
-- vtt_tokens and nowhere else. `characters` never heard about it. So the
-- board and the sheets drifted apart, and because every surface a player
-- looks at — the plates, the life globe, the character sheet overlay —
-- reads `characters`, the drift was invisible at the table.
--
-- On 2026-08-29 the live board held:
--
--     Samson   token 2/9   sheet 9/9
--     Fifi     token 3/8   sheet 8/8
--     Scott    token 3/9   sheet 9/9
--     Kenta    token 0/8   sheet 8/8      <- unconscious, per the board
--
-- The sheets win. All four token values were written by `player-cast`
-- within a single day of board testing, the surviving narration log shows
-- only Samson and Kenta casting at each other, and there is no "goes down"
-- line for Kenta anywhere. They are scratch values from testing the cast
-- path, not a record of played sessions, and no player ever saw them.
--
-- Carrying them forward would open the next session with a character
-- unconscious for reasons nobody can point to.
--
-- NOT a migration: this is a one-off repair, kept here so the reasoning is
-- reviewable rather than executed silently in the SQL editor. Run it once,
-- against the active board, after this PR merges.

-- ---------------------------------------------------------------------------
-- 1. Look before you write. Run this alone first and read the output.
-- ---------------------------------------------------------------------------
select
  t.label,
  t.hp_current   as token_hp,
  t.hp_max       as token_hp_max,
  c.hp_current   as sheet_hp,
  c.hp_max       as sheet_hp_max,
  t.updated_by,
  t.updated_at
from vtt_tokens t
join characters c on c.id = t.character_id
where t.character_id is not null
  and t.hp_current is distinct from c.hp_current
order by t.label;

-- ---------------------------------------------------------------------------
-- 2. The repair. Only rows that actually disagree are touched, and only
--    player tokens — NPC tokens carry their own HP and have no sheet.
-- ---------------------------------------------------------------------------
update vtt_tokens t
set hp_current = c.hp_current,
    hp_max     = coalesce(c.hp_max, t.hp_max),
    updated_by = 'hp-resync',
    updated_at = now()
from characters c
where c.id = t.character_id
  and t.character_id is not null
  and t.hp_current is distinct from c.hp_current;

-- ---------------------------------------------------------------------------
-- 3. Verify. Should return zero rows.
-- ---------------------------------------------------------------------------
select t.label, t.hp_current as token_hp, c.hp_current as sheet_hp
from vtt_tokens t
join characters c on c.id = t.character_id
where t.character_id is not null
  and t.hp_current is distinct from c.hp_current;
