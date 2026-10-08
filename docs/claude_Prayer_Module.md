# Prayer Module — design spec

**Status:** PR 1 (the pure rules module) built. Schema APPLIED 2026-10-01 (§9). Deity
seed, API route, phrasebook and UI not built.
**Code of record:** `lib/prayer.ts` + `lib/prayer.test.ts`.
**Date:** 2026-10-01
**Homebrew flag:** the whole module is homebrew. SRD 5.1 has no prayer mechanic. Every
number below is Claude's invention unless marked *sourced*, and all of it is Sam's call.

---

## 1. Live state verified before writing this

Queried against Supabase `ppadxmvvvxmnnejeaoer` on 2026-10-01:

- **No prayer, deity, faith, piety or divine table or column exists anywhere.** Zero hits
  across `information_schema`. This is greenfield.
- `characters` has **no deity column**. Samson is `Cleric L1, Lawful Neutral,
  background Acolyte` — and **no god is recorded for him anywhere in the database.**
  That is the one blocking gap (§8).
- Existing systems this plugs into, all real tables: `character_relationships`
  (6 dimensions, keyed subject/object uuid), `relationship_events` (kind, gravity,
  deltas, note, source), `world_flags`, `game_clock`, `time_log`, `rest_events`,
  `journal_entries` + `journal_offers`, `roll_requests` (**already carries `skill` and
  `dc`**), `skill_progress` + `skill_progress_rules`, `session_beats`, `npc_knowledge`,
  `character_secrets`, `dm_phrasebook`.

### Rules checked against SRD 5.1, not recalled

- **Divine Intervention** — *sourced, SRD 5.1 Classes: Cleric.* 10th level. Costs your
  action. Describe the aid you seek, roll percentile; **if you roll ≤ your cleric level,
  the deity intervenes.** GM chooses the nature; the effect of any cleric or domain spell
  is appropriate. On success unusable for 7 days, on failure after a long rest. Automatic
  at 20th.
- **Channel Divinity** — *sourced.* 2nd level, Turn Undead; "present your holy symbol and
  **speak a prayer**". Already diegetically a prayer; the module must not collide with it.
- **Shelter of the Faithful (Acolyte)** — *sourced.* Samson has this now at L1: ceremonies,
  free healing at a shrine of his faith, support from co-religionists. It is the only
  faith mechanic he currently owns and it is **social, not supernatural**. That is the
  right register for this module to extend.
- **No pantheon exists in SRD 5.1.** Confirmed by search — the deity roster cannot be
  sourced from the ingested rulebook. See §7.

---

## 2. The thesis

Every other system in this game is a contract: you roll, the DC was fixed before you
rolled, the result follows. Prayer is the one place where the engine's answer is shaped
by **what the character has already done**, not by what the die said.

That is the project thesis made mechanical. Prayer is the meaning-fantasy system.

Three rails hold it there. Break any one and it degenerates into a resource bar:

1. **Prayer never produces a spell effect, healing, damage, or a bonus to AC, attack or
   saves.** That is Divine Intervention's job. It arrives at cleric level 10 and it is the
   payoff of ten levels. Front-loading it onto a level 1 cleric breaks the class.
   Prayer's outputs are a *different currency*: information, witness, warding, and the
   one DM-granted token 5e already has (Inspiration).
2. **Prayer is never a pool.** No faith points, no bar, nothing to spend down and refill.
   The only thing that moves the odds is conduct and cost already paid.
3. **Silence is the common outcome and silence is written content.** Not a null, not an
   error toast. A specific, authored nothing — the drip, the cold, your own breath coming
   back at you. If the module ships without a silence phrasebook it has shipped broken.

---

## 3. What the player actually does

A prayer has four parts. The UI collects all four; the engine reads all four.

