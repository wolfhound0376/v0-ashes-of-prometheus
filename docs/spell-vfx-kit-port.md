# Spell VFX kit — port into the combat board

Porting the Faerzress VFX kit (baked flipbooks, per-damage-type delivery,
school-specific rune discs, 556-spell resolver) into `components/tactical`.

**These are the spell effects now.** They shipped flag-gated off in #293, which
meant nobody ever saw them; the flag now defaults ON. `castSpellVfx` in
`spell-vfx.ts` remains as the fallback for lightning and physical, and as the
escape hatch: `localStorage.setItem("ashes.vfxKit","0")` and reload restores it
everywhere, no deploy needed.

## Why this is a port and not a drop-in

The kit was built standalone against a plain Three.js page. The board makes
different, better assumptions, and the kit has to meet them:

| | kit as built | board's contract |
|---|---|---|
| anchor | one `CASTER` Vector3 | caster's hand **bone**, tracks follow-through |
| lifecycle | global singleton, one shared pool | per-cast `VfxHandle{update,dispose}` |
| budget | ~63 additive quads peak | ~40 additive points, nothing allocates per-frame |
| assets | 9 MB base64 in a JS file | static files, loaded lazily |
| module | `window.VFX` script tag | TS import |

The bone anchor in particular is what the rune disc was designed for — it is
supposed to spin up off one extremity, and a position sampled once at spawn
drifts off the palm within three frames.

## Shape

- `public/vfx/*.webp` + `manifest.json` — the baked sheets, out of the bundle
- `components/tactical/spell-vfx-kit.ts` — the ported engine, per-cast instances
- `components/tactical/spell-vfx.ts` — untouched; still the default path

## Projectile motion and impacts (pixel pass 2)

The first pixel pass shrank the painted flipbooks into blocks. This pass draws
the thrown spells as pixel art and gives them motion:

- `public/vfx/px*.webp` — drawn by `scripts/vfx/draw_pixel_vfx.py` (Python +
  Pillow, deterministic; rerun it and the sheets come out byte-identical). The
  four thrown types (`pxFireball`, `pxMissile`, `pxPoison`, `pxPsychic`) have a
  head at +X and a tail behind, 8 looping frames each. `pxFlash`, `pxRing` and
  `pxSpark` are white and tinted per type by the kit.
- `lib/projectile-motion.ts` — pure. Four profiles: `lob` (fire, poison —
  rises and falls), `weave` (force — hunts the target, tightening as it
  closes), `dart` (any attack-roll spell whose type has no thrown art, e.g.
  Guiding Bolt), `drift` (psychic — corkscrews in). Progress is eased so
  arrival is the fastest moment. Tested in `lib/projectile-motion.test.ts`.
- `spell-vfx-kit.ts` — a ball is placed by the profile, billboarded, then
  rolled so its +X points along its screen-space travel (`screenRoll`),
  stretched with speed, and followed by after-images. On impact: the type's
  sheet lands with a scale punch, a white flash cools to the type's colour, a
  shockwave ring runs out across the floor, and `impact-burst.ts` throws
  pixel sparks (one InstancedMesh per cast, nothing allocated per frame).
- **Aftermath and flourishes.** A single-target hit of a type with an
  `aftermath` lays that sheet flat under the struck square and holds it (cold
  → `pxIce`, 8 s); an area spell lays the type's `decal` instead. A `flourish`
  outlives the impact: `glow` (healing — `pxGlow` halo around the body, motes
  rising, 2.6 s) and `mockery` (Vicious Mockery, by spell name — three `pxGhost`
  quads circling the head, 2.4 s). `castSpellKitVfx` takes an optional
  `outcome` ("hit" | "miss" | "saved"); a flourish plays only when the spell
  took. The board does not pass it yet, so today a flourish plays whenever the
  cast does.
- `/cast-preview` — dev page, one lane per damage type. `?loop`
  recasts every few seconds; `?manual` hands the clock to `window.__castStep`
  so a screenshot script can photograph exact moments; `?cam=x,y,z&look=x,y,z`
  moves the eye.

## Collision note

`feat/cast-animation-and-spell-vfx` is live on `combat-board-3d.tsx` and
`lib/token-animation.ts`. Its commits are token-stacking, dead-stay-dead and
focus-your-own-character — different regions of the same file, not the VFX
rendering. These two PRs will need sequencing; this one keeps its diff tight
at the call site to make that cheap.
