# Scott — sheet reroll, 2026-09-29

**Canon.** Applied to the live `characters` row `88cc9dd1-b0fe-4e62-9829-f84aafe3c066` on Sam's instruction. Backup table: `characters_backup_scott_20260929`.

---

## Why

His `sheet_skill_proficiencies` was an empty object `{}`. A Half-Elf Bard with the Entertainer background has **seven** skill proficiencies — two from background, three from class, two racial — so the sheet was not merely thin, it was broken, and every skill check he had ever made was rolled flat.

Found while checking Arcana modifiers for the rune-mark DCs (`claude/claude_Alchemy_Rune_Marks.md`). Sam ruled: reroll and make it canon.

## The roll

`4d6` drop lowest, six times, rolled fresh:

```
[1,3,4,5] drop 1 -> 12      [3,4,5,5] drop 3 -> 14
[3,3,4,5] drop 3 -> 12      [3,4,4,5] drop 3 -> 13
[1,3,5,5] drop 1 -> 13      [1,3,3,6] drop 1 -> 12
```

**14, 13, 13, 12, 12, 12.** Flat — nothing above a 14 before racials — but 76 points against the standard array's 72. No rerolls taken and none offered.

Half-Elf (2014 Edition, per the Forge) adds +2 Charisma and +1 to two others; Charisma, Dexterity and Constitution.

## Before and after

| | Was | Now |
|---|---|---|
| STR | 8 (−1) | **12 (+1)** |
| DEX | 14 (+2) | 14 (+2) |
| CON | 13 (+1) | **14 (+2)** |
| INT | 10 (+0) | **12 (+1)** |
| WIS | 12 (+1) | 12 (+1) |
| CHA | 15 (+2) | **16 (+3)** |
| HP | 9 | **10** |
| AC | 10 | **12** |
| Spell save DC | 12 | **13** |
| Spell attack | +4 | **+5** |
| Skills | *none* | **seven** |

The old AC of 10 was wrong on its own terms — unarmored AC is 10 + Dexterity, so it should have been 12 even before the reroll. It is 12 rather than 13 because his gear is confiscated at Velkynvelve; light armour takes him to 13 when he gets it back.

## The seven skills

| Source | Skills |
|---|---|
| Entertainer background | Acrobatics, Performance |
| Bard, three of choice | **Arcana**, Perception, History |
| Half-Elf, two of choice | Persuasion, Nature |

`Acrobatics +4, Arcana +3, History +3, Nature +3, Perception +3, Performance +5, Persuasion +5`

Chosen to fill real party gaps rather than to flatter the character. Before this, **nobody in the party had Arcana, Perception, History or Nature.** Perception is the most-rolled skill in the game and the party had none of it. Arcana makes Scott the only trained rune-reader, which matters for the alchemy marks. Nature is what the Poisoned Cookbook's `drifted`-recipe check runs on.

## Also filled

`sheet_proficiencies` was empty too. Now: light armour; simple weapons plus hand crossbow, longsword, rapier and shortsword; lute, drum, pan flute and a disguise kit; Common, Elvish and Undercommon.

Unarmed strike corrected to +3 / 2 damage off the new Strength.

## Untouched

Species, background, hit dice, save proficiencies (`dex`, `cha`), and the whole spell list — two cantrips and four prepared, already correct and already sourced to SRD 5.2.1. Only `save_dc` and `attack_bonus` moved, and only because Charisma did.

## Key hygiene

Scott's keys are Title Case, matching Kenta, Samson and Bastet. **Fifi remains the outlier** with lowercase-underscore keys (`sleight_of_hand`). Anything reading `sheet_skill_proficiencies` must handle both until that is normalised — the open item this reroll did not fix.
