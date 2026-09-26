# Ashes of Prometheus — Camp Scene (design draft, 2026-09-26)

**Status:** draft for Sam's reaction, amended 2026-09-26 17:20 with his rulings (player view, action box, sleep = done) and brought in line with the camp rules that merged to main the same evening (PR #477–#480: two-tier budget, rations, the 14-action menu, the passive visitor roll). A working mock is published (artifact "Camp at the Fire"): the party's real repo sprites around a fire on three placeholder backdrops, a bedroll per member, ambient activity, and the menu of time as a pixel HUD wired to `lib/camp.ts`.
**Authority:** under `claude_HD2D_Pivot.md` (exploration looks like Octopath: 3D diorama, tilt-shift, 2D pixel actors, fixed oblique camera) and `docs/claude_Camp_Module.md` (the rules). This doc is the *look and behaviour* of the camp context; it changes no rule.

---

## 0. The one line

**One still diorama, a fire in the middle, the company doing camp things until you choose how to spend the night.** Nothing moves that matters mechanically; what moves is the company, so the scene feels inhabited while the player reads the menu.

## 1. Composition (from the mock)

- Fixed oblique camera, 16:9, logical 480×270 pixel canvas scaled up with nearest-neighbour; tilt-shift blur on the top third and bottom sixth so the plate reads as a diorama, not a map.
- **Fire** dead centre-low (240,172). Warm radial glow lights the floor and the figures; figures far from the fire fall into shadow (that shading is per-sprite, not baked).
- **Seats** around the fire (5 spots facing in). **Stations** off the ring: whetstone rock (left), cookpot (right), the quiet rock (back, meditation), a talking pair (right), and each member's **bedroll + tent**, colour-keyed to class, in an arc across the back and down both sides.
- **Depth sort** by feet-y; beds and props draw under figures; ambient particles (embers, spores, mist over water) on top.
- **HUD (as settled 2026-09-26 evening):** top-left plate — day, time-of-day word, RATIONS, TOKENS `2/2` (red at 0; it is `characters.rest_actions_remaining`). Top-right — the player's portrait and name, no frame, then a small **Sleep** button (asks "Are you sure?"; unspent tokens forfeit). Bottom-left — **Talk** (free). Bottom-centre — **Camp Actions**, the ornate window from Sam's concept: Explore (opens a sub-window: Forage, Hunt, Explore, Back), Entertain, Pray, Level Up, Craft, Medicine (= `brew`), Study (= attune/investigate/decipher), Trade (only when the passive roll brought a merchant), Break Camp (no token). Sleep and Talk are never in the window. Every tile carries Sam's painted icon art (delivered 2026-09-26). No XP gauge, no location switcher for players (DM only), no music control on screen.

## 1a. Whose view this is (Sam, 2026-09-26)

**The scene is one player's view.** Your own figure is the only one you can select or act for; the others are on screen, doing their things, but not yours to touch. The **DM view** shows every figure with its budget and readiness. Nothing here changes who may act — the route already refuses a `[CAMP_ACTION]` for a character the seat does not own.

**TALK leaves the scene — into the dashboard in camp mode (Sam, 2026-09-26 18:49: "dashboard mode sounds good").** Not a copy of the dashboard and not a second page: the camp scene opens the existing dashboard with `mode=camp` (a query flag or page state). In camp mode the dashboard hides what camp does not need — Roll for Initiative, the Tactical Map tab, the combat action buttons, the World AI panel — and shows the camp plate as the scene image, with the NPC header, disposition/challenge/health chips, dialogue log, suggestion chips, input, and the sheet rows (View Full Character Sheet, Inventory & Equipment, the class row) unchanged. Picking who to sit beside is a small row in the NPC header. **Talking spends no token** (Sam, 18:29). Back to camp closes the mode. Implementation: a `mode` prop threaded through `app/page.tsx` → `center-column.tsx` / `left-column.tsx` / `right-column.tsx` with `if (mode === "camp")` around the hidden pieces; `app/page.tsx` is the busiest file in the repo, so the collision check comes first.

