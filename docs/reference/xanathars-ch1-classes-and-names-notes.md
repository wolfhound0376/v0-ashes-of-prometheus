# Xanathar's Guide to Everything: class options (ch. 1) and Character Names (Appendix B), notes for later

**Status:** reference only. Nothing here is wired.
**Source:** pages Sam photographed from his copy, 2026-09-27 (pp. 7–60, 175–180, except pp. 26 and 36; several ch. 1 photos are low-resolution, so those features are given in outline only). They're summarised in Claude's words with page numbers, and the name tables are described, not copied. Check the book before quoting a rule to players.
**Companion:** `docs/reference/xanathars-ch2-dm-tools-notes.md` (ch. 2, DM's tools).

> **Edition ruling (Sam, 2026-09-27): "2024 for subclass."** Every class takes its subclass **at level 3**, including the Xanathar's ones below, whatever level the book prints. The book's own table (p. 7) gives 2014 timing: cleric, sorcerer and warlock at 1; druid and wizard at 2; everyone else at 3. **Ignore those levels here.**
>
> What this means for the party (live `characters`, 2026-09-27):
> - Samson (cleric 1), Kenta (sorcerer 1), Fifi (rogue 1) and Scott (bard 1) choose at level 3.
> - **Bastet is a level-5 barbarian with no Primal Path on the sheet.** Under 2024 rules she should already have one. Her feature list also lacks Extra Attack and Reckless Attack, so the sheet looks incomplete rather than the choice unmade. Ask her player.

## 0. The subclass list (p. 7)

The chapter adds 31 subclasses:
- **Barbarian:** Ancestral Guardian, Storm Herald, Zealot.
- **Bard:** Glamour, Swords, Whispers.
- **Cleric:** Forge, Grave.
- **Druid:** Dreams, Shepherd.
- **Fighter:** Arcane Archer, Cavalier, Samurai.
- **Monk:** Drunken Master, Kensei, Sun Soul.
- **Paladin:** Conquest, Redemption.
- **Ranger:** Gloom Stalker, Horizon Walker, Monster Slayer.
- **Rogue:** Inquisitive, Mastermind, Scout, Swashbuckler.
- **Sorcerer:** Divine Soul, Shadow Magic, Storm Sorcery.
- **Warlock:** Celestial, Hexblade.
- **Wizard:** War Magic.

Each class section opens with d6 flavour tables. The chapter then goes on to "This Is Your Life" (backstory tables) and racial feats, which haven't been photographed yet.

## 0a. Barbarian (ch. 1, pp. 8–11)

**Who this is for.** **Bastet**, a level-5 half-elf barbarian. She isn't seated in the party (`in_party` is false) as of 2026-09-27.

- **Character flavour:** d6 tables for personal totem, tattoos and superstitions. One superstition is "dwarves have lost their spirits and are almost like the undead", which gives a barbarian something to say about duergar.
- **Path of the Ancestral Guardian.**
  - Level 3: **Ancestral Protectors**. While raging, the first creature she hits each turn has disadvantage on attacks against anyone but her, and anyone else it hits takes half damage (resistance).
  - Level 6: **Spirit Shield**, a reaction that cuts damage to an ally within 30 ft by 2d6, rising to 3d6 at 10 and 4d6 at 14.
  - Level 10: Consult the Spirits (*augury* or *clairvoyance*, once per short rest).
  - Level 14: Vengeful Ancestors.
- **Path of the Storm Herald.**
  - Level 3: **Storm Aura** while raging, 10 ft, with one environment chosen:
    - desert: fire damage to everyone nearby;
    - sea: lightning to one target, DEX save;
    - tundra: temporary hp to allies.
  - Level 6: Storm Soul (resistance plus a utility, such as breathing underwater for sea).
  - Level 10: Shielding Storm (allies in the aura share the resistance).
  - Level 14: Raging Storm.
- **Path of the Zealot.**
  - Level 3: **Divine Fury**, +1d6 + half barbarian level (necrotic or radiant) on the first hit each turn while raging. **Warrior of the Gods:** a spell that only restores her to life needs no material components.
  - Level 6: Fanatical Focus (reroll a failed save once per rage).
  - Level 10: Zealous Presence (advantage for up to ten allies, once per long rest).
  - Level 14: **Rage beyond Death**, which keeps her standing at 0 hp until the rage ends.

**Why it matters here.** A **Zealot's Divine Fury** and an **Ancestral Guardian's Spirit Shield** both change damage math. `/api/combat` and the `[DAMAGE:]` handling would need to know her path before either could be honoured automatically. **Rage beyond Death** is the same kind of 0-hp exception as Strength of the Grave (§8).


---

## 1. Bard (ch. 1, pp. 12–16)

**Who this is for.** The party's bard is **Scott**, a level-1 half-elf, per the live `characters` table on 2026-09-27. Bards pick a college at **level 3**. The sheet has no subclass column, so that choice would have to live in the `sheet_*` family when it comes. That's worth knowing before camp level-ups (camp doc §15) reach level 3.

**Character flavour (p. 12–13), three d6 tables to roll or pick from:**

- **Defining Work:** the piece the bard is known for, whether a song, a poem or a parody. The examples are comic.
- **Instrument:** an unusual instrument. One option fits the Underdark exactly: a zither strung with drow spider silk.
- **Embarrassment:** a performance that went badly wrong once.
- **A Bard's Muse** (p. 13) is a short essay rather than a table. Its three muses are nature, love and conflict, each with a different view of what music is for.

**Why it matters here.** The camp module already gives the bard two jobs: **perform** (a camp action) and **lifting a partial rest to a full one**. A defining work or instrument is the kind of thing Malachar should mention when Scott performs. It's flavour, so it's Malachar's to voice, but it lands better if it's on the sheet (`sheet_backstory` or `sheet_appearance`) where he can read it.

**New bard colleges (pp. 14 on): Glamour, Swords, Whispers.** Only Glamour's opening page was photographed, and at low resolution. Its features in outline:

| Level | Feature | In outline |
|---|---|---|
| 3 | Mantle of Inspiration | Bonus action, spend a Bardic Inspiration: several allies within 60 ft gain temporary hp that scales with level, and can each use a reaction to move without provoking. |
| 3 | Enthralling Performance | After performing for at least a minute, a few listening humanoids must make a WIS save or be **charmed for an hour**. |
| 6 | Mantle of Majesty | Bonus action, concentration up to a minute: cast *command* as a bonus action each turn. Once per long rest. |
| 14 | Unbreakable Majesty | Bonus action, one minute: anyone attacking the bard must make a CHA save or pick another target. Once per short or long rest. |

**College of Swords (p. 15, outline).**
- **Level 3:** medium armour and scimitar proficiency; a fighting style (Dueling or Two-Weapon Fighting); **Blade Flourish**, which adds 10 ft of speed on the Attack action and lets the bard spend Bardic Inspiration on a hit for a defensive, slashing or mobile flourish.
- **Level 6:** Extra Attack.
- **Level 14:** a free d6 flourish when out of inspiration.

**College of Whispers (p. 16, outline).**
- **Level 3:** **Psychic Blades**, where a Bardic Inspiration adds psychic damage to a weapon hit, rising with level. **Words of Terror**, where a minute alone talking with someone can leave them frightened for an hour on a failed WIS save.
- **Level 6:** **Mantle of Whispers**, which captures the shadow of a humanoid dying nearby and lets the bard wear their persona for an hour.
- **Level 14:** **Shadow Lore**, a whispered word that can charm a creature for 8 hours on a failed WIS save.

**Enthralling Performance is the camp link.** The `perform` camp action currently settles on a Performance check. A Glamour bard's performance could also charm a listener, such as a visitor from the passive roll. **That's a ruling for Sam if Scott goes Glamour at level 3.**

## 2. Cleric (ch. 1, pp. 16–20)

**Who this is for.** The party's cleric is **Samson**, a level-1 human, per the live `characters` table on 2026-09-27. His sheet records no Divine Domain: `sheet_features` lists Spellcasting and the Acolyte background only.
**Sam ruled 2024 timing, so he chooses at level 3.** See the note at the top.

**Character flavour (pp. 16–17), three d6 tables:**
- **Temple:** where they trained.
- **Keepsake:** a personal item of faith.
- **Secret:** a private doubt.

A sidebar (p. 18) covers serving a pantheon, philosophy or cosmic force instead of a single god.

**Forge Domain (pp. 18–19).**

| Level | Feature | In outline |
|---|---|---|
| 1 | Bonus proficiencies | Heavy armour and **smith's tools**. |
| 1 | Blessing of the Forge | **At the end of a long rest**, touch a weapon or suit of armour: it's +1 until the next long rest. |
| 2 | Channel Divinity: Artisan's Blessing | **An hour-long ritual crafts a nonmagical item containing metal**, worth up to 100 gp. The cleric supplies metal (coins count) equal to its value, and the metal is consumed. It can duplicate a nonmagical metal item the cleric has, such as a key. |
| 6 | Soul of the Forge | Fire resistance, and +1 AC in heavy armour. |
| 8, 14 | Divine Strike | +1d8 fire once per turn on a weapon hit, then 2d8. |
| 17 | Saint of Forge and Fire | Fire immunity, and in heavy armour, resistance to nonmagical weapon damage. |

Domain spells: *identify, searing smite · heat metal, magic weapon · elemental weapon, protection from energy · fabricate, wall of fire · animate objects, creation*.

**Grave Domain (pp. 19–20).**

| Level | Feature | In outline |
|---|---|---|
| 1 | Circle of Mortality | Healing a creature at 0 hp uses the **maximum** on each die. *Spare the dying* is a bonus action at 30 ft and doesn't count toward cantrips known. |
| 1 | Eyes of the Grave | Action: sense undead within 60 ft. WIS-mod uses per long rest. |
| 2 | Channel Divinity: Path to the Grave | Curse a creature; the next hit on it deals double damage (vulnerability). |
| 6 | Sentinel at Death's Door | Reaction: turn a critical hit into a normal hit. WIS-mod uses per long rest. |
| 8 | Potent Spellcasting | Add WIS to cleric cantrip damage. |
| 17 | Keeper of Souls | When an enemy dies nearby, heal someone by that enemy's Hit Dice count. |

Domain spells: *bane, false life · gentle repose, ray of enfeeblement · revivify, vampiric touch · blight, death ward · antilife shell, raise dead*.

**Why it matters here.**
- **Forge is a crafting cleric.** At level 1, it brings smith's tools proficiency, which lights up §16's Construct tab.
- **Blessing of the Forge happens at the end of a long rest**, which is a camp moment.
- **Artisan's Blessing** (level 2) is an hour-long ritual that makes a metal item: a natural **camp action**. Like everything else, the result must resolve against the catalog (invariant 1). The 100 gp cap and the "pay in metal" rule would map onto `payFromPurse`.
- **Grave's Circle of Mortality** changes healing math at 0 hp. `/api/chat`'s HEAL handling would need to know the healer's domain.

## 3. Druid (ch. 1, pp. 21–25, low-resolution photos)

**No druid in the party** as of 2026-09-27, so these are brief.

- **Character flavour:** d6 tables for treasured item, guiding aspect and mentor.
- **Circle of Dreams:**
  - Level 2, Balm of the Summer Court: a pool of d6s that heal and grant temporary hp at range, as a bonus action.
  - Level 6, **Hearth of Moonlight and Shadow**: during a short or long rest, the druid wards a 30-ft sphere that helps the group's Stealth and Perception and hides its light. **This is a camp feature**, and would cut the passive visitor roll's chance of trouble finding the party, if a druid joins.
  - Level 10, Hidden Paths: teleport short distances.
  - Level 14, Walker in Dreams: after a short rest, cast dream-and-travel spells once.
- **Circle of the Shepherd:** speech with beasts and fey. Spirit Totem (bear, hawk or unicorn) buffs allies in an area. Later features strengthen summoned creatures.
- **Learning Beast Shapes (pp. 24–25):** Wild Shape options sorted by environment, with CR and fly/swim notes. The later photo adds Forest, Grassland, Hill, Mountain, Swamp, **Underdark** and Underwater, but it's too low-resolution to read the Underdark rows. Re-photograph that page if a druid ever joins.

## 4. Fighter (ch. 1, pp. 27–31)

**No fighter in the party** as of 2026-09-27.

- **Character flavour:** d6 tables for heraldic sign, instructor (gladiator, military, city watch, tribal warrior, street fighter, weapon master) and signature style.
- **Arcane Archer.**
  - Level 3: Arcana or Nature, plus *prestidigitation* or *druidcraft*. **Arcane Shot:** twice per short rest, a hit with a bow gains a magical effect. The save DC is 8 + proficiency + INT. The options are banishing, beguiling, bursting, enfeebling, grasping, piercing, seeking and shadow, each adding 2d6 of some damage type plus a rider.
  - Level 7: Magic Arrow and Curving Shot.
  - Level 15: Ever-Ready Shot.
  - Level 18: the extra damage rises to 4d6.
- **Cavalier.**
  - Level 3: a skill or language; Born to the Saddle (mounting costs 5 ft, advantage against falling off); **Unwavering Mark**, which punishes a marked foe for attacking anyone else.
  - Level 7: Warding Maneuver, a reaction that adds 1d8 to an ally's AC.
  - Level 10: Hold the Line, where opportunity attacks stop movement.
  - Levels 15 and 18: Ferocious Charger and Vigilant Defender.
- **Samurai (p. 31).**
  - Level 3: one of History, Insight, Performance or Persuasion (or a language). **Fighting Spirit:** a bonus action for advantage on weapon attacks this turn and temporary hp (5, then 10 at 10th, 15 at 15th), three times per long rest.
  - Level 7: Elegant Courtier (WIS added to Persuasion, and WIS save proficiency).
  - Level 10: Tireless Spirit.
  - Level 15: Rapid Strike.
  - Level 18: **Strength before Death**, a free turn at 0 hp.
- **Cavalier's high levels (p. 31):**
  - Level 15: Ferocious Charger, a prone-shove after a 10-ft charge.
  - Level 18: Vigilant Defender, a special opportunity attack on every creature's turn.

## 4a. Monk (ch. 1, pp. 32–35)

**No monk in the party.**

- **Character flavour:** d6 tables for monastery, monastic icon and master. One monastery was **founded by gnomes as an underground labyrinth**, which suits a monk from Blingdenstone.
- **Way of the Drunken Master.**
  - Level 3: Performance and brewer's supplies proficiency. **Drunken Technique:** Flurry of Blows also grants Disengage and +10 ft speed.
  - Level 6: Tipsy Sway (stand up for 5 ft; redirect a missed attack for 1 ki).
  - Level 11: Drunkard's Luck (2 ki cancels disadvantage).
  - Level 17: Intoxicated Frenzy.
- **Way of the Kensei.**
  - Level 3: Path of the Kensei, with two kensei weapons (a melee and a ranged, the longbow allowed); Agile Parry (+2 AC); Kensei's Shot (+1d4 at range); Way of the Brush (calligrapher's or painter's supplies).
  - Level 6: One with the Blade (magical attacks; Deft Strike for 1 ki).
  - Level 11: Sharpen the Blade.
  - Level 17: Unerring Accuracy.
- **Way of the Sun Soul.**
  - Level 3: **Radiant Sun Bolt**, a 30-ft ranged radiant attack using the martial arts die.
  - Level 6: Searing Arc Strike (*burning hands* for ki).
  - Level 11: Searing Sunburst.
  - Level 17: Sun Shield (bright light, and radiant damage back at melee attackers).

A Kensei's **Way of the Brush** grants painter's supplies, which opens the `paint` camp action (§19 of the camp doc).

## 5. Paladin (ch. 1, pp. 35–39)

**No paladin in the party.**

- **Character flavour:** d6 tables for personal goal (peace, revenge, duty, leadership, faith, glory), symbol, nemesis and temptation (fury, pride, lust, envy, despair, greed).
- **Oath of Conquest.**
  - Tenets: douse the flame of hope, rule with an iron fist, strength above all.
  - Level 3: Channel Divinity **Conquering Presence** (frighten creatures within 30 ft) or **Guided Strike** (+10 to one attack).
  - Level 7: Aura of Conquest. Frightened foes nearby can't move and take psychic damage.
  - Level 15: Scornful Rebuke.
  - Level 20: Invincible Conqueror.
  - The book ties this oath to Bel and the hell knights of Avernus.
- **Oath of Redemption.**
  - Tenets: peace, innocence, patience, wisdom.
  - Level 3: Channel Divinity **Emissary of Peace** (+5 Persuasion for 10 minutes) or **Rebuke the Violent** (radiant damage back at an attacker).
  - Level 7: Aura of the Guardian, taking an ally's damage instead.
  - Level 15: Protective Spirit, some healing each turn while below half hp.
  - Level 20: Emissary of Redemption.

**Why it matters here.** Both oaths make good **NPC templates**. A Conquest paladin is the natural shape for a demon-hunting zealot in *Out of the Abyss*, and a Redemption paladin for someone trying to talk a drow patrol down. Stat blocks for any such NPC still come from the bestiary or the campaign book, never from these class features (AGENTS.md §8, "no silent default").

## 6. Ranger (ch. 1, pp. 40–43)

**No ranger in the party.**

- **Character flavour:** d6 tables for view of the world, **homeland** and sworn enemy. One homeland is **the Underdark**, a childhood spent learning to fight its creatures.
- **Gloom Stalker, the Underdark archetype.** The book says they're often found there.
  - Level 3: extra spells (*disguise self, rope trick, fear, greater invisibility, seeming*). **Dread Ambusher:** WIS added to initiative, and on the first turn of combat +10 ft speed and an extra attack that deals +1d8. **Umbral Sight:** darkvision 60 ft (or +30 ft), and **invisible in darkness to anything relying on darkvision**, which covers most of the Underdark, drow included.
  - Level 7: Iron Mind, WIS save proficiency.
  - Level 11: Stalker's Flurry.
  - Level 15: Shadowy Dodge.
- **Horizon Walker.**
  - Level 3: extra spells; Detect Portal (within 1 mile); Planar Warrior (a hit becomes force damage, +1d8, later 2d8).
  - Level 7: Ethereal Step.
  - Level 11: Distant Strike.
  - Level 15: Spectral Defense.
- **Monster Slayer.**
  - Level 3: extra spells; Hunter's Sense (learn a creature's immunities, resistances and vulnerabilities); Slayer's Prey (+1d6 once per turn against one marked foe).
  - Level 7: Supernatural Defense.
  - Level 11: Magic-User's Nemesis.
  - Level 15: Slayer's Counter.

