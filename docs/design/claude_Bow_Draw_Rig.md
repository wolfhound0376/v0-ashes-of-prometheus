# Bow Draw Rig — integration spec

First-person longbow for the player HUD, rigged as **two sprites plus a string
drawn in code**. Drop-in for Layer 3.

Last verified 2026-09-30. Preview: the `Bow Draw Rig` artifact.

**Type gate:** `components/weapons/bow-draw.tsx` was measured against `main`'s
baseline on 2026-09-30 — 14 errors before, 14 after, **no new errors**.

> **Provenance.** The base art is a cartoon pass over a Skyrim first-person
> screenshot Sam supplied. Everything in §2 was **measured off that art**.
> Everything in §3 — the fletching taper, the horn nock, the forearm below
> y=896 — is **drawn by Claude**, because the source crop cut the arrow's whole
> rear off the frame and painted the string as a single straight line across the
> middle of the shaft. There was no nock in the source to measure.

---

## 1. Files

| File | Put it at | Size |
|---|---|---|
| `plate.png` | `public/weapons/bow/plate.png` | 1200 × 1152 |
| `arrow.png` | `public/weapons/bow/arrow.png` | 1200 × 1050 |
| `bow-draw.tsx` | `components/weapons/bow-draw.tsx` | — |

Both PNGs are transparent and share the **same origin** — draw them at their own
computed offsets, never re-registered. `plate.png` is arm, bracer, glove and bow
stave, with **no string and no arrow**. `arrow.png` is the arrow alone.

There is no string sprite. A painted string cannot bend, and a straight string at
full draw is the single thing that makes an archery animation read as fake.

---

## 2. Geometry (measured — do not tune by eye)

Everything lives in **arrow-axis space**. `S` is pixels along the arrow's own
axis, measured from the nocking point.

| Name | Value | What it is |
|---|---|---|
| `NOCK_POINT` | (602.2274, 615.9743) | where the arrow's axis crosses the braced string |
| `AXIS` | (0.6113, 0.7914) | unit vector along the arrow, pointing at the archer |
| `AXIS_N` | (−0.7914, 0.6113) | its normal |
| `SHAFT_T` | 3.15 | shaft centreline offset, along `AXIS_N` |
| `LIMB_A` | (1242.3, −43.4) | upper limb tip — off-canvas |
| `LIMB_B` | (−155.9, 1397.0) | lower limb tip — off-canvas |
| `S_ARROW_NOCK` | 449 | S of the nock groove **in the arrow sprite's own coordinates** |
| `S_REST` | 80 | S at rest — string braced, arrow nocked |
| `S_FULL` | 597 | S at full draw |

Derived, for sanity checks only:

| | |
|---|---|
| bow length, tip to tip | 2007 px |
| brace height (braced string → grip pivot) | 168 px — exactly **L / 12**, the longbow fistmele |
| nock travel, rest → full draw | 517 px |
| string angle at rest | 171° |
| **string angle at full draw** | **119.1°** — a real 68″ longbow at 28″ draw sits at ~119° |

`LIMB_A` and `LIMB_B` are both off the canvas, which is correct: the crop shows
the middle of a long bow. They sit on the braced string line, so at `S = 0` the
string is perfectly straight through `NOCK_POINT` — that is the definition of
brace.

---

## 3. The draw, in three lines

```ts
const S  = S_REST + ease(pull) * (S_FULL - S_REST)      // ease = smoothstep
const nock   = NOCK_POINT + AXIS * S + AXIS_N * SHAFT_T  // rides the string
const offset = AXIS * (S - S_ARROW_NOCK)                 // arrow rides its nock
```

Then, **in this order**:

1. `drawImage(plate, 0, 0)`
2. string: `LIMB_A → nock → LIMB_B`, stroked twice — `#1a1614` at width 7 and
   43% alpha for the edge, then `#fcfcfd` at width 5 for the core
3. `drawImage(arrow, offset.x, offset.y)`

The order is load-bearing. The string is drawn **before** the arrow so the nock
covers the apex, and the nock's groove is cut transparent so the string is
visibly seated *inside* it. Draw the arrow first and the string lies on top of
the shaft, which is the bug this rig exists to fix.

**The string never touches the middle of the shaft.** It seats in a notch at the
arrow's rear. If you ever see the apex land mid-shaft, `S_ARROW_NOCK` is wrong.

---

## 4. Wiring it to combat

```tsx
<BowDraw pull={pull} arrowVisible={!loosed} />
```

- **aiming** — ramp `pull` 0 → 1 over ~450 ms, then hold. Holding is the whole
  point; the player aims at whatever `pull` you stopped at.
- **loose** — snap `pull` to 0 over ~90 ms and set `arrowVisible={false}` on the
  same frame. The string's snap-forward reads as the release.
- **on the attack roll** — drive the loose off the existing dice promise so the
  string releases when the d20 lands, not before.
- **reduced motion** — `prefers-reduced-motion` should cut the ramp and just set
  the final `pull`.

`pull` is clamped, so feeding it a raw un-normalised value degrades to rest or
full draw rather than throwing.

---

## 5. What this is not

- Not a video. A clip gives you only the frames you rendered; two PNGs give you
  every draw position, and a bow HUD has to **hold** while the player aims.
- Not to real-world scale. It is a first-person crop, so the arrow is heavily
  foreshortened while the bow sits in the picture plane. Brace height lands on
  the fistmele rule and full draw lands on 119°, but do not read the arrow's
  on-screen length as a draw length in inches.
- Not canon game data. No stat block, no item row, no damage. This is Layer 3
  presentation only — it renders whatever the DM core already decided.

---

## 6. If the art is ever replaced

Re-measure in this order, or the rig will look subtly wrong in ways that are
hard to name:

1. **Arrow axis** — fit a line through the shaft; that gives `AXIS` and `AXIS_N`.
2. **Braced string** — fit the painted string; where it crosses the axis is
   `NOCK_POINT`.
3. **Grip pivot** — the stave centreline at the hand. Its perpendicular distance
   to the braced string is brace height; × 12 gives bow length; half that each
   way along the string line gives `LIMB_A` and `LIMB_B`.
4. **`S_ARROW_NOCK`** — S of the groove in the new arrow sprite.
5. **`S_FULL`** — solve for the string angle you want:
   `S = (halfBowLength / tan(angle / 2)) / (AXIS · n)`, then check the whole
   arrow still fits the canvas. If it does not, extend the canvas — do not
   shorten the draw.
