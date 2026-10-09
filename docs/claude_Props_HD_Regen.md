# Map props at 128px — high-fantasy Underdark re-cut

Decision of record. Sam, 2026-10-08: *"These should be underdark highfantasy
highdef pixel art, some that are animated."* Asked whether to leave the new
water props as a better-looking island or re-cut everything, he chose **re-do
the whole library**, and **static first, animation after**.

## What changes, and what doesn't

**Only the art files change.** `components/tactical/map-prop-decor.ts` sizes a
prop from `footprint_w/h` against the board's square size; `PX_PER_SQUARE = 64`
is declared there and never read. A 128px texture on a 1x1 footprint renders
into the same 5-ft square at double the density.

- No renderer change
- No geometry change
- No schema change
- The only DB write is `sprite_url` and `canvas_px` per row, and the script
  prints that SQL rather than running it

## Scope and cost

~223 props (191 existing + the water set) at 6 generations each on Pro Flash
128x128 — about **1,340 generations**. Tier 3 allowance is 9,500/cycle, resetting
2026-10-26; 2,706 were left when this was planned.

## The pilot that set the spec

Four props generated both ways on 2026-10-08. Three of four came back clean
(corner alpha 0.0, 20–34% opaque). The fourth — the cresting wave — came back
at 58% opaque with cave walls and a water surface painted behind it: a framed
illustration, not a prop.

**Cause: the prompt named a setting** ("in an Underdark river cavern"), so the
model drew one. `scripts/props/prop_prompts.py` therefore never names a place.
The Underdark reads through palette and lighting, and the isolation clause is
explicit and long.

## Two rules the pipeline enforces

**Measure, don't look.** `verify` checks corner alpha on every file and flags
anything above 8.0 as having a background baked in. The bad wave sat at 25.7
and looked fine as a thumbnail. This is the third time on this project that a
numeric check has caught what an eyeball missed.

**Nothing uploads without Sam.** Generation and upload are separate commands.
`upload` exits unless given `--approved`, skips everything in `out/rejects.txt`,
writes to `props/v2/<slug>.png` rather than overwriting the 64px originals, and
backs the table up before the SQL touches a row. Per AGENTS.md §7: build-time
generation is fine, shipping without approval is not.

## A catalog finding, caught on the first dry run

`category = 'remains'` is **not** a remains category. It is the floor-decal
bucket: `dead-drow` and `claw-gouges`, but also `burrow-hole`, `cracked-floor`,
`water-pool`, `campfire-small`, `crystal-violet-floor`. A corpse palette keyed
on that category told a cave pool to look like bleached bone.

The prompt builder now resolves the most specific description and uses only
that — exact slug, then slug prefix (`dead-`, `fungi-`, `trap-`), then category
— instead of stacking them. Renaming the category in the DB would be the real
fix; it is not done here because it is a separate idea.

## Running it

```bash
export PIXELLAB_API_KEY=...            # from pixellab.ai
export SUPABASE_URL=https://ppadxmvvvxmnnejeaoer.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...

python scripts/props/regen_props_hd.py plan              # no spend; prints the bill
python scripts/props/regen_props_hd.py plan --show boulder
python scripts/props/regen_props_hd.py generate --limit 8   # small first run
python scripts/props/regen_props_hd.py verify
python scripts/props/regen_props_hd.py sheets
# review out/review/*.png, list rejects in out/rejects.txt
python scripts/props/regen_props_hd.py upload --approved
```

`generate` is resumable — it skips any slug that already has a PNG, so an
interrupted run is restarted by running it again. Python 3.12 stdlib plus
Pillow and numpy for `verify`/`sheets`; no Node.

## The animation pass, deferred

`map-prop-decor.ts` builds one static `MeshBasicMaterial` per prop. Animated
props need a sprite-sheet material stepping on the clock — the VFX kit already
does this for impacts and AoE loops, so there is a working pattern to copy.

The manifest marks candidates as `animate_later` (anything emitting light, or
whose slug contains water/wave/curtain/fall/drip/fire/flame/torch/brazier/
steam/spore/ripple/eddy/foam) — roughly 6–10 props. Everything else is rock and
timber that gains nothing from moving.
