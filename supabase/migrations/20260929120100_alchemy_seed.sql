-- =====================================================================
-- Alchemy seed: the 22 effects and the 28-ingredient grid.
-- Run AFTER 20260929120000_alchemy_schema.sql.
--
-- The grid is the one validated by scripts/alchemy/grid_check.py. Do not
-- hand-edit it here -- edit the script, re-run it until it says PASS, and
-- regenerate this file. The constraints it enforces (no effect on fewer
-- than 2 ingredients, no pair sharing 3+, nothing on more than 7) are what
-- stop the grid collapsing back into "every mushroom is food".
--
-- Idempotent: safe to run twice.
-- =====================================================================

begin;

insert into alchemy_effects (slug, name, category, summary, is_harmful) values
  ('burning-blood', 'Burning Blood', 'harmful', 'Fire damage.', true),
  ('confuse', 'Confuse', 'harmful', 'As the confusion effect, briefly.', true),
  ('corrode', 'Corrode', 'harmful', 'Acid damage; damages metal.', true),
  ('darksight', 'Darksight', 'sensory', 'Darkvision, or extends existing darkvision.', false),
  ('inner-light', 'Inner Light', 'sensory', 'The drinker sheds light. Also disadvantage on Stealth -- this one cuts both ways.', false),
  ('iron-stomach', 'Iron Stomach', 'restorative', 'Advantage on Constitution saves against anything swallowed.', false),
  ('keen-scent', 'Keen Scent', 'sensory', 'Advantage on Perception and tracking by smell.', false),
  ('long-march', 'Long March', 'restorative', 'Removes one level of exhaustion, or ignores a day''s travel fatigue.', false),
  ('mind-link', 'Mind Link', 'sensory', 'Brief telepathy with one willing creature.', false),
  ('numbing-venom', 'Numbing Venom', 'harmful', 'Poison damage.', true),
  ('purge-disease', 'Purge Disease', 'restorative', 'Ends one disease.', false),
  ('resist-poison', 'Resist Poison', 'restorative', 'Advantage on saving throws against poison.', false),
  ('restore-health', 'Restore Health', 'restorative', 'Hit points back. The prize, deliberately scarce.', false),
  ('rot', 'Rot', 'harmful', 'Necrotic damage.', true),
  ('seize', 'Seize', 'harmful', 'Restrained, then paralyzed, on successive failed saves.', true),
  ('shrink', 'Shrink', 'strange', 'As reduce (SRD).', false),
  ('sicken', 'Sicken', 'harmful', 'The poisoned condition on a failed save.', true),
  ('silver-tongue', 'Silver Tongue', 'sensory', 'Advantage on Charisma checks.', false),
  ('soft-step', 'Soft Step', 'sensory', 'Advantage on Stealth.', false),
  ('steady-nerve', 'Steady Nerve', 'restorative', 'Advantage on saves against being frightened.', false),
  ('swell', 'Swell', 'strange', 'As enlarge (SRD).', false),
  ('wakefulness', 'Wakefulness', 'restorative', 'No sleep needed; advantage against magical sleep.', false)
on conflict (slug) do update set
  name = excluded.name, category = excluded.category,
  summary = excluded.summary, is_harmful = excluded.is_harmful,
  updated_at = now();

