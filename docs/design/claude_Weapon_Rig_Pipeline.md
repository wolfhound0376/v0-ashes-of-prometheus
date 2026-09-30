# Weapon Rig Pipeline — one rig, every weapon type

**Status:** design approved 2026-09-30; §3a corrected the same day from the first
capture. Waiting on the remaining source captures (§6).
**Generalises** `docs/design/claude_Bow_Draw_Rig.md`, which stays as the worked
example and the ranged special case.
**Layer 3 only.** No rules, no damage, no item rows. It renders what Layer 1 decided.

---

## 0. The one line

The bow rig does **not** extend to melee, and the reason points straight at the
pipeline we actually want: stop cutting weapons out of screenshots, cut the
**hands** once, and make the weapon a swappable child sprite.

---

## 1. Why the bow rig does not extend

The bow is **one degree of freedom**. The arrow slides along a fixed axis;
nothing rotates, and the arm never changes shape. That is why two static PNGs
and three lines of maths were enough — and it was luck, not method.

A melee attack is not that. A dagger jab moves the hand *through space*, rotates
the blade *about the wrist*, and foreshortens the forearm. A static plate cannot
express any of it. Reuse the bow's plate-plus-slider shape for a sword and you
get a sword that slides sideways without ever swinging.

**What does carry over** is the discipline, not the rig: layered sprites, a
code-driven transform, measured anchors, and no pose baked into the art.

---

## 2. Measured finding — screenshots are the wrong unit of work

Tested 2026-09-30 on a dual-wield grab (520 x 301):

| attempt | result |
|---|---|
| `rembg` u2net_human_seg | 15.9% kept — left hand and hilt only, **both blades gone** |
| `rembg` isnet-general-use | 27.6% kept — blades as translucent ghosts, hands see-through, background smoke retained |
| seeded GrabCut, left hand rect | 1 407 px — **two fingers** |
| seeded GrabCut, right hand rect | 9 772 px — fingers **plus a wedge of campfire** baked in as subject |

The cause is not the tool. At 520 x 301 the hand is ~150 px across and a
campfire sits directly behind it at the same luminance as lit skin. There is not
enough pixel data to separate them. The bow succeeded on a ~1700 px source and
still took a full session of measured geometry to cut **one** asset.

**Eighteen weapon types cut that way is eighteen sessions, not a pipeline.**

---

## 3. The architecture that does generalise

Three parts. Only one of them is per-weapon.

### 3a. Arm rig — shared, and it must be split UNDER and OVER

**Corrected 2026-09-30 from the dagger capture. The hand is not one sprite.**

Measured on the cut: across **29 scanlines** between y=300 and y=470, the
handle sits *between* two spans of skin — fingers in front of it, back of the
hand behind it. A single hand sprite therefore cannot hold a weapon: whatever
z-order you pick, either the fingers vanish behind the handle or the handle
floats on top of the fist.

So the arm rig is four layers, drawn in this order:

| # | layer | per | notes |
|---|---|---|---|
| 1 | `forearm_<L\|R>.png` | arm | pivot at the elbow — usually the frame edge |
| 2 | `hand_back_<grip>.png` | grip | back of the hand and the gauntlet, pivot at the wrist |
| 3 | *the weapon sprite* | weapon | slots **between** the two hand layers |
| 4 | `hand_fingers_<grip>.png` | grip | the wrapped fingers only, same pivot |

This is how games have always done a held weapon, and it is what preserves the
saving: the weapon still has exactly one sprite, and the grip still has exactly
one pair of hand layers.

`grip` has five values, not eighteen:

| grip | serves |
|---|---|
| `fist` | dagger, sword, club, mace, axe, rapier, trident (1-h), whip, sling, shuriken, grenade |
| `two_handed` | greatsword, staff, full crossbow, trident (2-h) |
| `open_palm` | magic hand gestures |
| `crossbow` | hand crossbow |
| `shield` | shield use |

