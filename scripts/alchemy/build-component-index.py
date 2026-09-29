#!/usr/bin/env python3
"""
Generate lib/spell-component-data.ts — every MATERIAL component in the game.

    python scripts/alchemy/build-component-index.py

WHY THIS EXISTS
---------------
Sam, 2026-09-29: "Add this to our alchemy module as a list of DND official
ingredients, just in case we stumble upon an ingredient someone happen to bring
from the surface or is selling."

The compiled list he supplied is two very different things stapled together.
Half of it is SPELL MATERIAL COMPONENTS — and lib/data/spells.json has held
those verbatim for all 556 spells the whole time, in `components`. Retyping
them from a forum table would import that table's mistakes (it has some: it
lists Continual Flame as a whole 50 gp ruby; the spell consumes ruby DUST).
So this lifts them from the dataset instead. Nothing is typed, nothing is
invented, and re-running it tracks the dataset.

The other half of his list — "aboleth spine makes a Rod of Rulership" — is not
in this dataset and is handled in lib/alchemy-ingredients.ts, where every row
says where it came from and how much to trust it.

WHAT IT EMITS
-------------
1. SPELL_COMPONENTS — one row per spell that has a material component: the
   clause verbatim, its price in gp, and whether the spell consumes it.
2. SUBSTANCE_SPELLS — a named substance to the spells whose component clause
   literally contains it. Matching is a substring test against the book's own
   wording, so a hit is a fact about the text, not a judgement call.

SUBSTANCES is the vocabulary that gets matched. Adding a term can only ever
find or not find it; it cannot invent a use. Terms that match nothing are
reported at the end of the run rather than silently dropped, because a term
with no hits is itself the answer to "is this actually official?".
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "lib" / "data" / "spells.json"
OUT = ROOT / "lib" / "spell-component-data.ts"

# Substances to index. Drawn from Sam's compiled list plus a frequency scan of
# the component text itself. Literal, lowercase, matched as substrings.
SUBSTANCES = [
    # Gems and their dusts
    "diamond dust", "powdered diamond", "diamond", "ruby dust", "ruby",
    "jade dust", "jade", "black pearl", "pearl", "onyx", "agate", "sapphire",
    "emerald", "opal", "jacinth", "amber", "quartz", "crystal", "gem",
    # Metals and minerals
    "gold dust", "gold", "powdered silver", "silver", "platinum", "copper",
    "iron", "lead", "tin", "mercury", "quicksilver", "brass", "bronze",
    "phosphorus", "sulfur", "brimstone", "saltpeter", "lime", "alum",
    "salt", "sand", "soot", "charcoal", "ash", "chalk", "ivory", "bone",
    # Waters and liquids
    "holy water", "purified water", "water", "oil", "vinegar", "wine",
    "blood", "tears", "venom", "poison", "ink",
    # Plants and organics
    "mistletoe", "incense", "herbs", "honeycomb", "gum arabic", "seed",
    "leaf", "twig", "wood", "bark", "flower", "root", "moss", "clover",
    "yew", "oak", "nut", "acorn", "cocoon", "caterpillar", "spider",
    "feather", "fur", "fleece", "hair", "scale", "claw", "tooth", "horn",
    "wing", "eye", "tongue", "heart", "guano", "dung", "egg", "eggshell",
    "milk", "honey", "cheese", "food",
    # Worked items that read as reagents
    "glass", "mirror", "clay", "wax", "cloth", "leather", "parchment",
    "string", "wire", "rod", "sponge", "soap", "phosphorescent moss",
]

# ---------------------------------------------------------------------------
# CREATURE-SOURCED COMPONENTS
#
# Sam, 2026-09-29, arrived with a list of 8 spells and "that's the entire
# official list." All 8 are real and quoted correctly, but a keyword scan of
# all 292 components found many more: Fireball is bat guano, Fly is a wing
# feather, Polymorph is a caterpillar cocoon, five illusion spells run on
# fleece. The 8 are the spells where the creature part is the WHOLE component;
# that is a real distinction, just not the same as "the official list".
#
# So this flag exists, and it is a CURATED JUDGEMENT, not a keyword match —
# keyword matching alone pulled in sulfur, incense and thorns. Every name below
# was read against its own component text. The script asserts each one exists
# in the dataset, so a rename upstream fails the run instead of silently
# dropping a spell.
#
# Two tiers, because Sam ruled on 2026-09-29 that worked material counts:
#   creature  the part is raw off a body — fur, feather, blood, bone, cocoon
#   worked    creature-derived but processed into an object — silk, vellum,
#             a gilded skull, a jeweled horn, the coins on a corpse's eyes
# Sam's ruling was to COUNT the worked ones. They are tiered separately so that
# decision can be reversed by filtering, without re-reading 292 components.
#
# (UA) spells are included and marked in their own names; filter on the suffix
# if a table should be published-only.

CREATURE_SOURCED = {
    # The 8 Sam brought — the creature part IS the component.
    "Feather Fall": "creature", "Spider Climb": "creature", "Animate Dead": "creature",
    "Bigby's Hand": "creature", "Rary's Telepathic Bond": "creature",
    "Chain Lightning": "creature", "Simulacrum": "creature", "Clone": "creature",
    # Cantrips and 1st
    "Dancing Lights": "creature", "Minor Illusion": "creature", "Bane": "creature",
    "Beast Bond": "creature", "Identify": "creature", "Jump": "creature",
    "Silent Image": "creature", "Sleep": "creature", "Tasha's Hideous Laughter": "creature",
    # 2nd
    "Aganazzar's Scorcher": "creature", "Darkness": "creature", "Enhance Ability": "creature",
    "Flaming Sphere": "creature", "Locate Animals or Plants": "creature",
    "Magic Mouth": "creature", "Phantasmal Force": "creature", "Suggestion": "creature",
    "Summon Beast": "creature", "Web": "creature",
    # 3rd
    "Conjure Lesser Demon (UA)": "creature", "Fear": "creature", "Fireball": "creature",
    "Fly": "creature", "Lightning Bolt": "creature", "Major Image": "creature",
    "Stinking Cloud": "creature", "Summon Lesser Demons": "creature", "Wind Wall": "creature",
    # 4th
    "Arcane Eye": "creature", "Conjure Shadow Demon (UA)": "creature",
    "Locate Creature": "creature", "Mordenkainen's Faithful Hound": "creature",
    "Polymorph": "creature", "Summon Greater Demon": "creature",
    # 5th
    "Insect Plague": "creature", "Negative Energy Flood": "creature",
    # 6th
    "Find the Path": "creature", "Fizban's Platinum Shield (UA)": "creature",
    "Guards and Wards": "creature", "Mass Suggestion": "creature",
    "Programmed Illusion": "creature", "Summon Fiend": "creature",
    "Tenser's Transformation": "creature", "True Seeing": "creature",
    # 7th and up
    "Delayed Blast Fireball": "creature", "Antipathy/Sympathy": "creature",
    "Dark Star": "creature", "Foresight": "creature", "Mass Polymorph": "creature",
    # Worked — creature-derived but processed. Sam ruled these count (2026-09-29).
    "Nystul's Magic Aura": "worked",   # a small square of silk
    "Clairvoyance": "worked",          # a jeweled horn
    "Summon Undead": "worked",         # a gilded skull
    "Gentle Repose": "worked",         # coins on the corpse's eyes
    "Create Undead": "worked",         # grave dirt, per corpse
    "Imprisonment": "worked",          # a vellum depiction
    "Augury": "worked",                # sticks, bones or similar tokens
    "Heroes' Feast": "worked",         # a gem-encrusted bowl
}

PRICE = re.compile(r"(\d[\d,]*)\s*(gp|sp|cp)\b", re.I)
MATERIAL = re.compile(r"\bM \((.*)\)\s*$")
RATE = {"gp": 1.0, "sp": 0.1, "cp": 0.01}


def material_clause(components: str | None) -> str | None:
    """The text inside 'M (...)', verbatim. None when the spell has no material."""
    if not components:
        return None
    m = MATERIAL.search(components.strip())
    return m.group(1).strip() if m else None


def price_gp(clause: str) -> float | None:
    """Highest price named in the clause, in gp. None when it names no price."""
    found = [int(n.replace(",", "")) * RATE[u.lower()] for n, u in PRICE.findall(clause)]
    if not found:
        return None
    gp = max(found)
    return round(gp, 2)


def ts(value) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(int(value)) if float(value).is_integer() else str(value)
    return json.dumps(value, ensure_ascii=False)


def main() -> None:
    spells = json.loads(SRC.read_text(encoding="utf-8"))
    rows = []
    for s in sorted(spells, key=lambda x: x["name"].lower()):
        clause = material_clause(s.get("components"))
        if clause is None:
            continue
        rows.append(
            {
                "spell": s["name"],
                "text": clause,
                "gp": price_gp(clause),
                "consumed": "consume" in clause.lower(),
                "creatureSourced": CREATURE_SOURCED.get(s["name"]),
            }
        )

    known = {r["spell"] for r in rows}
    unknown = sorted(n for n in CREATURE_SOURCED if n not in known)
    if unknown:
        raise SystemExit(
            "CREATURE_SOURCED names no longer in the dataset (renamed or dropped):\n  "
            + "\n  ".join(unknown)
            + "\nFix the names rather than deleting them — a dropped name silently "
              "removes a spell from the harvest economy."
        )

    index: dict[str, list[str]] = {}
    for term in SUBSTANCES:
        hits = [r["spell"] for r in rows if term in r["text"].lower()]
        if hits:
            index[term] = hits

    missing = [t for t in SUBSTANCES if t not in index]
    priced = [r for r in rows if r["gp"] is not None]
    consumed = [r for r in rows if r["consumed"]]

    out = [
        "// GENERATED by scripts/alchemy/build-component-index.py — do not edit by hand.",
        "//",
        "// Every MATERIAL component in the game, lifted verbatim from",
        "// lib/data/spells.json rather than retyped from a compiled table. Re-run",
        "// the script whenever that dataset changes.",
        "//",
        f"// {len(rows)} of {len(spells)} spells take a material component;",
        f"// {len(priced)} name a price and {len(consumed)} are consumed by the casting.",
        "//",
        "// `text` is the book's own wording, unedited. `gp` is the highest price the",
        "// clause names, converted to gp. `consumed` means the clause says so.",
        "",
        "export interface SpellComponent {",
        "  /** Spell name as the dataset spells it. */",
        "  spell: string",
        "  /** The clause inside M (...), verbatim. */",
        "  text: string",
        "  /** Price in gp when the clause names one, else null. */",
        "  gp: number | null",
        "  /** True when the casting destroys the component. */",
        "  consumed: boolean",
        "  /**",
        "   * Whether the component comes off a creature, and how directly.",
        "   * \"creature\" is raw material off a body; \"worked\" is creature-derived",
        "   * but processed (silk, vellum, a gilded skull). null is neither.",
        "   * A curated judgement per spell, not a keyword match — see the script.",
        "   */",
        "  creatureSourced: \"creature\" | \"worked\" | null",
        "}",
        "",
        "export const SPELL_COMPONENTS: SpellComponent[] = [",
    ]
    for r in rows:
        out.append(
            "  { spell: %s, text: %s, gp: %s, consumed: %s, creatureSourced: %s },"
            % (ts(r["spell"]), ts(r["text"]), ts(r["gp"]), ts(r["consumed"]), ts(r["creatureSourced"]))
        )
    out += [
        "]",
        "",
        "/**",
        " * Named substance to the spells whose component clause contains it.",
        " * A substring match against the book's wording — a hit is a fact about the",
        " * text, not a ruling. Substances that matched nothing are absent.",
        " */",
        f"export const SUBSTANCE_SPELLS: Record<string, string[]> = {{",
    ]
    for term in sorted(index):
        spells_for = ", ".join(ts(n) for n in index[term])
        out.append(f"  {ts(term)}: [{spells_for}],")
    out += [
        "}",
        "",
        "/** Spells whose component comes off a creature, by how directly. */",
        "export const CREATURE_SOURCED_SPELLS: Record<string, \"creature\" | \"worked\"> = {",
    ]
    for r in rows:
        if r["creatureSourced"]:
            out.append(f"  {ts(r['spell'])}: {ts(r['creatureSourced'])},")
    out += ["}", ""]

    OUT.write_text("\n".join(out), encoding="utf-8")

    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  {len(rows)} material components, {len(priced)} priced, {len(consumed)} consumed")
    print(f"  {len(index)} substances indexed")
    raw = sum(1 for r in rows if r["creatureSourced"] == "creature")
    worked = sum(1 for r in rows if r["creatureSourced"] == "worked")
    ua = sum(1 for r in rows if r["creatureSourced"] and "(UA)" in r["spell"])
    print(f"  creature-sourced: {raw} raw + {worked} worked = {raw + worked} ({ua} of them UA)")
    if missing:
        print(f"  {len(missing)} substances matched NOTHING in the 556 spells:")
        print("    " + ", ".join(missing))


if __name__ == "__main__":
    main()
