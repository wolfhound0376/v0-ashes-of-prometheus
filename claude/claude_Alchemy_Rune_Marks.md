# Arcane Rune Marks — where the eight are found

Placement draft for the alchemy rune system. Status: **draft for Sam's approval 2026-09-29. Nothing written to the catalog or to any node.**

Rules: `claude/claude_Alchemy_Minigame.md` §3. Grid: `claude/claude_Alchemy_Grid.md`.

---

## What a mark is

A **mark** is the knowledge of how to inscribe one school's rune on a sealed vessel. It is not a consumable — the wax and chalk are consumables, the mark is a thing a character knows. One row per character per school:

```
character_known_runes (character_id, school, learned_via, learned_at)
```

Sam's rulings this sits on: runes buy **advantage on rolls**, not potency; **only magic users can inscribe**; the knowledge must be **found**, not bought at level-up. Divine is not arcane, so a cleric is on the separate bases track and never learns a mark.

**Who can hold one in this party:** Kenta (Sorcerer) and Scott (Bard). Samson is divine and excluded by ruling. Fifi is a Rogue — but the spec's second door is *Arcana proficiency plus a taught mark*, so a mark with a teacher is a real path for her, and it hooks straight into earned proficiency. Four of the eight below are taught rather than found, which is what keeps that door open.

**Learning a found mark** is a check on a quiet hour — at camp, not under pressure. Failure costs the hour, not the mark; you can try again next rest. **Learning a taught mark** costs no check and no hour. It costs whatever the teacher wants.

### The check is Charisma (Arcana), not Intelligence

Measured against the live `characters` rows on 2026-09-29, not assumed:

| Character | Class | INT | Arcana proficient? | Arcana modifier |
|---|---|---|---|---|
| Kenta | Sorcerer 1 | 9 (−1) | no | **−1** |
| Scott | Bard 1 | 10 (+0) | no (see flag below) | **+0** |
| Fifi | Rogue 1 | 12 (+1) | no | **+1** |
| Samson | Cleric 1 | 12 (+1) | no | **+1** |

**Nobody in this party has Arcana proficiency, and the two people who can actually use a mark have the two worst Intelligence scores in the party.** An Intelligence (Arcana) ladder at DC 12–16 would have handed Kenta a 20% chance on the Divination mark and a 40% chance on the easiest one in the game. The found half of the system would simply never have happened at the table.

So the check is **Charisma (Arcana)** for spontaneous casters — the DMG's own variant of pairing a skill with a different ability. A sorcerer did not study this; they recognise it. Kenta's Charisma modifier is +3 (derived from his Persuasion +5 less his +2 proficiency), which makes the ladder below play at 55–75% rather than 20–40%.

A character who *does* have Arcana proficiency may use Intelligence (Arcana) instead, whichever is better. If Kenta ever earns Arcana through the earned-proficiency system, that is a real and visible upgrade rather than a wash.

> **Data flag, unrelated to alchemy:** Scott's `sheet_skill_proficiencies` is an empty object `{}`. A Bard has three skill proficiencies at level 1, so that sheet is incomplete. Worth fixing before these DCs are trusted — and it is the same `sheet_skill_proficiencies` key hygiene item already on the list, where Fifi's keys are lowercase-with-underscores and everyone else's are Title Case.

---

## The eight

Placed against real `subnodal_nodes` (the 14 canon Velkynvelve nodes), real `travel_nodes`, and the real `npc_encounters` roster. No invented locations, no invented NPCs.

### 1. Abjuration — the ward under the shrine
**Where:** Velkynvelve node 6, Shrine to Lolth (sector E)
**How:** found. DC 13 Charisma (Arcana).
**Cost:** you have to be alone in the shrine.

The floor is cut with a containment ward — drow work, meant to hold something in rather than keep anything out. It is the first mark most parties get and the right one to be first: abjuration is the *lower impurity* rune, so it teaches that a rune can clean a brew as well as sharpen it.

Pairs with the node's existing desecration objective. A party that smashes the shrine before reading the floor loses the mark permanently — worth letting them.

### 2. Illusion — scratched in the zurkhwood
**Where:** Velkynvelve node 11, Slave Pen (sector A)
**How:** found. DC 10 Charisma (Arcana) — the lowest in the set.
**Cost:** none. This one is a gift.

Someone was here before you and wanted very badly not to be seen. The mark is scratched into a zurkhwood post at knee height, where a sitting prisoner could work at it without being noticed.

