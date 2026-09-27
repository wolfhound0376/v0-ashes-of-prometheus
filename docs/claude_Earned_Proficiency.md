# Ashes of Prometheus — Earned Skill Proficiency (spec, 2026-09-26)

**Status:** APPROVED by Sam, 2026-09-26 (§9 decisions). Build order in §8; PR 1 (schema) is `supabase/migrations/20260926120000_earned_proficiency.sql`.
**Rule status:** HOMEBREW — Sam's call. 5e has no rule for earning a skill proficiency through play; the only printed path is the PHB downtime activity *Training* (250 days and 1 gp/day, a tool or language only — not in the SRD). This spec is recorded as homebrew so it never gets presented to players as a book rule.
**Sam's ask (2026-09-26):** "a dynamic where skill proficiency can be awarded for a number of successful interactions (animal proficiency after a number of successful animal handling checks, being taught by an NPC, maybe two critical 20s in a certain period of time)."
**Sits under:** `claude_Architecture_Canon.md` (Layer 1 owns it), `claude_Game_Context_State_Machine.md` §4 (skill checks), the gravity system (`learnings.md`).

---

## 0. The one line

**The engine counts; the engine awards; Malachar is told and makes it land.** A proficiency is earned from facts the database can see — real rolls against real DCs, real hours with a real teacher — never from Malachar deciding a player "seems to have got the hang of it."

## 1. The three paths (Sam's three, made precise)

All three apply only to a skill the character is **not already proficient in**. Expertise is not on this ladder — Sam, 2026-09-26: "expertise is gained differently." This system awards proficiency only; how expertise is earned is a separate, undesigned mechanic and nothing here should be extended to it by default.

| Path | Trigger | Counts when |
|---|---|---|
| **A. Practice** | 8 meaningful successes on the skill | DC ≥ 10, and the check was a fresh stake — not a retry of the same lock, the same guard, the same beast within the same campaign day |
| **B. Flash of talent** | 2 natural 20s on the skill within 7 campaign days | Any DC. The 20 must be on the kept die (advantage/disadvantage counts the kept face) |
| **C. Teaching** | 40 campaign hours of instruction from a teacher who has **expertise** in the skill, then one check at DC 12 | Teacher is an NPC or PC with expertise in that skill (Sam, 2026-09-27: "Trainer must have expertise" — proficiency alone does not teach); hours accrue only in camp context (Playable Layer §7: camp is where relationship deltas happen — teaching is one) |

Numbers approved as drafted (Sam, 2026-09-26), tunable in one table (§3). The thresholds are deliberately steep enough that a proficiency is a season's arc, not a session's.

**Why "meaningful":** without the freshness rule, a rogue picks the same lock nine times at DC 10 and is a locksmith by lunch. Playable Layer §0 — code decides outcomes — is what makes this enforceable: the engine knows the DC and the interaction key; Malachar doesn't have to referee "did that count?"

## 2. What has to exist first — the DC problem

Today a Malachar roll request is `[[1d20+3]]` plus a free-text purpose. `roll_requests` carries `die_sides`, `dice_count`, `modifier`, `purpose`. Nothing records which skill it was or what the DC was. Malachar rules success in prose; the engine only ever sees a total.

So step one is not the tally — it is making skill checks legible to the engine:

- Extend the request tag: `[[1d20+3 | stealth | DC 15]]` (skill and DC optional, so every existing `[[1d20+3]]` keeps working). `parseRollRequest` learns the two extra fields.
- `roll_requests` gains `skill text null`, `dc int null`. The resolve path reads them alongside the total.
- Malachar's system prompt tells him to name the skill and DC in the tag when he asks for a skill check. The DC still never reaches players; it's in the tag, which is stripped by `sanitizeForTTS` and the log filter like every other tag.
- The exploration path (`resolveInteraction` in `lib/game-context.ts`) already has skill and DC — it just needs to emit the same progress event.

This is a schema change. Own PR, SQL shown first, Sam pastes it.

## 3. Data

```sql
-- Tunables. One row per path; Sam edits numbers here, never in code.
create table skill_progress_rules (
  path            text primary key,       -- 'practice' | 'talent' | 'teaching'
  threshold       int  not null,          -- 8 successes / 2 crits / 40 hours
  window_days     int  null,              -- talent: 7; others null
  min_dc          int  null,              -- practice: 10; teaching final check: 12
  source          text not null           -- 'homebrew — Sam's call, 2026-09-26'
);

-- The ledger. Append-only; the award is derived from it, never stored as a counter.
create table skill_progress (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references characters(id),
  skill         text not null,            -- snake_case, the 18 SRD skills
  kind          text not null,            -- 'success' | 'crit' | 'training_hours' | 'award'
  amount        int  not null default 1,  -- hours for training; 1 otherwise
  dc            int  null,
  stake_key     text null,                -- interaction key / roll purpose, for freshness
  teacher_id    uuid null references characters(id),
  campaign_day  int  not null,            -- from game_clock at the time
  roll_request_id uuid null references roll_requests(id),
  created_at    timestamptz default now()
);
create index on skill_progress (character_id, skill, kind);
alter table skill_progress enable row level security;          -- service-role only,
alter table skill_progress_rules enable row level security;    -- same as time_log
```

