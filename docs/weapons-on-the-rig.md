# Weapons on the Rig

How a real weapon gets into a character's hand on the battle board, and why
this project takes the approach it does.

Design reference:
<https://claude.ai/code/artifact/84d08d9c-31c1-4d9c-91c1-5e76d3c44272>

## The fact that decides everything

Every rigged model in this cast carries the **same skeleton**. They all went
through Meshy's humanoid auto-rig, so Samson, Fifi, Scott, Eldeth and the drow
warrior expose bones under identical names — 25 to 27 nodes apiece, including:

    RightHand   LeftHand   Head   Spine02   Hips   LeftShoulder   RightShoulder

A weapon parented to `RightHand` inherits every frame of the animation **for
free**: it swings when the arm swings, with no per-clip code and no
per-character work. Because the names never vary, one attachment system covers
every model in the project — including ones that do not exist yet.

The catalogue is also smaller than it looks: 146 items, but only **19 are
hand-held** — 15 weapons, 3 wands, 1 shield. Five are named artifacts
(Dawnbringer, Hazirawn, Scourge, Dark Justiciar Blade, Tentacle Rod).

## The approach: archetypes, with artifacts promoted

Diablo's own bargain. Base items of a class share a silhouette and rarity is
carried by **colour**, not shape; only uniques earn their own model. Solasta
takes the same deal further, keeping weapons individually visible while
collapsing armour into a few looks per category.

- **Ten archetypes** form the floor — blade, dagger, mace, axe, spear, staff,
  wand, bow, crossbow, shield. Nothing on the board is ever empty-handed.
- **Five artifacts** get bespoke models, because those are the items players
  remember and the whole point of Dawnbringer is that it is not another sword.
- **Rarity is a tint**, so ten models carry a hundred and forty-six items
  without anyone mistaking a common for a legendary.

Fifteen models total, rather than one per item forever.

### Why not bake the weapon into the character GLB

It needs no new code, which is why it is worth naming and then refusing. Four
characters times nineteen items is 76 generations at 25 credits, it can never
change at runtime, and it has already failed here: **Samson's glowing mace
vanished during the A-pose rig**. The pipeline that gives clean skeletons is
the same one that strips held props.

## How it works in code

`lib/equipment.ts` owns this. The bone is a real node in the loaded scene
graph, so parenting to it is all that is required:

```ts
const hand = model.getObjectByName("RightHand")
hand.add(weapon)          // the skinning system carries it from here
```

- `archetypeFor(name)` maps an item name onto one of the ten shapes.
- `DEFAULT_GRIP` holds the fist transform per archetype. A model's origin is
  almost never its grip — a sword is modelled from the hilt, a spear from its
  butt — so this is data, not a constant.
- `proxyGeometry()` draws a stand-in when an item has no model yet. This is
  why the system works **before any art exists**: every character is armed
  today, and each real model replaces a proxy one item at a time.
- `applyRarity()` tints by rarity, cloning the material first so one
  legendary does not gild every sword sharing that archetype.

### Scale is relative, not absolute

Characters are normalised by measured height: a six-foot figure is **1.2 board
units**. That makes `scale: 1.0` roughly a metre of weapon. A model exported in
real-world metres arrives comically wrong, which is what `grip.scale` absorbs.

## Data

| Column | Meaning |
| --- | --- |
| `items.equippable_slot` | already populated: `main_hand`, `off_hand`, `head`, `torso` |
| `items.model_url` | GLB to attach. `NULL` = draw an archetype proxy |
| `items.grip` | `{pos:[x,y,z], rot:[x,y,z], scale}`. `NULL` = archetype default |
| `equipment_items.equipped` | per-character equip state (exists, currently unused) |

Today the board reads the character's `sheet_attacks` — the same source the
ability rack reads — so the miniature agrees with the buttons. When
`equipment_items` is populated it becomes the authority.

## Known compromises

**Two-handed weapons.** The rig cannot be re-posed, so a greatsword parented to
one hand looks approximately held rather than gripped. BG3 solves this with
bespoke animation sets; that is not available here. At board zoom it reads
acceptably, and it is the most common compromise in small-studio VTTs.

**Sheathed versus drawn.** `Spine02` is available as a stow socket and costs
only a second transform in the same table. Worth building in rather than
retrofitting.

## Build order

1. ~~Schema and one hard-coded blade~~ — done; proxies prove the socket.
2. The ten archetype models (~250 credits, one sitting).
3. Equip state driven from `equipment_items`.
4. Rarity glow, then the five artifacts (~175 credits).
5. Sheathe out of combat.
