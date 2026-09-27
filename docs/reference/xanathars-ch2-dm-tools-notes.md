# Xanathar's Guide to Everything, ch. 2 "Dungeon Master's Tools": notes for later

**Status:** reference only. Nothing here is wired unless a doc says so.
**Source:** pages Sam photographed from his copy, 2026-09-27 (pp. 77–92, 106–124). Summarised in Claude's words with page numbers; no prose is copied. Check the book before quoting a rule to players.
**Why it's here:** Sam, 2026-09-27: "More from the book we can store for info later." It isn't among the five books in `campaign_books`, so Malachar's retrieval can't see it. This file is the only copy in the project.

---

## 1. Already used

- **Tools and skills together (p. 78).** Proficiency in both a tool and a skill that apply to the same check may earn advantage, an added benefit, or a special use. Camp doc §18 applies it only where the book ties crafting to a skill: alchemist's supplies with Arcana.
- **Alchemical Crafting (p. 79).** A character proficient with alchemist's supplies can, as part of a long rest, make one dose of **acid, alchemist's fire, antitoxin, oil, perfume or soap**. It costs half the item's value in raw materials, which are bought ahead at 1 lb per 50 gp. Camp doc §18 proposes these as catalog recipes; the catalog has all of them except soap.

## 2. Camp and rest rules the book adds — candidates for the camp module

| Page | Rule | What it would change |
|---|---|---|
| 77 | **Sleeping in medium or heavy armour:** a long rest in it regains only a quarter of spent Hit Dice (min 1), and doesn't reduce exhaustion. | `lib/long-rest.ts`, when armour is tracked at rest |
| 77 | **Going without a long rest:** after 24 hours without one, DC 10 CON save or a level of exhaustion; +5 DC per further 24 hours, back to 10 after a long rest. | The camp's "no rest without rations" nights |
| 77 | **Waking someone:** sleepers wake from damage, a shake (an action), or loud noise; whispers only with passive Perception 15+ (20+ if magically asleep). | The passive visitor roll arriving at night |
| 80 | **Brewer's supplies, Potable Water:** in a long rest, purify 6 gallons (1 on a short rest). | A camp use for Brewer's supplies |
| 80 | **Carpenter's tools, Temporary Shelter:** in a long rest, a lean-to for the group; collapses 1d3 days later. | A camp use |
| 80 | **Cobbler's tools, Maintain Shoes:** in a long rest, up to six companions travel 10 h/day next day without exhaustion saves. | Travel pace, later |
| 81 | **Cook's utensils, Prepare Meals:** on a short rest with food, up to five companions regain 1 extra hp per Hit Die spent. | The short rest (`shortRest`) |
| 85 | **Weaver's tools, Craft Clothing:** an outfit in a long rest, given cloth. | Crafting (Construct tab) |
| 85 | **Woodcarver's tools, Craft Arrows:** up to 5 arrows in a short rest, 20 in a long rest, given wood. | Crafting (Construct tab) |
| 81, 84, 85 | **Repairs:** Smith's tools restore 10 hp to a metal object per hour (open flame). Leatherworker's, weaver's and woodcarver's tools repair one item in a short rest. Tinker's tools temporarily repair a disabled device (DC 10), or repair in half the time (DC 15). | The `mend` camp action |

## 3. Tool activity DCs (pp. 79–85)

Useful as sourced DCs when Malachar calls for a tool check.

