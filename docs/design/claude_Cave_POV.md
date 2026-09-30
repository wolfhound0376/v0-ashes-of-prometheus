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

## 2. Controls

- **Mouse** looks (after one click; Esc releases). Full pitch.
- **↑ ↓ / W S** walk, **← → / A D** strafe.
- **Left click** strikes with the lit card; **hold left** is the class power (Fifi: dagger thrust and lunge with a grunt).
- **Right click** draws the bow (hold), release looses.
- **Wheel tap** crouches / stands; **wheel hold** hides (rogues).
- **1–9** action cards · **Space** jumps · **0** leaps back (rogue, ranger, fighter) · **E** forage / open / pull arrows · **M** map.

## 3. Rules — SRD vs house rules (flagged)

SRD 5.1 unless marked **HOUSE**.

- **Characters** — Fifi, Kenta, Samson, Scott from the `characters` table (HP, AC, mods, attacks, spells, slots, voice ids).
  Speed: rogue and cleric move full speed, the others 0.72 (**HOUSE**, Sam).
- **Creatures** — giant spider (SRD) and hook horror (OotA) from `bestiary`.
- **Fright** — roar → WIS save DC 11 spider / 13 hook horror → SRD Frightened 6 s, voice line (**HOUSE** trigger).
- **Hide** — Stealth vs DC 15; creatures with passive Perception ≥ the total still see you.
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
- **Chests** — fixed test loot from the `items` catalog. Everything resolves to a catalog slug.

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
