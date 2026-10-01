-- Clerical help at the alchemy bench: two catalogue rows the bench needs.
--
-- Sam approved the art for both on the review page (2026-10-01, "Clerical
-- bases and brewing gear") and "Yes" to the brief's clerical rules. Rules in
-- lib/alchemy-cleric.ts. Applied live on Sam's "go ahead". Data only.
--
-- blessed-water   HOMEBREW. A cleric's prayer over a glass vial of water. As a
--                 brewing base it caps impurity at 1. No slot, no silver.
-- powdered-silver PHB p.151: holy water's ritual "uses 25 gp worth of powdered
--                 silver". One unit = one ritual's worth.
insert into items (slug, item_key, name, item_type, rarity, weight, value, description, source, stackable, icon_url, properties)
values
  ('blessed-water', 'blessed-water', 'Blessed Water (vial)', 'consumable', 'common', 0.5, 0,
   'Water a cleric has prayed over. Not holy water: it will not burn a fiend. As the base of a brew it keeps impurity from rising above 1.',
   'homebrew', true,
   'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/alchemy/cut/blessed-water.png',
   jsonb_build_object('homebrew', true, 'approved_by', 'Sam 2026-10-01', 'alchemy_base', 'blessed-water')),
  ('powdered-silver', 'powdered-silver', 'Powdered Silver (25 gp)', 'misc', 'common', 0, 25,
   'A twist of silver ground fine: 25 gp worth, the measure the holy-water ritual consumes.',
   'homebrew', true,
   'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/alchemy/cut/powdered-silver.png',
   jsonb_build_object('homebrew', true, 'approved_by', 'Sam 2026-10-01', 'source_note', 'PHB p.151 holy water ritual'))
on conflict (slug) do nothing;

-- Holy water already exists as a catalogue row; mark it a brewing base.
update items set properties = coalesce(properties, '{}'::jsonb) || jsonb_build_object('alchemy_base', 'holy-water')
where slug = 'holy-water';
