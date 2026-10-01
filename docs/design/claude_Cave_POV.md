# Darklake Cave — first-person module (`/cave`)

**Status:** playable test module, Sam-directed round by round, 2026-09-29 → 09-30.
**Decision of record:** `Painted_Scenes_Decision.md` ("Caves and dungeons: first-person") — open ground stays
painted scenes; entering a cave or dungeon switches to this grid raycaster.
**Preview artifact:** *Darklake Cave* (claude.ai artifact `N2u3kZqp5p7A4rBZLw6oSb`) — the same code as one file.

---

## 1. Where it lives

| Path | What |
|---|---|
| `app/cave/page.tsx` | The route. A thin header and a full-height same-origin iframe of `/cave-pov/index.html` — the `/forge/builder` pattern, so the game keeps its own render loop, pointer lock and audio graph. |
| `public/cave-pov/index.html` | Page shell: styles, start picker, film / death overlays, hotbar, key legend. |
| `public/cave-pov/manifest.js` | `const A = {…}` — the map, creatures, props, character strips and every asset URL. |
| `public/cave-pov/pov.js` | The game. **This is the source of truth for code** — edit it directly, no build step. |
| `public/cave-pov/assets/*` | 97 files, ~8.7 MB: sprites, props, textures, rig art, sounds, the hook-horror film. |
| `scripts/cave/unpack.py` | One-file artifact → `public/cave-pov/`. |
| `scripts/cave/bundle.py` | `public/cave-pov/` → one self-contained HTML for an artifact preview. |
| `scripts/cave/violet-anim.py` | How the violet fungus's 12-frame tentacle loop was warped from the field-pack sprite. |

`pov.js` loads audio from a `data:` URI (artifact) or a URL (app), so the same file runs in both.

## 1b. Dungeon records and the builder (Sam, 2026-09-30)

Sam: *"the cave is a template for dungeons"* — then chose **describe-and-build** plus *"the ability for me to add
assets, chests, traps, lore."*

- **One engine, many dungeons.** `pov.js` plays a record from `public/cave-pov/dungeons/<id>.json` (`/cave?d=<id>`,
  default `darklake`). A record holds: `id, name, kind, place, intro, map, start, creatures, chests (loot = catalog
  slugs), forage, props, traps, lore, hazards, dressing {seed, stalactites, props, violets}`. Creature stat blocks live
  once in `manifest.js` (`A.creatures`); a record only says which and where.
- **Describe-and-build:** Sam describes a dungeon; Claude writes the record (map + placements) and checks it in.
- **Builder (B):** the DM gets a *Builder* button on `/cave` (role `dm`); every preview has it too. Walk, pick
  Chest / Trap / Lore / Prop / Creature / Mushrooms / Light / Erase, *Place at the ring*. Changes save as a draft in
  that browser at once; **Export** downloads `<id>.json` for Claude to check in, so every player gets it. Monsters,
  traps and spores sleep while it is open. Chests pick from the **live `items` catalog** (the page passes the public
  Supabase URL + anon key to the iframe); lore text is Sam's, shown verbatim.
- **Traps — SRD 5.1 sample traps, numbers as recalled; check against the SRD before canon play:** hidden pit (DC 15 to
  spot, 10 ft, 1d6), poison darts (DC 15 to spot, 1d3 darts +8, 1d4 piercing + DC 15 CON or 2d10 poison, half on a
  save), falling net (DC 10 to spot, restrained, DC 10 Strength to escape). Passive Perception = 10 + WIS (skill
  proficiencies are not on the sheet yet); Search reveals traps whose DC the roll meets. Disarm darts/net: thieves'
  tools DEX DC 15 (+2 for rogues), failing by 5+ sets it off. **HOUSE:** a jump clears a pit; climbing out takes 2.5 s;
  darts fire up to 3 times. Note: the SRD darts can kill a level-1 character outright.
- **Lore:** journal, loose page, book (item-pixel icons) or a carved standing stone; E opens a parchment reader.
- **Not yet:** saving to the database (`dungeons` / `dungeon_state` — a migration Sam would paste), the travel
  generator, more creatures with cave art.

## 1c. First-person dagger (Sam, 2026-09-30: "replace the dagger animation like we did for the bow and arrow")