-- The grid. Ordered, index 0 is what tasting reveals.
update items set alchemy_effects = '["purge-disease", "resist-poison", "restore-health", "iron-stomach"]'::jsonb where slug = 'barrelstalk';
update items set alchemy_effects = '["swell", "iron-stomach", "burning-blood", "confuse"]'::jsonb where slug = 'bigwig';
update items set alchemy_effects = '["darksight", "resist-poison", "soft-step", "mind-link"]'::jsonb where slug = 'blind-cave-fish';
update items set alchemy_effects = '["sicken", "long-march", "purge-disease", "steady-nerve"]'::jsonb where slug = 'bluecap';
update items set alchemy_effects = '["seize", "keen-scent", "rot", "numbing-venom"]'::jsonb where slug = 'carrion-crawler-mucus';
update items set alchemy_effects = '["wakefulness", "soft-step", "steady-nerve", "iron-stomach"]'::jsonb where slug = 'cave-cricket-skewer';
update items set alchemy_effects = '["soft-step", "long-march", "wakefulness", "keen-scent"]'::jsonb where slug = 'cavern-lizard-meat';
update items set alchemy_effects = '["long-march", "purge-disease", "wakefulness", "iron-stomach"]'::jsonb where slug = 'deep-rothe-jerky';
update items set alchemy_effects = '["restore-health", "iron-stomach", "sicken", "steady-nerve"]'::jsonb where slug = 'deep-rothe-milk';
update items set alchemy_effects = '["sicken", "rot", "confuse", "restore-health"]'::jsonb where slug = 'edible-mushrooms';
update items set alchemy_effects = '["burning-blood", "steady-nerve", "resist-poison", "wakefulness"]'::jsonb where slug = 'fire-lichen';
update items set alchemy_effects = '["iron-stomach", "rot", "long-march", "sicken"]'::jsonb where slug = 'fried-grubs';
update items set alchemy_effects = '["corrode", "numbing-venom", "rot", "sicken"]'::jsonb where slug = 'gray-ooze-residue';
update items set alchemy_effects = '["inner-light", "keen-scent", "steady-nerve", "darksight"]'::jsonb where slug = 'nightlight-fungus';
update items set alchemy_effects = '["keen-scent", "confuse", "darksight", "soft-step"]'::jsonb where slug = 'nilhoggs-nose';
update items set alchemy_effects = '["inner-light", "silver-tongue", "mind-link", "wakefulness"]'::jsonb where slug = 'ormu-ink-vial';
update items set alchemy_effects = '["inner-light", "resist-poison", "restore-health", "burning-blood"]'::jsonb where slug = 'ormu-moss';
update items set alchemy_effects = '["shrink", "confuse", "silver-tongue", "keen-scent"]'::jsonb where slug = 'pygmywort';
update items set alchemy_effects = '["restore-health", "rot", "long-march", "purge-disease"]'::jsonb where slug = 'ripplebark';
update items set alchemy_effects = '["long-march", "steady-nerve", "restore-health", "wakefulness"]'::jsonb where slug = 'sporebread-loaf';
update items set alchemy_effects = '["rot", "seize", "mind-link", "swell"]'::jsonb where slug = 'tainted-spores-pouch';
update items set alchemy_effects = '["confuse", "sicken", "shrink", "seize"]'::jsonb where slug = 'timmask';
update items set alchemy_effects = '["silver-tongue", "mind-link", "sicken", "confuse"]'::jsonb where slug = 'tongue-of-madness';
update items set alchemy_effects = '["burning-blood", "wakefulness", "inner-light", "corrode"]'::jsonb where slug = 'torchstalk';
update items set alchemy_effects = '["soft-step", "resist-poison", "purge-disease", "long-march"]'::jsonb where slug = 'trillimac';
update items set alchemy_effects = '["mind-link", "soft-step", "silver-tongue", "keen-scent"]'::jsonb where slug = 'vial-of-rapport-spores';
update items set alchemy_effects = '["purge-disease", "shrink", "soft-step", "iron-stomach"]'::jsonb where slug = 'waterorb';
update items set alchemy_effects = '["swell", "steady-nerve", "resist-poison", "restore-health"]'::jsonb where slug = 'zurkhwood';

commit;

-- ---------------------------------------------------------------------
-- Verification. Run these after; all three should come back clean.
-- ---------------------------------------------------------------------

-- 1. 28 ingredients carry a grid, and every slug above matched a real row.
--    Expect: 28.
-- select count(*) from items where alchemy_effects is not null;

-- 2. Every effect named in the grid exists in the vocabulary.
--    Expect: 0 rows.
-- select distinct e from items, jsonb_array_elements_text(alchemy_effects) e
--  where alchemy_effects is not null
--    and e not in (select slug from alchemy_effects);

-- 3. Every effect is reachable -- it must sit on 2+ ingredients or no brew
--    can ever produce it. Expect: 0 rows.
-- select e, count(*) from items, jsonb_array_elements_text(alchemy_effects) e
--  where alchemy_effects is not null group by e having count(*) < 2;
