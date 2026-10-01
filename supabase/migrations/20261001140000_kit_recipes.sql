-- The five starter recipes that come with an alchemist's kit.
--
-- Sam, 2026-10-01: "The five starter recipes that go with the kit." Worked out
-- from the live alchemy_effects grid (claude/claude_Alchemy_Recipes_Built.md):
-- each pair shares exactly the effect it claims and nothing harmful. All TRUE.
-- Anyone carrying Alchemist's Supplies knows them (properties.recipe.kit);
-- the bench and the brew route read that. Data only; applied live.
insert into items (slug, item_key, name, item_type, rarity, weight, value, description, source, stackable, icon_url, properties)
select v.slug, v.slug, v.name, 'misc', 'common', 0, 0, v.descr, 'homebrew', true,
  'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/alchemy/cut/recipe-page.png',
  jsonb_build_object(
    'recipe', jsonb_build_object('ingredients', v.ingredients, 'claims', v.claims, 'kit', 'alchemists-supplies'),
    'reliability', 'true', 'homebrew', true, 'approved_by', 'Sam 2026-10-01')
from (values
  ('recipe-field-dressing', 'Recipe: Field Dressing', 'Barrelstalk and sporebread, prepared. A healer''s first lesson.', '["barrelstalk","sporebread-loaf"]'::jsonb, 'Restore Health'),
  ('recipe-deep-eyes', 'Recipe: Deep Eyes', 'Glowcap and blind cave fish. For seeing what the dark keeps.', '["glowcap","blind-cave-fish"]'::jsonb, 'Darksight'),
  ('recipe-antivenom-broth', 'Recipe: Antivenom Broth', 'Trillimac and fire lichen. Drink before the bite, not after.', '["trillimac","fire-lichen"]'::jsonb, 'Resist Poison'),
  ('recipe-iron-will', 'Recipe: Iron Will', 'Fire lichen and deep rothé milk. For the moment the courage goes.', '["fire-lichen","deep-rothe-milk"]'::jsonb, 'Steady Nerve'),
  ('recipe-march-ration', 'Recipe: March Ration', 'Cavern lizard meat and fried grubs. For the long road.', '["cavern-lizard-meat","fried-grubs"]'::jsonb, 'Long March')
) as v(slug, name, descr, ingredients, claims)
on conflict (slug) do nothing;
