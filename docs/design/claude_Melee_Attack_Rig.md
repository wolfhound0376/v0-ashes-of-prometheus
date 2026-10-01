# Melee Attack Rig — handoff to the dungeon crawler

**For:** the first-person cave/dungeon module — `Painted_Scenes_Decision.md`,
"Caves and dungeons: first-person" (Sam, 2026-09-29) and "Cave POV round 2"
(Sam, 2026-09-30). Proof: the *Darklake Cave* artifact.
**Status:** built and type-gated. Not wired to any screen.
**Preview:** the *Melee Rig Sandbox* artifact — every clip, scrubbable.
**Layer 3 only.** No rules, no damage, no item rows.

> ## SCOPE — first-person only (Sam, 2026-09-30)
>
> *"This melee effect is only for first person POV like the dark cave module
> I'm working on right now and other dungeons that are set up first person POV."*
>
> This rig is **not** a dashboard feature and **not** for the HD-2D tactical
> board or the painted camp scenes. It exists for the first-person cave and
> dungeon mode and nowhere else. `components/weapons/melee-attack.tsx` is a
> **reference renderer** — it exists so the sandbox and this repo agree on the
> maths, not so the dashboard can mount it. Consume `lib/weapon-rig.ts`.

---

## 0. Read this first — it overlaps work you already have

`Painted_Scenes_Decision.md` already specifies two things this package also does:

> **Hands** — drawn in code, not sprites: fist, dagger, longsword, bow… skin tone per character.
> **Weapon arcs** — a fading crescent ribbon traced by the blade tip during the strike.

So **do not merge this wholesale.** Two separable pieces, and they carry very
different risk:

| piece | verdict |
|---|---|
| `arcAt()` — the weapon arc | **Take it.** It is exactly the spec'd "crescent ribbon traced by the blade tip", already built and tuned, and it needs no art. |
| the painted dagger sprite | **Probably don't, yet.** See below. |

**Why the sprite is the risky half:** the crawler draws hands in code so it can
set **skin tone per character**. A painted sprite is one specific hand — this
one has Freía's red nails baked in. One sprite cannot serve four characters.
Until every character has their own capture, code-drawn hands are the right
call and the painted sprite is a dashboard asset.

The motion model in §2 is worth taking either way: it drives code-drawn hands
just as well as a sprite, because it only ever returns a position and an angle.

---

## 1. Files

| File | What |
|---|---|
| `lib/weapon-rig.ts` | **Pure geometry.** No React, no canvas, no DOM. This is the part the crawler wants. |
| `components/weapons/melee-attack.tsx` | Reference renderer only — proves the maths and the pixel quantisation. Not a dashboard feature, and the crawler does **not** need it. |
| `public/weapons/dagger/dagger.png` | The painted dagger sprite, 385 × 591, transparent. |

`tsc --noEmit`: 14 errors before, 14 after — no new errors against `main`'s
baseline, measured 2026-09-30. `pnpm build` exits 0. No schema, no migration.

---

## 2. The motion model

Two kinds of clip, and the distinction is the whole design.

### Path clips — no rotation at all

`slash_d`, `jab`, `thrust`. The hand and weapon **never rotate**. The whole unit
slides along a quadratic arc holding the angle it was drawn at. Sam's call,
2026-09-30: *"don't rotate the hand/blade AT ALL. JUST let it follow the bottom
part of the slash arc."*

| clip | start | end | lift | reads as |
|---|---|---|---|---|
| `slash_d` | (770, 470) | (290, 470) | 150 | sweeps right to left, bowing up |
| `jab` | (484, 475) | (560, 185) | 14 | drives out along the blade axis |
| `thrust` | (477, 504) | (575, 127) | 20 | same, longer reach |

The stab's direction is **not a guess**: it runs along the blade's own axis,
**−75.4°**, measured grip → tip off the sprite. A thrust that does not go where
the blade points is the one thing that reads as broken instantly.

### Joint clips — the elbow carries the sweep

Everything else. `a1` is the elbow, `a2` the wrist, and the sweep lives in `a1`
so the **hand travels the arc** instead of pivoting in place. Sam's correction,
2026-09-30: *"it's not a wrist pivot. The whole hand should follow the arc."*
Before that fix the dagger's slash was 38° of elbow and 62° of wrist; now the
sweeping clips are ~100° of elbow and near-zero wrist, and the hand travels
**405px instead of 254px**.