| Part | What it is | Why it matters mechanically |
|---|---|---|
| **Addressee** | Which god. "To whoever is listening" is legal and has its own, worse, table. | Sets which Standing ledger is read, and who *else* might hear. |
| **Petition** | Free text, the player's own words. | Content. Malachar answers *this*, not a category. |
| **Offering** | What you give. Checked against the live sheet — never taken on faith. | The only player-side lever on the odds. Promised costs are worth nothing; paid costs are worth everything. |
| **Posture** | Aloud · murmured · silent. | Decides who in the world can hear you. This is the risk dial. |

---

## 4. Standing — the hidden ledger

Per character, per deity. **Not** the six NPC relationship dimensions — a god does not
trust you or fear you. Four values:

- **Attention** `0..100` — does it know your name yet. Rises from rites kept, acts
  witnessed by the faithful, and prayers offered in genuine extremity. Decays slowly.
- **Accord** `−100..+100` — conduct measured against that deity's tenets and prohibitions.
  The moral ledger. Moved by `faith_events`, which are generated from the same stream that
  already feeds `relationship_events`.
- **Debt** `−100..+100` — bidirectional, same idea as the NPC system. **Every answered
  prayer raises your Debt.** Unpaid Debt rots: at Debt ≥ 50, Accord bleeds −1 per in-game
  week. This is the anti-vending-machine mechanism, and it is the most important number
  in the module.
- **Obligation** — named vows sworn in this deity's name, each `open` / `kept` / `broken`.

All four are hidden from the player, same as the gravity and relationship systems. What
the sheet shows is a word, not a number: *unknown · noticed · favoured · indebted ·
lapsed · forsworn*.

---

## 5. Resolution — the arithmetic, shown

**Response Number (RN)**, rolled under on d100:

```
RN = A + C + O + E + V + R − D,  clamped to [0, CAP]
```

| Term | Value |
|---|---|
| **A** Attention | 0–19 → 0 · 20–49 → 1 · 50–79 → 2 · 80–100 → 3 |
| **C** Accord | ≤ −50 → −3 · −49..−1 → −1 · 0..24 → 0 · 25..59 → +2 · 60..100 → +4 |
| **O** Offering | nothing → 0 · something that costs (a ration, a watch stood, a wound taken for another) → +1 · something irreplaceable (an heirloom, a secret, a hand) → +3 |
| **E** Extremity | from the existing gravity score of the moment: ≥70 → +3 · 40–69 → +1 · else 0 |
| **V** Vow | an open vow in this god's name, currently kept → +2 · any vow broken → **−5**, and no answer above Tier 1 until atoned |
| **R** Reach | see §8 — Lathander only (Sam, 2026-10-01) |
| **D** Debt | `trunc(Debt / 25)`, truncated so a god who owes you is worth what owing costs |
| **CAP** | cleric of that deity → **your cleric level** · any other class → **5** · praying to a god you have no standing with → **2** |

The CAP is the rail. It makes prayer **mathematically incapable of outperforming Divine
Intervention at any level**, because Divine Intervention is d100 ≤ cleric level and prayer
is capped at the same number while almost never reaching it. At L1 Samson's realistic RN
is 1–4. He will mostly get silence. That is correct and it is the point.

**E is the SRD's own "when your need is great" clause, generalised.** Prayer in comfort is
nearly never answered.

**Tier by margin** — one roll, no second roll. The deeper under RN, the better the answer:

| Roll vs RN | Tier | What it is |
|---|---|---|
| `> RN` | **0 — Silence** | Authored nothing. Phrasebook, keyed by deity × location. |
| `≤ RN` | **1 — A Sign** | Information only. An omen, a direction, one true thing the DM knows. The workhorse tier; this is what makes prayer worth doing at level 1. |
| `≤ ⌊RN × 2/3⌋` | **2 — A Witness** | The deity marks the moment. Written to `world_flags` / `faith_events`; co-religionist NPCs can later *know* it. Grants **Inspiration** — RAW-legal, DM-granted, non-scaling, the only 5e currency that fits. |
| `≤ ⌊RN / 3⌋`, Offering ≥ 1 | **3 — A Hand** | The smallest material nudge, and it always costs Debt: re-roll one die already rolled, *or* one ally's death save, *or* one specific thing warded off. Never a spell. |
| cleric ≥ 10 only | **4 — An Answer** | This **is** Divine Intervention. The module supplies the ritual framing and hands off to the class feature. It never duplicates or replaces it. |

