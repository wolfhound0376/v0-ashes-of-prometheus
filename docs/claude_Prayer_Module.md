# Prayer Module — design spec

**Status:** PR 1 (the pure rules module) built. Schema NOT applied; nothing else built.
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
| **R** Reach | see §8 — Lathander only, and NEEDS SAM |
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

### Reach — a dawn god where there is no dawn (NEEDS SAM, added 2026-10-01)

One term Sam has not ruled on, implemented behind a single deletable constant
(`REACH_RULES` in `lib/prayer.ts`):

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
Whenever the rule bites, the result carries a `NEEDS SAM` flag at runtime, so an unruled
number can never pass as a ruled one.

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
2. The **Reach** rule (§8) — the one new term, unruled. Keep, retune, or delete.
3. Is the roster the proposed eight, or does Sam want to pull tenets from Roll20 first?
4. Does a Tier 3 "Hand" ever get to save a character from death, or is that a line?
5. Should other players *see* that Samson prayed, or only hear what he said aloud?
   (The journal module's ruling was "the owner isn't told when someone reads it" — the
   parallel ruling here would be that prayer is private unless spoken aloud.)
