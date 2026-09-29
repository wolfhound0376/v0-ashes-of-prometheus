#!/usr/bin/env python3
"""
Generate lib/ingredient-registry-data.ts from Sam's compiled ingredient list.

    python scripts/alchemy/build-ingredient-registry.py

WHY THIS EXISTS
---------------
Sam supplied a compiled list of ~380 named D&D ingredients on 2026-09-29 so the
alchemy module can recognise something a surface trader offers, rather than the
DM improvising whether it is real. The list is kept verbatim at
claude/alchemy_ingredient_list_2026-09-29.md; this parses it so nothing is
retyped and a correction to the list re-flows into the engine.

The list marks rows ✓ (claimed official) or ~ (homebrew). Claude cannot confirm
a ✓ from anything in this repo, EXCEPT where the row is a spell material
component — lib/data/spells.json holds all 556 spells' components verbatim, so
those rows get checked against the actual text and come out VERIFIED. Every
other row keeps the list's own claim and is labelled `unverified`, which is the
honest word: it means "this repo cannot confirm it", not "it is wrong".

That check is worth running on its own account. It already caught the list
stating Continual Flame takes a whole 50 gp ruby; the spell consumes ruby DUST.
Mismatches are printed at the end of every run.

PROVENANCE, in descending order of how much the engine trusts a row:
  spell-component  the dataset's own component text names it — verified here
  srd-equipment    SRD gear/poison the catalog already carries
  unverified       the list claims a WotC book; nothing here can confirm it
  homebrew         the list itself marks it community content
"""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIST = ROOT / "claude" / "alchemy_ingredient_list_2026-09-29.md"
SPELLS = ROOT / "lib" / "data" / "spells.json"
OUT = ROOT / "lib" / "ingredient-registry-data.ts"

# Sections of the list that are tables of ingredients. The final
# "Quick-Reference" table is a rarity summary, not ingredients, and is skipped.
SKIP_SECTIONS = {"Quick-Reference: \"Where to Find\" by Rarity"}

# Rows whose Source cell is a book name rather than a ✓/~ marker.
BOOKS = ("PHB", "DMG", "OotA", "MotF", "Tasha", "Xanathar", "Frostmaiden", "Phandelver", "SRD")

MATERIAL = re.compile(r"\bM \((.*)\)\s*$")
PRICE = re.compile(r"(\d[\d,]*)\s*(gp|sp|cp)\b", re.I)
RATE = {"gp": 1.0, "sp": 0.1, "cp": 0.01}
# Spell names in the "Used For" cell arrive italicised: *Revivify*.
SPELL_REF = re.compile(r"\*([^*]+)\*")


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\([^)]*\)", " ", s)          # drop parentheticals
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s


def price_gp(text: str) -> float | None:
    found = [int(n.replace(",", "")) * RATE[u.lower()] for n, u in PRICE.findall(text)]
    return round(max(found), 2) if found else None


def parse_list(md: str) -> list[dict]:
    rows: list[dict] = []
    section = ""
    header: list[str] = []
    for line in md.splitlines():
        line = line.rstrip()
        if line.startswith("## "):
            section = line[3:].strip()
            header = []
            continue
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if all(set(c) <= set("-: ") for c in cells):      # the |---|---| rule
            continue
        if cells and cells[0].lower() == "ingredient":     # header row
            header = [c.lower() for c in cells]
            continue
        if section in SKIP_SECTIONS or not header:
            continue
        row = dict(zip(header, cells))
        name = row.get("ingredient", "").strip()
        if not name:
            continue
        rows.append(
            {
                "name": name,
                "section": section,
                "note": row.get("cost / note", "").strip(),
                "usedFor": row.get("used for", "").strip(),
                "source": row.get("source", "").strip(),
            }
        )
    return rows