Tier 3 raises Debt by 25. Tier 2 by 10. Tier 1 by 0 — a sign costs the god nothing.

### The Wrong Listener

Rolled **separately**, and rolled whether or not the prayer was answered. Only when posture
is *aloud* (or *murmured* in a confined space) and the location carries a hostile faith.

Velkynvelve carries one: it is a drow outpost of **Lolth**. d20, on a **1–2** something
notices; on a **1–4** if the prayer named a god Lolth hates. Outcomes escalate: a guard
hears → Ilvara is told → and, at the bad end, the thing that answers is not a drow and is
not your god.

This is what makes prayer a *decision* instead of a free action.

---

## 6. Why this lands in Velkynvelve immediately

*Sourced, Velkynvelve canon:* the slave pen is **magically warded against casting**, the
prisoners have **no spell components**, and the jailers are priestesses of **Lolth**.

Prayer needs no components, no slots, and no somatic hand. **It is the only divine act
available to Samson inside the pen** — and it is forbidden by the people holding the whip.

The module's first scene writes itself, and it costs no new art, no new map and no new
sprite. Samson prays, and the question is only how loudly.

Everyone can pray, not just the cleric — at a lower CAP and with a much higher chance of
the wrong listener. Kenta is Lawful Evil. There are gods who *will* answer him.

---

## 7. Deity roster — sourcing, not inventing

SRD 5.1 contains no pantheon, so the roster cannot come from the ingested rulebook. It
must come from Sam's Roll20 OotA Compendium / FR material, or be declared homebrew.

I ran a word-boundary scan of all ~2,600 `campaign_chunks` for candidate gods. **A naive
substring scan is badly wrong here** and I nearly shipped it: `Torm` scored 71 on
substring and **1** on word boundary (it was matching *storm*, *torment*); `Shar` scored
166 and **4** (*shard*, *sharp*, *Shuushar*); `Helm` 39 and **9** (*helmet*, *overwhelmed*).
Honest counts only:

| Deity / power | Chunk hits (word-boundary) |
|---|---|
| Lolth | 155 |
| Orcus · Demogorgon · Zuggtmoy · Juiblex · Yeenoghu · Baphomet | 23–60 each (demon lords, not gods — different table) |
| Bane | 37 |
| Eilistraee | 15 |
| Gruumsh | 12 |
| Vhaeraun · Helm | 9 each |
| Blibdoolpoolp | 7 |
| Ghaunadaur · Callarduran · Moradin · Diirinka · Shar | 4 each |
| Laduguer · Lathander · Selûne | 3 each |
| Ilmater · Tempus · Mystra · Chauntea | 2 each |
| Oghma · Silvanus · Umberlee · Torm · Deep Duerra · Diinkarazan · Maanzecorian | 1 each |

**Proposed starter eight**, all present in the ingested text, all Underdark-relevant:
Lolth (the local power, hostile), Eilistraee and Vhaeraun (the drow dissidents — the
interesting choices), Blibdoolpoolp (kuo-toa, Shuushar is right there), Callarduran
(deep gnomes, Jimjar is right there), Laduguer (duergar), Moradin (Eldeth is a shield
dwarf), Gruumsh (Ront is an orc). Every one of them already has an NPC in the party who
cares.

Each row needs tenets, prohibitions and a *sign* (how that god answers — Eilistraee by
song and moonlight, Callarduran by stone that was not cut that way before). **Tenets and
signs will be homebrew** unless Sam pulls them from a book he owns, and every row carries
`source` saying which.

---

## 8. Samson's god — ANSWERED: Lathander (Sam, 2026-10-01)