**Why it matters here.** Umbral Sight is the one to know even without a ranger. A Gloom Stalker NPC or rival is **invisible to the drow of Velkynvelve in the dark**. If Malachar runs one, that's the rule, not a flourish.

## 7. Rogue (ch. 1, pp. 44–47)

**Who this is for.** **Fifi of Copperas Cove** is a level-1 human rogue. Rogues pick an archetype at level 3 in both editions.

- **Character flavour:** d6 tables for guilty pleasure, adversary (a pirate captain, a spymaster, a thieves' guild master…) and benefactor (a smuggler, the Beggar King, a dragon who didn't eat you…).
- **Inquisitive.**
  - Level 3: **Ear for Deceit** (an Insight roll of 7 or lower counts as 8); **Eye for Detail** (Perception or Investigation as a bonus action); **Insightful Fighting** (a bonus-action Insight contest that allows Sneak Attack without advantage for a minute).
  - Level 9: Steady Eye.
  - Level 13: Unerring Eye (sense illusions and shapechangers).
  - Level 17: Eye for Weakness.
- **Mastermind.**
  - Level 3: **Master of Intrigue** (disguise kit, forgery kit, a gaming set, two languages, and mimicking speech); **Master of Tactics** (Help as a bonus action, at 30 ft).
  - Level 9: Insightful Manipulator.
  - Level 13: Misdirection.
  - Level 17: Soul of Deceit.
