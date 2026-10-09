"""Turning a `map_props` row into a high-fantasy 128px prompt.

Sam's direction, 2026-10-08: "These should be underdark highfantasy highdef
pixel art, some that are animated."

The library's first 191 props were generated at 64px against a muted,
desaturated reference and came back muddy — readable at board scale, but flat.
The 128px Pro Flash pilot (cresting wave, water curtain, mooring post, wet
stalagmite) showed what the same subjects look like with a jewel-toned palette,
bioluminescent accents and real rim lighting, so the whole library is being
re-cut at that spec.

WHY 128px IS FREE. `components/tactical/map-prop-decor.ts` sizes a prop from
`footprint_w/h` against the board's square size. `PX_PER_SQUARE = 64` is
declared there and never read. A 128px texture on a 1x1 footprint therefore
renders into the same 5-ft square at double the density — no renderer change,
no geometry change, no migration. Only the art file changes.

TWO FAILURE MODES THIS FILE EXISTS TO PREVENT, both seen for real:

  1. A SPECIMEN NAMEPLATE. Sending a proper noun alone as a description invites
     the model to label it. Every prompt therefore ends with the no-text clause,
     and no prompt is ever just a name.

  2. A FRAMED ILLUSTRATION INSTEAD OF A PROP. The pilot's cresting wave came
     back at 58% opaque with cave walls and a water surface painted behind it —
     beautiful, and useless as a prop, because a prop has to be a cutout that
     sits on someone else's floor. The cause was naming a SETTING ("in an
     Underdark river cavern"). So the subject line never names a place; the
     Underdark reads through palette and lighting instead, and the isolation
     clause is explicit. `verify` in the regen script measures corner alpha
     rather than trusting the eye, because this is exactly the error that looks
     fine in a thumbnail.
"""

from __future__ import annotations

# The look, in one line, applied to every prop so the library holds together.
STYLE = (
    "high-fantasy pixel art, rich jewel-toned palette, deep shadow and crisp rim "
    "lighting, faint bioluminescent blue-green accents, detailed shading ramps"
)

# What must be true of EVERY file, whatever it depicts.
ISOLATION = (
    "a single isolated object on a fully transparent background, nothing behind it, "
    "no ground, no floor, no scenery, no backdrop, no cave walls, no vignette, no frame"
)

NO_TEXT = "NO TEXT, no label, no caption, no lettering, no nameplate, no border"

# How each render class must be drawn. Decals lie flat and are read from
# straight above; billboards stand and are read from the side. Getting this
# wrong produces art that looks correct in isolation and wrong on the board.
CLASS_DIRECTION = {
    "decal": "lying flat on the ground, seen from directly overhead, no perspective",
    "billboard": "standing upright, seen from the side, flat elevation view",
    "overhead": "seen from directly below, hanging downward",
}

# Per-category colour and material direction. The point is that a fungus and a
# corpse should not share a palette just because they share a generator.
CATEGORY_DIRECTION = {
    "fungi": "luminous caps in violet, teal and amber, soft inner glow, moist translucent flesh",
    "vegetation": "pale sunless growth, desaturated green and bone-white, damp and limp",
    "rock": "slate and violet mineral banding, wet highlights, crystalline facets catching light",
    # NOT what the name suggests. `remains` is the catalog's floor-decal bucket:
    # it holds dead-drow and claw-gouges, but also burrow-hole, cracked-floor,
    # water-pool, campfire-small and crystal-violet-floor. A corpse palette here
    # told a cave pool to look like bleached bone — caught on the first dry run.
    # So the line stays neutral, and the corpses get theirs from the `dead-`
    # prefix rule below.
    "remains": "ground-level detail worn into the stone, muted and weathered",
    "burial": "weathered carved stone, cold grey-blue, moss in the cut lines, solemn",
    "fixture": "wrought iron and dark timber, verdigris and rust, warm lamp-glow where lit",
    "prison": "heavy black iron, bolt heads and chain, cold and brutal, rust bleeding at the joints",
    "structure": "drow-built dark stone and spider-motif ironwork, elegant and cruel",
    "web": "pale silk catching light, fine translucent strands, dusty",
    "trap": "concealed mechanism, muted and easy to miss, dull metal against stone",
}

# A slug hint REPLACES the category line rather than stacking with it. Stacking
# is what produced "cave pool ... bleached bone and dried leather": the hint and
# the category were both asserting what the thing is made of, and they
# disagreed. The most specific description wins.
SLUG_HINTS = {
    "water-pool": "still dark water with a mirror sheen, faint reflected glow",
    "campfire-small": "warm orange firelight, the one warm source, embers and ash",
    "crystal-violet-floor": "violet crystal growth breaking through stone, internal glow",
    "burrow-hole": "a dark hole dug into bare stone, loose spoil around the rim",
    "cracked-floor": "fractured stone, hairline cracks catching shadow",
    "claw-gouges": "deep parallel claw scores torn through stone",
}

# Prefix rules, for families too large to hand-write. Checked after SLUG_HINTS.
SLUG_PREFIX_HINTS = {
    "dead-": "a corpse lying still, bleached bone and dried leather, muted ochre and grey, no fresh gore",
    "fungi-": "luminous cap and stalk, violet teal and amber, soft inner glow, moist translucent flesh",
    "trap-": "concealed mechanism, muted and easy to miss, dull metal against stone",
}


def _subject_direction(row: dict) -> str | None:
    """The most specific material/colour line available for this prop."""
    slug = row.get("slug", "")
    if slug in SLUG_HINTS:
        return SLUG_HINTS[slug]
    for prefix, hint in SLUG_PREFIX_HINTS.items():
        if slug.startswith(prefix):
            return hint
    return CATEGORY_DIRECTION.get((row.get("category") or "").strip())


def render_class_direction(render_class: str) -> str:
    return CLASS_DIRECTION.get(render_class, CLASS_DIRECTION["billboard"])


def view_for(render_class: str) -> str:
    """The Pro Flash `view` value for a render class."""
    return "high top-down" if render_class == "decal" else "side"


def prompt_for(row: dict) -> str:
    """Build the full generation prompt for one `map_props` row.

    `row` needs `slug`, `label`, `category` and `render_class`.
    """
    label = (row.get("label") or row.get("slug", "")).strip()
    render_class = (row.get("render_class") or "billboard").strip()

    parts = [label.lower() if label else row.get("slug", "object").replace("-", " ")]

    subject = _subject_direction(row)
    if subject:
        parts.append(subject)

    parts.append(STYLE)
    parts.append(render_class_direction(render_class))
    parts.append(ISOLATION)

    return ". ".join(p.strip().rstrip(".") for p in parts if p) + ". " + NO_TEXT


def is_animation_candidate(row: dict) -> bool:
    """Props whose whole point is that they move.

    Deliberately narrow. A rock gains nothing from a sprite sheet, and every
    animated prop costs a sheet, a bigger file and a draw-call path the
    renderer does not have yet. Sam's call 2026-10-08 was static first, so this
    only marks them for the later pass.
    """
    slug = row.get("slug", "")
    if row.get("emits_light_ft"):
        return True
    moving = ("water", "wave", "curtain", "fall", "drip", "fire", "flame", "torch",
              "brazier", "steam", "spore", "ripple", "eddy", "foam")
    return any(m in slug for m in moving)
