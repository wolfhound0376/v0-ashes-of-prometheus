# Ashes of Prometheus — Journal Module (decision of record, 2026-09-29)

**Status:** delivered as `lib/journal.ts` + `lib/journal.test.ts` (71 tests pass; suite 688 across 31 files; `tsc --noEmit` shows the same 14 pre-existing errors as main, verified by stashing). Pure module only — no wiring, no schema change. Wiring is §8.
**Authority:** sits under `claude_Architecture_Canon.md` (Layer 1) and follows the shape of `docs/claude_Camp_Module.md`. Nothing here changes the four layers, the Claude-only stack, the 5-ft grid, or the dice roller.
**Provenance is explicit.** Every rule below is a live database constraint, a dated ruling of Sam's, or a house rule labelled "needs Sam's yes" and surfaced in `flags` at runtime. Where a rule is missing the code returns a flag, never a guess.

---

## 0. The one line

**A journal is a thing before it is a text.** The page has always existed — a table, an item, a UI, an RLS policy. What never existed was the book as an object with custody, and the page as something another person can pick up and read. This module is both, plus one home for the parsing and prompt text that had five and two copies respectively.

## 1. What already existed (verified live 2026-09-29)

| Piece | Where | State |
|---|---|---|
| `journal_entries` table, RLS | Supabase; `journal_read` (SELECT, anon) + `journal_player_insert` (INSERT, anon, `author='player'`) | **Live**; no UPDATE, no DELETE policy — a committed page is permanent from the browser |
| Journal + quill as items | `items` (`tattered-journal`, `small-quill`), `inventory_items` | **Live** — all 5 PCs hold both, `confiscated_from` null |
| Tag emission | `app/api/chat/route.ts` — numbered rule 10 **and** the STRUCTURED TAGS catalogue | Live, stated **twice** |
| Tag parsing + write | `app/api/chat/route.ts` ~L1972 | Live, regex inline, **4 copies** |
| Page display | `components/dashboard/journal-pages.tsx` | Live |
| Restart burns pages | `app/api/restart-campaign/route.ts` L231 | **Live** — Sam's ruling, 17 Aug 2026 |
| "Test" | `lib/__tests__/journal-tag.test.mjs` | **Re-implements the parser it tests** — a 5th copy; could pass while the route was broken |
| `visibility` = `dm` / `party` / `found` | CHECK constraint on the table | **Never written by anything** |
| Custody check before writing | — | **Did not exist** |
| `in_world_date`, `title` | Columns exist | **Never written by anything** |

## 2. Findings — reported, not fixed

1. **`journal_entries` has 0 rows.** Not one page has ever been written, by anyone, since PR #148 merged. The route logs which failure it was (`NO [JOURNAL] TAG IN RESPONSE` vs. a write error), so the next live session's logs will say whether this is prompt compliance or a database problem. Until then it is unknown and should not be assumed fixed by this PR — **this module does not wire itself in** (§8).
2. **Project memory is stale on the restart ruling.** It records "whether a full restart burns `journal_entries` pages is not yet decided". It was decided and shipped on 17 Aug 2026; the route deletes every row and reports the count. `RESTART_BURNS_PAGES` is now the one home for it.
3. **The design's second half was built in the schema and never in code.** `visibility` has admitted `found` since PR #148. Sam's own note — journals "can be lost, stolen, destroyed, found by NPCs (updating their knowledge), or forged" — is half-present in the database and wholly absent from the app.
4. **There is no `npc_knowledge` or `npc_memories` table.** The only NPC table is `npc_encounters`. So "found by NPCs, updating their knowledge" cannot be built today; `pagesOnDiscovery` returns the pages and flags the gap rather than writing to a table that does not exist.
5. **`author` has no value for a forged page.** The CHECK constraint allows `player | malachar | import` only. Forgery needs either a new author value or a `forged_by` column — a migration, not code, and not proposed here.
6. **Bastet holds a journal and quill.** Project memory flags her as possibly not belonging to the active run (`run_id` null). Not touched.

## 3. The rules

### Custody (§2 of the module)

The confiscation mechanism already carries this. Stripped gear moves to a stash character tagged `confiscated_from` its owner, so a character's own possessions are the rows where `character_id` is theirs **and** `confiscated_from` is null. Live data confirms it: the party's weapons sit in the stash, the journals never moved.

| State | Means | Can write? |
|---|---|---|
| `held` | Their row, unconfiscated, quantity > 0 | Yes |
| `taken` | Row exists elsewhere, tagged back to them | No — and somebody can read it |
| `missing` | No row anywhere | No |

`missing` is deliberately ambiguous. Destroyed, dropped and never-issued are indistinguishable from inventory alone, so the code does not resolve it into a story. The DM says which.

**Sam's ruling, kept:** journals always survive confiscation unless explicitly taken by narrative. The code does not special-case this — it falls out of nobody moving the row.

### Writing a page (§3)

Existing route behaviour, restated so it is testable: no body → nothing; no acting character → nothing, logged with the lost page; first tag wins, the rest are reported as `dropped`.

New: **you cannot write in a book you are not holding.** Supply `inventory` and custody is checked; omit it and the check is skipped entirely, so the route can adopt this in two steps.

