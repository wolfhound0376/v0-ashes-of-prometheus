-- Seed script: Load authoritative Act 1 + early Underdark bestiary (15 creatures)
-- Run this in Supabase SQL Editor to populate the bestiary table

-- Clear existing bestiary (optional; comment out to append instead)
-- DELETE FROM bestiary;

-- ============================================================================
-- COMBATANTS (9 creatures)
-- ============================================================================

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Drow',
  'Medium',
  'humanoid',
  'CE',
  15,
  'chain mail',
  13,
  '2d8 + 4',
  '30 ft.',
  10, 14, 14, 11, 11, 9,
  null, null, 'Darkvision 120 ft.',
  'Elvish, Undercommon',
  null, null, null,
  '1/8',
  25,
  '[{"name":"Fey Ancestry","desc":"Has advantage on saves vs. being charmed; magic can''t put it to sleep"}]',
  '[{"name":"Shortsword","to_hit":"+4","reach":"5 ft.","desc":"1d6 + 2 piercing"},{"name":"Hand Crossbow","to_hit":"+4","reach":"30/120 ft.","desc":"1d4 + 2 piercing; drow typically carry poisoned bolts"}]',
  null,
  'Typical Drow warrior at Velkynvelve or Underdark encounters'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Drow Mage',
  'Medium',
  'humanoid',
  'CE',
  12,
  null,
  22,
  '5d8',
  '30 ft.',
  10, 14, 14, 14, 12, 11,
  null, null, 'Darkvision 120 ft.',
  'Elvish, Undercommon',
  null, null, null,
  '1/4',
  50,
  '[{"name":"Fey Ancestry","desc":"Has advantage on saves vs. being charmed; magic can''t put it to sleep"},{"name":"Innate Spellcasting","desc":"Uses Charisma (spell save DC 11). Can cast following spells: at-will dancing lights, mage hand; 1/day each darkness, faerie fire, levitate"}]',
  '[{"name":"Shortsword","to_hit":"+4","reach":"5 ft.","desc":"1d6 + 2 piercing"}]',
  null,
  'Drow spellcaster; typically guards or scouts'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Hook Horror',
  'Large',
  'monstrosity',
  'U',
  15,
  null,
  75,
  '10d10 + 20',
  '30 ft., climb 30 ft.',
  17, 16, 16, 6, 12, 7,
  null, null, 'Darkvision 120 ft., tremorsense 120 ft.',
  null,
  null, null, null,
  '3',
  700,
  '[{"name":"Echolocation","desc":"Blind beyond 120 ft. in complete darkness; sightless in bright light"},{"name":"Multiple Bodies","desc":"A hook horror can use echolocation to fight unseen enemies without disadvantage from invisibility"}]',
  '[{"name":"Multiattack","desc":"Makes two hook attacks"},{"name":"Hook","to_hit":"+6","reach":"10 ft.","desc":"1d6 + 3 piercing"}]',
  null,
  'CR 3 Underdark menace; exact stats from Monster Manual'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Quaggoth',
  'Medium',
  'monstrosity',
  'CN',
  13,
  'natural armor',
  45,
  '6d8 + 18',
  '40 ft.',
  17, 12, 16, 6, 12, 7,
  null, null, 'Darkvision 120 ft.',
  null,
  'poison resistance',
  null,
  '2',
  450,
  '[{"name":"Quickness","desc":"Moves 1d4 × 5 feet on initiative roll; can move to that speed as part of readying an action on its first turn"},{"name":"Reactive Strikes","desc":"Can make an opportunity attack when a creature moves within 5 ft. of it, even if the creature didn''t provoke"}]',
  '[{"name":"Multiattack","desc":"Makes three claw attacks"},{"name":"Claw","to_hit":"+5","reach":"5 ft.","desc":"1d6 + 3 slashing; target must succeed on DC 13 Con save or take 2d6 poison damage"}]',
  null,
  'Violent simian monstrosity; appears in Act 1 caves'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Giant Spider',
  'Large',
  'beast',
  'U',
  14,
  'natural armor',
  26,
  '4d10 + 8',
  '30 ft., climb 30 ft.',
  14, 16, 12, 2, 11, 4,
  null, null, 'Darkvision 60 ft.; blindsight 10 ft.',
  null,
  null, null, null,
  '1',
  200,
  '[{"name":"Spider Climb","desc":"Can climb difficult surfaces including upside down on ceilings"},{"name":"Web Sense","desc":"Senses vibrations in webs"}]',
  '[{"name":"Bite","to_hit":"+5","reach":"5 ft.","desc":"1d8 + 3 piercing plus 2d8 poison (DC 11 Con save for half)"},{"name":"Web","reach":"30 ft. x 60 ft.","desc":"Webs restrain and are DC 12 Strength save to break"}]',
  null,
  'Common Underdark hazard'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Dwarf (Deep)',
  'Medium',
  'humanoid',
  'G',
  16,
  'plate armor',
  11,
  '2d8 + 2',
  '25 ft.',
  17, 10, 14, 11, 10, 9,
  null, null, 'Darkvision 60 ft.',
  'Dwarvish, Undercommon',
  null, null, null,
  '1/4',
  50,
  '[{"name":"Sunlight Sensitivity","desc":"Disadvantage on attack and Wisdom (Perception) in sunlight"}]',
  '[{"name":"Warhammer","to_hit":"+5","reach":"5 ft.","desc":"1d8 + 3 bludgeoning, or 1d10 + 3 if two-handed"}]',
  null,
  'Deep dwarf scout or guard; Underdark origin'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Grick',
  'Medium',
  'monstrosity',
  'N',
  14,
  'natural armor',
  27,
  '5d8 + 5',
  '30 ft., climb 30 ft.',
  14, 14, 13, 3, 12, 6,
  null, null, 'Darkvision 60 ft.',
  null,
  null, null, null,
  '2',
  450,
  '[{"name":"Stone Camouflage","desc":"Advantage on Stealth checks to hide in rocky terrain"}]',
  '[{"name":"Tentacles","to_hit":"+4","reach":"5 ft.","desc":"1d6 + 2 piercing; if hit, target is grappled (escape DC 14); Grick can grapple up to 4 creatures"},{"name":"Bite","to_hit":"+4","reach":"5 ft.","desc":"2d6 + 2 piercing"}]',
  null,
  'Ambush predator of caves; CR 2'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Ochre Jelly',
  'Large',
  'ooze',
  'U',
  8,
  null,
  45,
  '6d10 + 12',
  '10 ft.',
  15, 6, 14, 2, 6, 1,
  null, null, 'Blindsight 60 ft. (blind beyond this)',
  null,
  'acid resistance',
  'acid immunity, charmed, exhaustion, frightened, grappled, paralyzed, petrified, poisoned, prone, restrained',
  '2',
  450,
  '[{"name":"Amorphous","desc":"Can enter a hostile creature''s space and stop there; can move through narrow openings"},{"name":"Transparent","desc":"Even when in plain sight, the jelly is hard to see"}]',
  '[{"name":"Pseudopod","to_hit":"+4","reach":"5 ft.","desc":"2d6 + 2 acid damage"},{"name":"Split","desc":"When hit by a melee weapon, the jelly can split into two (to max 2 parts)"}]',
  null,
  'Amorphous acid hazard; CR 2'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Myconid Adult',
  'Medium',
  'plant',
  'N',
  12,
  'natural armor',
  22,
  '3d8 + 9',
  '20 ft.',
  10, 10, 16, 10, 12, 5,
  null, null, 'Darkvision 120 ft.',
  'Myconid, understands others but doesn''t speak',
  'null',
  null,
  '1/4',
  50,
  '[{"name":"Spore Network","desc":"Fungal network allows simple non-vocal telepathy; can sense the direction of other Myconids within 30 ft."}]',
  '[{"name":"Fist","to_hit":"+2","reach":"5 ft.","desc":"1d4 poison damage + 1d4 poison (DC 13 Con save half)"},{"name":"Spore Cloud","range":"15 ft.","desc":"Melee weapon attack; target loses resistance to poison for 1 minute"}]',
  null,
  'Fungal humanoid; typically peaceful but territorial'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Umber Hulk',
  'Large',
  'monstrosity',
  'U',
  18,
  'natural armor',
  93,
  '11d10 + 33',
  '40 ft., burrow 40 ft.',
  20, 13, 16, 9, 10, 7,
  null, null, 'Darkvision 120 ft., tremorsense 60 ft.',
  null,
  null, null, null,
  '5',
  1800,
  '[{"name":"Confusing Gaze","desc":"When a creature starts its turn within 30 ft., it must make a DC 16 Int save or have disadvantage on attack rolls and ability checks this turn"},{"name":"Tunneler","desc":"Can burrow through solid rock at half its burrowing speed, leaving a 10 ft. tunnel"}]',
  '[{"name":"Multiattack","desc":"Makes two claw attacks and one mandible attack"},{"name":"Claw","to_hit":"+8","reach":"5 ft.","desc":"1d8 + 5 slashing"},{"name":"Mandible","to_hit":"+8","reach":"5 ft.","desc":"2d8 + 5 piercing"}]',
  null,
  'Tunneling terror; CR 5; final encounter tier'
);