A closed fist around a cylinder is a closed fist around a cylinder. **One `fist`
pair covers roughly two thirds of the list.**

**Capture consequence:** a grab of a hand *holding* a weapon cannot be split into
these two layers where the fingers overlap the handle — the pixels are shared.
Either the fingers get redrawn over the handle by hand once, or the `fist` pair
is captured on a weapon whose handle is plain enough to cut along. This is the
one thing worth solving before capturing the other seventeen.

### 3a-i. Grip read from the 2026-09-30 dagger capture

Right hand, fingerless gauntlet, bare fingers. Four fingers (index, middle,
ring, little) wrap the far side of the handle with their tips emerging on the
near side; the **thumb is extended up the handle's spine toward the guard**, not
wrapped. That is a **sabre / thumb-forward grip** — a thrust-and-rising-cut
grip, which is exactly `fist` + the `jab` and `slash_d` clips already assigned
to the dagger in §4. No change needed there.

Measured anchors, in the 400 × 535 source: `grip` **(205, 380)**, `tip`
**(272, 12)**, giving a grip→tip length of **374 px** and an axis of
**(0.179, −0.984)**, i.e. 79.7° above horizontal.

### 3b. Weapon sprite — the only per-weapon asset

One transparent PNG of the weapon alone, plus two measured anchors: `grip`
(where the palm closes) and `tip` (the business end). `axis` is derived as
`normalize(tip - grip)`. A weapon on its own is trivial to cut, which is the
entire point of moving it out of the screenshot.

### 3c. Motion clip — per attack shape, not per weapon

Keyframes over elbow position, wrist angle and weapon roll, with three timings:
`windup_ms`, `strike_ms`, `recover_ms`.

`thrust` - `jab` - `slash_h` - `slash_d` - `chop_overhead` - `bash` -
`swipe_wide` - `throw` - `shoot_bolt` - `sling` - `lash` - `cast_gesture` -
`block`

Thirteen clips cover all eighteen weapon types, because a mace bash and a club
bash are the same motion with a different sprite.

---

## 4. The file that makes "just add the weapon type" true

One row per type. Adding a weapon is this row plus one PNG — no code.

| weapon | grip | clips | weight | sfx `weapon` |
|---|---|---|---|---|
| dagger | fist | jab, slash_d | light | `dagger` |
| dual daggers | fist x2 | jab (alternating) | light | `dagger` |
| sword | fist | slash_d, thrust | mid | `sword` |
| greatsword | two_handed | chop_overhead, slash_h | heavy | `greatsword` |
| club | fist | bash | mid | `club` |
| mace | fist | bash | mid | `mace` |
| axe | fist | chop_overhead | mid | `axe` |
| staff | two_handed | swipe_wide, thrust | mid | `staff` |
| trident | two_handed | thrust | heavy | `trident` |
| rapier | fist | thrust | light | `rapier` |
| whip | fist | lash | light | `whip` |
| hand crossbow | crossbow | shoot_bolt | light | `hand_crossbow` |
| crossbow | two_handed | shoot_bolt | heavy | `crossbow` |
| shuriken | fist | throw | light | `shuriken` |
| sling | fist | sling | light | `sling` |
| grenade | fist | throw | mid | `grenade` |
| magic gesture | open_palm | cast_gesture | — | *(spell cue, not attack)* |
| shield | shield | block, bash | heavy | `shield` |

`weight` only bends the ease curve — heavy accelerates slower and settles
longer. See §5.

---

## 5. "Physics" — curves, not a solver

A swing does not need a physics sim, and adding one would be a liability next to
the Three.js dice roller (the one place real physics belongs, and which must
never be lost). What reads as physical is four things:

1. **Asymmetric timing** — slow windup, fast strike, medium recover. Equal
   timings are what make an animation read as floaty.
2. **Overshoot and settle** on the recover, one or two pixels.
3. **Weight** — `light / mid / heavy` scales windup and recover, not strike.
4. **The hold.** Same lesson as the bow: the strike frame holds while the attack
   roll is in the air on the dice provider, and resolves when the d20 lands.