A missing quill is a **flag, not a refusal** — people write with charcoal, chalk, a splinter and blood. Worth narrating, not enforcing.

### Disclosure (§5)

`private → dm → party → found`, one way only. **`found` is terminal.** Ilvara does not forget what the book said because the party stole it back. That is the whole point of a diegetic artifact: losing it costs something picking it up again cannot undo.

### The dateline (§6)

`in_world_date` gets `"Day 3 · Night"` from the campaign clock, reusing `describeTimeOfDay` from `lib/time-tracking` rather than forming a second opinion about what "night" means. Players never see the clock — that rule predates this module and is not bent for a dateline. No clock → null, so the column stays null rather than lying.

## 4. Sam's rulings, 2026-09-29

1. **Page limit: 600 characters.** Sam set the unit (characters) and left the number to Claude. 600 is roughly 100 words — a solid paragraph. Calibrated against the project's own canonical examples, which run **171 and 152 characters**, so a real page sits well under it and the limit only trips when a page stops being a page. A test asserts both examples pass unflagged, because a limit that complains about the pages the prompt calls correct is worse than no limit. Over the limit the page is **stored in full** and flagged; only `PAGE_HARD_LIMIT` (20,000, the column's own constraint) ever cuts.
2. **The owner is not told when their journal is read.** Sam: *"Owner doesn't necessarily find out unless he is checking."* So `NOTIFY_OWNER_ON_DISCOVERY = false` — no alert, no banner, no log line, and Malachar is explicitly forbidden from telling them or confirming it if asked outright. `unseenDisclosures` returns a count **or null**, never zero: "no pages have been read" is itself a notification. A player who never opens their journal finds out when an NPC quotes them back to themselves.
3. **Some pages have titles, and most do not.** Sam: *"Some pages have titles."* A title is the **writer's**, never derived from the body — a heading the character did not write is the module putting words in their mouth, which the prompt forbids for the page and so forbids for the line above it. Optional pipe form `[JOURNAL: <title> | <the page>]`, matching the `[CAMP_ACTION: who | action | args]` convention already in the repo. Guard: the pre-pipe segment is a title only if it is ≤ 60 characters, so a pipe occurring in prose stays prose. Both prompt copies say most pages have none, so Malachar does not decorate every entry.

### Still house rules (need Sam's yes)

Each is surfaced in `flags` at runtime, so an ungiven ruling cannot pass as a given one.

- **A missing quill is a flag, not a refusal** (charcoal, chalk, a splinter and blood).
- **`missing` does not decide between destroyed, dropped and never-issued.**

## 5. Provenance

- **Sam-originated:** journals as diegetic artifacts (lost, stolen, destroyed, found, forged); journals survive confiscation; a restart burns the pages (17 Aug 2026); one canonical book plus N character journals as publishable artifacts; the three rulings in §4 — a page limit measured in characters, the owner not being told, and some pages carrying titles.
- **Database-originated (verified live 2026-09-29, not convention):** the author list, the visibility list, the 20,000-character body cap, the RLS insert contract.
- **Claude-originated, for Sam's yes:** the number 600 (Sam set the unit and delegated the figure); the two house rules still open at the end of §4; `found` being terminal; custody derived from `confiscated_from`; the pipe form and its 60-character guard; the dateline format.

## 6. What this module does not do

- It does not wire itself into the chat route. Nothing about live behaviour changes when this merges.
- It does not write to `npc_knowledge` (there is none), forge pages (no author value), or delete anything.
- It does not fix the zero-rows problem, because the cause is not yet known (§2.1).

## 7. Collision check

`node scripts/who-else.mjs --days 14 lib/journal.ts app/api/chat/route.ts components/dashboard/journal-pages.tsx` → **CLEAR** (2026-09-29 16:00). Eight branches are live; none touches these files. `lib/journal.ts` is a new file.

## 8. Wiring plan — one idea per PR

- **PR 1 (this one)** — `lib/journal.ts` + `lib/journal.test.ts` + this doc. No schema change, no behaviour change.
- **PR 2** — The chat route calls `decideJournalPage` and `journalInsert` instead of its inline regexes; the two prompt copies become `JOURNAL_NUMBERED_RULE` and `JOURNAL_TAG_RULES`; `lib/__tests__/journal-tag.test.mjs` is deleted, since its re-implementation is exactly the failure mode the module removes. No schema change.
- **PR 3** — Custody: pass the character's inventory rows into the decision, and add `formatJournalBlock` to the prompt so Malachar is never told to offer a book that is gone. No schema change.
- **PR 4** — The dateline: write `in_world_date` from the campaign clock at insert; the dashboard already renders it in preference to the browser timestamp. No schema change.
- **PR 5** — Disclosure: a service-role route that moves visibility to `found` when a journal changes hands. The dashboard marks read pages **only when the owner opens their journal** (§4.2) — no alert anywhere.

Deferred until schema work Sam approves: forged pages (`author` has no value for one), and NPC knowledge from a found journal (no table).

## 9. Open questions for Sam

1. **Forgery: new `author` value, or a `forged_by` column?** Either is a migration. Until then a forged page cannot be stored as forged.
2. **Does an NPC who reads a journal act on it?** Needs a knowledge table that does not exist (§2.4).

Answered 2026-09-29 and now in §4: the page limit, whether the owner is told, and titles.
