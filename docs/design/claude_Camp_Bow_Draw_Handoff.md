# Handoff to the camp module — first-person bow draw rig

**For:** whoever picks up `claude/claude_Camp_Module.md` §8 next.
**From:** the asset session, 2026-09-30.
**Geometry and integration spec:** `docs/design/claude_Bow_Draw_Rig.md` — read
that for the constants. This doc only says how it meets camp.

---

## 0. The one line

A rigged first-person longbow exists, it is pushed, and it is **not wired to
anything**. Camp is the likeliest home for it, and this is what would have to be
true for it to land there.

---

## 1. What arrived

Branch **`feat/bow-draw-rig`**, pushed 2026-09-30, branched from `origin/main`
@ `9c6585c`. Four new files, **no existing file touched**:

```
components/weapons/bow-draw.tsx
docs/design/claude_Bow_Draw_Rig.md
public/weapons/bow/plate.png     1200 x 1152
public/weapons/bow/arrow.png     1200 x 1050
```

No schema change, no migration. `tsc --noEmit`: 14 errors before, 14 after — no
new errors against `main`'s baseline, measured on the day. `pnpm build` exits 0.
Collision check clear — nothing unmerged touches `components/weapons/` or
`public/weapons/`, and camp owns `lib/camp.ts`, so the two lanes do not overlap.

The API is one prop:

```tsx
<BowDraw pull={pull} arrowVisible={!loosed} />
```

`pull` runs 0 (nocked at rest) to 1 (full draw) and is clamped. It can be **held
anywhere** — that is the whole reason it is a rig and not a rendered clip.

---

## 2. Where it plugs into camp

Two candidate hooks. Both are proposals, neither is decided.

### 2a. Hunt

`claude/claude_Camp_Scene.md` puts **Explore → Forage / Hunt / Explore** in a
sub-window of the Camp Actions frame. Hunt is the obvious place for a bow.

**It changes no rules.** Per `claude_Camp_Module.md` §2, forage and hunt both
resolve on WIS (Survival) DC 15 (OotA-Enc p.25), yield 1d6 + WIS person-days
(DMG p.111, flagged non-SRD), into `party_supplies`. The rig renders the beat;
`forage()` still decides the outcome. Suggested shape:

- open the Hunt tile → `pull` ramps 0 → 1 over ~450 ms, then **holds**
- the Survival check rolls through the Three.js dice provider as it does today
- the die lands → `pull` snaps to 0 over ~90 ms, `arrowVisible` goes false
- success or failure is narrated from `forage()`, not from the animation

The hold is the point: the arrow stays drawn while the die is in the air.

### 2b. Training

`claude/claude_Earned_Proficiency.md` §8 PR 5 is *"training action in the camp
module (`claude_Camp_Module.md` owns camp; add the action there)"*. Archery
practice toward a ranged proficiency is a natural fit for the same rig, at a
lower `pull` with repeats.

If that action gets built, the rig costs nothing extra — same component, same
props.

---

## 3. Style — RESOLVED 2026-09-30, this section supersedes the earlier caution

An earlier draft of this doc told you **not** to merge on the assumption the
style question was settled. **It is now settled.** Sam green-lit the cel-shaded
first-person HUD on 2026-09-30: a first-person weapon view is accepted as a
different register from the third-person board, and it stands as a third visual
language beside the painted inventory icons and the HD-2D pixel sprites.

`feat/bow-draw-rig` is therefore **clear to merge**. Nothing about the
2026-09-27 painted-vs-pixel icon split changes — that ruling was about inventory
icons versus board icons and neither moves.

Melee weapons do not reuse this rig; see `docs/design/claude_Weapon_Rig_Pipeline.md`.

---

## 4. What the rig does not do

- No stat block, no item row, no damage, no ammunition count. Layer 3
  presentation only — it renders what Layer 1 already decided.
- No loot. Hunt's yield comes from `forage()` and `party_supplies`.
- It does not know whose bow it is. If a character without a ranged weapon can
  open the Hunt tile, that is camp's gate to write, not the rig's.

---

## 5. Provenance

- **Sam-originated:** the source screenshot; "make it a full draw"; "make the
  string white"; the instruction to hand this to camp; the 2026-09-30 style
  green-light (§3).
- **Claude-originated:** the two-layer rig and the code-drawn string; the
  fletching taper, horn nock and extended forearm (the source art cropped the
  arrow's entire rear off-frame and painted the string as one straight line
  across the shaft — there was no nock to measure); all constants in
  `claude_Bow_Draw_Rig.md` §2; both camp hooks in §2 above.
- **Real-world reference:** nock, nocking point, brace height and fistmele
  (brace = bow length / 12) from standard archery definitions. Full draw sits at
  119.1°, where a real 68" longbow at 28" sits.
- **Books:** none. No 5E rule is touched by this branch.