- **Scout.**
  - Level 3: **Skirmisher** (a reaction move away when an enemy ends its turn next to you); **Survivalist** (Nature and Survival with **doubled proficiency**).
  - Level 9: Superior Mobility.
  - Level 13: Ambush Master.
  - Level 17: Sudden Strike.
- **Swashbuckler.**
  - Level 3: **Fancy Footwork** (no opportunity attacks from someone you've attacked); **Rakish Audacity** (CHA added to initiative, and Sneak Attack when you and the target are alone in melee).
  - Level 9: Panache (charm or taunt with Persuasion).
  - Level 13: Elegant Maneuver.
  - Level 17: Master Duelist.

**Why it matters here.**
- **Scout** doubles Survival, the skill the `forage`/`hunt` camp actions roll. That makes a Scout the party's best forager.
- **Mastermind** adds a disguise kit and a forgery kit, which the crafting menu would count as tools.
- Both come through the existing proficiency lists, with no new wiring.

## 8. Sorcerer (ch. 1, pp. 48–52)

**Who this is for.** **Kenta** is a level-1 half-elf sorcerer. His sheet shows *Innate Sorcery* (2024) and no origin yet. **Under Sam's 2024 ruling he chooses at level 3.**

- **Character flavour:** d6 tables for arcane origin (a bloodline, a reincarnation, a prophecy, "made in a vat by an alchemist"), how people reacted, supernatural mark and **sign of sorcery** (what visibly happens when you cast).
- **Divine Soul.**
  - Level 1: **Divine Magic**, which lets you learn spells from the cleric list, plus one bonus spell by affinity: good *cure wounds*, evil *inflict wounds*, law *bless*, chaos *bane*, neutrality *protection from evil and good*. **Favored by the Gods:** add 2d4 to a failed save or missed attack, once per short rest.
  - Level 6: Empowered Healing.
  - Level 14: Otherworldly Wings.
  - Level 18: Unearthly Recovery.
- **Shadow Magic.** It comes with a d6 table of quirks (cold to the touch, a heartbeat once a minute…).
  - Level 1: **Eyes of the Dark**, darkvision 120 ft; from level 3, *darkness* for 2 sorcery points, and the sorcerer sees through it. **Strength of the Grave:** when damage would drop the sorcerer to 0 hp, a CHA save (DC 5 + the damage) leaves them at 1 hp instead. It doesn't work against radiant damage or a critical hit, and once it succeeds it's gone until a long rest.
  - Level 6: Hound of Ill Omen, 3 sorcery points for a shadow hound that hunts one target.
  - Level 14: **Shadow Walk**, a bonus-action teleport of up to 120 ft from dim light or darkness to dim light or darkness.
  - Level 18: Umbral Form.
- **Storm Sorcery.**
  - Level 1: Wind Speaker (Primordial and its dialects); Tempestuous Magic, a free 10-ft flight around casting a 1st-level-or-higher spell.
  - Level 6: Heart of the Storm (resistance, and a burst of lightning or thunder when casting those spells); Storm Guide (stop rain or steer wind).
  - Level 14: Storm's Fury.
  - Level 18: Wind Soul.
  - Weather rarely applies underground.

**Why it matters here.**
- A **sign of sorcery** is exactly the kind of detail Malachar should repeat every time Kenta casts. It's flavour, so it's his to voice, but only if it's written on the sheet (`sheet_appearance` or `sheet_backstory`), where the prompt can see it.
- **Shadow Magic is the Underdark origin.** Nearly everywhere counts as darkness, so Shadow Walk works almost anywhere.
- If Kenta takes Shadow Magic, **Strength of the Grave has to be honoured where `/api/chat` applies `[DAMAGE:]`**. That code would need to know the feature, whether it's been used since the last long rest, and whether the hit was radiant or a critical. **That's a code change, not a prompt line.**

## 9. Warlock (ch. 1, pp. 53–58)

**No warlock in the party.**

- **Character flavour:** d6 tables for the patron's attitude, special terms of the pact (abstain from alcohol, never wear the same outfit twice…) and **binding mark** (an eye that matches the patron's, a vestigial tail, a nose that glows in the dark…).
- **The Celestial.**
  - Level 1: expanded spells; *light* and *sacred flame* as bonus cantrips; **Healing Light**, a pool of d6s (1 + warlock level) spent as a bonus action to heal at 60 ft, up to CHA-mod dice at a time.
  - Level 6: Radiant Soul.
  - Level 10: **Celestial Resilience**, temporary hp for the warlock and up to five others **at the end of every short or long rest**.
  - Level 14: Searing Vengeance.