Samson is a cleric of **Lathander**, the Morninglord. Three things in the ingested
books make this better-sourced than a homebrew pick would have been:

- **SRD 5.1, Classes: Cleric Domains** names Lathander explicitly among the sun gods
  appropriate to the **Life domain**. Life is the only domain in SRD 5.1, so Samson's
  domain and his god now agree by the book rather than by fiat.
- **OotA Expanded p.114**, the *Dawn Shroud* spell: "created by clerics of the church
  of Lathander." The church exists in this campaign's canon, and its signature is
  **carried dawn** — light made where there is none. That is the god's `sign`, sourced.
  (It is a 5th-level spell; far off for a level 1 cleric, and the right thing to walk
  toward.)
- **OotA Expanded p.359** lists Lathander among the non-evil sun deities whose
  followers stand against **Lolth's** forces.

That last one has teeth. Samson is praying to a declared enemy of Lolth, inside a Lolth
outpost, in front of her priestesses. He sits on the **wide** wrong-listener band (1–4),
not the default (1–2), by sourced canon rather than by a ruling.

### Reach — a dawn god where there is no dawn (Sam, 2026-10-01 — approved)

Approved by Sam on 2026-10-01 as written, and implemented behind a single deletable
constant (`REACH_RULES` in `lib/prayer.ts`) so retuning it later costs one edit:

| Where / when | R |
|---|---|
| Sunless location, outside the dawn window | **−1** |
| Inside the true dawn window (05:30–07:30 by `game_clock.minutes_of_day`) | **+2** |
| Under an open sky at any other hour | 0 |
| Any god with no reach rule | 0 |

The window **replaces** the penalty rather than stacking with it. Samson cannot see the
sky; the only way he knows it is dawn is by having kept count of the days. That makes
keeping the calendar a devotional act and makes the one hour his god reaches him
something he has to earn by paying attention.

Delete `REACH_RULES` and `reachTerm` returns 0 for every god. Nothing else depends on it.
Whenever the rule bites, the result carries a flag at runtime naming it as homebrew and
recording whose ruling it is — the module never applies an invented number silently.

---

## 9. Schema — SQL shown, not applied

Four tables. RLS enabled and read policies created **in the same block**, per the
`scene_effects` lesson. All writes go through a service-role route; no anon write policy.

Note for Sam: this repo's tables were all made by hand in the Supabase UI and the `.sql`
files in the repo **do not run on deploy** — nothing here is applied by merging this PR.
To apply it, paste the block into the Supabase SQL editor, or say "run the prayer
migration" and I will run it through the Supabase MCP after showing you the final text.

