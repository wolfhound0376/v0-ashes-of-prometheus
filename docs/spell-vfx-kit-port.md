# Spell VFX kit — port into the combat board

Porting the Faerzress VFX kit (baked flipbooks, per-damage-type delivery,
school-specific rune discs, 556-spell resolver) into `components/tactical`.

**Ships behind a flag.** `castSpellVfx` in `spell-vfx.ts` stays the default
until Sam has looked at the new effects on a real board.

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

## Collision note

`feat/cast-animation-and-spell-vfx` is live on `combat-board-3d.tsx` and
`lib/token-animation.ts`. Its commits are token-stacking, dead-stay-dead and
focus-your-own-character — different regions of the same file, not the VFX
rendering. These two PRs will need sequencing; this one keeps its diff tight
at the call site to make that cheap.
