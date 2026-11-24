-- Ormu eaten raw heals 1d4 (Sam, 2026-11-23: "Eating ormu moss heals 1d4 and later a potion does better.").
-- Additive: one key on the catalogue row's properties, nothing else changes. The walk reads it
-- (template.html useOf / eatHealOf; /api/walk-loot "eat" refuses anything without it).
update items
set properties = coalesce(properties, '{}'::jsonb)
  || jsonb_build_object('eat_heal', '1d4', 'eat_heal_source', 'Sam 2026-11-23: eating ormu moss heals 1d4; a potion of healing does better')
where slug = 'ormu-moss';
