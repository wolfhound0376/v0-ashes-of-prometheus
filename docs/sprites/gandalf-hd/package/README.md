# Gandalf — PixelLab production package
Includes original identity board, approved six-pose concept board, six cropped references, master prompt, twelve motion prompts, eight-direction animation manifest, import and QA instructions.

## Status
These are concept references, not playable animation frames. No existing animation package was supplied. No PixelLab generation has been run. The cropped PNGs retain source alpha, including semi-transparent edge/background pixels; they are NOT clean transparent starters. All motion entries intentionally remain needs-generation.

## Workflow
1. Create a clean 160×160 idle base from MASTER_PROMPT.txt using the canonical reference. Make a front and right-facing test first.
2. Check likeness, hair, gold trim, silhouette and transparent background at native size and 4× nearest-neighbor.
3. Produce eight directions from that approved base. Keep the same camera elevation. Do not mirror asymmetric hands/book poses.
4. Generate idle, walk and projectile-casting first. Use each action prompt with its matching directional base. Suggested frame counts are planning values: adapt to the current tool limits.
5. Generate the remaining motions. Keep projectile, shield, rune, impact and ground effects separate from character sprites.
6. Export actual frames, update the manifest with filenames, durations and release events, and run QA before engine import.

## Import specification
Proposed frame canvas: 160×160 RGBA; bottom-center feet pivot (80,148). Lock this across every direction. Filename: gandalf_ACTION_DIRECTION_000.png. Keep consistent padding; never independently trim frames. Use nearest-neighbor texture filtering, no mipmaps, integer display scaling. Import frame durations from the final manifest. Loop only marked looping actions. Death holds its last frame; other one-shots return to idle. Tune hurtboxes to actual exported silhouettes; none are invented here. Animation durations are presentation only and do not determine D&D action economy or damage. Trigger projectiles at the authored release event after rules resolution.

## QA checklist
- Exact auburn hair, blue eyes, pointed ears, navy/gold costume in every view.
- No extra hands, swapped handedness, book mutation or disappearing embroidery.
- Clean alpha with no dark haze, soft background or detached pixels.
- Stable head size, feet pivot and canvas; no drift or sliding planted feet.
- Seamless idle/walk loops and readable anticipation, release, recovery.
- Check all eight directions and actual frame counts; verify no duplicate placeholder frames.
- Validate VFX separately against light and dark battlefield backgrounds.

## Reuse
For another character, replace canonical source and identity fields, preserve any supplied animation timing and structure, regenerate only missing motions, and keep unfinished animations explicitly marked needs-generation.
