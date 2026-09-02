# Wiring the AoE ground decal into the board

`components/tactical/aoe-decal.ts` is finished, typechecked and tested, and
nothing calls it yet. This is the diff that turns it on.

It was left unwired deliberately: `combat-board-3d.tsx` had two unmerged
branches live on it (`feat/board-declutter`, `fix/board-says-why`) when this
was written, and that file is the repo's documented collision hotspot. The
module was built to make this last step small — everything that needed
thinking about is already done and verified.

**Run `node scripts/who-else.mjs components/tactical/combat-board-3d.tsx`
first.** If it is still contested, wait; nothing here expires.

## The diff

**1. Import** — near the existing vfx imports (~line 48):

```ts
import { layAreaDecal, type AreaDecalHandle } from "./aoe-decal"
import { areaVisualFor } from "@/lib/aoe-visual"
```

**2. Keep the lingering ones.** Concentration marks outlive their cast, so they
need somewhere to live that is not the per-cast effect list:

```ts
// Ground marks that persist: keyed by the caster whose concentration holds
// them, because that is what ends them.
const areaDecalsRef = useRef(new Map<string, AreaDecalHandle>())
```

**3. Lay the mark where the area spell resolves.** In the point-release path
(`releaseAtPoint`, ~line 1373), after the cells are computed and the cast is
sent — the mark is confirmation that it landed, so it should not appear if the
server refuses:

```ts
const visual = areaVisualFor(entry.name)
if (visual && cells.length) {
  // The SAME clipped list the template drew, so the mark covers exactly the
  // ground the outline promised.
  const onMap = (c: Cell) => !map || (c.x >= 0 && c.y >= 0 && c.x < map.grid_width && c.y < map.grid_height)
  const handle = layAreaDecal({
    parent: scene,
    cells: cells.filter(onMap),
    centre: entry.area?.origin === "self" ? origin : { x: gx, y: gy },
    visual,
    cellToWorld: (x, y) => sqCentre(x, y),
    squareSize: SQ,
  })
  if (visual.lingers) {
    // One concentration, one mark: a caster starting a new one drops the old.
    areaDecalsRef.current.get(casterTokenId)?.end()
    areaDecalsRef.current.set(casterTokenId, handle)
  }
  effects.push(handle)   // whatever list already drives update(dt)/dispose()
}
```

`centre` is the aimed square for a point spell and the caster's square for a
cone or a Thunderwave — that is where the bloom radiates from, and averaging
the cells instead would put a cone's wave out in the middle of its spray.

**4. End a lingering mark when concentration does.** Wherever concentration
already drops (broken, recast, caster down):

```ts
areaDecalsRef.current.get(tokenId)?.end()
areaDecalsRef.current.delete(tokenId)
```

`end()` starts a fade and `update()` keeps returning true until it finishes, so
the existing effect loop disposes it normally. It is safe to call twice.

## Clouds need one extra thing

An area whose visual has `form: "cloud"` — poison, and the gloom spells (Fog
Cloud, Silence, Sleep) — renders as crossed vertical quads standing in each
covered cell rather than as a quad lying on the floor. The call site above is
unchanged, because `layAreaDecal` reads the form itself. Two things follow:

- **Do not clip a cloud into the floor's y-stack.** It deliberately sits at
  y = 0 and takes its height (~10 ft) from its geometry. If anything on the
  board flattens effect groups to a decal height, clouds squash to nothing.
- **`end()` is not optional for them.** The spells that make gas are
  concentration spells, so a cloud is almost always a lingering mark — and a
  Fog Cloud whose concentration broke but which is still hanging in the room
  is worse than no cloud at all.

## What to check on the board

- **A Fireball's mark covers the squares the template outlined** — not a circle
  that disagrees with the grid at the corners. That agreement is the whole
  reason `areaCells` is shared, and the corners are where players look.
- **No visible repeat.** Each square's texture is turned a quarter at a time by
  `turnFor`. If a blast reads as wallpaper, that hash broke — see its comment
  and `lib/__tests__/aoe-visual.test.mjs`.
- **A Web is still on the floor next round,** and goes when concentration goes.
- **The mark sits UNDER the movement bands** (y 0.025 against their 0.035). If a
  scorch is hiding reach tiles the y-stack is wrong: aftermath must never
  obscure the live answer to "where can I go".
- **A 20 ft radius costs six draw calls, not sixty-nine.** If the frame rate
  moves on a Fireball, the bucketing is not merging.
- **A cloud reads as one mass, not a row of separate puffs.** The quads are
  drawn wider than their square so neighbours overlap. Daylight between cells
  means that overlap is being clipped somewhere.

## Known gaps, deliberately left

- **AoE templates still skip line-of-sight.** Only single-target creature spells
  check `hasLineOfSight`; a template checks range and map bounds only, so a
  Fireball can currently be placed through a wall. Fixing it is a change to
  `showTemplate` and to `app/api/combat/route.ts` together — client preview and
  server resolution have to agree or the board lies again.
- **No per-creature readout while aiming an area.** Point mode explicitly clears
  `setHoverRead(null)`, so there is no "who is caught in this, and what do they
  save against" list. That is the other half of making area targeting feel
  informed, and it is a board-file change too.