**Award** = the moment a `kind='award'` row is written and `characters.sheet_skill_proficiencies[skill]` is set to `'proficient'` in the same transaction. Two writes, one truth.

## 4. Flow

```
skill check resolves (roll_requests resolve, or resolveInteraction)
   → engine knows: character, skill, DC, kept die, total, campaign day, stake key
   → lib/skill-progress.ts  recordCheck(...)      pure: decides which rows to append
   → append skill_progress rows (success? crit?)
   → lib/skill-progress.ts  evaluate(ledger, rules) pure: any path crossed?
   → if yes: award row + sheet_skill_proficiencies update + gravity event (high)
   → world context for the NEXT turn carries one line:
       "PROFICIENCY EARNED: Samson is now proficient in Animal Handling
        (path: practice, 8 successes over 23 days). Narrate it; do not explain the rule."
   → Malachar narrates. Player dashboard shows the new proficiency on the sheet.
```

Teaching hours are logged from camp: a camp action "train with `<teacher>` in `<skill>`" writes `training_hours` rows and a `time_log` row (the clock moves; it is honest downtime). When 40 hours are banked the next camp offers the DC 12 check.

## 5. What Malachar may and may not do

- **May** name the skill and DC in the roll tag (he already picks DCs).
- **May** narrate a teacher's lesson, a beast calming, the thing suddenly clicking.
- **May not** award, deny, accelerate, or reset progress. He has no tag for it. If he writes "you've clearly mastered this," nothing happens.
- **May not** see the tally. The prompt gets the award line when one fires and nothing before it. Same rule as gravity: hidden state stays hidden.

## 6. Player-facing

**Learning mark: visible** (Sam, 2026-09-26). Once any progress row exists for a skill, the character sheet shows a faint mark beside that skill — a presence, not a meter. No count, no path, no "3 of 8". The tally itself stays hidden exactly as gravity does; the mark only says *something is happening here*. The award is the moment: the sheet flips to proficient, the log carries a line, Malachar narrates it.

## 7. Guardrails

- Practice successes need DC ≥ 10 — a DC 5 check teaches nothing.
- Freshness: one success per `stake_key` per campaign day. Same lock, same guard, same beast: once.
- Talent window is campaign days from `game_clock`, not wall-clock; a 7-day window is 7 in-game days.
- Teaching needs a teacher who actually has it — with expertise (Sam, 2026-09-27). The engine checks the teacher's sheet; Malachar cannot declare Buppido a master of Animal Handling.
- Nothing retroactive: rolls before the feature ships don't count. The ledger starts empty.
- Multiclass note: an earned proficiency is a character fact, not a class feature. It survives structured multiclass when that lands.

## 8. Build order (one idea per PR)

1. **Schema PR** — two tables above, RLS on, no policies. SQL shown first. Also `roll_requests.skill`, `roll_requests.dc`.
2. **Tag PR** — `parseRollRequest` reads `| skill | DC n`; the resolve path reads them; Malachar's prompt asks for them. Backwards compatible.
3. **Library PR** — `lib/skill-progress.ts`: `recordCheck`, `evaluate`, pure, vitest with a seeded ledger for each path and each guardrail.
4. **Wiring PR** — resolve route and `resolveInteraction` call `recordCheck`; award writes the sheet; world-context line.
5. **Camp PR** — training action in the camp module (`claude_Camp_Module.md` owns camp; add the action there). **Shipped 2026-09-27** as `lib/camp.ts` §17 (`train`); see `claude_Camp_Module.md` §17 for the tag, the teacher check and Sam's three rulings of 2026-09-27 (expertise required to teach; 4 hours per evening; the teacher's evening is free).
6. **Dashboard PR** — the learning mark (approved, §6). **Shipped 2026-09-27**: `GET /api/skill-progress/marks?characterId=` returns only the skill names with unawarded progress (`skillsInProgress`); `lib/hooks/use-skill-marks.ts` reads it once per turn; the full character sheet (`character-sheet-slideover.tsx`) draws a faint ember in the skill's empty dot (`.hdot.l`). No count, no path, no words.

PRs 1–4 are a day. 5 depends on the camp module's shape. Nothing touches `combat-board-3d.tsx`.

## 9. Decisions (Sam, 2026-09-26)

- Thresholds: 8 successes / 2 crits in 7 days / 40 h — approved as drafted.
- Learning mark: visible (§6).
- Meaningful checks: confirmed for Path A — DC ≥ 10 and fresh stake, or it doesn't count.
- Path B: "talent is talent" — a natural 20 counts at any DC.
- Expertise: not this system. Gained differently; to be designed separately.

## 10. Provenance

- **Sam-originated:** the three triggers (repeated success, NPC teaching, two crits in a window); "keep it 5E"; visible mark; talent at any DC; expertise kept separate.
- **Claude-originated, Sam-approved:** the DC-legibility prerequisite (§2), the append-only ledger with award derived not stored, freshness rule, camp-only teaching hours, the numbers, the visible-mark-hidden-tally split.
- **Book:** none. Homebrew throughout. PHB *Training* cited only to say it does not cover this.