**SLEEP means "I'm done."** It sets the player's `rest_actions_remaining` to 0 (unspent actions are forfeited — sleep is a choice) and walks their figure to bed. The readiness state *is* that column, so no new table: when every player character is at 0, the route's existing rule fires ("once all characters have used up their actions they rest according to their rations") — rations charged, the **passive roll** drawn once (`passiveCampEncounter`), the long or partial rest applied. A clean roll: the cave dims and every figure plays `sleep`. A hostile roll: the figures scramble to the fire, surprise (passive Perception vs Stealth) and initiative follow. A merchant or a wandering person: they walk in and stand at the fire for the DM's scene. The scene learns all of this from realtime on `characters` (budgets, readiness) and `rest_events` (the night's result).

## 1b. The backdrop (Sam, 2026-09-26 17:19 — decided)

**A painted, high-quality 4K plate per location**, in the look of Sam's concept (depth, lantern light, wet stone, faerzress glow), with the animated pixel sprites composited into it. Not R3F, not pre-rendered pixel plates: the location plate is a picture, the actors are sprites, and the fire, its light and the tilt-shift are drawn over it in the scene. Plates are generated without characters, one per biome, through the scene-image path (FAL is the canon tool for scene images; Runway stays Layer 4). Sam's concept image is the reference; the same prompt minus the figures is the plate.

