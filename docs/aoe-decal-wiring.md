# The AoE ground decal, wired

**This is done.** `components/tactical/aoe-decal.ts` is called from
`combat-board-3d.tsx` and an area spell now leaves a mark on the floor.

Kept as a record of where the wiring lives and what to check, because the
call site is not obvious from the module.

## Where it happens

The mark is laid in `flinch()` — the closure the cast effect calls on the
frame it ARRIVES — not at release and not when the realtime rows land.
Painted at release, a Fireball's scorch would appear while the bolt was still
in the air. Painted on the rows, the blast would clear and the floor would
light up a beat later for no visible reason.

`releaseAtPoint` computes the covered squares ONCE, as `shapeCells`, and that
one list answers both questions that must never disagree: who is standing in
the blast, and which squares the mark covers. It travels to the effect on
`PendingCast.cells`. Nothing downstream recomputes the shape.

`centre` is the aimed square, except for a self-origin shape (a cone, a
Thunderwave) where it is the caster's — that is where the bloom radiates
from, and averaging the cells would start the wave in the middle of the spray.

## Lingering marks

`areaDecals` maps a caster to the mark their concentration is holding. It ends
when:

- **they cast another area spell** — one concentration, one mark, which is the
  rule 5E already enforces on the caster;
- **they go down** — checked per frame against `isDowned`;
- **the board unmounts.**

**The gap:** there is no concentration tracker in this codebase, only a sound
cue named for one. So a Web whose caster simply *chooses* to drop
concentration, or who fails a CON save without going down, keeps its mark
until one of the three above happens. Wiring a real tracker is the fix; when
that lands, call `end()` from it and delete the downed check here.

## What to check on the board

- **A Fireball's mark covers the squares the template outlined** — not a circle
  that disagrees with the grid at the corners. That agreement is the whole
  reason `areaCells` is shared, and the corners are where players look.
- **No visible repeat.** Each square's texture is turned a quarter at a time by
  `turnFor`. If a blast reads as wallpaper, that hash broke — see its comment
  and `lib/__tests__/aoe-visual.test.mjs`.
- **A Web is still on the floor next round,** and goes when its caster does.
- **The mark sits UNDER the movement bands** (y 0.025 against their 0.035). A
  scorch hiding reach tiles means the y-stack is wrong: aftermath must never
  obscure the live answer to "where can I go".
- **A 20 ft radius costs six draw calls, not sixty-nine.** If the frame rate
  moves on a Fireball, the bucketing is not merging.
- **A cloud reads as one mass, not a row of separate puffs.** Cloud quads are
  drawn wider than their square so neighbours overlap. Daylight between cells
  means that overlap is being clipped somewhere.
- **Clouds stand up.** Poison and the gloom spells render as crossed vertical
  quads ~10 ft tall at y = 0, taking their height from geometry. If anything
  flattens effect groups to a decal height, they squash to nothing.

## Still not done

- **AoE templates skip line-of-sight.** Only single-target creature spells
  check `hasLineOfSight`; a template checks range and map bounds only, so a
  Fireball can be placed through a wall. Fixing it means changing
  `showTemplate` AND `app/api/combat/route.ts` together — client preview and
  server resolution have to agree or the board lies again.
- **No per-creature readout while aiming an area.** Point mode clears
  `setHoverRead(null)`, so there is no "who is caught in this, and what do they
  save against" list before you commit.
