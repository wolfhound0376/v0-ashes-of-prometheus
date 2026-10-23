# Unarmed strike hit sprites

Cut from Sam's 6-pose sheet (2026-10-22). Every PNG is hard-alpha (0/255), no halo.

Per move folder:
- `full.png`  - body + hit FX, as drawn (the attack's strike frame)
- `body.png`  - fighter only, FX removed, limb gaps patched
- `fx.png`    - FX only, same canvas as body (stacks with zero offset; draw FX UNDER body)
- `fx_trim.png` - FX only, cropped tight; reusable on any token's unarmed hit

`manifest.json`: canvas size, `impact_px` (FX centre of mass), `feet_y_px` (ground line), `fx_bbox`, `fx_kind`.

| move | fx_kind | suggested use |
|---|---|---|
| jab | burst | standard unarmed hit |
| side_kick | burst | standard kick hit |
| flying_knee | burst | small/fast hit (Flurry of Blows 2nd strike) |
| uppercut | arc | launcher / Stunning Strike |
| roundhouse | arc | crit / big hit |
| sweep | arc | Prone (shove/trip) |

Bursts that the fist/foot covered were completed by point-mirroring the visible half through the impact point.
Sheet scale: figure is ~370px tall here; downscale with NEAREST to the board's ppu.