**The Camp Actions window** (Sam's second concept image, "almost exactly"): an ornate gold-on-black frame with the title, a one-line subtitle, and a grid of tiles — icon, name, a token pill, one line of description. Tiles are the menu on main (forage, hunt, explore, talk, perform, pray, level up, craft = artifice/mend/brew, study = attune/investigate/decipher, trade — merchant only) plus SLEEP and BREAK CAMP at no token. Every token tile spends through `spendCampAction`; a refusal never spends.

**Music:** a calm, unobtrusive camp track plays under the scene (ElevenLabs, per the stack; normalised — every ElevenLabs render arrives near −13 LUFS and must be two-pass normalised before it enters the library). Starts on the player's first click, never auto-plays with sound. The mock uses a synthesised drone and fire crackle as the placeholder.

## 2. Three backdrops = three biomes

Biome is a property of the node: `travel_nodes.metadata.biome` ∈ `tunnels | fungal | shore` (extendable). The same scene serves every camp; only the plate, palette and ambient particles change. This mirrors the encounter-table convention (`metadata.encounter_table`).

| Biome | Where in OotA | Plate | Ambient | Glow colour |
|---|---|---|---|---|
| `tunnels` | Drow passages below Velkynvelve, the escape days | stalagmites, webs in the corners, faint violet moss | drifting violet motes | faerzress violet |
| `fungal` | Fungus caverns on the road to Sloobludop (OotA-Enc terrain "Fungus cavern") | luminous mushrooms, teal/purple | rising spores | purple/teal |
| `shore` | Darklake edge, underground streams (terrain "Underground stream") | dark water on the right third, wet rocks, blue rim light | mist, ripples | cold blue |

Real plates: pixel-textured HD-2D dioramas per `claude_HD2D_Pivot.md` — not smooth 3D, not photo. Generation path is PixelLab (`create_image_pro` / pro-flash at 480×270 or built from `create_topdown_tileset` + props), style-anchored to Fifi's sheet. Prompts in §5. The mock's procedural plates are placeholders only.

## 3. The company at rest — ambient behaviour

Each member runs a small loop: pick a station → walk (walk sheet, facing from velocity) → do the thing for 4–10 s → pick again. Stations have capacity; the talking pair needs two. Chooses from: fire (weighted ×3), whetstone, cookpot, quiet rock, talk, own bed.

The night itself is §1a: sleep is per player, the rest resolves when everyone is done, and the passive roll decides whether anyone comes.

**Layer 1 hooks (later, not in the mock):** the choice of station should read the world — hunger (`unfed_rest_streak`) pushes toward the cookpot or away from it when supplies are 0; the relationship dimensions decide who sits next to whom and who will not talk to whom; a character with a pending level-up drifts to the quiet rock. This is where the gravity system becomes visible without a single number on screen.

## 4. Assets needed (real, not stand-ins)

**Per character (8 today: Fifi, Kenta, Samson, Scott, Eldeth, Ront, Sarith, Derendil), new PixelLab animation states, 4 facings are enough for camp (S, SE, SW, E/W mirrored):**
- `sit` — cross-legged, hands to the fire (loop, 4 f)
- `sleep` — lying in a bedroll, breathing (loop, 4 f)
- `sharpen` — whetstone over a blade (loop, 6 f)
- `eat` — bowl and spoon (loop, 6 f)
- `meditate` — still, faint breath (loop, 4 f)
- `talk` — gesturing (loop, 6 f)

`lib/sprite-token.ts`'s `SpriteState` grows by those six; `scripts/sprites/build-sprite.py` gains a `--camp` set. **Collision:** `origin/claude/monster-animations` is live on `lib/sprite-token.ts` today — branch from it or sequence behind it.

**Props (one sheet):** fire (4 f), bedroll ×8 in class colours, tent peak ×8, whetstone rock, cookpot on a tripod, the quiet rock, a lantern.

**Plates:** three 480×270 pixel dioramas (§2), each with a night variant or a darkening overlay (the mock uses an overlay).

**Sprite name to fix:** the repo folder is `public/sprites/freia` and its manifest says "Freía la Fey" (a shelved concept). The figure is Fifi. Rename to `fifi` when the camp sheets are built so the manifest and the character row agree.

## 5. PixelLab prompts (plates)

Style anchor: Fifi's sheet (PixelLab character `8691d89b-…`). 480×270, top-down oblique ~35°, no characters, no fire (the fire is a separate animated prop), a clear 120-px-wide floor in the centre-low third for the ring.

- **tunnels:** "Underdark cavern camp clearing, drow tunnel mouth at the back, stalagmites, pale spider webs in the upper corners, faint violet bioluminescent moss on the floor, dark grey basalt, pixel art, top-down oblique, HD-2D diorama, no characters"
- **fungal:** "Underdark fungal grove clearing, giant luminous purple and teal mushrooms, spore haze, soft moss floor, pixel art, top-down oblique, HD-2D diorama, no characters"
- **shore:** "Underdark lake shore camp, black still water on the right third, wet dark rocks, cold blue rim light, faint mist, pixel art, top-down oblique, HD-2D diorama, no characters"

## 6. Wiring plan

1. **Scene component** `components/camp/camp-scene.tsx` (R3F per §1b, canvas as the fallback) mounted on the `camp` context; reads party + allies, node biome, `party_supplies`, the clock, and subscribes to `characters` (`rest_actions_remaining`) and `rest_events`. No schema change.
2. **HUD → routes**: each button sends the `[CAMP_ACTION: <me> | <action>]` tag through `/api/chat` as that character, so the player and the DM spend actions down one path. SLEEP writes `rest_actions_remaining = 0` for that character (service-role route); the route's existing all-done rule does the rest. TALK is the dashboard conversation with the scene behind it — no new endpoint.
3. **Assets** land in `public/sprites/<slug>/{sit,sleep,sharpen,eat,meditate,talk}.png` and `public/camp/plates/<biome>.png`, `public/camp/props.png`.
4. **Layer 1 hooks** (§3) last.

## 7. Provenance

- **Sam (2026-09-26):** sprite camp scene; at least three Underdark backdrops; "looks 3D"; a bed or tent per character; pixelated UI for the options; NPCs visibly doing things (sharpening, talking, eating, meditating). Later the same day: one player's view, only your own character selectable; TALK opens the existing dashboard UI; an action box (1/2, 0/2); SLEEP = done; when everyone has hit sleep the rest executes and the encounter roll is passive; a clean roll plays the sleep animation.
- **Claude, for Sam's yes:** biome as node metadata; station loop with capacities; six new animation states; distance-from-fire shading; readiness = `rest_actions_remaining` hitting 0 (no new table; unspent actions forfeited on SLEEP); live R3F plate over pre-rendered; relationship-driven seating as the Layer 1 hook.
