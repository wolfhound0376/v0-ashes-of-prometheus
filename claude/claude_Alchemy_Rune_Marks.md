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

**Learning a found mark** is an Intelligence (Arcana) check on a quiet hour — at camp, not under pressure. Failure costs the hour, not the mark; you can try again next rest. **Learning a taught mark** costs no check and no hour. It costs whatever the teacher wants.

---

## The eight

Placed against real `subnodal_nodes` (the 14 canon Velkynvelve nodes), real `travel_nodes`, and the real `npc_encounters` roster. No invented locations, no invented NPCs.

### 1. Abjuration — the ward under the shrine
**Where:** Velkynvelve node 6, Shrine to Lolth (sector E)
**How:** found. DC 14 Arcana.
**Cost:** you have to be alone in the shrine.

The floor is cut with a containment ward — drow work, meant to hold something in rather than keep anything out. It is the first mark most parties get and the right one to be first: abjuration is the *lower impurity* rune, so it teaches that a rune can clean a brew as well as sharpen it.

Pairs with the node's existing desecration objective. A party that smashes the shrine before reading the floor loses the mark permanently — worth letting them.

### 2. Illusion — scratched in the zurkhwood
**Where:** Velkynvelve node 11, Slave Pen (sector A)
**How:** found. DC 12 Arcana — the lowest in the set.
**Cost:** none. This one is a gift.

Someone was here before you and wanted very badly not to be seen. The mark is scratched into a zurkhwood post at knee height, where a sitting prisoner could work at it without being noticed.

**Sarith Kzekarit** knows what it is, and knows who cut it. Whether he says so is his business.

The easiest mark in the game should be the one a prisoner would want most, and it should be *in the cell*. Illusion buys advantage on Stealth and Deception.

### 3. Divination — Ilvara's scrying notes
**Where:** Velkynvelve node 7, Ilvara's Quarters (sector E)
**How:** found. DC 16 Arcana.
**Cost:** **she notices.** This is a theft from a priestess of Lolth with a working divination habit, and the notes are how she watches. Taking them should change how hard she looks for you.

Divination buys advantage on the next attack roll — you saw it coming. Appropriate that it comes from the person who sees everything, and that stealing it is what makes her see you.

### 4. Transmutation — the smith's keening mark
**Where:** Velkynvelve node 10, Guard Tower (sector B), during the armoury raid
**How:** found. DC 13 Arcana.
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

---

## Where that leaves the curve

| Stage | Marks available | Note |
|---|---|---|
| Velkynvelve | Illusion (12), Abjuration (14), Transmutation (13), Divination (16) | All four are *found*; a party that never opens a book leaves with none |
| The escape road | Necromancy | Free, from Buppido, and it is the dangerous one |
| Sloobludop | Conjuration | First *taught* mark; first door for a non-caster |
| Gracklstugh | Evocation | The one you pay for |
| Neverlight Grove | Enchantment | The one that costs you something stranger |

`blingdenstone` deliberately holds none. It is the arc's endpoint and should not be a shop.

Four found, four taught. The found ones front-load in the prison where an Arcana check is the only tool a prisoner has; the taught ones spread across the road, which is what keeps Fifi's Arcana path alive past chapter 1 and stops the whole system belonging to Kenta.

## Sourced vs homebrew

**SOURCED:** all fourteen Velkynvelve nodes and their sector codes and stated game uses, straight from `subnodal_nodes`; Sloobludop, Gracklstugh, Neverlight Grove and Blingdenstone from `travel_nodes`; Ilvara Mizzrym, Sarith Kzekarit, Shuushar the Awakened, Stool and Buppido from `npc_encounters` and Out of the Abyss; Intelligence (Arcana) checks and advantage (SRD).

**HOMEBREW — invented here, all Sam's to overrule:** the mark system itself, every placement, every DC, every cost, what each school's rune does, the found/taught split, and the reading of Buppido as the necromancy source.

## Open questions

1. **Is the Buppido hook too on-the-nose?** It is the strongest idea in this draft and also the one most likely to read as the DM winking. The alternative is putting necromancy in the Quaggoth Den (node 12) as a found mark and leaving Buppido out of it.
2. **Ilvara noticing the theft** needs a mechanical consequence or it is just flavour. Pursuit pressure? A scrying scene? Her knowing a name she should not?
3. **Should a found mark be losable?** Written above so that smashing the shrine before reading it costs the mark forever. That is a real punishment for a reasonable action, so flag it now rather than at the table.
4. **DCs 12–16** are a guess at this party's Arcana. Worth checking Kenta's actual modifier before these are fixed.