That last one is the only timing that must be wired to Layer 1.

---

## 6. Rulings (Sam, 2026-09-30) and the capture brief

### 6a. Style — DECIDED: cartoon HUD is green-lit

A cel-shaded first-person HUD is accepted as a **third visual language** beside
the painted inventory icons and the HD-2D pixel board: a first-person weapon
view is a different register from a third-person board.

This **unblocks `feat/bow-draw-rig` for merge**. The 2026-09-27 painted/pixel
split is untouched — that ruling was about inventory icons versus board icons.

### 6b. Weapon art — DECIDED: Sam captures high-resolution screenshots

The no-AI-generated-item-art rule stands, unlifted. Sam supplies the source.

### 6c. Capture brief — what makes a grab usable

Every requirement below exists because something broke without it.

**Non-negotiable**

1. **Native resolution, PNG, >= 1920 wide.** Not a crop of a crop, not a JPEG
   paste. The 520 px grab failed for this reason alone.
2. **Nothing bright behind the hands or the blade.** No campfire, no torch, no
   sunlit sky. Fire glow bleeds onto lit skin and makes the two inseparable —
   that is exactly what put a wedge of campfire inside the right-hand cutout.
   Night sky, dark stone, deep water or a dark interior all work.
3. **The whole weapon in frame, tip to pommel.** The bow's arrow tail ran off
   the bottom edge and cost a full rebuild of the sprite plus an extended
   canvas. Leave a margin.
4. **HUD and crosshair off.**

**Critical for the rig, easy to get wrong**

5. **Identical camera between grabs.** Same FOV, same position, same stance. The
   hand sprite is cut **once** and reused for every weapon — if the field of
   view shifts between captures, the weapons will not register to the hand and
   every sprite needs re-anchoring by hand.
6. **Neutral idle pose, never mid-swing.** The rig *creates* the swing. A baked
   attack pose cannot be un-posed and is unusable.
7. **One weapon per grab**, plus **one grab per grip type** (fist, two-handed,
   open palm, crossbow, shield).

**Order to shoot in**

The first capture that matters is **one clean pair of hands** — a plain
one-handed weapon, neutral pose, dark plain background. That single grab becomes
the shared rig, and every weapon after it is cheap. Everything else can wait
until that one is cut and proven.

---

## 7. Sound — already built, do not rebuild it

`claude_SFX_Pipeline.md` already defines the exact hook this pipeline needs:

```ts
{ type: "attack", weapon, result, target, sneakAttack }
```

`weapon` is **already a parameter**. The kit already carries 17 combat clips and
`melee_hit_chainmail` is already approved on the ElevenLabs canvas. Unknown keys
are ignored by design, so a new weapon can emit its cue before its file exists.

So the rig **emits the existing cue**. It does not get a sound system of its own.

Magic gestures are the exception and are also already handled: spells are stems
(`windup / release / impact / tail`) keyed by sonic family, a Layer 3 hook, not
an attack cue.

---

## 8. Provenance

- **Sam-originated:** one generic melee pipeline where adding a weapon type is
  all that is required; the eighteen weapon types in §4; "get the physics and
  sounds"; "rig it to the person"; both rulings in §6.
- **Claude-originated, Sam-approved:** the finding that screenshots are the
  wrong unit of work (§2, measured); the hand-rig / weapon-child / motion-clip
  split (§3); the five grips; the thirteen clips; the §4 mapping;
  curves-not-a-solver (§5); the capture brief (§6c).
- **Already decided elsewhere:** the SFX cue contract (§7) is
  `claude_SFX_Pipeline.md`, ratified 2026-08-29, unchanged here.
- **Books:** none. No 5E rule is touched.

---

## 9. Note on the tested grab

The 2026-09-30 dual-wield capture is a **sword and a dagger**, not two daggers.
Left hand holds a longsword with an ornate guard; right holds a curved glass
dagger. Recorded so nobody re-derives it.
