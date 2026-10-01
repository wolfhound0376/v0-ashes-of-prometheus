-- The brew record carries an ARRAY of effects, not one effect.
--
-- 20260929120000_alchemy_schema.sql required `brew ? 'effect'` (singular).
-- The brew route has always written `effects` (a list: a brew can carry a
-- benefit and a harm at once — Sam's ruling, 2026-09-30) and the drink route
-- reads `effects`. So every real, non-sandbox brew failed this CHECK and the
-- party could never hold a potion. Live count before this migration: 0 rows
-- with brew set, so nothing is reshaped.
--
-- Applied 2026-10-01 on Sam's "go ahead" (alchemy step 4).

alter table inventory_items drop constraint if exists inventory_items_brew_shape;
alter table inventory_items add constraint inventory_items_brew_shape check (
  brew is null
  or (
    jsonb_typeof(brew) = 'object'
    and jsonb_typeof(brew->'effects') = 'array'
    and jsonb_array_length(brew->'effects') >= 1
    and (brew->>'potency')::int between 1 and 3
    and (brew->>'impurity')::int between 0 and 3
  )
);

comment on column inventory_items.brew is
  'Brew record for a crafted potion: {"effects":["restore-health","rot"],'
  '"potency":1-3,"impurity":0-3,"rune":null|"<school>","base":"water"|'
  '"blessed-water"|"holy-water","recipe":null|"<slug>","brewed_by":"<uuid>",'
  '"brewed_at":"<iso>"}. Written by app/api/alchemy/brew, read by '
  'app/api/alchemy/drink.';
