# The pixel road

Sam, 2026-11-22: the party walks a PixelLab tile map between nodes; a stop on it opens a painted plate.
Design of record: `claude/Pixel_Road_Hybrid_2026-11-22.md` (project doc). This folder is step 1, look only.

## What a stretch is made of (`public/pixel-road/<id>/`)

| File | What it is |
|---|---|
| `road.json` | The map's own cell grid (`w` floor, `r` damp floor, `d` rock, `a` rock face, `s` stream), every prop's place and footprint, the way in, the way out, the landmarks. **This is where walking comes from; nothing is masked by hand.** |
| `ground.png` | The whole stretch at 32px a cell, props painted in. |
| `shade.png` | Depth as one see-through layer: the dark at the foot of every rock face, and the shadow each prop throws. |
| `front.png` | The lip of the rock that stands south of the floor, drawn in front of the figures so their feet go behind it. |
| `objects/<kind>.png` | The same props again, one file per kind, so a figure can stand behind one. |
| `fg/ceiling.webp`, `fg/shelf.webp` | The near rock the page hangs in front of everything: Sam's paintings of a stalactite ceiling lip and a stalagmite shelf (2026-11-22), kept in `scripts/pixel-road/art/`. They slide faster than the floor. |

Everything in that folder is written by `bake.py`. Do not edit it by hand; change the map in PixelLab and bake again.

## Where the depth comes from (Sam, 2026-11-22: "more like a cavern ... more depth")

1. **Tall rock faces**: the rock tileset is made with `transition_size 1.0` and `view low top-down`, so a wall shows a full cell of face.
2. **Things that stand over the figures**: spires, fangs and zurkhwood four to six cells tall. Figures walk behind them.
3. **Shadow**: `shade.png`.
4. **A close camera**: about eight and a half cells of height on screen.
5. **Rock south of the floor** (Sam: "the inferior walls look 2d"): seen from above it has no face to show, so it gets a raised, lit lip in front of the figures (`front.png`) and sinks into black away from the floor (`shade.png`).
6. **Near rock**: a painted ceiling of stalactites across the top and a shelf of stalagmites along the bottom that slide faster than the floor.

## Light

`road.json` names the kinds of prop that give off light (`glow`: colour, `shine`: strength). The page gives each a
pool of its colour on the floor, a bloom over itself and a slow pulse; crystals (shine 1) also get glints
(Sam, 2026-11-22: "Crystals should glow").

## Props that belong

Sam, 2026-11-22, on the first teal fungus rocks: "Those green boulders looks out of place ... they don't look random".
What fixed it: let the odd colour be a small part of the prop (stone boulders with teal fungus in the cracks, not a
teal rock), and stand it against a wall or in a corner, not alone in the middle of the floor.

## The art standard (Sam, 2026-11-23: "I want all the underdark pixel art to be high quality")

