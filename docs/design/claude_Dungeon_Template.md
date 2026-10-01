# Dungeons from the cave template — proposal

**Status:** Sam approved 2026-09-30 — describe-and-build, plus a builder for him to add chests, traps, lore and props.
Built: build-order step 1 (records) and the builder (step 4). Not built: DB persistence (step 3), generator (step 5).
**Sam, 2026-09-30:** "the cave is a template for dungeons. There will be many and some naturally will spawn based on
how exploring goes during travels. Some I will design myself that will have serious monsters, loot, and lore. These
we will place."

---

## 1. The split: one engine, many dungeons

Today `public/cave-pov/manifest.js` holds one hard-coded cave. The change is to separate the **engine** (pov.js —
raycaster, controls, rules, sound; unchanged) from the **dungeon** (a data file). Every dungeon, spawned or authored,
is the same kind of record; the engine loads one and plays it.

## 2. A dungeon record

| Field | What it holds |
|---|---|
| `id`, `name`, `kind` | `spawned` or `authored` |
| `place` | where it sits in the world (location / travel leg), so it can be found again |
| `look` | wall, floor, ceiling textures; light colour; ambience and music cue |
| `map` | the grid (`#` rock, `.` floor, `C` crystal wall …) — hand-drawn for authored, generated for spawned |
| `creatures` | bestiary slugs + positions (+ optional boss behaviour, cinematic on first sight) |
| `loot` | chests / caches holding `items` catalog slugs only — never invented |
| `lore` | readable things (carvings, journals, bones) whose text is canon, written to the campaign's lore |
| `hazards` | violet fungi, webs, pits, bad air — each with its rule (SRD or flagged house rule) |
| `exits` | back to travel/camp, deeper levels, one-way drops |
| `seed` | for spawned dungeons: the generator seed, so the same cave comes back the same |

## 3. Two ways a dungeon comes to exist

**Spawned (during travel).** When exploring on a travel day turns up a cave, Layer 1 (Malachar) asks the generator
for one: region and depth pick the look and the creature pool (the `bestiary` table already carries `habitat` and
`encounter_rarity`), party level sets how dangerous, loot comes from the catalog. The generator carves the map from a
seed. Small, quick, and the dice decide what's inside.

**Authored (Sam's).** Sam designs the map, places the serious monsters, the named loot, the lore. These are placed at
fixed points in the world and never re-rolled. Two ways to author, to decide:
- (a) describe it to Claude, who builds the record and a preview to walk through; or
- (b) a dungeon editor page: paint the grid, drop creatures/chests/lore from the real tables, test-walk it.

## 4. Persistence (the point of the project)

A dungeon remembers: monsters killed stay dead, chests opened stay empty, arrows stay stuck, lore read is known.
That needs two tables — `dungeons` (the record) and `dungeon_state` (what changed, per campaign). **This is a
Supabase migration Sam would paste by hand**; nothing is written until it is agreed.

## 5. Build order (proposed)

1. Engine reads a dungeon record instead of the built-in cave (the Darklake Cave becomes record #1). No DB yet.
2. Wire the cave to the claimed character and write finds through the catalog.
3. `dungeons` + `dungeon_state` migration; save and restore state.
4. Authoring path (a or b).
5. Generator for spawned dungeons + the travel hook in Layer 1.