| Tool | Activity → DC |
|---|---|
| Alchemist's supplies | puff of thick smoke 10 · identify a poison 10 · identify a substance 15 · start a fire 15 · neutralise acid 20 |
| Brewer's supplies | detect poison in a drink 10 · identify alcohol 15 · ignore effects of alcohol 20 |
| Calligrapher's supplies | identify the writer of nonmagical script 10 · writer's state of mind 15 · spot forged text 15 · forge a signature 20 |
| Carpenter's tools | simple wooden structure 10 · complex one 15 · weak point in a wooden wall 15 · pry apart a door 20 |
| Cartographer's tools | map's age and origin 10 · direction and distance to a landmark 15 · a map is fake 15 · fill in a missing part 20 |
| Cobbler's tools | shoe's age and origin 10 · hidden compartment in a heel 15 |
| Cook's utensils | typical meal 10 · duplicate a meal 10 · poison in food 15 · gourmet meal 15 |
| Disguise kit | cover injuries 10 · spot a disguise 15 · copy a humanoid's appearance 20 |
| Forgery kit | mimic handwriting 15 · duplicate a wax seal 20 |
| Gaming set | catch a player cheating 15 · read an opponent's personality 15 |
| Glassblower's tools | source of glass 10 · what a glass object once held 20 |
| Herbalism kit | find plants 15 · identify poison 20 |
| Jeweler's tools | modify a gem's appearance 15 · a gem's history 20 |
| Leatherworker's tools | modify a leather item's appearance 10 · its history 20 |
| Mason's tools | chisel a small hole in stone 10 · weak point in a stone wall 15 |
| Musical instrument | identify a tune 10 · improvise a tune 20 |
| Navigator's tools | plot a course 10 · position on a nautical chart 15 |
| Painter's supplies | accurate portrait 10 · painting with a hidden message 20 |
| Poisoner's kit | spot a poisoned object 10 · effects of a poison 20 |
| Potter's tools | what a vessel held 10 · serviceable pot 15 · weak point in ceramic 20 |
| Smith's tools | sharpen a dull blade 10 · repair a suit of armour 15 · sunder a nonmagical metal object 15 |
| Thieves' tools | pick a lock, disable a trap: varies |
| Tinker's tools | temporary repair of a disabled device 10 · repair in half the time 15 · improvise a temporary item from scraps 20 |
| Vehicles | rough terrain or waters 10 · assess condition 15 · tight corner at speed 20 |
| Weaver's tools | repurpose cloth 10 · mend a hole 10 · tailor an outfit 15 |
| Woodcarver's tools | small wooden figurine 10 · intricate pattern 15 |

Every tool entry also lists the skills it pairs with (Arcana, History, Investigation and so on) and one special use. See the book for those.

## 4. Other DM tools in the chapter