He flagged the first spire (PixelLab's quick `create_map_object`) as not good enough, and picked the "blend" from a
side-by-side: the crisp detail of PixelLab's best generator, in the cool grey-violet of his own ceiling and shelf
paintings. Every Underdark prop is made this way:

1. **Generator**: `create_image_pro` (10 generations a call; small canvases come back as several candidates, so pick the best). Not `create_map_object`.
2. **Colour**: rock props take the 16-colour palette lifted from Sam's shelf painting:
   `#120f18 #1d1924 #23202b #292430 #2f2a37 #37313e #3d3845 #443e4b #4e4955 #574d58 #605761 #69616a #776971 #877980 #a4959e #c4b6bd`
   (`palette_name`: "Underdark limestone, cool grey-violet"). Things with a colour of their own (crystals, mushrooms) are described as growing from grey-violet rock, with no palette.
3. **Words that work**: name the material and its surface ("weathered limestone with layered dripstone flows, sharp ridges, ledges"), where the light is ("pale highlights on the lit left side, deep violet shadows on the right"), the finish ("crisp, detailed 16-bit pixel art with clean dark outline and rich shading"), and what it is not ("no smooth blobs, no carving").
4. **Into the map**: trim the picture to its art, `import_object` it (free) named `underdark-hq <kind>`, and place it. The chosen pictures are kept in `art/props/`.
5. **Sam sees the candidates before they go in** (the art rule in AGENTS.md).

## A stop opens a plate

Sam, 2026-11-23, sent the picture "for the ruins". A landmark in the config may name a painted plate
(`"plate": "art/plates/ruins.png"`). The bake copies it to `plates/<kind>.png`, and when the party comes to rest
beside that landmark the road fades into the picture; a click or any key goes back to the road. It is look-only: no
fight, trade or search happens inside the plate yet (that is step 2).

## A landmark that is part of the cave: vista and paving

Sam, 2026-11-23, on the first Ruins prop: "This should be a lot larger and be part of the background as well with
multiple worn pillars not like a token sitting in the middle of the cave."

- **Build it into the wall.** The Ruins are a 256px-wide colonnade facade standing against the back wall of its
  chamber, with the gaps between its pillars filled with darkness so it reads as cut into the rock, and loose worn
  pillars on the floor in front. `import_object` takes at most 256x256.
- **`vista` on a landmark** (`{"x","y","h","reach"}`): within `reach` pixels the camera eases back to show `h` world
  pixels of height centred on x,y, and the near rock (ceiling and shelf) fades so the landmark is not hidden.
- **`paving` in the config** lays ONE painted picture of floor (not tiles) in front of a landmark:
  `{"image","x","y","w","solid","ragged"}`. It is kept at its own finer resolution in `paving/` and the page draws it
  over the ground and under the shadows; the bake eats its edge away so it reads as broken paving, not a rug.
  Sam, 2026-11-23, on a first try built from flat 64px tiles: "Those ground tiles look horrible for the ruins. Make
  highquality, highdef ones that look like rubble, stone, forget the spider that looks silly." The floor is made with
  `create_image_pro` at 640x384 (25 generations), `no_background: false`, with crops of his terrain board as references.

## Arriving at a stop: the plate, the question, the music

Sam, 2026-11-23: "once you come near the ruins it goes to the pixel AI ruins large art. There should be a question
more or less that ask (Do you enter or walk away)", "have some eery music playing from eleven labs", "make the
walking more subtle", and "The ruins should look like the tile set (which looks good)".

- A landmark with a `plate` opens it the moment the leader comes within `near` pixels (no need to stop). The party
  halts and a card asks `ask` with two answers, `enter` and `leave`. Walking away returns to the road. Entering has
  nowhere to lead yet (step 2), so it says so. Card fonts are Cinzel and Crimson Text, per Sam's card rulings.
- A landmark with `music` (a file under `art/music/`) crossfades with the road's track as the party nears, by the
  same measure the camera vista uses, and plays alone while the plate is open. The Ruins track is ElevenLabs Music
  (`eleven_music_v2_5`, 90s, 900 credits), with its tail folded into its head so it loops.
- Footsteps play at 0.14 (were 0.5).
- A landmark's building and props must be in the same stone as its floor. The Ruins facade and pillars were
  regenerated with crops of Sam's terrain board and of the forecourt floor as references, and the facade's stone was
  then shifted to the floor's own hue so the two meet without a seam of colour.

## Resting on the road

Sam, 2026-11-23: "when walking through this map there should be the option to short rest or make camp for a long rest.
This triggers a pixel art for a flaming fire pit, then fades in/out into a pixel art loading screen for camp and enters
into the camp module."

- Two small buttons, bottom right, while the party is walking: **Short rest** and **Make camp**. Hidden while a plate is open.
- Either fades to the fire pit (`public/pixel-road/rest/firepit.png`; the page adds the flicker, the sparks and
  `/audio/camp-embers.mp3`). A short rest stays a few seconds and fades back to the road. Making camp goes on to the
  camp loading picture (`rest/camp-load.png`) with a line of the voyage card's book lore, then opens `/camp`.
- `?stay=1` plays the whole long-rest sequence without leaving the page (for tests and for looking at it).
- This page has no hit points, hit dice or clock, so a short rest here changes nothing but the screen. That needs the
  road hooked to the travel rules (step 2). Coming back from the camp to the road is also not wired yet.
- Both pictures: PixelLab `create_image_pro`, 640x360, `no_background: false`, 25 generations each. Masters in `art/rest/`.

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

## A landmark with rooms behind it

A landmark may carry `"href"`. "Enter" then leaves the road for that address instead of showing the `inside` line
(`?stay=1` keeps the old behaviour for testing). The Ruins use `/velkynvelve?ruins=1`: six painted walk plates
(`scripts/velkynvelve-walk/spec.py` RUINS_PLATES). Their way out comes back here as `?at=ruins`, which stands the party
at that landmark's door, just outside its reach, so the question does not open on arrival.

## The real march (Sam, 2026-11-23: "Pixel road part of the real march")

The travel map (`components/map/underdark-map-module.tsx`) lays this page over itself for each leg of a march, in
the browser that leads: `?embed=1&road=<id>&line=<heroes>&npcs=<companions>&from=<marker>&to=<marker>`
(`lib/travel/pixel-road.ts`). In that mode the page:

- walks the heroes and the companions (the company at camp is the company on the road);
- names its two ends for the markers of the leg;
- posts `aop:road-done` when the leader reaches the far end. The map fades back, moves the party along that edge of
  the nodal map, rolls what waits at the marker, and fades into the road again for the next leg;
- shows the remarks the map deals it (`aop:road-remarks`, from `lib/travel/road-remarks.ts`): a companion asks to
  rest when the fatigue gauge says so, gives a direction the book says they know, or offers a hand;
- reports a rest (`aop:road-rest`) instead of running it: the map runs the real hour, or the Camp Module;
- treats landmarks as scenery (no plate, no rooms), so a march is never left half walked.

It still decides nothing. SKIP THE WALK on the overlay, and the DM's PIXEL ROAD switch under the map, are the ways out.