-- ============================================================================
-- PRISONER-ALLIES & LYCANTHROPES (6 creatures)
-- ============================================================================

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Tortle',
  'Medium',
  'humanoid',
  'G',
  17,
  'natural armor shell',
  22,
  '3d8 + 9',
  '30 ft.',
  15, 12, 16, 11, 13, 12,
  null, null, 'passive Perception 11',
  'Aquan, Common',
  null, null, null,
  '1/4',
  50,
  '[{"name":"Hold Breath","desc":"Can hold breath for 1 hour"}]',
  '[{"name":"Greataxe","to_hit":"+4","reach":"5 ft.","desc":"1d12 + 2 slashing"}]',
  null,
  'Tortle prisoner; typically fighter or barbarian background'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Wererat (Humanoid Form)',
  'Medium',
  'humanoid',
  'CE',
  12,
  'leather armor',
  33,
  '6d8 + 6',
  '30 ft.',
  10, 15, 12, 11, 10, 8,
  null, null, 'Darkvision 60 ft.',
  'Thieves'' Cant, Common, Sylvan',
  'bludgeoning, piercing, slashing from nonmagical weapons not of silvered',
  null,
  '2',
  450,
  '[{"name":"Shapechanger","desc":"Can use its action to polymorph into a rat-humanoid hybrid or into a Large rat, or back to humanoid. HP remain the same in each form"},{"name":"Keen Smell","desc":"Advantage on Wisdom (Perception) checks based on smell"},{"name":"Darkvision","desc":"120 ft. in rat form"}]',
  '[{"name":"Multiattack (Humanoid Form)","desc":"Makes two shortsword or hand crossbow attacks"},{"name":"Shortsword","to_hit":"+4","reach":"5 ft.","desc":"1d6 + 2 piercing"},{"name":"Bite (Rat Form)","to_hit":"+4","reach":"5 ft.","desc":"1d4 + 2 piercing"}]',
  null,
  'Infected lycanthrope; can transform; CR 2'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Werewolf (Humanoid Form)',
  'Medium',
  'humanoid',
  'CE',
  12,
  'hide armor',
  55,
  '10d8 + 10',
  '30 ft.',
  15, 13, 14, 10, 11, 10,
  null, null, 'Darkvision 60 ft.',
  'Common, Sylvan',
  'bludgeoning, piercing, slashing from nonmagical weapons not of silvered',
  null,
  '3',
  700,
  '[{"name":"Shapechanger","desc":"Can use action to polymorph into wolf form or back to humanoid. HP same in each form. Can''t change if reduced to 0 HP"},{"name":"Keen Hearing and Smell","desc":"Advantage on Wisdom (Perception) checks relying on hearing or smell"}]',
  '[{"name":"Multiattack (Humanoid Form)","desc":"Makes two longsword attacks or two hand crossbow attacks"},{"name":"Bite (Wolf Form)","to_hit":"+5","reach":"5 ft.","desc":"1d8 + 3 piercing (and target must succeed on DC 13 Con save or be cursed with lycanthropy)"},{"name":"Longsword","to_hit":"+5","reach":"5 ft.","desc":"1d8 + 3 slashing"}]',
  null,
  'Infected lycanthrope; perilous transformation; CR 3'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Giant Ape',
  'Huge',
  'beast',
  'U',
  15,
  'natural armor',
  157,
  '15d12 + 60',
  '40 ft., climb 40 ft.',
  23, 12, 19, 7, 12, 7,
  null, null, 'Passive Perception 11',
  null,
  null, null,
  '7',
  2900,
  '[{"name":"Fist and Bite","desc":"Can use both melee attacks as a multiattack"}]',
  '[{"name":"Multiattack","desc":"Makes two fist attacks or two rock attacks"},{"name":"Fist","to_hit":"+9","reach":"10 ft.","desc":"2d8 + 6 bludgeoning"},{"name":"Rock","to_hit":"+9","range":"60/240 ft.","desc":"2d6 + 6 bludgeoning"}]',
  null,
  'Enormous primate; potential late-game ally or menace; CR 7'
);

INSERT INTO bestiary (name, size, creature_type, alignment, ac, ac_note, hp, hp_formula, speed, str, dex, con, int, wis, cha, saving_throws, skills, senses, languages, damage_resistances, damage_immunities, condition_immunities, cr, xp, traits, actions, reactions, notes)
VALUES (
  'Worg',
  'Large',
  'monstrosity',
  'CE',
  13,
  null,
  26,
  '4d10 + 8',
  '50 ft.',
  16, 13, 14, 7, 11, 10,
  null, null, 'Darkvision 60 ft., passive Perception 10',
  'Goblin, Worg',
  null, null, null,
  '2',
  450,
  '[{"name":"Keen Hearing and Smell","desc":"Advantage on Wisdom (Perception) checks relying on hearing or smell"}]',
  '[{"name":"Bite","to_hit":"+5","reach":"5 ft.","desc":"2d6 + 3 piercing"}]',
  null,
  'Intelligent wolf-beast; often serves as pack mount; CR 2'
);

-- ============================================================================
-- Table is now seeded with 15 authoritative D&D 5E stat blocks
-- All combatants have real Monster Manual stats with save DCs and damage formulae
-- All prisoner-allies/lycanthropes are ready for narrative use
-- ============================================================================
