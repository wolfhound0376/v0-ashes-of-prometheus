# The Sandbox World — rehearsal that remembers, then forgets

Sam, 2026-10-26: "I'm not sure anything saves temporarily during a sandbox testing so rolls events don't move well. I think we should have another database that gets wiped out when we leave the sandbox automatically for sandbox tries."

## What was wrong

- Rehearsal (`/?sandbox=1`) ran Malachar through `lib/dry-run.ts`, which reads the live game and **throws every write away**. A roll, a wound, an item, the clock — gone before the next turn read the world. That is why rolls and events "don't move."
- Only **1 of 53** API routes that write (`app/api/chat`) honoured the flag. Fortune rolls, the drow surgeon, most of combat and the rest write to the **live** game from a rehearsal.

## The design (Sam said go, 2026-10-26)

A second copy of the game in Postgres schema `sandbox`, in the same Supabase project.

| | |
|---|---|
| **Enter** | `sandbox_begin(by)` wipes `sandbox` and rebuilds it from `public`: every table with its rows, keys, defaults, checks, RLS policies, grants, foreign keys and triggers; every view; every SQL/plpgsql function, rewritten so `public.x` → `sandbox.x` and run with `search_path = sandbox, extensions, public`. |
| **Play** | Writes land in `sandbox` and **stay** — the next turn sees them. Triggers fire inside the sandbox (history, secrets, the game clock). Live updates (realtime) cover the sandbox twins. |
| **Leave** | `sandbox_end()` drops everything. The empty schema stays so the Data API setting keeps working. Every new rehearsal also starts with a wipe, so a crashed tab never carries over. |

Exceptions, on purpose:
- `campaign_chunks` (24 MB rulebook + embeddings) — a **read-only view** of the live table. Rehearsal searches the books; nothing can write them.
- `characters_history` (22 MB audit log) — copied **empty**.
- `*backup*` tables — skipped.

Cannot be fenced by the database: storage uploads and outside services (model calls, ElevenLabs, Runway). Gated in the app.

One world at a time — a second `sandbox_begin` wipes the first.

## Why not a Supabase branch

A branch is built from migration files. Most of this database was built by hand in the Supabase UI, so a branch would come up missing tables. It also costs money and takes minutes to start.

## Setup done 2026-10-26

- Schema `sandbox` created with usage for `anon`, `authenticated`, `service_role`.
- Sam added `sandbox` to the Data API's exposed schemas. Verified: the API answers `Accept-Profile: sandbox`.

## Plan

1. **PR 1 — this one.** `migrations/20261026190000_sandbox_world.sql` (`sandbox_begin`, `sandbox_end`) + `scripts/sandbox/test-sandbox-world.mjs` (40 checks against an in-process Postgres). **Schema change** — applied only on Sam's "run the sandbox migration".
2. **PR 2 — server switch.** Rehearsal cookie set at the DM door; the shared server client returns `db.schema('sandbox')` while it is set, so all 53 routes follow at once. Retire the dry-run swallow in the chat route.
3. **PR 3 — browser.** Dashboard reads, realtime channels and the Underwalk follow `?sandbox=1` into the sandbox.
4. **PR 4 — Leave rehearsal** button and a rehearsal border.

## Facts measured on the live DB, 2026-10-26

- 123 public tables, 54 MB total; ~8 MB without the rulebook and history.
- 34 backup tables, 8 views, 38 SQL/plpgsql functions, 22 triggers, 70 RLS policies, 20 realtime tables.
- Triggers that write to *other* tables (the reason a dumb copy would leak): `characters_history_aud` → `characters_history`, `characters_create_secrets` → `character_secrets`, `time_log_apply` → `game_clock`, `npc_encounter_guard` → `npc_encounters`.
- Counters: `story_dialogue.sequence_number`, `characters_history.hist_id` (serial), `dm_phrasebook.id` (identity). The sandbox gets its own, continuing from live.
- `vtt_maps`, `vtt_tokens` use replica identity FULL; copied.