def main() -> None:
    md = LIST.read_text(encoding="utf-8")
    spells = json.loads(SPELLS.read_text(encoding="utf-8"))

    components: dict[str, str] = {}
    for s in spells:
        m = MATERIAL.search((s.get("components") or "").strip())
        if m:
            components[s["name"].lower()] = m.group(1)

    parsed = parse_list(md)
    seen: dict[str, dict] = {}
    mismatches: list[str] = []
    verified = 0

    for row in parsed:
        name, note, used, src = row["name"], row["note"], row["usedFor"], row["source"]
        # The list uses ✓ for "official" and ~ for homebrew, in either the
        # Source or the Used For cell depending on the table.
        marked_official = "✓" in src or any(b in src for b in BOOKS)
        marked_homebrew = "~" in src and not marked_official

        # Verify against the real component text: does a spell this row cites
        # actually name this ingredient?
        head = re.split(r"[(/,]", name)[0].strip().lower()
        cited = [m.strip().lower() for m in SPELL_REF.findall(used)]
        hits = [c for c in cited if c in components]
        confirms = [c for c in hits if head and head in components[c].lower()]
        provenance = "homebrew" if marked_homebrew else "unverified"
        evidence = None
        if confirms:
            provenance = "spell-component"
            evidence = components[confirms[0]]
            verified += 1
        elif hits and marked_official:
            # The spell is real and the row claims it, but the spell's own text
            # does not name this ingredient. Worth Sam's eyes.
            mismatches.append(f"{name!r} cites {hits[0]!r}, whose text reads: {components[hits[0]]!r}")

        slug = slugify(name)
        if slug in seen:                       # the list repeats a few rows
            prior = seen[slug]
            if provenance == "spell-component" and prior["provenance"] != "spell-component":
                seen[slug] = None              # replaced below
            else:
                continue
        entry = {
            "slug": slug,
            "name": name,
            "category": row["section"],
            "usedFor": re.sub(r"[*~✓]", "", used).strip() or None,
            "gp": price_gp(note) if note else price_gp(used),
            "provenance": provenance,
            "claimedSource": re.sub(r"[✓~]", "", src).strip() or None,
            "evidence": evidence,
        }
        seen[slug] = entry

    entries = [e for e in seen.values() if e]
    entries.sort(key=lambda e: e["slug"])

    def ts(v):
        if v is None:
            return "null"
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return str(int(v)) if float(v).is_integer() else str(v)
        return json.dumps(v, ensure_ascii=False)

    counts = {}
    for e in entries:
        counts[e["provenance"]] = counts.get(e["provenance"], 0) + 1

    out = [
        "// GENERATED by scripts/alchemy/build-ingredient-registry.py — do not edit by hand.",
        "//",
        "// Named D&D ingredients the alchemy module should RECOGNISE — so that when a",
        "// surface trader offers something, the engine can say what it is instead of",
        "// the DM improvising whether it exists.",
        "//",
        "// Parsed from claude/alchemy_ingredient_list_2026-09-29.md (Sam's compiled",
        "// list, kept verbatim). Edit that file and re-run the script.",
        "//",
        "// RECOGNISING an ingredient is not the same as it being canon. Read",
        "// `provenance` on every row before treating one as real:",
        "//   spell-component — lib/data/spells.json names it in that spell's own",
        "//                     component text. Verified in this repo.",
        "//   unverified      — the list claims a WotC book. Nothing in this repo can",
        "//                     confirm it. Not a ruling that it is wrong.",
        "//   homebrew        — the list itself marks it community content.",
        "//",
        f"// {len(entries)} ingredients: "
        + ", ".join(f"{n} {k}" for k, n in sorted(counts.items(), key=lambda kv: -kv[1]))
        + ".",
        "",
        "export type IngredientProvenance = \"spell-component\" | \"unverified\" | \"homebrew\"",
        "",
        "export interface RegisteredIngredient {",
        "  /** Stable key. Matches an items.slug only where the catalog happens to carry it. */",
        "  slug: string",
        "  /** Name as the list gives it. */",
        "  name: string",
        "  /** The list's own section heading. */",
        "  category: string",
        "  /** What the list says it is for. */",
        "  usedFor: string | null",
        "  /** Price in gp where one is named. */",
        "  gp: number | null",
        "  /** How far this repo can vouch for the row. */",
        "  provenance: IngredientProvenance",
        "  /** The book the list claims, unedited. */",
        "  claimedSource: string | null",
        "  /** For a verified row: the spell's component text that proves it. */",
        "  evidence: string | null",
        "}",
        "",
        "export const REGISTERED_INGREDIENTS: RegisteredIngredient[] = [",
    ]
    for e in entries:
        out.append(
            "  { slug: %s, name: %s, category: %s, usedFor: %s, gp: %s, provenance: %s, claimedSource: %s, evidence: %s },"
            % tuple(ts(e[k]) for k in ("slug", "name", "category", "usedFor", "gp", "provenance", "claimedSource", "evidence"))
        )
    out += ["]", ""]
    OUT.write_text("\n".join(out), encoding="utf-8")

    print(f"wrote {OUT.relative_to(ROOT)}")
    print(f"  {len(parsed)} rows parsed, {len(entries)} unique ingredients")
    for k, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"    {n:4d}  {k}")
    print(f"  {verified} rows verified against the real spell component text")
    if mismatches:
        print(f"  {len(mismatches)} rows cite a real spell that does NOT name them:")
        for m in mismatches:
            print(f"    - {m}")


if __name__ == "__main__":
    main()