- **The Hexblade.**
  - Level 1: expanded spells; **Hexblade's Curse** (bonus action, one target for a minute: + proficiency to damage, crits on 19–20, hp back if it dies); **Hex Warrior** (medium armour, shields, martial weapons, and CHA for attacks with one weapon).
  - Level 6: Accursed Specter.
  - Level 10: Armor of Hexes.
  - Level 14: Master of Hexes.
- **New eldritch invocations (pp. 56–57):**
  - **Aspect of the Moon:** no sleep needed, and eight hours of light activity **such as keeping watch** counts as a long rest.
  - Cloak of Flies, Eldritch Smite, Ghostly Gaze, Gift of the Depths, Gift of the Ever-Living Ones, Grasp of Hadar, Improved Pact Weapon, Lance of Lethargy, Maddening Hex, Relentless Hex, Shroud of Shadow, Tomb of Levistus, Trickster's Escape.

**Why it matters here.**
- **Aspect of the Moon** lets a warlock take every watch without losing the long rest (camp doc §3).
- **Celestial Resilience** is a rest-end effect. It would sit where the rest code already hands out rest results.
- Neither needs building until someone plays a warlock.

## 10. Wizard (ch. 1, pp. 58–60)

**No wizard in the party.**

- **Character flavour:** d6 tables for spellbook (metal sheets etched with acid, inscribed stones in a bag, black pages readable only in dim light or darkness…), ambition and eccentricity.
- **War Magic.**
  - Level 2: **Arcane Deflection** (a reaction for +2 AC or +4 to a save, then only cantrips until the end of the next turn); **Tactical Wit** (INT added to initiative).
  - Level 6: Power Surge, stored energy for extra force damage.
  - Level 10: Durable Magic, +2 AC and saves while concentrating.
  - Level 14: Deflecting Shroud.
