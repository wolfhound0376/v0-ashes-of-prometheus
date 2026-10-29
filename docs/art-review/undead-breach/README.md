# Undead Breach: emergence animations (awaiting Sam's approval)

Two "rise from the ground" clips, made in PixelLab from the **same characters that are already
on the battle map**, so the creature that climbs out is the one that then fights:

| Clip | PixelLab character | In-game sprite | Frames | Canvas |
|---|---|---|---|---|
| Zombie crawls out of the dirt | `b1088c19-d0e2-4ac9-95ba-d4de40361bbd` | `public/sprites/zombie-rotting` | 21 @ 12 fps (1.75 s), no loop | 168×168 |
| Skeleton breaks up through stone | `370cb985-bdf2-415d-97a9-38aa0b8a01be` | `public/sprites/skeleton-swordsman` | 21 @ 12 fps, no loop | 172×172 |

Choreography follows the production pack Sam supplied (2026-10-29): the zombie's hands come
first, then the head, then it drags itself flat on its elbows before it gets onto all fours and
stands. The skeleton's skull breaks through violet-cracked stone and it climbs up out of the rubble.

**How they were made.** PixelLab animates from a character's standing pose, so each clip was
generated as the creature *sinking into* the ground and is played in reverse. The last frame is
the character's own standing south pose, so it hands off cleanly to `idle`.

**Not wired into the game.** Per the art rule (§7), nothing is attached to a sprite manifest
until Sam approves it. Once approved: copy `emerge.png` into the creature's `public/sprites/<slug>/`,
add an `emerge` entry to its `sprite.json` (pivot needs re-measuring because the canvas is larger
than the 128-px idle cell), and teach the renderer to play it once on spawn.

Known nits: the dirt/rubble disappears abruptly once the creature is fully standing; only the
south facing exists so far.
