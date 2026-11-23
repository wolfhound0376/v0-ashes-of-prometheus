# The pixel road

Sam, 2026-11-22: the party walks a PixelLab tile map between nodes; a stop on it opens a painted plate.
Design of record: `claude/Pixel_Road_Hybrid_2026-11-22.md` (project doc). This folder is step 1, look only.

## What a stretch is made of (`public/pixel-road/<id>/`)

| File | What it is |
|---|---|
| `road.json` | The map's own cell grid (`w` floor, `d` rock, `a` cliff face, `s` stream), every prop's place and footprint, the way in, the way out, the landmarks. **This is where walking comes from; nothing is masked by hand.** |
| `ground.png` | The whole stretch at 32px a cell, props painted in. |
| `objects/<kind>.png` | The same props again, one file per kind, so a figure can stand behind one. |

## How `road-01` was made (PixelLab map `4c4f1c68-96b2-407b-a46b-a97cde7fe3b1`, "Road 01 - Tunnel out of Velkynvelve")

1. Painted from rectangles with the floor/rock tileset `e5f9831f…` and the stream tileset `bbec3155…`.
2. `ground.png`: four `view_map` crops of 16x22 cells, set side by side (a crop comes back at full size; the whole map comes back at half).
3. `grid`: the rows `get_map` prints for the same cells.
4. Props and footprints: `objects/manifest.json` in the map's export ZIP (`boundingBox`, `groundBounds`).

The export ZIP's own picture of the ground is a blank 1x1 until the map has been saved once in Map Workshop, and
its `map.json` has no cell grid, which is why steps 2 and 3 are done this way.

## PixelLab rules learned the hard way

- A rock edge with a cliff face needs every step in it to be two rows or taller, or the tile draws black.
- Three kinds of ground cannot meet at one corner: keep a row of floor between water and rock.
- Water one cell wide tiles as steps: make streams two wide or straight.

## Checks

`npx vitest run lib/pixel-road.test.ts` is the walk check for every stretch in `public/pixel-road/`: the way in
reaches the way out on floor with a figure's footprint, no prop seals off any floor, every prop stands on floor,
and every landmark can be walked up to.
