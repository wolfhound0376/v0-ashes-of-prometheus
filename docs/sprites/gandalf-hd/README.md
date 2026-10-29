# Gandalf HD — 160×160 base sprites

Source art for Gandalf's HD prisoner sprite. **The prisoner is now the live sprite** in
`public/sprites/gandalf/` (Sam, 2026-10-29: "replace the one we have now with the prisoner you created").
The old 128px grey-tunic sprite is in git history (commit a875913a).

## Approved by Sam, 2026-10-29

| File | What it is |
|---|---|
| `gandalf_normal_idle_S.png` | NORMAL outfit: navy-and-gold coat. PixelLab `create_image_pro`, candidate 2 of 4 (job `4475cdba-460b-4f12-8e38-d5a5495ad25d`). |
| `gandalf_prisoner_idle_S.png` | SOILED PRISONER: the same sprite edited for light wear (job `e6c6b86c-59ff-4b25-88ac-f2861464c319`). Sam picked this over a heavier pass that turned the coat grey. |
| `review-sheet.png` | What Sam approved from: normal, heavy prisoner (rejected), light prisoner, at 4× nearest-neighbour. |

Both are 160×160 RGBA with transparent backgrounds. They share the same silhouette, and
their feet sit at y=148, which matches the package's pivot (80,148).

## The brief

`package/` is the production pack exactly as Sam supplied it: identity and concept
boards, cropped references, `MASTER_PROMPT.txt`, one prompt per action in `prompts/`,
`character_manifest.json`, and the README/QA checklist.

## What went live (2026-10-29)

PixelLab character `833e44ea-9445-4fa7-9038-df6455e73872`: 8 facings from the approved prisoner base,
then template clips: idle `breathing-idle`, walk `walking-8-frames`, attack `cross-punch`, cast
`fireball`, hurt `taking-punch`, dead `falling-back-death`, jump `running-jump`. Camp poses come from
the states Camp Sit (30a4292e), Camp Eat (16331f69) and Camp Sleep (68f6f757): v3, south only, 5/7/5 frames.
Built with `build-sprite.py --ppu 108` and `add-camp-poses.py`. Cell 160, pivot (80,158). His idle stands
127 px, and 127/108 matches the old 113/96, so he is exactly as tall on the map as before.
Known flaw, shipped anyway with Sam's OK: in a few side-view cast and hurt frames the long coat thins out to a jacket.

## Next steps (not done)

1. Eight directions from each approved base (`create_character_pro_flash` with
   `first_frame_url`, so only the rotations are charged). Never mirror asymmetric poses.
2. Actions in this order: idle, walk, cast_projectile, then the rest. Generate each
   action for both outfits with matching frame counts.
3. Build into `public/sprites/gandalf/` with `scripts/sprites/build-sprite.py`. Set `ppu`
   by the sprite height rule (half-elf, 5.9 ft default) and measure it from the new idle sheet.
4. Every image goes to Sam for approval before it is attached to anything.