```sql
-- 1. deities
create table public.deities (
  slug           text primary key,
  name           text not null,
  title          text,
  pantheon       text,
  alignment      text,
  portfolio      text,
  tenets         jsonb not null default '[]'::jsonb,
  prohibitions   jsonb not null default '[]'::jsonb,
  sign           text,              -- how this god answers, in prose
  is_hostile_to  jsonb not null default '[]'::jsonb,
  source         text not null,     -- 'oota-expanded p.NN' | 'homebrew — Sam'
  created_at     timestamptz not null default now()
);

-- 2. character_faith — the hidden Standing ledger
create table public.character_faith (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  deity_slug    text not null references public.deities(slug),
  is_primary    boolean not null default false,
  state         text not null default 'unknown'
                check (state in ('unknown','noticed','favoured','indebted','lapsed','forsworn')),
  attention     integer not null default 0  check (attention between 0 and 100),
  accord        integer not null default 0  check (accord between -100 and 100),
  debt          integer not null default 0  check (debt between -100 and 100),
  vows          jsonb not null default '[]'::jsonb,
  last_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (character_id, deity_slug)
);

-- 3. prayers — the log, one row per prayer offered
create table public.prayers (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid,
  character_id    uuid not null references public.characters(id) on delete cascade,
  deity_slug      text references public.deities(slug),   -- null = "whoever is listening"
  game_day        integer,
  minutes_of_day  integer,
  location        text,
  posture         text not null check (posture in ('aloud','murmured','silent')),
  petition        text not null,
  offering        jsonb not null default '{}'::jsonb,     -- {kind, item_id, verified:bool, weight}
  standing        jsonb not null default '{}'::jsonb,     -- snapshot of A/C/D/vow at roll time
  response_number integer not null,
  roll            integer not null,
  tier            smallint not null check (tier between 0 and 4),
  answer          text,                                   -- what Malachar wrote
  gravity         integer,
  overheard_by    text,                                   -- null, or who heard it
  created_at      timestamptz not null default now()
);

-- 4. faith_events — what moves Accord, mirroring relationship_events
create table public.faith_events (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  deity_slug    text not null references public.deities(slug),
  kind          text not null,
  gravity       integer,
  deltas        jsonb not null default '{}'::jsonb,       -- {attention, accord, debt}
  note          text,
  source        text,
  created_at    timestamptz not null default now()
);

create index on public.prayers (character_id, created_at desc);
create index on public.faith_events (character_id, deity_slug, created_at desc);

alter table public.deities         enable row level security;
alter table public.character_faith enable row level security;
alter table public.prayers         enable row level security;
alter table public.faith_events    enable row level security;

create policy deities_read         on public.deities         for select to public using (true);
create policy prayers_read         on public.prayers         for select to public using (true);
-- character_faith and faith_events are the HIDDEN ledger: no anon select at all.
-- They are read only by service-role routes. Omitting a select policy is deliberate.
```

**Flagged for Sam:** `character_faith` and `faith_events` deliberately get **no read
policy**, so the dashboard cannot see them — that is the point (hidden ledger), but it is
exactly the shape that caused the `scene_effects` blackout, so it is called out here
rather than discovered later. The sheet shows the `state` word, served by a route.

---

## 10. Build order — one idea per PR

1. **DONE** — `lib/prayer.ts` + `lib/prayer.test.ts`, pure, no Supabase and no THREE:
   `responseNumber`, `tierFor`, `resolvePrayer`, `wrongListenerRisk`, `debtDecay`,
   `standingWord`, `reachTerm`. 41 tests. **Nothing visible ships in PR 1 and that is
   fine** — it is the camp/journal pattern and it is what makes the rest reviewable.
2. Migration above, applied by hand after Sam reads it.
3. Deity seed — the eight, every row carrying `source`, tenets and signs flagged homebrew.
4. `/api/prayer` service-role route: resolve, write `prayers`, write `faith_events`,
   apply Debt, roll the Wrong Listener.
