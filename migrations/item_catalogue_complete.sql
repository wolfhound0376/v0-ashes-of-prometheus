-- item_catalogue_complete.sql — every item in the game gets a catalogue row, a unique item code, a description for the
-- hover card, a pixel sprite, and (for what the heroes carry) a link from their pack to the catalogue.
--
-- Sam, 2026-10-29: "make sure all items have a set number that exist for the game and an assigned rarity and unique ID
-- for DND 5E. Make sure that for all items there are pixel sprites and hover info mapped to it."
--
-- Audit before this ran (live, 2026-10-29): 333 items, every one with a unique id, slug and valid 5e rarity. Gaps:
--   item_code     320 of 333 missing (13 had one: ACC-L-000001 and kin)
--   description   100 missing (the hover card had only rules lines for them)
--   pixel sprite   50 missing (+ the 9 new rows below) — sprites ship in public/item-pixels with this PR
--   not catalogued  9: scale mail and the copper/electrum/platinum coins the loot rolls (walk_loot_coins.sql was never
--                  applied), and five things the heroes carry (crowbar, orb focus, scholar's pack, calligrapher's
--                  supplies, sickle)
--   inventory     49 pack rows (28 names) with no item_id, so no sprite, rarity or hover card in a pack
--
-- Order: run AFTER the PR is merged and deployed (step 5 points pixel_icon_url at files the PR adds).
-- Additive only. Every UPDATE fills an empty field and touches nothing already set. A re-run does nothing.

begin;

-- 1. the nine rows the game needs (the coins are walk_loot_coins.sql verbatim)
insert into public.items (slug, name, item_type, equippable_slot, rarity, weight, value, description, source, campaign_slug, stackable, properties)
values
  ('copper-coin', 'Copper coin', 'currency', null, 'common', 0.02, 0, 'A copper piece. A hundred make a gold piece.', 'srd', null, true, '{"srd":true,"value_cp":1,"icon_hint":"coin"}'),
  ('electrum-coin', 'Electrum coin', 'currency', null, 'common', 0.02, 0, 'An electrum piece, worth five silver.', 'srd', null, true, '{"srd":true,"value_sp":5,"icon_hint":"coin"}'),
  ('platinum-coin', 'Platinum coin', 'currency', null, 'common', 0.02, 10, 'A platinum piece, worth ten gold.', 'srd', null, true, '{"srd":true,"value_gp":10,"icon_hint":"coin"}'),
  ('scale-mail', 'Scale Mail', 'armor', 'torso', 'common', 45, 50, 'Medium armour of leather covered in overlapping metal scales. AC 14 + Dex (max 2); disadvantage on Stealth.', 'campaign', null, false, '{"srd":true,"book":"SRD 5.1","base_ac":14,"dex_cap":2,"icon_hint":"scale-mail","armor_category":"medium","stealth":"disadvantage"}'),
  ('crowbar', 'Crowbar', 'gear', null, 'common', 5, 2, 'An iron bar for prying. Advantage on Strength checks where its leverage can be applied.', 'campaign', null, false, '{"srd":true,"book":"SRD 5.1","icon_hint":"crowbar"}'),
  ('arcane-focus-orb', 'Arcane Focus (Orb)', 'focus', null, 'common', 3, 20, 'A crystal orb. An arcane spellcaster can use it as a spellcasting focus.', 'campaign', null, false, '{"srd":true,"icon_hint":"orb","spellcasting_focus":"arcane"}'),
  ('scholars-pack', 'Scholar''s Pack', 'pack', null, 'common', 10, 40, 'A backpack, a book of lore, a bottle of ink, an ink pen, 10 sheets of parchment, a little bag of sand and a small knife.', 'campaign', null, false, '{"srd":true,"icon_hint":"backpack"}'),
  ('calligraphers-supplies', 'Calligrapher''s Supplies', 'tool', null, 'common', 5, 10, 'Ink, parchment and quills. Proficiency adds to checks to write with flourish or study a script.', 'campaign', null, false, '{"srd":true,"icon_hint":"ink-and-quill","proficiency":"calligraphers-supplies"}'),
  ('sickle', 'Sickle', 'weapon', 'main_hand', 'common', 2, 1, 'Simple melee weapon: 1d4 slashing, light.', 'campaign', null, false, '{"srd":true,"damage":"1d4","icon_hint":"sickle","damage_type":"slashing","weapon_properties":["light"]}')
on conflict (slug) do nothing;

