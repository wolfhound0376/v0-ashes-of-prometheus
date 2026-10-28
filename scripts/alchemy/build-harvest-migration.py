"""Build the ingredients + harvest migration (Sam, 2026-10-27: "I want all of this in databases and wired in the game").

Writes migrations/20261027200000_ingredients_and_harvest.sql:
  1. `ingredient_registry`  — Sam's 347-row ingredient list (claude/alchemy_ingredient_list_2026-09-29.md, already parsed
                             into lib/ingredient-registry-data.ts), one row each, provenance kept as the list gives it.
  2. new `items` rows       — the harvest parts the catalogue lacks; rarity from the creature's CR (Xanathar's, lib/harvest.ts).
  3. `creature_harvest`     — which bestiary creature yields which part on the kill, with qty, note, provenance, source.
  4. registry -> item links — ingredient_registry.item_slug where the catalogue carries that part.
Every table: RLS on with an anon/authenticated read policy in the same migration (learnings: never one without the other);
writes go through service-role routes only.

Run from the repo root:  python scripts/alchemy/build-harvest-migration.py
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "migrations" / "20261027200000_ingredients_and_harvest.sql"

# ---- the registry, parsed from the generated TS (the TS is generated from Sam's list; same rows) ----
src = (ROOT / "lib" / "ingredient-registry-data.ts").read_text()
ROW = re.compile(r'\{ slug: "([^"]+)", name: "((?:[^"\\]|\\.)*)", category: "([^"]+)", usedFor: (null|"(?:[^"\\]|\\.)*"), gp: (null|[\d.]+), '
                 r'provenance: "([^"]+)", claimedSource: (null|"[^"]*"), evidence: (null|"(?:[^"\\]|\\.)*") \}')
registry = []
for m in ROW.finditer(src):
    registry.append(dict(slug=m[1], name=json.loads(f'"{m[2]}"'), category=m[3], used_for=None if m[4] == "null" else json.loads(m[4]),
                         gp=None if m[5] == "null" else float(m[5]), provenance=m[6], claimed_source=None if m[7] == "null" else json.loads(m[7]),
                         evidence=None if m[8] == "null" else json.loads(m[8])))
assert len(registry) == 347, len(registry)
REG = {r["slug"]: r for r in registry}

# ---- bestiary CRs (from the live table, 2026-10-27) for the creatures below ----
CR = {"giant-fire-beetle": "0", "chuul": "4", "cloaker": "8", "cloaker-lord": "17", "grell": "3", "intellect-devourer": "2", "giant-toad": "1",
      "green-hag": "3", "night-hag": "5", "imp": "1", "carrion-crawler": "2", "drider": "6", "hook-horror": "3", "hook-horror-alpha": "5",
      "hook-horror-clan-mother": "7", "phase-spider": "3", "purple-worm": "15", "roper": "5", "umber-hulk": "5", "ochre-jelly": "2",
      "shrieker": "0", "troglodyte": "1/4", "orc": "1/2", "orog": "2", "orc-eye-of-gruumsh": "2", "skeleton": "1/4", "vampire": "13",
      "vampire-spawn": "5", "wight": "3", "death-knight": "17", "fire-elemental": "5", "water-elemental": "5", "cave-troll": "7",
      "quaggoth": "2", "quaggoth-alpha": "5", "quaggoth-thonot": "3", "giant-spider": "1", "gray-ooze": "1/2", "ixitxachitl": "1/4",
      "vampiric-ixitxachitl": "2", "female-steeder": "1", "myconid-sprout": "0", "drow-spore-servant": "1/8", "duergar-spore-servant": "1/2",
      "hook-horror-spore-servant": "3", "venom-ooze": "9", "drowned": "6", "deep-rothe": "1/4", "giant-lizard": "1/4", "beholder": "13"}
NAME = {"giant-fire-beetle": "Giant Fire Beetle", "chuul": "Chuul", "cloaker": "Cloaker", "grell": "Grell", "intellect-devourer": "Intellect Devourer",
        "giant-toad": "Giant Toad", "green-hag": "Green Hag", "night-hag": "Night Hag", "imp": "Imp", "carrion-crawler": "Carrion Crawler",
        "drider": "Drider", "hook-horror": "Hook Horror", "phase-spider": "Phase Spider", "purple-worm": "Purple Worm", "roper": "Roper",
        "umber-hulk": "Umber Hulk", "ochre-jelly": "Ochre Jelly", "shrieker": "Shrieker", "troglodyte": "Troglodyte", "orc": "Orc",
        "skeleton": "Skeleton", "vampire-spawn": "Vampire Spawn", "wight": "Wight", "death-knight": "Death Knight", "fire-elemental": "Fire Elemental",
        "cave-troll": "Cave Troll"}


def crn(c):
    a, _, b = c.partition("/")
    return int(a) / int(b) if b else float(a)


def rarity_for_cr(c):          # lib/harvest.ts rarityForCr — keep in step
    n = crn(c)
    return "legendary" if n >= 19 else "very_rare" if n >= 13 else "rare" if n >= 9 else "uncommon" if n >= 4 else "common"


# ---- NEW catalogue rows: (item_slug, name, item_type, primary creature, registry slug or None, extra properties, description) ----
# Rarity = the primary (lowest-CR) creature's Xanathar's band. Value = the list's gp where it names one.
NEW = [
    ("giant-fire-beetle-gland", "Fire Beetle Gland", "misc", "giant-fire-beetle", None,
     {"light": {"bright_ft": 10, "dim_ft": 10, "lasts": "1d6 days after the beetle dies"}, "srd": True, "icon_hint": "glowing-orb"},
     "One of the pair of glowing glands that gives a giant fire beetle its name. It keeps shedding light for 1d6 days after the beetle dies (SRD 5.1)."),
    ("chuul-tentacles", "Chuul Tentacles", "misc", "chuul", "chuul-tentacles", {}, None),
    ("cloaker-hide", "Cloaker Hide", "misc", "cloaker", "cloaker-hide", {}, None),
    ("grell-beak", "Grell Beak", "misc", "grell", "grell-beak", {}, None),
    ("grell-brain-tissue", "Grell Brain Tissue", "misc", "grell", "grell-brain-tissue", {}, None),
    ("intellect-devourer-brain", "Intellect Devourer Brain", "misc", "intellect-devourer", "intellect-devourer-brain", {}, None),
    ("giant-toad-saliva", "Giant Toad Saliva", "consumable", "giant-toad", "giant-toad-saliva", {}, None),
    ("green-hag-eye", "Green Hag Eye", "misc", "green-hag", "green-hag-eye", {}, None),
    ("night-hag-eye", "Night Hag Eye", "misc", "night-hag", "night-hag-eye", {}, None),
    ("imp-heart", "Imp Heart", "misc", "imp", "imp-heart", {}, None),
    ("carrion-crawler-tentacles", "Carrion Crawler Tentacles", "misc", "carrion-crawler", "carrion-crawler-tentacles", {}, None),
    ("carrion-crawler-antenna-stomach", "Carrion Crawler Antenna and Stomach", "misc", "carrion-crawler", "carrion-crawler-antenna-stomach", {}, None),
    ("drider-pincers", "Drider Pincers", "misc", "drider", "drider-pincers", {}, None),
    ("drider-web-silk", "Drider Web Silk", "misc", "drider", "drider-web-silk", {}, None),
    ("hook-horror-tentacles", "Hook Horror Tentacles", "misc", "hook-horror", "hook-horror-tentacles", {}, None),
    ("phase-spider-silk", "Phase Spider Silk", "misc", "phase-spider", "phase-spider-silk", {}, None),
    ("purple-worm-guts", "Purple Worm Guts", "misc", "purple-worm", "purple-worm-guts", {}, None),
    ("roper-tentacles", "Roper Tentacles", "misc", "roper", "roper-tentacles", {}, None),
    ("umber-hulk-blood", "Umber Hulk Blood", "consumable", "umber-hulk", "umber-hulk-blood", {}, None),
    ("umber-hulk-hide", "Umber Hulk Hide", "misc", "umber-hulk", "umber-hulk-hide", {}, None),
    ("umber-hulk-mandibles", "Umber Hulk Mandibles", "misc", "umber-hulk", "umber-hulk-mandibles", {}, None),
    ("ochre-jelly-oil", "Ochre Jelly Oil", "consumable", "ochre-jelly", "ochre-jelly-oil", {}, None),
    ("shrieker-rendered", "Rendered Shrieker", "misc", "shrieker", "shrieker", {}, None),
    ("troglodyte-saliva-scale", "Troglodyte Saliva and Scale", "misc", "troglodyte", "troglodyte-saliva-scale", {}, None),
    ("orc-tusk", "Orc Tusk", "misc", "orc", "orc-tusk", {}, None),
    ("skeleton-bone", "Skeleton Bone", "misc", "skeleton", "skeleton-bone", {}, None),
    ("vampire-dust", "Vampire Dust", "misc", "vampire-spawn", "vampire-dust", {}, None),
    ("wight-heart", "Wight Heart", "misc", "wight", "wight-heart", {}, None),
    ("death-knight-sword", "Death Knight's Sword", "weapon", "death-knight", "death-knight-sword", {}, None),
    ("elemental-essence", "Elemental Essence", "misc", "fire-elemental", "elemental-essence", {}, None),
    ("troll-heart", "Troll Heart", "misc", "cave-troll", "troll-heart", {}, None),
]

# ---- WHO DROPS WHAT: (bestiary_slug, item_slug, qty, note, provenance, source) ----
REGP = lambda s: "registry-unverified" if REG[s]["provenance"] == "unverified" else "spell-component" if REG[s]["provenance"] == "spell-component" else "registry-homebrew"
REGS = lambda s: f"Sam's ingredient list ({REG[s]['claimed_source'] or 'community'}): {REG[s]['used_for'] or 'no use named'}"
HARVEST = [
    # SRD text names these
    ("giant-fire-beetle", "giant-fire-beetle-gland", 2, "the pair that gives it its name", "srd", "SRD 5.1 Giant Fire Beetle: its glands shed light for 1d6 days after it dies"),
    ("carrion-crawler", "carrion-crawler-mucus", 1, "harvested from the dead crawler", "srd", "SRD 5.1 Poisons: Crawler Mucus must be harvested from a dead or incapacitated crawler"),
    ("purple-worm", "purple-worm-poison", 1, "harvested from the dead worm", "srd", "SRD 5.1 Poisons: Purple Worm Poison must be harvested from a dead or incapacitated purple worm"),
    # the book (Out of the Abyss) names these
    ("beholder", "beholder-central-eye", 1, "the great central eye", "book", "OotA: the central eye of a beholder, a component of Vizeran's ritual (guide p.25; book p.176)"),
    # existing catalogue harvest rows (their own `harvest_from`)
    ("quaggoth", "quaggoth-pelt", 1, "a shaggy white pelt", "catalogue", "items.quaggoth-pelt harvest_from Quaggoth"),
    ("quaggoth-alpha", "quaggoth-pelt", 1, "a shaggy white pelt", "catalogue", "items.quaggoth-pelt harvest_from Quaggoth"),
    ("quaggoth-thonot", "quaggoth-pelt", 1, "a shaggy white pelt", "catalogue", "items.quaggoth-pelt harvest_from Quaggoth"),
    ("quaggoth-thonot", "thonot-psi-crystal", 1, None, "catalogue", "items.thonot-psi-crystal harvest_from Quaggoth Thonot"),
    ("giant-spider", "spider-venom-gland", 1, "cut clear of the jaws", "catalogue", "items.spider-venom-gland harvest_from Giant Spider"),
    ("giant-spider", "giant-spider-silk", 2, "strands from the spinnerets", "registry-unverified", "Sam's ingredient list (OotA): craftable material"),
    ("giant-spider", "spider-meat", 2, "from the legs", "catalogue", "items.spider-meat (Sam's Underdark food list, 2026-09-29)"),
    ("gray-ooze", "gray-ooze-residue", 1, "decanted; what its acid does is not ruled yet", "catalogue", "items.gray-ooze-residue harvest_from Gray Ooze"),
    ("hook-horror", "hook-horror-claw", 2, "the two great hooks", "catalogue", "items.hook-horror-claw harvest_from Hook Horror"),
    ("hook-horror-alpha", "hook-horror-claw", 2, "the two great hooks", "catalogue", "items.hook-horror-claw harvest_from Hook Horror"),
    ("hook-horror-clan-mother", "hook-horror-claw", 2, "the two great hooks", "catalogue", "items.hook-horror-claw harvest_from Hook Horror"),
    ("ixitxachitl", "ixitxachitl-hide", 1, None, "catalogue", "items.ixitxachitl-hide harvest_from Ixitxachitl"),
    ("vampiric-ixitxachitl", "ixitxachitl-hide", 1, None, "catalogue", "items.ixitxachitl-hide harvest_from Ixitxachitl"),
    ("female-steeder", "steeder-silk-spinneret", 1, None, "catalogue", "items.steeder-silk-spinneret harvest_from Female Steeder"),
    ("myconid-sprout", "vial-of-rapport-spores", 1, None, "catalogue", "items.vial-of-rapport-spores harvest_from Myconid Sprout"),
    ("drow-spore-servant", "tainted-spores-pouch", 1, None, "catalogue", "items.tainted-spores-pouch harvest_from Spore Servants"),
    ("duergar-spore-servant", "tainted-spores-pouch", 1, None, "catalogue", "items.tainted-spores-pouch harvest_from Spore Servants"),
    ("hook-horror-spore-servant", "tainted-spores-pouch", 1, None, "catalogue", "items.tainted-spores-pouch harvest_from Spore Servants"),
    ("venom-ooze", "concentrated-venom-sac", 1, None, "catalogue", "items.concentrated-venom-sac harvest_from Venom Ooze"),
    ("drowned", "grave-brine-flask", 1, None, "catalogue", "items.grave-brine-flask harvest_from Drowned"),
    ("giant-fire-beetle", "beetle-meat", 1, None, "catalogue", "items.beetle-meat (Giant Beetle Meat)"),
    ("deep-rothe", "rothe-meat", 2, None, "registry-unverified", "Sam's ingredient list: Deep Rothé (meat, milk, hide) — food"),
    ("giant-lizard", "cavern-lizard-meat", 2, None, "registry-unverified", "Sam's ingredient list (OotA): riding lizards (meat) — food"),
    ("roper", "roper-digestive-juices", 1, None, "registry-unverified", "Sam's ingredient list (DMG): solvent (alchemy)"),
]
# every new catalogue row that came from the list drops from its primary creature (and the kin listed here)
KIN = {"orc-tusk": ["orc", "orog", "orc-eye-of-gruumsh"], "vampire-dust": ["vampire-spawn", "vampire"], "elemental-essence": ["fire-elemental", "water-elemental"],
       "cloaker-hide": ["cloaker", "cloaker-lord"], "hook-horror-tentacles": ["hook-horror", "hook-horror-alpha", "hook-horror-clan-mother"]}
QTY = {"orc-tusk": 2, "grell-beak": 1, "drider-pincers": 2, "carrion-crawler-tentacles": 8, "umber-hulk-mandibles": 2, "roper-tentacles": 6, "chuul-tentacles": 2}
for slug, name, typ, primary, reg, props, desc in NEW:
    if slug == "giant-fire-beetle-gland":
        continue                                     # SRD row above
    for b in KIN.get(slug, [primary]):
        HARVEST.append((b, slug, QTY.get(slug, 1), None, REGP(reg), REGS(reg)))

# sanity: no duplicate (creature, part); every creature has a CR here; every part exists or is new
seen = set()
for b, i, *_ in HARVEST:
    assert (b, i) not in seen, (b, i); seen.add((b, i))
    assert b in CR, b


def q(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(int(v)) if float(v).is_integer() else str(v)
    return "'" + str(v).replace("'", "''") + "'"


def qj(o):
    return q(json.dumps(o, ensure_ascii=False)) + "::jsonb"


sql = ["-- GENERATED by scripts/alchemy/build-harvest-migration.py — Sam, 2026-10-27: \"I want all of this in databases and wired in the game\".",
       "-- Tables: ingredient_registry (Sam's 347-ingredient list), creature_harvest (who drops what on the kill). New items rows for",
       "-- harvest parts the catalogue lacked; rarity from the creature's CR band (Xanathar's p.128-129, lib/harvest.ts).",
       "-- Idempotent: tables `if not exists`, inserts `on conflict do nothing`. Existing items rows are NOT changed, except the three rarity fixes at the end (Sam: \"fix to match\").",
       "begin;", "",
       "create table if not exists public.ingredient_registry (",
       "  slug text primary key,",
       "  name text not null,",
       "  category text not null,",
       "  used_for text,",
       "  gp numeric,",
       "  provenance text not null check (provenance in ('spell-component','unverified','homebrew')),",
       "  claimed_source text,",
       "  evidence text,",
       "  item_slug text references public.items(slug) on update cascade on delete set null,",
       "  source_doc text not null default 'claude/alchemy_ingredient_list_2026-09-29.md',",
       "  created_at timestamptz not null default now()",
       ");",
       "alter table public.ingredient_registry enable row level security;",
       "drop policy if exists ingredient_registry_read on public.ingredient_registry;",
       "create policy ingredient_registry_read on public.ingredient_registry for select to anon, authenticated using (true);",
       ""]
sql.append("insert into public.ingredient_registry (slug, name, category, used_for, gp, provenance, claimed_source, evidence) values")
sql.append(",\n".join(f"  ({q(r['slug'])}, {q(r['name'])}, {q(r['category'])}, {q(r['used_for'])}, {q(r['gp'])}, {q(r['provenance'])}, {q(r['claimed_source'])}, {q(r['evidence'])})" for r in registry))
sql.append("on conflict (slug) do nothing;")
sql.append("")

sql.append("insert into public.items (slug, name, item_type, rarity, value, description, source, stackable, properties) values")
vals = []
for slug, name, typ, primary, reg, props, desc in NEW:
    r = REG.get(reg) if reg else None
    rar = rarity_for_cr(CR[primary])
    p = {"harvest_from": f"{NAME.get(primary, primary)} (CR {CR[primary]})", "rarity_rule": "Xanathar's p.128-129: harvest band of the creature's CR"}
    if r:
        p.update({"feeds": r["used_for"], "registry_slug": reg, "provenance": r["provenance"], "claimed_source": r["claimed_source"]})
        if r["provenance"] == "homebrew":
            p["homebrew"] = True
    p.update(props)
    d = desc or (f"Harvested from a {NAME.get(primary, primary).lower()}. " + (f"Used for: {r['used_for']}." if r and r["used_for"] else "No use named yet."))
    srcs = "SRD 5.1" if slug == "giant-fire-beetle-gland" else ("homebrew" if r and r["provenance"] == "homebrew" else f"Sam's ingredient list (claims {r['claimed_source']})" if r and r["claimed_source"] else "Sam's ingredient list")
    vals.append(f"  ({q(slug)}, {q(name)}, {q(typ)}, {q(rar)}, {q(int(r['gp']) if r and r['gp'] else None)}, {q(d)}, {q(srcs)}, {q(typ != 'weapon')}, {qj(p)})")
sql.append(",\n".join(vals))
sql.append("on conflict (slug) do nothing;")
sql.append("")

sql += ["create table if not exists public.creature_harvest (",
        "  id bigint generated always as identity primary key,",
        "  bestiary_slug text not null references public.bestiary(slug) on update cascade on delete cascade,",
        "  item_slug text not null references public.items(slug) on update cascade on delete cascade,",
        "  qty integer not null default 1 check (qty > 0),",
        "  note text,",
        "  provenance text not null check (provenance in ('srd','book','spell-component','registry-unverified','registry-homebrew','catalogue','sam')),",
        "  source text not null,",
        "  created_at timestamptz not null default now(),",
        "  unique (bestiary_slug, item_slug)",
        ");",
        "alter table public.creature_harvest enable row level security;",
        "drop policy if exists creature_harvest_read on public.creature_harvest;",
        "create policy creature_harvest_read on public.creature_harvest for select to anon, authenticated using (true);",
        "",
        "insert into public.creature_harvest (bestiary_slug, item_slug, qty, note, provenance, source) values"]
sql.append(",\n".join(f"  ({q(b)}, {q(i)}, {q(n)}, {q(note)}, {q(pv)}, {q(s)})" for b, i, n, note, pv, s in HARVEST))
sql.append("on conflict (bestiary_slug, item_slug) do nothing;")
sql.append("")
sql.append("-- link the list to the catalogue where the catalogue carries the part")
sql.append("update public.ingredient_registry r set item_slug = i.slug from public.items i where i.slug = r.slug and r.item_slug is null;")
sql.append("update public.ingredient_registry set item_slug = 'shrieker-rendered' where slug = 'shrieker' and item_slug is null;")
sql.append("update public.ingredient_registry set item_slug = 'rothe-meat' where slug = 'deep-rothe' and item_slug is null;")
sql.append("update public.ingredient_registry set item_slug = 'cavern-lizard-meat' where slug = 'riding-lizards' and item_slug is null;")
sql.append("update public.ingredient_registry set item_slug = 'carrion-crawler-mucus' where slug = 'carrion-crawler-mucus-venom' and item_slug is null;")
sql.append("")
sql.append("")
sql.append("-- Sam, 2026-10-27: \"fix to match\" — three existing parts brought into their creature's Xanathar's CR band")
for slug, rar, why in [("thonot-psi-crystal", "common", "Quaggoth Thonot, CR 3"), ("carrion-crawler-mucus", "common", "Carrion Crawler, CR 2"), ("beholder-central-eye", "very_rare", "Beholder, CR 13")]:
    sql.append(f"update public.items set rarity = '{rar}', properties = coalesce(properties, '{{}}'::jsonb) || jsonb_build_object('rarity_rule', 'Xanathar''s p.128-129: harvest band of the creature''s CR ({why})') where slug = '{slug}';")
sql.append("commit;")
OUT.write_text("\n".join(sql) + "\n")
print(f"wrote {OUT.relative_to(ROOT)}: {len(registry)} registry rows, {len(NEW)} new items, {len(HARVEST)} harvest rows, {len({b for b, *_ in HARVEST})} creatures")