If you convert the remaining joint clips to path clips later, `chop_overhead`
and `slash_h` are the two that will look inconsistent first.

### Timing

`{ windup 220, strike 90, recover 300 }` ms by default. Weight scales the
windup and the recover — light ×0.78, mid ×1, heavy ×1.36 — and **never the
strike**, so a heavy weapon takes longer to arrive and longer to settle but the
contact is just as fast. Equal timings are what make a swing read as floaty.

**The one timing that must reach Layer 1:** hold the strike frame while the
attack roll is in the air on the Three.js dice provider, and release when the
d20 lands.

---

## 3. API

```ts
import { rigAt, arcAt, elbowAt, totalMs } from "@/lib/weapon-rig"

const rig = rigAt("slash_d", t, "light")   // { x, y, angle, scale, phase }
const arc = arcAt("slash_d", t, tipOffset, "light")  // { alpha, bands[] } | null
```

`rigAt` gives you a position and an angle; **you draw**. That is why the same
numbers serve the sandbox preview and the 640 × 360 raycaster buffer.

`arcAt` returns ready-to-fill polygons — four bands, outer first, dark navy rim
through to a white core. `tipOffset` is the blade tip relative to the hand in
the same frame; for a path clip it is a constant, which is why the trail can
never drift off the blade.

---

## 4. Putting it in the 640 × 360 buffer

The numbers above live in a 900 × 520 stage. Scale by **k = 360 / 520 = 0.6923**
and everything lands proportionally:

| | stage | 640 × 360 |
|---|---|---|
| elbow (off-screen, below) | (620, 600) | (429, 415) |
| hand at rest | (507, 388) | (351, 269) |
| slash start → end | (770, 470) → (290, 470) | (533, 325) → (201, 325) |
| slash lift | 150 | 104 |
| jab start → end | (484, 475) → (560, 185) | (335, 329) → (388, 128) |

At that scale the dagger sprite is 165 × 254 — about **70% of the view height**,
which is large for a first-person weapon. Expect to pull the sprite scale down
to ~0.30 and lower the rest position; the path shapes stay as they are.

### The one thing to get right: the effect's pixel size

The reference renderer draws the arc to a 1/5-scale buffer and upscales it,
because the sandbox canvas is not pixelated. **Do not do that in
the crawler.** The crawler already renders at 640 × 360 and scales up with
pixelated filtering, so:

> Draw the arc bands straight into the 640 × 360 buffer — **FX_PX = 1**. The
> crawler's own upscale provides the chunk.

Set it to 5 there and the arc's pixels come out five times the size of the
world's pixels, which reads as a bug rather than a style. Keep the alpha
threshold (`< 110 → 0`, else 255) and the four-colour snap; that is what makes
the edges hard instead of a blurry upscale.

### Arc colour

Currently a cold blue ramp, which suits a glass dagger and nothing else. The
obvious wiring is the **sonic-family table already ratified in
`claude_SFX_Pipeline.md`** — damage type picks the family, family picks the
colour, so fire weapons throw an orange arc and necrotic a green one with no new
decisions and no new art. Not built; flagged because the mapping already exists.

---

## 5. Sound

Do not build one. `claude_SFX_Pipeline.md` already defines
`{ type: "attack", weapon, result, target, sneakAttack }` with `weapon` as a
parameter, 17 combat clips, and `melee_hit_chainmail` approved on the
ElevenLabs canvas. Emit that cue on the strike frame. Unknown keys are ignored
by design, so a new weapon can emit before its file exists.

---

## 6. Provenance

- **Sam-originated:** slash rather than jab; pixel sprites animating the arc;
  "it's not a wrist pivot, the whole hand should follow the arc"; "don't rotate
  the hand/blade AT ALL"; the stab; the instruction to package this for the
  crawler. The dagger art is a cel-shaded repaint of Sam's own screenshot.
- **Claude-originated, for review:** the path-clip vs joint-clip split; every
  number in §2; the generated trail and its four-tone ramp; the §4 conversion
  and the FX_PX warning; the recommendation in §0 to take the arc and leave the
  sprite.
- **Already decided elsewhere:** the SFX contract (§5) and the crescent-ribbon
  requirement (§0) are `claude_SFX_Pipeline.md` and `Painted_Scenes_Decision.md`,
  unchanged here.
- **Books:** none. No 5E rule is touched.
