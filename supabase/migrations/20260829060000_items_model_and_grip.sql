-- WEAPONS ON THE RIG.
--
-- Two columns so an item can appear in a character's hand on the battle board.
--
--   model_url  the GLB to attach. NULL means "no art yet" and the board draws
--              a proxy of the right archetype instead -- so the system works
--              before a single model exists, and improves item by item.
--
--   grip       where it sits in the fist: { pos:[x,y,z], rot:[x,y,z], scale }.
--              A model's origin is almost never its grip -- a sword is modelled
--              from the hilt, a spear from its butt -- and every model differs,
--              so this is per item rather than assumed. NULL falls back to the
--              archetype default in lib/equipment.ts.
--
-- Scale is RELATIVE to the board: characters are normalised so a six-foot
-- figure is 1.2 units, which makes 1.0 roughly a metre of weapon.
alter table items add column if not exists model_url text;
alter table items add column if not exists grip jsonb;

comment on column items.model_url is
  'GLB attached to the hand bone on the battle board. NULL = draw an archetype proxy.';
comment on column items.grip is
  'Fist transform: {pos:[x,y,z], rot:[x,y,z], scale}. NULL = archetype default.';
