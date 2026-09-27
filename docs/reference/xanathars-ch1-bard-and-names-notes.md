# Xanathar's Guide to Everything: Bard (ch. 1) and Character Names (Appendix B), notes for later

**Status:** reference only. Nothing here is wired.
**Source:** pages Sam photographed from his copy, 2026-09-27 (pp. 12–14, 175–180). They're summarised in Claude's words with page numbers, and the name tables are described, not copied. Check the book before quoting a rule to players.
**Companion:** `docs/reference/xanathars-ch2-dm-tools-notes.md` (ch. 2, DM's tools).

---

## 1. Bard (ch. 1, pp. 12–14)

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

**Enthralling Performance is the camp link.** The `perform` camp action currently settles on a Performance check. A Glamour bard's performance could also charm a listener, such as a visitor from the passive roll. **That's a ruling for Sam if Scott goes Glamour at level 3.**

## 2. Character names (Appendix B, pp. 175–180)

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
3. **The tables aren't copied into this repo.** At about 1,150 names they're a substantial piece of the book. If Sam wants a generator, the options are:
   - Malachar is told the naming *style* of each people (say, dwarf clan names are compound words about stone, fire and metal), and invents in that style;
   - Sam enters lists he's happy to have in the database;
   - we write our own lists.