- **Identifying a spell (p. 85).** A reaction (while it's cast) or an action (after, from its effect). INT (Arcana) against DC 15 + the spell's level, with advantage if it's a spell of the identifier's own class. Needs a perceptible casting.
- **Perceiving a caster (p. 85).** Casting is noticed through its V, S or M components. With none (Subtle Spell, innate casting), it's imperceptible.
- **Invalid spell targets (pp. 85–86).** Nothing happens to an invalid target, and the slot is still spent. Against a save, the caster perceives it as a successful save.
- **Areas of effect on a grid (pp. 86–88).** Two methods: the template method, where a square is in if the template covers any part of it, and the token method, with square-edged shapes for circles, cones and lines. The board's AoE code may want to name which one it uses (`lib/aoe.ts`).
- **Encounter building (pp. 88–90).** An alternative to the DMG's XP budget: match each character's level to a monster CR by ratio. It has a solo-monster table, multiple-monster ratio tables by tier, and a Quick Matchups table. For the current party (four or five level-1 characters), one CR 1/4 monster or two CR 1/8 monsters per character is an even fight.
- **Monster personality and relationships (p. 91).** A d8 personality table (from cowardly to bully) and a d6 relationship table (rival, abused, worshipped, outcast…). They'd give Malachar sourced flavour for a group of enemies.
- **Random encounters (p. 92 on).** d100 tables by environment and tier. Sam photographed the Arctic (levels 1–4, 5–10), **Underdark** (all four tiers), Underwater (all tiers) and Urban (all tiers) sets. See §5 for the Underdark set.

## 5. Underdark random encounters (pp. 106–109) — the ones this campaign lives in

- **Four d100 tables:** levels 1–4, 5–10, 11–16 and 17–20. Each mixes creature groups (names in **bold** are Monster Manual stat blocks) with non-combat "encounters of a less monstrous nature". Examples: orc graffiti about someone named Krusk; a rubble passage recently cleared after a cave-in; an abandoned miners' camp; a faint tapping from inside a wall; a merchant caravan of a drow mage, two drow elite warriors and quaggoths.
- **Levels 1–4 fits the party now.** It leans on OotA's own cast: giant fire beetles, kobolds, stirges, troglodytes, gray oozes, magma mephits, goblins, drow, kuo-toa, grimlocks, deep gnomes, darkmantles or piercers, specters, bugbears, fire snakes, giant spiders, a goblin boss, myconids, a minotaur or its skeleton, duergar, dwarf explorers, gibbering mouthers, hook horrors, quaggoths. It also reaches high: one mind flayer arcanist on 01, one mind flayer on 99, a spirit naga on 00, a rust monster, a hell hound. The book's advice (p. 92) is that not every result must be a fight, and the party may flee or talk.
- **How it relates to what's live.** The watch and the passive roll use OotA-Encounters' own tables (`encounter_table_rows`, `underdark_random` → creature / terrain / ambush) and Sam's camp visitor table. Xanathar's Underdark table is a **third source**. It could be loaded as its own `encounter_tables` key (e.g. `xge_underdark_1_4`) and chosen per node through `travel_nodes.metadata.encounter_table`, which `resolveWatch` already reads, with no code change. That would mean copying the table's rows into Sam's private database, as was done for OotA; it hasn't been done, and waits for his word.
- **Monsters the bestiary lacks — checked 2026-09-27.** A result names a stat block, and before any Xanathar's row goes live every creature it names must resolve against `bestiary`, or the "never invent a stat block" rule bites. By exact name, **35 of the 91 creatures on the levels 1–4 table are in the bestiary (100 rows); 56 are not.** Missing include kobold, stirge, duergar, deep gnome, grimlock, darkmantle, minotaur, ogre, mind flayer, rust monster, hell hound, gelatinous cube and nothic. Some may exist under another name (a duergar variant), so exact matching undercounts a little. Either way, most of the table needs stat blocks first.

## 6. Traps Revisited (pp. 113–123)

- **Simple traps vs complex traps.** A simple trap fires once and is then harmless or easily avoided. Each has a level range matching the tiers of play, a threat (moderate, dangerous, deadly), a trigger, an effect and countermeasures. Run it by noting passive Perception and asking players exactly where they are and what they do, rather than calling for a bare check.
- **Advice (p. 114):** traps work best as a surprise, not so often that players search every square. One or two per encounter or adventure.
- **Examples photographed (simple, levels 1–4 unless noted):**

  | Trap | Trigger | Effect | Countermeasures |
  |---|---|---|---|
  | Bear trap | stepping on it | +8 attack, 5 (1d10) piercing, speed 0 until freed with DC 15 STR (self or adjacent) | DC 10 WIS (Perception) spots; DC 10 DEX with thieves' tools disables |
  | Crossbow trap | trip wire | two +8 attacks, 5 (1d10) piercing each | DC 15 Perception spots; DC 15 DEX with thieves' tools disables; a total of 5 or lower triggers it |
  | Falling portcullis (moderate) | pressure plate | a portcullis drops, blocking an exit | DC 20 Perception spots; DC 20 DEX with thieves' tools disables; 5 or lower triggers it |
  | Fiery blast (levels 5–10) | stepping on a mosaic without the god's holy symbol | 15-ft cube of fire, DC 15 DEX save, 24 (7d6) fire, half on success | DC 15 Perception reveals ash; DC 15 INT (Religion) defaces the rune (a failure triggers it); *dispel magic* (DC 15) destroys it |
  | Net trap | trip wire (a bell rings too) | 10×10 ft net: DC 15 DEX save or restrained; escape DC 10 STR as an action; the net has AC 10, 20 hp | DC 15 Perception spots the wire; DC 15 DEX with thieves' tools disables; a failure triggers it |
  | Pit trap (moderate) | stepping on the canvas | DC 10 DEX save or fall 10 ft, 3 (1d6) bludgeoning | DC 10 Perception reveals the canvas and a 1-ft ledge |
  | Poison needle (deadly) | picking or opening the lock | DC 20 CON save, 14 (4d10) poison and poisoned 10 min, paralysed while poisoned; half and not poisoned on a success | DC 20 Perception (inspecting the lock); DC 20 DEX with thieves' tools; 10 or lower triggers it |
  | Scything blade (levels 5–10, dangerous) | a lever | 5×20 ft area, DC 15 DEX save, 22 (4d10) slashing, half on success | DC 15 Perception (marks, bloodstains); DC 15 DEX with thieves' tools disables the lever |
  | Sleep of ages (levels 11–16, deadly) | pressure plate | *sleep* cast from a 9th-level slot, centred on the plate | DC 20 Perception; DC 20 INT (Arcana) within 5 ft disables (10 or lower triggers); *dispel magic* (DC 19) |

- **Designing simple traps (pp. 115–117).** Start from purpose (alarm, delay, restrain, slay), then trigger, effect, countermeasures and placement. The tables below are what keep an improvised trap honest.

  **Trap save DCs and attack bonuses** (the check DC to spot or disable defaults to the save DC):

  | Danger | Save / check DC | Attack bonus |
  |---|---|---|
  | Moderate | 10 | +5 |
  | Dangerous | 15 | +8 |
  | Deadly | 20 | +12 |

  **Damage by level** (per creature; use d6s instead of d10s for traps that hit several at once):

  | Levels | Moderate | Dangerous | Deadly |
  |---|---|---|---|
  | 1–4 | 5 (1d10) | 11 (2d10) | 22 (4d10) |
  | 5–10 | 11 (2d10) | 22 (4d10) | 55 (10d10) |
  | 11–16 | 22 (4d10) | 55 (10d10) | 99 (18d10) |
  | 17–20 | 55 (10d10) | 99 (18d10) | 132 (24d10) |

  **Spell equivalent by level:** 1–4 cantrip / 1st / 2nd · 5–10 1st / 3rd / 6th · 11–16 3rd / 6th / 9th · 17–20 6th / 9th / 9th + 5th.

  **Triggers:** most are found with DC 20 Perception or Investigation; crude ones DC 15, devious ones DC 25. Spotting a trigger doesn't always reveal the whole trap. **Disarming:** one successful check (thieves' tools DEX, STR to wreck it, INT (Arcana) for a magic trap); the trap may name a number at or below which the attempt triggers it.

