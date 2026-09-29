# Ashes of Prometheus — The Sectioned Journal (design of record, 2026-09-29)

**Status:** design + pure rules module. Schema is **shown, never run** (§9). Nothing in this document is wired.
**Authority:** extends `docs/claude_Journal_Module.md` (merged, PRs #578 + #582). Interlocks with `claude/claude_Alchemy_Minigame.md`, which already says at line 142 that recipes *"hang off loot ceremony and the journal system"* — this is that system. Sits under `claude_Architecture_Canon.md` (Layer 1).
**Provenance:** Sam's rulings of 2026-09-29 are quoted inline. Everything not quoted is Claude's proposal and needs his yes. Nothing here invents game data.

---

## 0. The one line

**The journal stops being a diary and becomes the character's second sheet.** Sam, 2026-09-29: the book gains sections, most entries arrive by consent rather than by typing, the system tags what goes in, and what is written down becomes *mechanically real* — recipes you can brew, weaknesses you can exploit, stories you can sell. A journal is now worth stealing for what it does, not only for what it says.

That last sentence is the whole design. The custody and disclosure rules already merged (`found` is terminal, the owner is not told) were built for a book of private thoughts. They now guard a book of **capabilities**.

---

## 1. The sections

Fourteen, from Sam's list. `section` is a new column on `journal_entries` (§9), defaulting to `pages`.

| Slug | Label | Gets there by | Gate |
|---|---|---|---|
| `pages` | Pages | The player writes, or Malachar's `[JOURNAL]` tag. **The default.** | — |
| `alchemy` | Alchemy | System tag on an herb-property discovery | — |
| `poisoner` | Poisoner | Same, when the property is a poison | — |
| `spirits` | Spirits | Same, when the property is a drink | — |
| `recipes` | Recipes | Pasted from a read document, or transcribed | see §4 |
| `arcane` | Arcane | A decoded symbol or sigil | see §4 |
| `maps` | Maps | Transcribed at camp before sleep | §3 timing |
| `clues` | Clues | Puzzle clues, transcribed | — |
| `quests` | Quests | **Automatic** on accepting a quest — no prompt | — |
| `songs` | Songs & Ballads | Transcribed (proficient) or noted down (not) | see §4 |
| `lore` | Lore | Bard only — stories with value | **bard** |
| `visions` | Visions & Whispers | Nightmares, visions, things overheard, cultural insight | — |
| `autopsy` | Autopsy | Examining a corpse for weaknesses | **Medicine** |
| `drawings` | Drawings | The player draws something seen or imagined | — |

**Naming I chose and Sam should overrule if he dislikes it:** `visions` / "Visions & Whispers" for his item 10. His list — nightmares, visions, things overheard, cultural insights — is wider than "visions" alone, and "Whispers" carries the overheard half without needing a second section.

**One section per entry.** A page is filed once. A recipe found *in* a vision is a recipe; the vision is its own page. Two pages, two sections, cross-referenced by `tags`, never one page in two places.

---

## 2. Consent: the small window

Sam: *"it automatically opens a small window asking if you want to journal this."*

So discovery does **not** write a page. It creates an **offer**, and the offer is the thing the player accepts or dismisses. This matters for three reasons: a player who is away from the keyboard loses nothing, a character who declines to record something has made a real choice, and the book stays *theirs* — nothing appears in it that its owner did not put there.

```
discovery  →  journal_offer (pending)  →  player accepts  →  journal_entries row
                                       →  player declines →  offer closed, nothing written
                                       →  window passes   →  offer expires
```

**Two windows**, because Sam's examples have two different timings:

- `immediate` — herb properties, recipes, decoded sigils, clues. Prompted at the moment of discovery.
- `before_sleep` — maps, per Sam: *"Maps brought back from foraging (at the end) / exploring / hunting can be transcribed before going to sleep."* The offer is raised at camp and dies when the long rest resolves. This hands the camp module a real decision: transcribing is a thing you do *instead of* something else at the fire.

**Quests are the exception and take no offer.** Sam: *"Quests accepted automatically get journaled into the Quest section."* Accepting the quest is the consent.

**The offer carries the page**, already written by the system from the tagged data — not by Malachar. That keeps the standing rule intact: the AI invents no game data. A recipe page says what the recipe says.

---

## 3. What the entries *do* — the part that is not flavour

This is the departure from the merged module, where a page was inert text.

### Knowledge is per character

Sam, item 7: *"If you have the recipe then when doing alchemy the recipes are unlocked ONLY for you."*

That matches the alchemy spec exactly, which already gates the Grid per character (`character_known_effects`) and runes per school (`character_known_runes`). The journal becomes the **third** table in that family and the one the player can actually see:

| Section | Unlocks | Table |
|---|---|---|
| `alchemy` / `poisoner` / `spirits` | An ingredient's effect column | `character_known_effects` (alchemy spec) |
| `recipes` | That recipe at the bench | `character_known_recipes` (**new**, §9) |
| `arcane` | A rune school to inscribe | `character_known_runes` (alchemy spec) |
| `autopsy` | A creature's weakness | `character_known_weaknesses` (**new**, §9) |

**The journal page and the unlock row are written together or not at all.** One transaction. A page you can read but cannot use, or an unlock with no page explaining it, are both bugs — and the second is worse, because it is knowledge with no provenance.

### Sharing

Sam, item 3: *"NPC can act on a journal they read. So you can also share knowledge from your journal."*

Three ways knowledge leaves the book, and they are the visibility values already in the table:

- `party` — the owner shows a page deliberately. The reader gains the unlock **if they meet the gate** (§4). Fifi showing Kenta a rune page teaches Kenta nothing; he is not a caster.
- `found` — somebody took the book. The reader gains what they can use. **Terminal, and the owner is not told** — both rules already merged and now much heavier, because what leaks is a capability.
- An NPC reading it **acts on it** (§5).

**The gate is checked at reading, not at writing.** You can transcribe a rune you cannot inscribe; the page is a record, the unlock is a permission, and they are not the same thing.

---

## 4. Gates

| Gate | Rule | Source |
|---|---|---|
| Lore | Bard class only | Sam, item 11 |
| Songs | Transcribe with musical-instrument proficiency; without it the page is still written, as a plainer note that unlocks no performance | Sam, item 9: *"can be transcribed if you have musical proficiency or added into your journal (if you do not)"* |
| Autopsy | Medicine proficiency required to attempt at all | Sam, item 12: *"only to be performed with adequate medicine skill"* |
| Arcane / runes | Arcane spellcasting, or Arcana proficiency plus a taught mark. **Divine is not arcane.** | Alchemy spec §3, Sam's earlier ruling |
| Recipes | None to transcribe. Brewing needs the relevant tool proficiency, which `lib/alchemy.ts` already checks | SRD + alchemy spec |

### Autopsy — the numbers are mine and need Sam's yes

Sam gave the gate ("adequate medicine skill") and the purpose ("divine information from a foe, regarding their weaknesses"), not the maths. Proposed:

- Requires **proficiency in Medicine**, a corpse that is intact and fresh (one long rest), and the tools or an improvised blade.
- **Wisdom (Medicine) check, DC 10 + the creature's CR** rounded up, minimum DC 10.
- Success reveals **one** entry from the creature's `bestiary` row that already exists — a damage vulnerability, a resistance, a condition immunity, or a legendary/regional trait. **Never an invented weakness**; if the row has nothing left to reveal, the check says so and the corpse is spent.
- Beating the DC by 5+ reveals two.
- Failure costs the corpse. Knowing your limits is the skill.

Everything in that box is homebrew and flagged at runtime until Sam rules.

---

## 5. NPCs reading journals

Sam: *"NPC can act on a journal they read."*

The merged module's `pagesOnDiscovery` already returns the pages and flags that nothing durable can happen, because **no NPC knowledge table exists** — the only NPC table is `npc_encounters`. That gap is now the blocker for a mechanic Sam has explicitly asked for, so §9 proposes the smallest table that closes it: `npc_knowledge (npc_name, kind, payload, learned_from_character, learned_at)`.

Keyed by **name, not id** — the Jimjar rule from `AGENTS.md` §8. Canon about an NPC is keyed by name across every row, and knowledge is canon.

What "acts on it" means, kept concrete rather than atmospheric:
- Ilvara reads the escape plan; the watch rotation changes.
- A merchant reads the recipe section; the same potion is on his table next week, at a price.
- Anyone who reads the `visions` section knows what frightens you, which is the gravity system's currency.

None of that needs new AI machinery. It is a row in the prompt's NPC block, which `formatJournalBlock` already knows how to write without revealing how it knows.

---

## 6. Bard lore and the long game

Sam, item 11: *"These stories have value and can be used to tell other people for entertainment or write a book eventually that can be sold. Maybe even give you fame like Volo."*

Three tiers, and only the first is near-term:

1. **Tell it.** A `lore` page can back a Performance check at camp or in a tavern. The existing camp `perform` action already reads a band (flat / warm / moving) — a lore page in hand shifts the band, and the module already has `PERFORMANCE_BANDS`. Smallest possible hook, no new system.
2. **Compile it.** `compileJournal` already exists and already produces a book. A `lore`-only compilation with enough pages is a manuscript — a catalog item, sellable, with a value set by page count and quality.
3. **Fame.** A renown counter that a published book raises, which changes how NPCs open a scene. **Not designed here.** It touches the relationship system's six dimensions and deserves its own document rather than a paragraph in this one.

I would build 1, spec 2, and leave 3 alone until the relationship system is wired.

---

## 7. Forgery

Sam, item 3: *"Forgery needs a new author."*

`author` becomes `player | malachar | import | forged`. That is a CHECK-constraint change (§9) and it does exactly what the alchemy spec's **sabotaged recipes** need — that spec's `reliability` field already describes a recipe that *"works, and following it waives the unknown-ingredient impurity penalty"* versus one that inflates impurity **silently**, and calls out that a liar recipe *"needs no saving throw — only trust."*

A forged page is therefore not cosmetic. It is the delivery mechanism for a sabotaged recipe: planted in a book, transcribed in good faith, and discovered three hours later in the dark.

**The forged author is never shown to the player.** The dashboard renders a `forged` page exactly as it renders a `player` page. Only the DM view and the system know. A forgery the reader can spot is not a forgery.

---

## 8. What this does to the merged rules

| Merged rule | Still true? |
|---|---|
| `found` is terminal — a read page cannot be unread | **Yes, and it matters more.** What leaked is now a capability. |
| The owner is not told unless they check | **Yes**, and `unseenDisclosures` should count leaked *unlocks*, not just pages. |
| Custody — no journal, no page | **Yes**, and it now also means: no journal, no recipes at the bench. Losing the book disarms you. |
| Titles are the writer's, never derived | **Yes**, except that sectioned entries get their section label as a heading, which is the system's, not a title. |
| Page limit 600 characters | **Needs revisiting for `recipes` and `maps`.** A transcribed recipe is not a diary entry. Proposed: the limit applies to `pages`, `visions` and `lore`; structured sections are bounded by the column's 20,000 instead. |
| The AI invents no game data | **Yes**, and the offer mechanism (§2) is how it is kept — the system writes the page from tagged data, not Malachar. |

---

## 9. Schema — SHOWN, NOT RUN

Per `AGENTS.md` §10, nothing below has been executed and no migration has been applied. Sam pastes these, or tells me to.

```sql
-- 1. Sections and structured tags on the existing table.
alter table public.journal_entries
  add column if not exists section text not null default 'pages',
  add column if not exists tags jsonb;

alter table public.journal_entries
  add constraint journal_entries_section_check check (section in (
    'pages','alchemy','poisoner','spirits','recipes','arcane','maps',
    'clues','quests','songs','lore','visions','autopsy','drawings'
  ));

create index if not exists journal_entries_char_section_idx
  on public.journal_entries (character_id, section, created_at);

-- 2. Forgery gets an author (Sam, 2026-09-29).
alter table public.journal_entries drop constraint journal_entries_author_check;
alter table public.journal_entries add constraint journal_entries_author_check
  check (author in ('player','malachar','import','forged'));

-- 3. The consent window (§2).
create table if not exists public.journal_offers (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  section       text not null,
  window_kind   text not null default 'immediate' check (window_kind in ('immediate','before_sleep')),
  body          text not null,
  title         text,
  tags          jsonb,
  state         text not null default 'pending' check (state in ('pending','accepted','declined','expired')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

-- 4. Per-character unlocks. Same shape as the alchemy spec's
--    character_known_effects / character_known_runes.
create table if not exists public.character_known_recipes (
  character_id uuid not null references public.characters(id) on delete cascade,
  recipe_slug  text not null,
  learned_via  text not null,            -- 'transcribed' | 'pasted' | 'taught' | 'shared'
  journal_id   uuid references public.journal_entries(id) on delete set null,
  learned_at   timestamptz not null default now(),
  primary key (character_id, recipe_slug)
);

create table if not exists public.character_known_weaknesses (
  character_id  uuid not null references public.characters(id) on delete cascade,
  bestiary_slug text not null,
  detail        text not null,           -- copied from the bestiary row, never invented
  journal_id    uuid references public.journal_entries(id) on delete set null,
  learned_at    timestamptz not null default now(),
  primary key (character_id, bestiary_slug, detail)
);

-- 5. What an NPC learns from a journal they read (§5). Keyed by NAME,
--    per the Jimjar rule in AGENTS.md §8.
create table if not exists public.npc_knowledge (
  id                      uuid primary key default gen_random_uuid(),
  npc_name                text not null,
  kind                    text not null,   -- 'journal_page' | 'recipe' | 'plan' | 'fear'
  payload                 jsonb not null,
  learned_from_character  uuid references public.characters(id) on delete set null,
  learned_at              timestamptz not null default now()
);
create index if not exists npc_knowledge_name_idx on public.npc_knowledge (npc_name);
```

**RLS on every new table, with its read policy in the same block** — the `scene_effects` lesson in project memory: enabling RLS without a policy silently blacks out the dashboard. Writes go through service-role routes, never an anon insert policy. The exact policies are deliberately not drafted here; they belong in the migration PR where they can be reviewed against the existing `journal_read` / `journal_player_insert` pair.

**`journal_offers` is the one I would push back on myself.** It may not need to be a table at all if every offer is resolved in the same session it was raised. It becomes necessary only because of `before_sleep` — a map offer must survive until camp. If Sam would rather maps be transcribed *at the moment of the find*, the table disappears and the whole mechanism is client-side. That is a real simplification and worth one ruling.

---

## 10. Build order

One idea per PR, in dependency order.

1. **The section vocabulary + gates, pure.** `lib/journal-sections.ts` + tests. No schema. *(This PR.)*
2. **The migration** — §9, reviewed and pasted by Sam.
3. **Sections in the UI** — the dashboard journal gains tabs; entries file by `section`.
4. **Quests auto-file** — the only section needing no consent, so the shortest path to something live.
5. **The offer flow** — the small window, `immediate` first, `before_sleep` with the camp module.
6. **Alchemy interlock** — recipes and effects unlock per character; requires the alchemy minigame, which is shelved behind exploration mode.
7. **Autopsy**, once Sam rules on the DC.
8. **Sharing and NPC knowledge.**
9. **Bard lore tiers 1 and 2.**

---

## 11. Open questions

1. **`journal_offers` as a table, or client-side only?** Turns entirely on whether maps must survive until camp (§9).
2. **The 600-character limit on structured sections** — does a transcribed recipe get the diary limit? I would say no (§8).
3. **Autopsy DC 10 + CR** — mine, needs a yes (§4).
4. **`visions` as the name** for nightmares / overheard / cultural insight (§1).
5. **Drawings** — what is actually stored? A description, an uploaded image, or a canvas the player draws on? Sam's item 13 does not say, and the three have very different costs.
6. **Does a shared page's unlock survive the sharer's death?** Knowledge does; the book might not.
