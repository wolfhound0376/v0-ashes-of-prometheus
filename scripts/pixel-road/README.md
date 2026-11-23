# The pixel road

Sam, 2026-11-22: the party walks a PixelLab tile map between nodes; a stop on it opens a painted plate.
Design of record: `claude/Pixel_Road_Hybrid_2026-11-22.md` (project doc). This folder is step 1, look only.

## What a stretch is made of (`public/pixel-road/<id>/`)

| File | What it is |
|---|---|
| `road.json` | The map's own cell grid (`w` floor, `r` damp floor, `d` rock, `a` rock face, `s` stream), every prop's place and footprint, the way in, the way out, the landmarks. **This is where walking comes from; nothing is masked by hand.** |
| `ground.png` | The whole stretch at 32px a cell, props painted in. |
| `shade.png` | Depth as one see-through layer: the dark at the foot of every rock face, and the shadow each prop throws. |
| `objects/<kind>.png` | The same props again, one file per kind, so a figure can stand behind one. |
| `fg/ceiling.webp`, `fg/shelf.webp` | The near rock the page hangs in front of everything: Sam's paintings of a stalactite ceiling lip and a stalagmite shelf (2026-11-22), kept in `scripts/pixel-road/art/`. They slide faster than the floor. |

Everything in that folder is written by `bake.py`. Do not edit it by hand; change the map in PixelLab and bake again.

## Where the depth comes from (Sam, 2026-11-22: "more like a cavern ... more depth")

1. **Tall rock faces**: the rock tileset is made with `transition_size 1.0` and `view low top-down`, so a wall shows a full cell of face.
2. **Things that stand over the figures**: spires, fangs and zurkhwood four to six cells tall. Figures walk behind them.
3. **Shadow**: `shade.png`.
4. **A close camera**: about eight and a half cells of height on screen.
5. **Near rock**: a painted ceiling of stalactites across the top and a shelf of stalagmites along the bottom that slide faster than the floor.

## Light

`road.json` names the kinds of prop that give off light (`glow`: colour, `shine`: strength). The page gives each a
pool of its colour on the floor, a bloom over itself and a slow pulse; crystals (shine 1) also get glints
(Sam, 2026-11-22: "Crystals should glow").

## Props that belong

Sam, 2026-11-22, on the first teal fungus rocks: "Those green boulders looks out of place ... they don't look random".
What fixed it: make a prop from the same stone as the floor and let the odd colour be a small part of it (brown
boulders with teal fungus in the cracks, not a teal rock), and stand it against a wall or in a corner, not alone in
the middle of the floor.

## Baking `road-01` (PixelLab map `1c47eece-3986-4b2c-9501-3ad0b47fe44e`, "Road 01 - Tunnel out of Velkynvelve (cavern)")

`python3 scripts/pixel-road/bake.py road-01 <config.json>`, with a config like `road-01.config.json` here (its
picture paths are placeholders: the pictures come from PixelLab each time and are not kept in the repo).

1. Crops: four `view_map` calls, 16 cells wide and the full height. A crop that size comes back at full size; the whole map comes back at half.
2. Grid: the rows `get_map` prints for the same cells (`road-01.grid.txt`).
3. Export: `get_map(export="pixellab")`, unzipped. Only `objects/` is used.
4. Foreground: `art/ceiling.webp` and `art/shelf.webp` (one screen wide each, see-through; any stretch can reuse them).

The export ZIP's own picture of the ground is a blank 1x1 until the map has been saved once in Map Workshop, and
its `map.json` has no cell grid, which is why steps 1 and 2 are done this way.

Tilesets: floor/rock with a full face `3cf4a866-eae9-41d6-a5d4-04233a8cde45`, floor/damp floor
`e8d4090b-3e06-4d97-8dbe-e8308ca891ed`, stream/floor `bbec3155-b824-44ad-8e80-58905b4a41fd`. All share one floor
tile (`7962dd5e-...`), which is what lets them meet without a seam.

## PixelLab rules learned the hard way

- A rock edge with a face needs every step in it to be two rows or taller, or the tile draws black. Build the cave from rectangles.
- Three kinds of ground cannot meet at one corner: keep a cell of plain floor between water or damp floor and rock.
- Flat ground (damp patches, water) can be painted with `path` ops for a natural edge; a rectangle of it looks like a rug.
- Say what a prop is made of and what it is not. "Rock column pillar" came back as a blue marble pillar; "natural stalagmite rock formation ... no carving, no architecture" came back as rock.

## Checks

`npx vitest run lib/pixel-road.test.ts` is the walk check for every stretch in `public/pixel-road/`: the way in
reaches the way out on floor with a figure's footprint, no prop seals off any floor, every prop stands on floor,
and every landmark can be walked up to.