- **Timing.** Level 3, per Sam's 2024 ruling; the book says level 2. The warlock's patron is also level 3, not the book's level 1.

## 11. Character names (Appendix B, pp. 175–180)

**What it is.** A set of **d100 tables of names**, each with 50 names, two numbers per name. They're sorted by people and by kind of name:

| People | Tables |
|---|---|
| Dragonborn | female, male, clan |
| Dwarf | female, male, clan |
| Elf | child, female adult, male adult, family |
| Gnome | female, male, clan |
| Halfling | female, male, family |
| Half-orc | female, male |
| Tiefling | female, male, virtue names |

Human names grouped by real-world culture follow after p. 180; they weren't photographed. The introduction says a name needn't match the character's people, and a DM may give a people a different naming culture entirely.

**How it maps to the Underdark.** The book has no drow, duergar, deep gnome or kuo-toa tables.

- **Drow:** the Elf tables are the nearest, but *Out of the Abyss* has its own drow naming. **The campaign book wins.**
- **Duergar:** Dwarf. The male list even has a "Duergath".
- **Deep gnomes (svirfneblin):** Gnome.
- **Orcs:** Half-orc. "Ront" is on the half-orc male list, so Ront's name is book-style.
- **Kuo-toa, goblins, myconids:** nothing here.

**Why it matters here.**

1. **Unnamed NPCs get improvised names.** Names are flavour and so Malachar's to choose (invariant 2). But **once spoken, a name is canon**: `npc_encounters` keys faces, voices and conditions by name (the Jimjar bug, AGENTS.md §8). A name picked from a consistent list reads better than an ad-lib.
2. **Any name generator must avoid names already in `npc_encounters`.** Otherwise a new stranger inherits an old NPC's face and voice.
3. **The tables aren't copied into this repo.** At about 1,150 names they're a substantial piece of the book.

**Sam's ruling (2026-09-27): "Malachar can make up names; that's fine."** No generator and no lists. Names stay Malachar's flavour (invariant 2). Point 2 above still holds: once he has spoken a name, it's canon.