The painted dagger and `lib/weapon-rig.ts` from `feat/bow-draw-rig` (`claude_Melee_Attack_Rig.md`), ported into
`pov.js`. Light timing (windup 172 ms, strike 90, recover 234); the attack roll lands on the strike frame. Dagger on the
full-resolution HUD like the bow. Held at a fixed 30° counter-clockwise tilt, blade leaning left (Sam, 9/30: first "rotate
the blade and hand drawing by 30 degrees and fix it there", then "60 degrees counter clockwise now" from that); it never
rotates during a swing. The painted hand is Freía's (red nails) — every character uses it until
each has their own capture. Fists keep the pixel animation.

- **Quick click = `slash_out`** (Sam, 9/30: "the slash from medially go lateral"): a backhand along a bowed arc. Sam, later: "start left then
  just slash right" — the hand rises into view already on the left, slashes right, and drops off the bottom right; it
  never travels left first or slides back to the middle. Sam: "swipe 30% faster" — the slash plays at 1.3× (about
  380 ms instead of 496; the hit lands about 200 ms in), the thrust keeps the rig timing. How often you can attack is
  unchanged. `slash_d` (the rig's inward cut) stays in the table
  unused.
- **Hold = `thrust_c`** (Sam, 9/30: "just go a little in front of the character and come from the center POV; similar
  to what we had previously"): a short draw-back, then a drive in toward the middle, the hand shrinking to 0.8 as the
  blade goes away; the tip lands just under the crosshair. The rig's long `thrust` clip stays unused.
- **The trail** (Sam, 9/30: "more like it looked before. Street Fighter type of arc"): the old pixel crescent is back —
  square pixels on the 320×180 canvas, cream outer edge, gold, faint orange inside, fat through the middle and dotted at
  the ends — riding the painted dagger's real tip path. The thrust gets the old radiating speed lines instead. The
  rig's blue ribbon (`arcAt`, `MR.BANDS`) is no longer drawn.

## 2. Controls

- **Mouse** looks (after one click; Esc releases). Full pitch.
- **↑ ↓ / W S** walk, **← → / A D** strafe.
- **Left click** strikes with the lit card; **hold left** is the class power (Fifi: dagger thrust and lunge with a grunt).
- **Right click** draws the bow (hold), release looses.
- **Wheel tap** crouches / stands; **wheel hold** hides (rogues).
- **Fifi's bar** (Sam, 9/30: "Clear the text and options but keep the cards 2-8"): names only, no sub-lines —
  1 Dagger / Shortbow (left and right click), 2 Search, 3 Dash, 4 Throw object (throws on the key press; today that is
  the dagger, and left click punches until it is picked up), 5–8 empty slots kept for later. Hide is the wheel hold,
  Dodge is 0, Unarmed is automatic. The other three characters keep their spell bars.
- **1–9** action cards · **Space** jumps · **0** leaps back (rogue, ranger, fighter) · **E** forage / open / pull arrows · **M** map.

## 3. Rules — SRD vs house rules (flagged)

SRD 5.1 unless marked **HOUSE**.

- **Characters** — Fifi, Kenta, Samson, Scott from the `characters` table (HP, AC, mods, attacks, spells, slots, voice ids).
  Speed: rogue and cleric move full speed, the others 0.72 (**HOUSE**, Sam).
- **Creatures** — giant spider (SRD) and hook horror (OotA) from `bestiary`.
- **Fright** — roar → WIS save DC 11 spider / 13 hook horror → SRD Frightened 6 s, voice line (**HOUSE** trigger).
- **Hide** — Stealth vs DC 15; creatures with passive Perception ≥ the total still see you.
  Blindsight ignores hiding inside its range (hook horror 60 ft, giant spider 10 ft — both from `bestiary`). Whenever a
  creature finds a hidden character the log says why with the numbers ("blindsight 60 ft and Fifi is 25 ft away…", or
  "its passive Perception 10 meets or beats her Stealth 9"), and she stops being hidden (Sam, 9/30: "can you prove it
  beat my stealth").
- **Creature reach** — an attack starts only inside its reach with a clear line (bite 5 ft = 1.1 squares, hooks 10 ft
  = 2), and is checked again when the blow lands: still inside reach (+0.1 square) and in line, or it falls short and
  the log says "out of reach" with the distance. Step back during the wind-up and it misses (Sam, 9/30).
- **Crouch** — slower (55%), quieter, advantage on Stealth, noticed within 8 squares instead of 12 (**HOUSE**). Standing ends Hide.
- **Leap back (0)** — ~8 ft, disadvantage on attacks against you while airborne + 0.5 s, 3 s cooldown, grunt (**HOUSE**).
- **Jump (Space)** — SRD standing high jump, (3 + STR mod) ÷ 2 ft; a moving hop ×1.5 (**HOUSE**). Real gravity.
- **Bow** — SRD attack roll decides the hit. Arrow physics (**HOUSE**, Sam): speed (20 + 3×STR, min 12) × 1.3 squares/s,
  gravity 2.4, zeroed at 8 squares, DEX widens the hit reach and adds 5% zoom per +1, draw 0.5 s. Enchanted bows don't drop.
  Arrows stick where they strike — walls, floors, creatures, and props **only where the prop's picture is** (pixel test
  against the frame at the billboard plane). Fungi hold 90%, rock and crystal 40%.
- **Violet fungi** — walk within ~1.3 squares: they glow, stir, puff spores (30 s recharge). Inside the cloud: CON save
  DC 12 (the guide's DC for Underdark magic fungi). Fail → SRD Poisoned 60 s plus d4 (**HOUSE** table):
  1 choking fit (1d4 poison, coughing reveals you within 8 squares), 2 swimming sight (30 s blur), 3 reeling (20 s,
  view drifts and steps veer — nod to the timmask's confusion cloud), 4 spore-lit lungs (60 s, no hiding, seen at 12).
  Shooting one wakes it.
- **Forage** — E at a bluecap patch: Survival (WIS) DC 15 → 1d3 of bluecap, barrelstalk, trillimac, waterorb,
  ripplebark, fire lichen, torchstalk. Each character plays their own pick-up animation (PixelLab `picking-up`).
  On a find they say one of three lines at random, in their own ElevenLabs voice (`characters.voice_id`), Sam 9/30:
  "This might be edible." / "I bet I can make something from this." / "This is probably garbage… but maybe…" —
  `audio-<voice>Forage.webm`, one take each cut at the pauses (`FOUND_CUT`, checked against word timings).
- **Chests** — fixed test loot from the `items` catalog. Everything resolves to a catalog slug.

- **Cave fauna** (Sam, 9/30: "harmless fauna flying around like bats hanging that get startled when stirred and fly
  around. Insects should be moving around. Little spiders might be crawling"): set dressing only — no stat blocks, no
  rolls, nothing to fight. Counts in the record's `dressing` (`bats` 10, `spiders` 9, `swarms` 6).
  - **Bats** roost on the ceiling in twos to fours. They flush when you come within 2 squares standing, 2.8 walking,
    4.2 dashing, 1.4 crouched or hidden; also on a loosed arrow (3.5), a weapon hit (4), a jump landing (3; 1.5
    crouched) or a creature's roar (9). The whole cluster goes up together, wingbeats and squeaks, circles 3.5–7 s,
    then flies to a new spot in sight and away from you, and hangs again. Distances are Claude's choice, not a rule.
  - **Moths and gnats** dance around the glowing fungi and crystals: pale moths with beating wings, dark gnats.
  - **Little spiders** creep along the floor by the walls in fits and starts and scuttle off when you come within 1.6.
  - Pixel bitmaps drawn in code, lit by the cave light and clipped by the walls. Sounds: ElevenLabs sound effects
    (`audio-batFlush`, `-batFlush2`, `-batSqueak`, cut at the squeak onsets).

## 4. Look and sound

- Raycaster 640×360, pixelated; floor/ceiling per pixel; billboards clipped per column against the wall depth buffer.
- Props are the field games' pixel art; big ones are solid, placed only where they can't block a corridor.
- Over-the-shoulder body from each character's sheet (back rows NE/N/NW), translucent while hidden.
- First-person bow: the `feat/bow-draw-rig` plate (forearm extended 700 px down-left so it never shows a cut) and
  Sam's reference arrow (blackened shaft, violet fletching, barbed bronze head) at a quarter of the first thickness.
  Drawn on its own full-resolution canvas over the pixel view. **Style note:** this painted rig is a third visual
  language — Sam approved it for the cave (2026-09-30); the question for camp/main is still open.
- Sound: eerie score and roars (Runway); character voice lines (ElevenLabs, each `voice_id`); water drops, cave
  footsteps, breathing, fungus stir/puff, coughs (ElevenLabs sound effects). Drips and breathing kept very quiet (Sam).

## 5. Not yet wired (next lanes)

- Reads no database at runtime — sheets, stat blocks and loot are baked into `manifest.js`. Next: load the claimed
  character, write forage and chest awards through the catalog (`awardItem`), write HP/conditions back.
- No entry from camp: Explore → "Enter the cave" should route here.
- Kenta has no ranged weapon card; only Fifi has grunts recorded.

## 6. Editing and checking

1. Edit `public/cave-pov/pov.js` (or `index.html` / `manifest.js`).
2. `node --check public/cave-pov/pov.js` — **always**. A `//` comment pasted mid-line has twice swallowed live code
   (a whole `else` branch; `holdTick()`), and a second top-level `function shade` once silently replaced the first.
3. Serve `public/` and play `/cave-pov/index.html`; for a preview artifact run `scripts/cave/bundle.py`.
4. `drawFx` blends additively — anything solid must set `source-over` itself.

## Provenance

- **Sam-originated:** first person for caves; strafing, sound, hands, weapon arcs, cards 1–9, eerie music, roars,
  swearing voice lines; forage/chests; hook horror film; over-the-shoulder sprites; Fifi's shortbow and 12 arrows;
  bow draw plane, sway, zoom, red crosshair, string sound; arrow physics rules; crosshair placement; arrows that stick;
  rogue dagger swipe/thrust; crouch/hide on the wheel; leap back on 0 (3 s, grunt); jump on Space by STR; pixel props,
  solid props; the violet fungus spores with DC and d4; drips/footsteps/breathing via ElevenLabs, quieter; the bow rig;
  the reference arrow and its thickness; arrows impaling mushrooms; character-specific forage animation.
- **Claude-originated:** the raycaster method; fright save as the voice-line trigger; DC 12 and the d4 table contents;
  crouch detection range; leap-back disadvantage window; moving-hop bonus; pixel-accurate prop hits; stick odds.