-- 2. descriptions for the hover card (100 items that had none; rules text from each row's own properties, SRD 5.1)
update public.items i set description = v.d
from (values
  ('acid-vial', 'Thrown up to 20 ft, it shatters on impact: 2d6 acid damage. Crafted with alchemist''s supplies.'),
  ('assassins-blood', 'An ingested poison. DC 10 Constitution: on a fail, 1d12 poison damage and poisoned for 24 hours.'),
  ('bag-of-holding', 'A cloth bag far larger inside than out. Holds up to 500 lb in 64 cubic feet, and always weighs 15 lb however full it is.'),
  ('barrel', 'A wooden barrel that holds 40 gallons of water.'),
  ('battleaxe', 'Martial melee weapon: 1d8 slashing, versatile (1d10).'),
  ('bell', 'A small brass bell.'),
  ('blowgun', 'Martial ranged weapon: 1 piercing, range 25/100, ammunition, loading.'),
  ('blowgun-needles', 'A case of 50 needles for a blowgun.'),
  ('bomb', 'A cast-iron sphere packed with powder. Lit and thrown: everything within 5 ft makes a DC 12 Dexterity save, taking 3d6 fire damage, half on a success.'),
  ('bone-charm', 'A small carved bone charm on a cord. A trinket: it does nothing unless the DM rules otherwise.'),
  ('bone-ring', 'A ring carved from bone in the Underdark style. Pretty, and nothing more.'),
  ('boots', 'Plain leather boots. 5 sp.'),
  ('boots-of-elvenkind', 'Soft boots that make your steps silent. Advantage on Stealth checks that rely on moving silently.'),
  ('cauldron', 'A large iron pot for cooking or brewing.'),
  ('cloak-of-elvenkind', 'With the hood up, Perception checks to see you have disadvantage and you have advantage on Stealth checks to hide. Requires attunement.'),
  ('cloak-of-protection', 'A plain cloak with a faint shimmer. +1 to AC and saving throws while worn. Requires attunement.'),
  ('club', 'Simple melee weapon: 1d4 bludgeoning, light.'),
  ('crystal-ball', 'A sphere of crystal about 6 inches across. While touching it you can cast scrying (save DC 17). Requires attunement.'),
  ('cursed-dagger', 'A dagger (1d4, thrown 20/60) that carries a curse. Its effect is the DM''s to reveal at the table. Requires attunement.'),
  ('cursed-tome', 'A heavy book that should not have been opened. Its curse is the DM''s to reveal at the table. Requires attunement.'),
  ('dart', 'Simple ranged weapon: 1d4 piercing, finesse, thrown (20/60).'),
  ('diluted-drow-poison', 'Drow poison cut thin by the drow surgeon. Drunk willingly, it fakes death: unconscious for up to an hour, the pulse too faint to find, waking if hurt.'),
  ('disguise-kit', 'Cosmetics, hair dye and small props for changing your appearance. Proficiency adds to checks to create a visual disguise.'),
  ('drow-lockpick', 'A slim drow pick. Counts as thieves'' tools; it snaps on a natural 1.'),
  ('flute', 'A wooden flute. A musical instrument; a bard can use it as a focus.'),
  ('forgery-kit', 'Papers, inks, seals and tools for copying documents. Proficiency adds to checks to forge a document.'),
  ('gauntlets', 'Plain steel gauntlets. No special effect.'),
  ('gloves', 'Plain gloves. 5 sp.'),
  ('gloves-of-thievery', 'Invisible while worn. +5 to Sleight of Hand checks and to Dexterity checks made to pick locks.'),
  ('gold-ring', 'A plain gold ring. Jewellery, no magic.'),
  ('greataxe', 'Martial melee weapon: 1d12 slashing, heavy, two-handed.'),
  ('gunpowder-keg', 'A keg of black powder. Lit, it explodes: everything within 10 ft makes a DC 12 Dexterity save, taking 7d6 fire damage, half on a success.'),
  ('handaxe', 'Simple melee weapon: 1d6 slashing, light, thrown (20/60).'),
  ('hempen-rope', '50 feet of hempen rope. 2 hit points; bursts with a DC 17 Strength check.'),
  ('holy-water', 'Thrown up to 20 ft, it shatters on impact. A fiend or undead hit takes 2d6 radiant damage.'),
  ('horn', 'A hunting horn. A musical instrument.'),
  ('idol-of-lolth', 'A small idol of the Spider Queen, the kind drow clergy carry.'),
  ('javelin', 'Simple melee weapon: 1d6 piercing, thrown (30/120).'),
  ('light-hammer', 'Simple melee weapon: 1d4 bludgeoning, light, thrown (20/60).'),
  ('lolths-tooth', 'A cursed +1 dagger (thrown 20/60). While it is wielded it is a beacon to Ilvara Mizzrym; remove curse ends the beacon only. DC 15 Arcana to learn more.'),
  ('longbow', 'Martial ranged weapon: 1d8 piercing, range 150/600, ammunition, heavy, two-handed.'),
  ('longsword', 'Martial melee weapon: 1d8 slashing, versatile (1d10).'),
  ('morningstar', 'Martial melee weapon: 1d8 piercing.'),
  ('net', 'Martial ranged weapon, range 5/15. A Large or smaller creature hit is restrained until it frees itself (DC 10 Strength) or the net takes 5 slashing damage.'),
  ('pike', 'Martial melee weapon: 1d10 piercing, heavy, reach, two-handed.'),
  ('pitchfork', 'A farm fork used as a weapon: 1d6 piercing, two-handed. Not in the SRD; treated as a peasant''s trident.'),
  ('quarterstaff', 'Simple melee weapon: 1d6 bludgeoning, versatile (1d8).'),
  ('reliquary', 'A small box or case holding a fragment of a sacred relic. A cleric or paladin can use it as a holy symbol.'),
  ('ring-of-animal-influence', '3 charges, regaining 1d3 at dawn. Spend one to cast animal friendship, fear (beasts only) or speak with animals.'),
  ('ring-of-evasion', '3 charges, regaining 1d3 at dawn. When you fail a Dexterity saving throw, use your reaction and a charge to succeed instead. Requires attunement.'),
  ('ring-of-feather-falling', 'When you fall, you descend 60 feet a round and take no falling damage. Requires attunement.'),
  ('ring-of-free-action', 'Difficult terrain costs you no extra movement, and magic can neither reduce your speed nor paralyse or restrain you. Requires attunement.'),
  ('ring-of-invisibility', 'As an action you turn invisible until you attack, cast a spell, or end it as a bonus action. Requires attunement.'),
  ('ring-of-jumping', 'As a bonus action you can cast jump on yourself at will. Requires attunement.'),
  ('ring-of-mind-shielding', 'Immune to magic that reads your thoughts, tells whether you lie, or learns your alignment or creature type. Your soul can rest in it when you die. Requires attunement.'),
  ('ring-of-protection', '+1 to AC and saving throws while worn. Requires attunement.'),
  ('ring-of-regeneration', 'While you have at least 1 hit point, regain 1d6 hit points every 10 minutes; lost body parts regrow. Requires attunement.'),
  ('ring-of-resistance', 'Resistance to one damage type, fixed by the gem in the band (set when found). Requires attunement.'),
  ('ring-of-shooting-stars', 'In dim light or darkness: dancing lights and light at will, plus faerie fire, ball lightning and shooting stars from its 6 charges. Requires attunement.'),
  ('ring-of-spell-storing', 'Stores up to 5 levels of spells cast into it. While wearing it you can cast any spell stored there. Requires attunement.'),
  ('ring-of-spell-turning', 'Advantage on saves against spells that target only you. On a natural 20 against a spell of 7th level or lower, you turn it back on its caster. Requires attunement.'),
  ('ring-of-swimming', 'You have a swimming speed of 40 feet.'),
  ('ring-of-telekinesis', 'You can cast telekinesis at will, but only on objects that are not being worn or carried. Requires attunement.'),
  ('ring-of-the-ram', '3 charges, regaining 1d3 at dawn. A ranged spell attack out to 60 ft: 2d10 force and a 5 ft push per charge spent. Requires attunement.'),
  ('ring-of-three-wishes', '3 charges. Spend one to cast wish. With the last charge gone, the ring is ordinary.'),
  ('ring-of-warmth', 'Resistance to cold damage, and you and your gear are comfortable down to -50°F. Requires attunement.'),
  ('ring-of-water-walking', 'You can stand on and move across any liquid as if it were solid ground.'),
  ('ring-of-x-ray-vision', 'As an action, see through solid matter out to 30 ft for 1 minute. Using it again before a long rest risks exhaustion (DC 15 Constitution). Requires attunement.'),
  ('rock', 'A fist-sized stone. Thrown (20/60 ft) for 1d4 bludgeoning, or loaded into a sling.'),
  ('rusted-battleaxe', 'A battleaxe (1d8 slashing) eaten by rust: -1 to attack and damage rolls, and it breaks on a natural 1.'),
  ('rusted-longsword', 'A longsword (1d8 slashing) eaten by rust: -1 to attack and damage rolls, and it breaks on a natural 1.'),
  ('rusted-morningstar', 'A morningstar (1d8 piercing) eaten by rust: -1 to attack and damage rolls, and it breaks on a natural 1.'),
  ('rusted-pike', 'A pike (1d10 piercing) eaten by rust: -1 to attack and damage rolls, and it breaks on a natural 1.'),
  ('rusted-scimitar', 'A scimitar (1d6 slashing) eaten by rust: -1 to attack and damage rolls, and it breaks on a natural 1.'),
  ('rusted-war-pick', 'A war pick (1d8 piercing) eaten by rust: -1 to attack and damage rolls, and it breaks on a natural 1.'),
  ('rusted-warhammer', 'A warhammer (1d8 bludgeoning) eaten by rust: -1 to attack and damage rolls, and it breaks on a natural 1.'),
  ('scimitar', 'Martial melee weapon: 1d6 slashing, finesse, light.'),
  ('serpent-venom', 'An injury poison from a giant poisonous snake. DC 11 Constitution: 3d6 poison damage on a fail, half on a success.'),
  ('shield-plus-1', 'A magic shield: +3 to AC in all (+2 for the shield, +1 magic).'),
  ('shovel', 'An iron-bladed shovel for digging.'),
  ('shuriken', 'A throwing star: 1d4 piercing, finesse, thrown (20/60). Not in the SRD; treated as a dart.'),
  ('signet-ring', 'A ring bearing a personal or house seal, for sealing letters.'),
  ('silver-ring', 'A plain silver ring. Jewellery, no magic.'),
  ('sling', 'Simple ranged weapon: 1d4 bludgeoning, range 30/120, ammunition.'),
  ('sling-bullets', 'A pouch of 20 lead bullets for a sling.'),
  ('spell-scroll-1', 'A scroll holding one 1st-level spell, set when it is found. Read it to cast the spell once; the scroll then crumbles.'),
  ('spell-scroll-2', 'A scroll holding one 2nd-level spell, set when it is found. Read it to cast the spell once; the scroll then crumbles.'),
  ('spell-scroll-cantrip', 'A scroll holding one cantrip, set when it is found. Read it to cast the cantrip once; the scroll then crumbles.'),
  ('spellbook', 'A leather-bound book of 100 blank vellum pages, ready for a wizard''s spells.'),
  ('spiked-gauntlets', 'Gauntlets studded with spikes: 1d4 piercing, light. Not in the SRD.'),
  ('tinkers-tools', 'Tools for repairing and building small mechanical objects. Proficiency adds to those checks.'),
  ('totem-club', 'A quaggoth or derro totem club: 1d6 bludgeoning. Any magic in it is the DM''s call.'),
  ('travelers-cloak', 'A plain hooded travelling cloak. No special effect.'),
  ('truth-serum', 'An ingested poison. DC 11 Constitution: on a fail, poisoned for 1 hour and unable to knowingly tell a lie.'),
  ('undead-charm', 'A charm meant to ward off the dead. What it actually does is the DM''s call. Requires attunement.'),
  ('war-pick', 'Martial melee weapon: 1d8 piercing.'),
  ('warhammer', 'Martial melee weapon: 1d8 bludgeoning, versatile (1d10).'),
  ('whip', 'Martial melee weapon: 1d4 slashing, finesse, reach.'),
  ('wizards-staff', 'An arcane focus in the shape of a staff, and a quarterstaff in a fight: 1d6 bludgeoning, versatile (1d8).'),
  ('wyvern-poison', 'An injury poison from a wyvern''s sting. DC 15 Constitution: 7d6 poison damage on a fail, half on a success.')
) as v(slug, d)
where i.slug = v.slug and coalesce(btrim(i.description), '') = '';

-- 3. an item code for every item, in the scheme already in use: TYPE-RARITY-NNNNNN (ACC-L-000001, WPN-VR-000001).
--    Types: WPN weapon · ARM armor · ACC accessory · FOC focus · GEAR gear · TOOL tool · PACK pack · AMMO ammunition ·
--    CON consumable · MISC misc (QST when the row is a quest item) · CUR currency · ART artifact.
--    Rarity: C U R VR L A. Numbers continue after the highest code already issued for that prefix, in name order.
with coded as (
  select i.id,
    (case i.item_type when 'weapon' then 'WPN' when 'armor' then 'ARM' when 'accessory' then 'ACC' when 'focus' then 'FOC'
       when 'gear' then 'GEAR' when 'tool' then 'TOOL' when 'pack' then 'PACK' when 'ammunition' then 'AMMO'
       when 'consumable' then 'CON' when 'currency' then 'CUR' when 'artifact' then 'ART'
       when 'misc' then case when i.properties ? 'quest' then 'QST' else 'MISC' end else 'ITM' end)
    || '-' ||
    (case i.rarity when 'common' then 'C' when 'uncommon' then 'U' when 'rare' then 'R' when 'very_rare' then 'VR'
       when 'legendary' then 'L' when 'artifact' then 'A' else 'X' end) as prefix,
    i.name
  from public.items i where i.item_code is null
), numbered as (
  select c.id, c.prefix,
    coalesce((select max(substring(x.item_code from '([0-9]+)$')::int) from public.items x where x.item_code like c.prefix || '-%'), 0)
      + row_number() over (partition by c.prefix order by c.name) as n
  from coded c
)
update public.items i set item_code = n.prefix || '-' || lpad(n.n::text, 6, '0')
from numbered n where i.id = n.id and i.item_code is null;

-- 4. link every pack row to its catalogue item (by name; "Dagger" is the plain dagger, not the obsidian-flake alias)
update public.inventory_items ii set item_id = i.id
from (values
  ('Arcane Focus (Orb)', 'arcane-focus-orb'),
  ('Arrows (20)', 'arrows'),
  ('Book', 'book'),
  ('Burglar''s Pack', 'burglars-pack'),
  ('Calligrapher''s Supplies', 'calligraphers-supplies'),
  ('Crowbar', 'crowbar'),
  ('Dagger', 'dagger'),
  ('Dark Common Clothes with Hood', 'common-clothes'),
  ('Explorer''s Pack', 'explorers-pack'),
  ('Gaming Set (Dice)', 'gaming-set-dice'),
  ('Greataxe', 'greataxe'),
  ('Handaxe', 'handaxe'),
  ('Healer''s Kit', 'healers-kit'),
  ('Leather Armor', 'leather-armor'),
  ('Parchment (1 sheet)', 'parchment-1-sheet'),
  ('Pouch', 'belt-pouch'),
  ('Quarterstaff', 'quarterstaff'),
  ('Quiver', 'quiver'),
  ('Robe', 'robe'),
  ('Scholar''s Pack', 'scholars-pack'),
  ('Shortbow', 'shortbow'),
  ('Shortsword', 'shortsword'),
  ('Sickle', 'sickle'),
  ('Small Quill', 'small-quill'),
  ('Spear', 'spear'),
  ('Tattered Journal', 'tattered-journal'),
  ('Thieves'' Tools', 'thieves-tools'),
  ('Traveler''s Clothes', 'travelers-clothes')
) as m(name, slug)
join public.items i on i.slug = m.slug
where ii.item_id is null and ii.name = m.name;

-- 5. the 59 new pixel sprites (public/item-pixels/<slug>.png, 48x48 RGBA, PixelLab, added by this PR)
update public.items set pixel_icon_url = '/item-pixels/' || slug || '.png'
where coalesce(pixel_icon_url, '') = '' and slug in (
  'alchemists-still',
  'arcane-focus-orb',
  'black-dragon-mask',
  'blessed-water',
  'blue-dragon-mask',
  'bonecap',
  'calligraphers-supplies',
  'carved-knucklebone',
  'common-clothes',
  'communion-wine',
  'copper-coin',
  'crowbar',
  'cult-robes',
  'diluted-drow-poison',
  'dragon-hatchery-eggs',
  'drow-lockpick',
  'drow-recipe-page',
  'drow-sigil-wax',
  'electrum-coin',
  'essence-of-ether',
  'glowcap',
  'green-dragon-mask',
  'hazirawn',
  'ilvara-chest-key',
  'lolths-tooth',
  'mask-of-the-dragon-queen',
  'midnight-tears',
  'moonstone',
  'nightlight-cordial',
  'nimergan',
  'platinum-coin',
  'powdered-silver',
  'recipe-antivenom-broth',
  'recipe-book',
  'recipe-deep-eyes',
  'recipe-field-dressing',
  'recipe-iron-will',
  'recipe-march-ration',
  'recipe-page',
  'red-dragon-mask',
  'ripplebark-bitter',
  'ruby-amulet-lost-love',
  'rune-chalk',
  'scale-mail',
  'scholars-pack',
  'sickle',
  'silver-chain-headdress',
  'silver-coin',
  'skyreach-castle',
  'slave-pen-key',
  'sporebread-small-beer',
  'tessadyle',
  'the-draakhorn',
  'tome-of-the-dragon',
  'torchstalk-brandy',
  'wand-of-winter',
  'white-dragon-mask',
  'whorlstone-punch',
  'wind-spores'
);

commit;

-- After: every count below should be 0.
-- select count(*) filter (where item_code is null) no_code, count(*) filter (where coalesce(btrim(description),'')='') no_desc,
--        count(*) filter (where coalesce(pixel_icon_url,'')='') no_sprite from public.items;
-- select count(*) from public.inventory_items where item_id is null;