**Sarith Kzekarit** knows what it is, and knows who cut it. Whether he says so is his business.

The easiest mark in the game should be the one a prisoner would want most, and it should be *in the cell*. Illusion buys advantage on Stealth and Deception.

### 3. Divination — Ilvara's scrying notes
**Where:** Velkynvelve node 7, Ilvara's Quarters (sector E)
**How:** found. DC 15 Charisma (Arcana).
**Cost:** **she notices.** This is a theft from a priestess of Lolth with a working divination habit, and the notes are how she watches. Taking them should change how hard she looks for you.

Divination buys advantage on the next attack roll — you saw it coming. Appropriate that it comes from the person who sees everything, and that stealing it is what makes her see you.

### 4. Transmutation — the smith's keening mark
**Where:** Velkynvelve node 10, Guard Tower (sector B), during the armoury raid
**How:** found. DC 12 Charisma (Arcana).
**Cost:** it is in a guard tower. The cost is the tower.

A working mark, not a scholar's — cut into a whetstone block, used by whoever keeps drow blades sharp. Transmutation buys advantage on an ability check of your choosing, which makes it the generalist of the set and the right one to sit behind a fight rather than a puzzle.

### 5. Conjuration — the fish-wife's welcome
**Where:** `sloobludop` — the kuo-toa village
**How:** **taught**, by **Shuushar the Awakened**.
**Cost:** none he will name. Shuushar teaches because teaching is what he does, and that will be more unsettling than a price.

Conjuration doubles a potion's duration or splits it into two weaker doses — the sharing rune. Of everyone in the campaign, the enlightened kuo-toa is the one who would think to hand you that.

A **taught** mark, so this is a door for Fifi.

### 6. Evocation — bought in the City of Blades
**Where:** `gracklstugh`
**How:** **bought or won** from a duergar smith.
**Cost:** money, or a favour, or a fight. Duergar do not teach for free.

Evocation is the only true potency rune in the table — it fortifies the potion's own numbers. It should be the one you *pay* for, in the city that sells everything, and it should arrive late enough that the party has already learned to live without it.

### 7. Enchantment — the grove's communion
**Where:** `neverlight-grove`
**How:** **taught**, by the myconids. **Stool** brokers it if he is still with the party.
**Cost:** you have to take the rapport spores to be taught, which means letting them in.

Enchantment buys advantage on Charisma checks, and the myconid version of persuasion is not persuasion — it is being briefly the same organism as the person you are talking to. That is the most alien way to learn a social buff and it should feel like it.

A **taught** mark. Second door for Fifi.

### 8. Necromancy — what Buppido offers
**Where:** anywhere. **Buppido** carries it and he is travelling with you.
**How:** **taught**, freely, cheerfully, unprompted, possibly more than once.
**Cost:** nothing up front. That is the problem.

Necromancy is the rune that grants advantage **and +1 impurity** — power with a bill attached. It is the easiest mark in the campaign to acquire and the most expensive to use, and it is offered by the friendliest face in the marching order.

Buppido believes he is a god. He would very much like to teach someone something. Let him.

**Design note:** this is the mark that makes the system say something. Every other mark is gated by a place you have to reach or a check you have to pass. This one is gated by nothing at all, and it is the one that costs you every time you use it.

**Ruled 2026-09-29: Buppido stays.** The Quaggoth Den gets something of its own instead — below.

---

## The Quaggoth Den — the cache, not a mark

**Where:** Velkynvelve node 12, Quaggoth Den (sector C)
**How:** searched, not deciphered. No check to read anything; the cost is the quaggoths.

A mark is knowledge. Knowledge alone brews nothing — **a rune needs wax**, and nothing else in this draft said where the party's first wax comes from. It comes from here.

Hidden in the bedding at the back of the den, where drow do not go and quaggoths do not care:

| What | Why it matters |
|---|---|
| **Drow sigil-wax**, several sticks | The consumable every rune is inscribed with. Without it the marks are theory. |
| **A recipe, `drifted`** | The party's first Poisoned Cookbook page — a bad copy, +1 impurity, spottable on a moderate Intelligence (Nature) check when read. It teaches the mechanic on a low-stakes page. |
| **The bones of the prisoner who cut the Illusion mark** | They got this far. The den is as far as they got. |

