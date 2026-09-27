# Xanathar's Guide to Everything: index of what the project holds

**What this is:** the map of the whole book against what Ashes of Prometheus has catalogued from it. Sam, 2026-09-27: "Make sure we catalog all of Xanathar's Guide into the appropriate reference file for later use and Malachar/DM access."
**Rule for every file here:** paraphrase in our own words with page numbers. The book's prose and full tables are not copied (copyright), so each number points back to Sam's copy.

## Where it lives

| File | Covers |
|---|---|
| `docs/reference/xanathars-ch1-classes-and-names-notes.md` | Ch. 1, the subclasses (pp. 7–60), and Appendix B names (pp. 175–180) |
| `docs/reference/xanathars-ch2-dm-tools-notes.md` | Ch. 2, the DM's Tools (pp. 77–92, 106–145) |
| `lib/data/spells.json` | Ch. 3 spells: already in the game's spell data (556 spells, Xanathar's included, e.g. Absorb Elements, Toll the Dead, Healing Spirit) |
| This file | The index and the gaps |

**How Malachar and the DM reach it:** both notes files are ingested into Supabase as the book `xge-notes` (`campaign_books` / `campaign_chunks`, embedded with gte-small), under the campaign slug `out-of-the-abyss`.
- **Malachar:** the scene-anchored retrieval that already feeds him the campaign book and the SRD (`lib/world-ai/book-retrieval.ts` → `ask-world`) now searches these notes too. He never cites them to players (`formatBookPassages`).
- **The DM, by keyword** (Supabase SQL editor): `select section, content from search_srd('set a trap', 5, null, 'xge-notes');`
- **Re-ingesting after an edit:** `scripts/ingest-xge-notes.mjs` (see its header).

## The book, chapter by chapter

| Part | Pages | Held | Notes |
|---|---|---|---|
| **Ch. 1 Character Options**: subclass list | 7 | ✅ | ch1 notes §0 |
| Barbarian | 8–11 | ✅ | §0a: Ancestral Guardian, Storm Herald, Zealot |
| Bard | 12–16 | ✅ | §1: Glamour, Swords, Whispers |
| Cleric | 16–20 | ✅ | §2: Forge, Grave |
| Druid | 21–25 | ✅ (low-res) | §3: Dreams, Shepherd, beast shapes (Underdark list unreadable) |
| Druid beast shapes, cont. | 26 | ❌ | not photographed |
| Fighter | 27–31 | ✅ | §4: Arcane Archer, Cavalier, Samurai |
| Monk | 32–35 | ✅ | §4a: Drunken Master, Kensei, Sun Soul |
| Paladin | 35–39 | ✅ (p. 36 partly) | §5: Conquest, Redemption |
| Ranger | 40–43 | ✅ | §6: Gloom Stalker, Horizon Walker, Monster Slayer |
| Rogue | 44–47 | ✅ | §7: Inquisitive, Mastermind, Scout, Swashbuckler |
| Sorcerer | 48–52 | ✅ | §8: Divine Soul, Shadow Magic, Storm Sorcery |
| Warlock | 53–58 | ✅ | §9: Celestial, Hexblade, new invocations |
| Wizard | 58–60 | ✅ | §10: War Magic |
| This Is Your Life (backstory tables) | 61–72 | ❌ | not photographed |
| Racial feats | 73–75 | ❌ | not photographed |
| **Ch. 2 Dungeon Master's Tools**: simultaneous effects, falling, sleep, adamantine, knots, tools | 77–85 | ✅ | ch2 notes §1–§4 |
| Spellcasting, AoE, encounter building, random encounters (intro) | 85–92 | ✅ | ch2 notes §4 |
| Random encounter tables, other environments | 93–105 | ❌ | Arctic, Underwater and Urban were photographed; Coastal, Desert, Forest, Grassland, Hill, Mountain and Swamp were not |
| **Underdark random encounters** | 106–109 | ✅ | ch2 notes §5, checked against the bestiary |
| Traps Revisited | 113–123 | ✅ | ch2 notes §6 |
| Downtime Revisited: rivals and activities | 123–134 | ✅ | ch2 notes §7–§8 |
| Awarding magic items; common magic items; item tables | 135–145 | ✅ | ch2 notes §9–§10 |
| **Ch. 3 Spells** | 147–172 | ✅ as data | `lib/data/spells.json` |
| **Appendix A: Shared Campaigns** | ~172–174 | ❌ | not photographed; organised-play guidance, low value here |
| **Appendix B: Character Names**, nonhuman | 175–180 | ✅ | ch1 notes §11 (described, not copied) |
| Appendix B, human names | 181–192 | ❌ | not photographed; Sam ruled Malachar makes up names anyway |

## Already wired into the game from this book

- **Tools and skills together → advantage**, alchemist's supplies with Arcana (camp doc §18).
- **Either tool makes the item:** antitoxin by herbalism kit or alchemist's supplies (§18; the alchemy recipes themselves still await Sam's yes).
- **Rest-time tool uses as camp actions:** disguise, forgery, compose, paint, set a trap (camp doc §19).
- **Bead of Nourishment** in the catalog, counted as a ration (camp doc §20).
- **"Recharging without a dawn"** → recharge at the end of a long rest (camp doc §20).

## Still to photograph, if Sam wants them catalogued

1. **pp. 61–72 This Is Your Life.** Backstory tables: parents, siblings, life events. These would help flesh out NPCs.
2. **pp. 73–75 racial feats.** Only useful if feats are allowed at the table.
3. **pp. 93–105**, the other environments' encounter tables. Mostly surface environments, so low priority for the Underdark.
4. **p. 26**, the rest of the druid's beast shapes, and a sharper photo of the Underdark list on p. 25.