- **Complex traps (pp. 118–123).** They run like a legendary monster:
  - **Initiative:** slow (10), fast (20), or very fast (20 and 10).
  - **Elements:** active elements act on the trap's turn; dynamic elements escalate over rounds; constant elements hurt anyone who ends a turn in the area, usually at half the active damage.
  - **Defeating one:** each element falls to its own checks, by default **three successes**. Each success weakens it (save DC or attack bonus down, damage halved, then off), and each attempt usually costs an action.
  - **XP for overcoming one:** levels 1–4 650 · 5–10 3,850 · 11–16 11,100 · 17–20 21,500.
  - **Examples photographed:** Path of Blades (levels 1–4, dangerous: whirling blades, crushing pillars, a rune of fear); Sphere of Crushing Doom (5–10, deadly: a steel sphere through portals); Poisoned Tempest (11–16, deadly: locked doors, rising poison gas, a d6 tempest table).
- **Why it matters here.** Malachar must not improvise trap numbers. With these tables in his prompt, or in a `traps` table the board can place, any trap he builds lands on the book's numbers: a level-1–4 "dangerous" dart is +8 to hit for 11 (2d10), full stop.

## 7. Downtime Revisited: rivals (pp. 123–124, partly photographed)

- **Rivals are NPCs who oppose the characters during downtime,** not necessarily villains: a tax collector, a jealous priest, a rival adventuring party. The book suggests two or three at a time, each with a separate agenda.
- **Building one:** goals (why they interfere), assets (money, followers, influence), and plans (three or four kinds of action, played out during downtime or described as happening off-screen). A d20 table of example rivals and a worked example (Marina Rodemus) follow.
- **Why it matters here.** Camp is this campaign's downtime. A rival's plans advancing while the party rests would fit the camp module's passive roll and the six hidden relationship dimensions (§5), if Sam wants it.

- **Why it matters here.** The Velkynvelve escape and the tunnels beyond would use exactly these, and Malachar must not improvise trap numbers. A `traps` table, or catalog-style rows the board can place, would be the canon home if Sam wants them live.
