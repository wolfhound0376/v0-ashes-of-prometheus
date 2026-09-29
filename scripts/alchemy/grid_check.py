#!/usr/bin/env python3
"""Validate the alchemy ingredient grid.

The grid is DESIGN DATA, not yet in the database. Nothing here writes to Supabase.
Run this after any hand-edit: the constraints below are what stop the grid
collapsing back into "every mushroom is food", which is what the first two
drafts did.

    python3 scripts/alchemy/grid_check.py

Spec: claude/claude_Alchemy_Grid.md
"""
from collections import Counter
from itertools import combinations
import sys

# slug -> four effects IN ORDER. Column 1 is what TASTING reveals.
GRID = {
    "barrelstalk":             ("purge-disease", "resist-poison", "restore-health", "iron-stomach"),
    "bigwig":                  ("swell", "iron-stomach", "burning-blood", "confuse"),
    "blind-cave-fish":         ("darksight", "resist-poison", "soft-step", "mind-link"),
    "bluecap":                 ("sicken", "long-march", "purge-disease", "steady-nerve"),
    "carrion-crawler-mucus":   ("seize", "keen-scent", "rot", "numbing-venom"),
    "cave-cricket-skewer":     ("wakefulness", "soft-step", "steady-nerve", "iron-stomach"),
    "cavern-lizard-meat":      ("soft-step", "long-march", "wakefulness", "keen-scent"),
    "deep-rothe-jerky":        ("long-march", "purge-disease", "wakefulness", "iron-stomach"),
    "deep-rothe-milk":         ("restore-health", "iron-stomach", "sicken", "steady-nerve"),
    "edible-mushrooms":        ("sicken", "rot", "confuse", "restore-health"),
    "fire-lichen":             ("burning-blood", "steady-nerve", "resist-poison", "wakefulness"),
    "fried-grubs":             ("iron-stomach", "rot", "long-march", "sicken"),
    "gray-ooze-residue":       ("corrode", "numbing-venom", "rot", "sicken"),
    "nightlight-fungus":       ("inner-light", "keen-scent", "steady-nerve", "darksight"),
    "nilhoggs-nose":           ("keen-scent", "confuse", "darksight", "soft-step"),
    "ormu-ink-vial":           ("inner-light", "silver-tongue", "mind-link", "wakefulness"),
    "ormu-moss":               ("inner-light", "resist-poison", "restore-health", "burning-blood"),
    "pygmywort":               ("shrink", "confuse", "silver-tongue", "keen-scent"),
    "ripplebark":              ("restore-health", "rot", "long-march", "purge-disease"),
    "sporebread-loaf":         ("long-march", "steady-nerve", "restore-health", "wakefulness"),
    "tainted-spores-pouch":    ("rot", "seize", "mind-link", "swell"),
    "timmask":                 ("confuse", "sicken", "shrink", "seize"),
    "tongue-of-madness":       ("silver-tongue", "mind-link", "sicken", "confuse"),
    "torchstalk":              ("burning-blood", "wakefulness", "inner-light", "corrode"),
    "trillimac":               ("soft-step", "resist-poison", "purge-disease", "long-march"),
    "vial-of-rapport-spores":  ("mind-link", "soft-step", "silver-tongue", "keen-scent"),
    "waterorb":                ("purge-disease", "shrink", "soft-step", "iron-stomach"),
    "zurkhwood":               ("swell", "steady-nerve", "resist-poison", "restore-health"),
}

# Ingredients a party can forage or buy cheaply. Anything else is loot.
COMMON = {"barrelstalk","bluecap","edible-mushrooms","ripplebark","trillimac","waterorb",
          "zurkhwood","torchstalk","fire-lichen","nightlight-fungus","ormu-moss","timmask",
          "sporebread-loaf","cave-cricket-skewer","cavern-lizard-meat","deep-rothe-jerky",
          "deep-rothe-milk","fried-grubs","blind-cave-fish","nilhoggs-nose"}

def main() -> int:
    fails = []
    for slug, eff in GRID.items():
        if len(eff) != 4:
            fails.append(f"{slug}: {len(eff)} effects, expected 4")
        if len(set(eff)) != 4:
            fails.append(f"{slug}: repeats an effect")

    cnt = Counter(e for v in GRID.values() for e in v)
    common = Counter(e for s, v in GRID.items() if s in COMMON for e in v)

    # An effect on only one ingredient can never be brewed: a potion needs the
    # effect SHARED by two ingredients.
    for eff, n in cnt.items():
        if n < 2:
            fails.append(f"{eff}: on {n} ingredient, unreachable")

    # Two ingredients sharing 3+ effects are interchangeable, which is what
    # kills the discovery layer -- learning the second teaches you nothing.
    for a, b in combinations(GRID, 2):
        shared = set(GRID[a]) & set(GRID[b])
        if len(shared) >= 3:
            fails.append(f"{a}/{b}: share {len(shared)} effects {sorted(shared)}")

    # No effect should be so common it is the default outcome of any brew.
    for eff, n in cnt.items():
        if n > 7:
            fails.append(f"{eff}: on {n} ingredients, too common")

    pairs = list(combinations(GRID, 2))
    brewable = sum(1 for a, b in pairs if set(GRID[a]) & set(GRID[b]))
    clean = sum(1 for a, b in pairs if len(set(GRID[a]) & set(GRID[b])) == 1)
    gated = sorted(e for e in cnt if common.get(e, 0) < 2)

    print(f"{len(GRID)} ingredients, {len(cnt)} effects")
    print(f"brewable pairs: {brewable}/{len(pairs)}  ({clean} yield a single clean effect)")
    print(f"effects needing at least one looted ingredient: {', '.join(gated) or 'none'}")
    print()
    for eff, n in sorted(cnt.items(), key=lambda x: (-x[1], x[0])):
        print(f"  {eff:16s} {n:3d} ingredients ({common.get(eff, 0)} common)")
    print()
    if fails:
        print("FAIL")
        for f in fails:
            print("  " + f)
        return 1
    print("PASS - all constraints hold")
    return 0

if __name__ == "__main__":
    sys.exit(main())