That last line is the point of the node. The Slave Pen mark and this cache are one story read in two places: someone worked at a post for weeks, made it across the compound, and stopped here. The party is following a route that has already failed once.

The quaggoths are why the cache is still there. Sector C is a creature encounter with a stealth bypass — and the bypass is the trap, because slipping past the den quietly means never finding any of this.

---

## Ilvara's pool — what noticing actually does

**Ruled 2026-09-29: pursuit pressure, and she scries through still water.**

Taking her notes starts a **pursuit track**, 0–6, visible to the DM and never to the players. It opens at 1 the moment the Divination mark is taken.

| Trigger | Track |
|---|---|
| Long rest camped within sight of still water | +1 |
| Drinking or drawing from a standing pool rather than a `waterorb` or `barrelstalk` | +1 |
| Camping dry — no standing water in the node | 0 |
| A potion sealed with the **Abjuration** rune, drunk at camp | −1, once per rest |

| Track | What happens |
|---|---|
| 3 | A drow patrol crosses the party's route. It does not find them. It is not supposed to. |
| 5 | Ambush, at a place of Ilvara's choosing rather than theirs |
| 6 | She knows their node. Malachar may say so out loud. |

**Why this is the right consequence.** Velkynvelve node 14 is Pool / Underground River — the water escape, and one of the best ways out of the compound. Making still water her eye means **the fastest way out is also the way she watches**, and the party makes that trade without knowing they are making it until the patrol shows up.

It also gives two things a second job. The Abjuration mark stops being only the impurity rune and becomes the counter-scrying rune, which means the first mark most parties find still matters in chapter 4. And `waterorb` and `barrelstalk` — until now just two more foraging rows — become the difference between drinking safely and drinking where she can see you.

Standing rule for Malachar: **he never says the water is watched.** He describes still water, in detail, every time. The players work it out or they do not.

---

## Where that leaves the curve

| Stage | Marks available | Note |
|---|---|---|
| Velkynvelve | Illusion (10), Transmutation (12), Abjuration (13), Divination (15) | All four are *found*; a party that never opens a book leaves with none |
| Velkynvelve, node 12 | *no mark* — the wax cache, a drifted recipe, and a body | Without the wax the marks are theory |
| The escape road | Necromancy | Free, from Buppido, and it is the dangerous one |
| Sloobludop | Conjuration | First *taught* mark; first door for a non-caster |
| Gracklstugh | Evocation | The one you pay for |
| Neverlight Grove | Enchantment | The one that costs you something stranger |

`blingdenstone` deliberately holds none. It is the arc's endpoint and should not be a shop.

Four found, four taught. The found ones front-load in the prison where an Arcana check is the only tool a prisoner has; the taught ones spread across the road, which is what keeps Fifi's Arcana path alive past chapter 1 and stops the whole system belonging to Kenta.

## Sourced vs homebrew

**SOURCED:** all fourteen Velkynvelve nodes and their sector codes and stated game uses, straight from `subnodal_nodes`; every ability score, modifier and skill proficiency in the table above, read from the live `characters` rows on 2026-09-29; Sloobludop, Gracklstugh, Neverlight Grove and Blingdenstone from `travel_nodes`; Ilvara Mizzrym, Sarith Kzekarit, Shuushar the Awakened, Stool and Buppido from `npc_encounters` and Out of the Abyss; Intelligence (Arcana) checks and advantage (SRD).

**HOMEBREW — invented here, all Sam's to overrule:** the mark system itself, every placement, every DC, every cost, what each school's rune does, the found/taught split, the reading of Buppido as the necromancy source, the Quaggoth Den cache, the pursuit track and its numbers, Ilvara scrying through still water, and the Charisma (Arcana) substitution.

## Open questions

1. **Is the Buppido hook too on-the-nose?** It is the strongest idea in this draft and also the one most likely to read as the DM winking. The alternative is putting necromancy in the Quaggoth Den (node 12) as a found mark and leaving Buppido out of it.
2. **The pursuit track numbers** — 0–6 with a patrol at 3 and an ambush at 5 is a first guess and wants one session of play against it.
3. **Should a found mark be losable?** Written above so that smashing the shrine before reading it costs the mark forever. That is a real punishment for a reasonable action, so flag it now rather than at the table.
4. **The Charisma (Arcana) substitution is homebrew** (a DMG variant, applied here as a standing rule for spontaneous casters). If you would rather keep it Intelligence, the DCs have to drop to roughly 8–12 or the found marks do not happen.
