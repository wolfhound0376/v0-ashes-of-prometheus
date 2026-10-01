-- Drink data for the three catalogue drinks that predate the drinks list.
--
-- The six new drinks (2026-09-30) were inserted with properties.drink. The
-- three older rows — Darklake Stout, Fire Lichen Liquor, Mushroom Wine — had
-- none, so nothing could drink or brew them. Numbers are the approved ladder
-- (beer DC 10 one step; wine DC 12 one step, cleric only; liquor DC 14 two
-- steps, needs a still). `made_from` is claude/claude_Underdark_Drinks.md's
-- "Existing rows" table (stout: bluecap mash; liquor: fire lichen distilled;
-- wine: zurkhwood and trillimac must). Data only; applied live 2026-10-01 on
-- Sam's "go ahead".
update items set properties = coalesce(properties, '{}'::jsonb) || jsonb_build_object('drink', d.drink)
from (values
  ('darklake-stout', '{"class":"beer","proof":"low","save_dc":10,"steps_per_drink":1,"maker":"any brewer","made_from":["bluecap"]}'::jsonb),
  ('fire-lichen-liquor', '{"class":"liquor","proof":"high","save_dc":14,"steps_per_drink":2,"maker":"any brewer, needs a still","made_from":["fire-lichen"]}'::jsonb),
  ('mushroom-wine', '{"class":"wine","proof":"middling","save_dc":12,"steps_per_drink":1,"maker":"cleric only","made_from":["zurkhwood","trillimac"]}'::jsonb)
) as d(slug, drink)
where items.slug = d.slug and not (items.properties ? 'drink');