5. Silence + answer phrasebook, keyed deity × location, following `dm_phrasebook`.
6. UI: prayer panel as a camp action, plus the pen special case (`allows_prayer` style
   flag on the node, since the pen's ward blocks casting but not prayer).
7. Malachar prompt block — how he writes an answer and, harder, how he writes a silence.
8. `faith_events` generation hooked to the existing gravity/`relationship_events` stream.

## 11. Deliberately not in v1

- **Prayer in combat.** Tempting as a free action at Tier 0–2 only; out of scope until
  the out-of-combat loop is proven.
- **Multi-deity petitions**, divine champions, domain changes, excommunication rites.
- **Clerics losing their powers.** The module tracks `forsworn`, but what that *costs* a
  cleric mechanically is a campaign ruling I am not making unasked.

## 12. Open questions for Sam

1. ~~Samson's god~~ — **answered: Lathander** (§8).
2. ~~The **Reach** rule~~ — **answered: keep as written** (Sam, 2026-10-01).
3. Is the roster the proposed eight, or does Sam want to pull tenets from Roll20 first?
4. ~~Does a Tier 3 "Hand" ever save a character from death?~~ — **answered: yes** (Sam, 2026-10-01).
5. ~~Is a prayer private?~~ — **answered: private unless spoken aloud** (Sam, 2026-10-01).
6. Should other players *see* that Samson prayed, or only hear what he said aloud?
   (The journal module's ruling was "the owner isn't told when someone reads it" — the
   parallel ruling here would be that prayer is private unless spoken aloud.)

---

## 13. Devotion, granted spells, missions, and the warlock commune

Sam's ruling, 2026-10-01, verbatim:

> "prayers are required regularly for Cleric god's to bestow up level spells. Getting them
> at level 2 and on isn't automatic and isn't chosen by the player. Their God may also give
> missions to unlock the next level spells or a certain domain. Regarding warlocks, praying
> allows them to commune with their patron to determine if they will receive a boon or
> debuff/curse. They are required to check in regularly. They're spell progression is
> similar to clerics and not chosen."

Code of record: `lib/devotion.ts` + `lib/devotion.test.ts` (33 tests).

### Why this is a separate clock from §5

The answer roll is rare on purpose — a level 1 cleric sees silence four times in five, and
that is the design. If spell progression rode on *that* roll, Samson could level three
times, roll badly each time, and reach level 4 with level 1 spells through no decision of
his own. That is not a demanding god; it is a slot machine deciding whether he has a
character sheet.

So:

| Module | What it decides | How often it pays | Driven by |
|---|---|---|---|
| `lib/prayer.ts` | The **answer** — signs, witness, a hand | Rarely | Luck, conduct, cost |
| `lib/devotion.ts` | The **grant** — spells, domains | Reliably | Keeping the cadence |

The grant rides on the **observance**, which is entirely in the player's control. That is
the difference between a demand and a punishment.

### The four rails

1. **Slots always advance by the book.** Spell slots are class maths and are never
   withheld. A lapsed cleric can still upcast what he has. He is never non-functional.
2. **Nothing is ever revoked.** A lapse stops you *gaining*; it never takes away a spell
   already granted. `grantDecision` can only add — asserted by test.
3. **The god chooses, not the player** (Sam's ruling). The pick is weighted by the deity's
   portfolio, so a Lathanderite's list reads as light and dawn rather than a random draw.
   The live sheet already has the hook: `sheet_spellcasting.pool`, currently `"class_list"`,
   becomes `"deity_granted"`. **No migration needed for that part — the field exists.**
4. **Missions gate the exceptional, never the ordinary.** A mission can hold back a new
   *domain*, or a spell level that runs *ahead* of the class table. It can never gate
   progression a character is already owed by levelling. Asserted by test.

### Observance (homebrew — cadence numbers invented)

| State | When |
|---|---|
| `current` | Prayed within 7 game days |
| `due` | 7–10 days — still grants, but the sheet says the clock is running |
| `lapsed` | Past 10 days — new spell levels stop arriving until he prays again |

A character who has **never** prayed is `due`, not `lapsed`. You cannot fall behind on an
observance nobody told you about.

### The warlock inversion

The best idea in Sam's message, and it falls straight out of the design:

> **A cleric's bad outcome is silence. A warlock's bad outcome is attention.**

A patron *always* answers — that is what a pact is. Skipping the check-in does not get a
warlock ignored, it gets them noticed. `communeOutcome` returns `boon` / `indifference` /
`displeasure` / `curse` and never silence; a lapsed observance shifts the result one step
worse, a broken vow shifts it another.

### Open — flagged, not resolved

- **Edition: SRD 5.2.1 (2025) is canon** (Sam, 2026-10-01). That matches
  `class_spellcasting_progression` and every live sheet. **But 5.2.1 is not ingested** —
  `campaign_chunks` holds SRD 5.1 only, so no 5.2.1 rule can be quoted or checked from a
  session. §5's cap has been restated to stand on its own terms rather than on a citation
  that cannot be verified here. **Ingesting SRD 5.2.1 is the real fix and is open work.**
- **Mission storage — DECIDED and APPLIED** (2026-10-01): `character_faith.missions` jsonb,
  plus `character_faith.last_prayer_day` integer for the observance. A jsonb column rather
  than a `faith_missions` table because missions are few, always read with the faith row,
  and never queried across characters. Promote to a table if they ever need searching.
- **The `pool` flip is BLOCKED by a CHECK constraint.** `class_spellcasting_progression.pool`
  allows only `'class_list'` and `'spellbook'`. Adding `'deity_granted'` means dropping and
  recreating the constraint — a destructive DDL, so it waits for Sam. See §14.
- **Samson's live sheet is deliberately untouched.** `sheet_spellcasting.pool` stays
  `"class_list"` until the grant route exists. Marking him deity-granted with nothing on the
  other end to grant anything is the shape of a silent failure, on a live character.
- **The deity roster**: Lathander is seeded (2026-10-01). The other seven wait on Roll20
  text, which is not reachable from a Claude session.

---

## 14. Applied to the database so far

| When | What | How |
|---|---|---|
| 2026-10-01 | `deities`, `character_faith`, `prayers`, `faith_events` | migration `create_prayer_module_tables` |
| 2026-10-01 | `character_faith.last_prayer_day`, `character_faith.missions` | migration `add_prayer_observance_and_missions` |
| 2026-10-01 | Lathander seeded — 1 row in `deities`, `reach='dawn_hour'`, hostile to Lolth | insert |
| 2026-10-01 | `pool` CHECK widened to allow `deity_granted`; Cleric + Warlock rows flipped | migration `widen_spellcasting_pool_for_deity_granted` |

All applied. Verified after the fact: the constraint now reads
`CHECK (pool = ANY (ARRAY['class_list','spellbook','deity_granted']))`, Cleric and Warlock
are `deity_granted`, and Bard / Druid / Paladin / Ranger / Sorcerer / Wizard are untouched.

**Two corrections to what was said in chat before this was run**, both found by querying
rather than assuming:

- It touched **10 rows, not 40**. The table only holds levels 1–5 for each class.
- **`class_spellcasting_progression` stops at level 5 for every class.** Levels 6–20 do not
  exist. `grantDecision` reads `owedSpellLevel` from this table, so the grant system has
  nothing to read above level 5. Filling the table out is a prerequisite for the grant
  route and is **open work**.

---

## 15. The PRAY button already exists — and this module is the rule behind it

Found 2026-10-01 by searching the repo rather than assuming the UI was greenfield.

`lib/camp.ts` has shipped a `pray` camp action since **2026-09-26**. It is in
`CAMP_ACTIONS`, it has alias parsing (`pray` / `prayer` / `praying`), it costs one camp
action, and the camp screen renders it as **PRAY — "Speak to your god."** Players can
press it right now.

And `CAMP_ACTION_RULES` says exactly what happens when they do:

> `pray: { resolves: "dmScene() — no rule; the DM answers or does not", source: "Sam, 2026-09-26" }`

**There is no mechanic behind it.** Malachar improvises an answer, every time, with nothing
constraining what a god may give. That is precisely the failure mode the referee skill
exists to prevent — the fake scavenged-items table, the invented Hook Horror attack — and
it is live in production in the camp screen today.

So the integration is smaller and better-aimed than the build order assumed:

- **No new UI is needed.** PR 6 was "a prayer panel as a camp action". The action is there.
  What is missing is the rule it calls, which is `lib/prayer.ts`.
- **The wiring point is one function.** `decideCampAction({ action: "pray" })` currently
  returns `check: null` and hands off to `dmScene()`. It should call `resolvePrayer()` and
  hand Malachar a tier and a standing instead of a blank page.
- **The camp action cost is the rate limit, and it is better than anything designed here.**
  A prayer costs one of two camp actions per full rest. That is a real scarcity the
  observance cadence should defer to rather than duplicate — praying is already something
  you give something up to do.

Revised next step: **the wiring PR is `lib/camp.ts` + a service-role route**, not a UI
build. It is also now the highest-value piece, because every unwired prayer between now and
then is Malachar inventing divine mechanics in front of players.

---

## 16. WIRED — the PRAY button resolves against the rule (2026-10-08)

`CAMP_ACTION_RULES.pray` no longer reads `dmScene() — no rule; the DM answers or does
not`. It reads `prayAtCamp()`. Every press of the PRAY button on the camp screen now goes
through `lib/prayer.ts`, and Malachar narrates inside a contract instead of deciding what a
god does.

**`lib/camp-prayer.ts`** — the bridge, in its own file so `lib/camp.ts` (1,800+ lines, and
a repeat collision point) takes only a one-line change. It owns no rules: it reads what the
camp already knows and returns a resolved tier plus a `NarrationContract`.

The contract is the point. `PRAYER_FORBIDDEN` ships in every response at every tier:

> do not cast or imitate any spell · do not restore hit points · do not deal damage · do
> not grant a bonus to AC, an attack roll, a saving throw or a skill check · do not create
> or hand over any item · do not grant a spell slot or class feature · do not reveal that a
> prayer was offered unless it was spoken aloud

A test asserts that list is byte-identical across all 100 rolls at all 20 levels, so no
tier can quietly widen it.

**`app/api/prayer/route.ts`** — service-role, because `character_faith` and `faith_events`
have RLS on with no select policy. It resolves, writes `prayers` (every tier, silence
included), upserts the ledger, logs a `faith_events` row, spends the camp action, and posts
to `dialogue` **only when the prayer was spoken aloud**.

### Rulings this bakes in

- **A silence still costs the camp action.** Silence is the god's answer, not a failed
  attempt. Refunding it would teach players to press again until something happened, which
  is the vending machine the whole design avoids.
- **The camp action is the rate limit.** One of two per full rest, which is a real scarcity
  the observance cadence defers to rather than duplicating.
- **An unknown deity slug is never created.** The catalogue rule (AGENTS.md §0: the AI
  cannot invent items) applied to gods — an unrecognised slug prays to nobody, which the
  rules already handle at cap 2.

### Two schema assumptions that were wrong, caught before shipping

- `travel_nodes` has **no `is_current` column**. The party's location is
  `party_position → travel_nodes`. The first draft of the route would have thrown at
  runtime on the first press.
- `dialogue` takes `speaker_type`, and its `channel` is `dm` in every live row. The draft
  wrote `channel: "player"`, which exists nowhere in the data.

### Data applied 2026-10-08

| What | Why |
|---|---|
| `class_spellcasting_progression` 40 → **160 rows** (all 8 casters, levels 1–20) | `grantDecision` was blind above level 5 |
| `prepared` made nullable | SRD 5.1 prints no number for Cleric/Druid/Paladin/Wizard — it is computed per character |
| Lolth seeded in `deities`, hostile to Lathander | without her the wrong listener could never fire |
| `Velkynvelve.metadata` gains `location_faith: lolth`, `sunless`, `confined` | a hostile faith is a property of the node, never guessed from its name |
| `character_faith` row for Samson → Lathander | the ledger starts at zero; `last_prayer_day` NULL reads "due", never "lapsed" |

### Edition note

Levels 1–5 remain **SRD 5.2.1 (2025)**; levels 6–20 are **SRD 5.1**, each row saying so in
its own `source` column. Slots and cantrips agree between the editions from level 2 up, so
the grant system is unaffected. Two real differences, left as they are:

- **Paladin and Ranger keep level-1 spellcasting** (Sam, 2026-10-08). 5.2.1 gives it; 5.1
  starts them at level 2.
- **`prepared` has a visible cliff** at level 5→6 for the prepared casters (a number, then
  NULL). It goes away when SRD 5.2.1 is ingested, which remains the real fix.

### Still owed

- The silence/answer phrasebook (`dm_phrasebook` pattern), so a silence is authored rather
  than improvised prose about nothing.
- The Malachar prompt block that carries `NarrationContract` into the system prompt.
- The UI call: the PRAY button still needs to POST to `/api/prayer` and render the result.
  **Until that lands, the route exists and the button does not call it.**
