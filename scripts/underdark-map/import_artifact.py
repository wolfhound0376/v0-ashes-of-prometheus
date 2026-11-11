#!/usr/bin/env python3
"""Turn Sam's "Underdark World Map" artifact (the Map Module) into the game's travel map page.

    python3 -I scripts/underdark-map/import_artifact.py <downloaded artifact .html>

Writes public/underdark-map/index.html plus the art and sound that were embedded in the artifact
(public/underdark-map/img, /sfx) and a local copy of three.js (/vendor). The LOOK is the artifact's,
untouched: the same painting, shaders, roads, rings, fog, camera and hero. What changes:

  * GAME MODE (?game=1, inside the game's own page): the graph, the fog, who leads, the hero's
    sprite and every move come from the game through postMessage (components/map/underdark-map-module.tsx).
    The page animates; it decides nothing. The artifact's prototype rules (reveal-on-arrival, the
    toll knight, the pool dive, the grove search, the boat picker) are switched off there.
  * Opened on its own (no ?game=1) it is still the artifact's stand-alone demo.
  * Files the artifact kept in its own store (/_blob/...) cannot be reached from the game. Entrance
    plates switch to the bucket originals; the five library music tracks switch to the game's own
    URLs (lib/music-library.ts); the entrance loops, the nine place themes and the leaders' spoken
    lines are left out until they are uploaded to the bucket.
  * /test-copy-silence.js is the first script, like every page that can make a sound.

Re-run it whenever the artifact changes; every patch asserts that the text it replaces is there,
so a changed artifact fails loudly instead of half-patching.
"""
import base64, json, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "underdark-map"
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not SRC or not SRC.is_file():
    sys.exit(__doc__)
html = SRC.read_text(encoding="utf8")

for d in ("img", "sfx", "vendor"):
    (OUT / d).mkdir(parents=True, exist_ok=True)


def sub(old, new, count=1):
    """Replace exactly `count` occurrences (0 = all, at least one) or stop."""
    global html
    n = html.count(old)
    if n == 0 or (count and n != count):
        sys.exit(f"import_artifact: expected {count or 'some'} of {old[:90]!r}, found {n}")
    html = html.replace(old, new)


def rsub(pattern, repl, count=1):
    global html
    html, n = re.subn(pattern, repl, html, flags=re.S)
    if n == 0 or (count and n != count):
        sys.exit(f"import_artifact: pattern {pattern[:90]!r} matched {n}, expected {count or 'some'}")


EXT = {"image/jpeg": "jpg", "image/png": "png", "audio/mpeg": "mp3"}


def save(data_uri, rel):
    m = re.fullmatch(r"data:([a-z]+/[a-z0-9.+-]+);base64,(.*)", data_uri, flags=re.S)
    if not m:
        sys.exit(f"import_artifact: not a data URI for {rel}")
    p = OUT / f"{rel}.{EXT[m.group(1)]}"
    p.write_bytes(base64.b64decode(m.group(2)))
    return str(p.relative_to(OUT))


# ---------------------------------------------------------------- embedded art -> files
for name, rel in (("MAP", "img/map"), ("FX_MASK", "img/fx-mask"), ("GROVE_ART", "img/grove"), ("WALK", "img/fifi-walk"), ("IDLE", "img/fifi-idle")):
    m = re.search(rf'\b{name}="(data:[^"]+)"', html)
    if not m:
        sys.exit(f"import_artifact: {name} not found")
    html = html.replace(m.group(0), f'{name}="{save(m.group(1), rel)}"', 1)

m = re.search(r"const BOAT_ART=(\{.*?\});", html, flags=re.S)
boats = json.loads(m.group(1))
boats = {kind: [save(uri, f"img/boat-{kind}-{i}") for i, uri in enumerate(uris)] for kind, uris in boats.items()}
html = html.replace(m.group(0), "const BOAT_ART=" + json.dumps(boats) + ";", 1)

for const in ("SFX_SRC", "BED_SRC"):
    m = re.search(rf"const {const}=(\{{.*?\}});\n", html, flags=re.S)
    table = json.loads(m.group(1))
    for key, v in table.items():
        f = save(v["data"], f"sfx/{key}")
        table[key] = {"url": f, "data": f}
    html = html.replace(m.group(0), f"const {const}=" + json.dumps(table) + ";\n", 1)

# ---------------------------------------------------------------- the artifact's file store
# Entrance plates: the bucket originals. Loops are not in the bucket yet.
m = re.search(r"const PLATES=(\{.*?\});\n", html, flags=re.S)
plates = json.loads(m.group(1))
for k, p in plates.items():
    p["url"] = p["src4k"]
    p["loop"] = ""
html = html.replace(m.group(0), "const PLATES=" + json.dumps(plates) + ";\n", 1)

# Music: the five library tracks from the game's own library; the nine place themes are left out, so
# trackFor() falls through to the library pool for that place, exactly as it does for an unthemed one.
lib = (ROOT / "lib" / "music-library.ts").read_text(encoding="utf8")
m = re.search(r"const MUSIC=\{.*?\};\n", html, flags=re.S)
names = dict(re.findall(r'"([a-z0-9-]+)":\{n:"([^"]+)"', m.group(0)))
music = {}
for tid, label in names.items():
    if tid.startswith("theme-"):
        continue
    u = re.search(r'id: "' + re.escape(tid) + r'",\s*name: "[^"]*",\s*url: "([^"]+)"', lib)
    if not u:
        sys.exit(f"import_artifact: music track {tid} is not in lib/music-library.ts")
    music[tid] = {"n": label, "u": u.group(1)}
html = html.replace(m.group(0), "const MUSIC=" + json.dumps(music) + ";\n", 1)

# The leaders' spoken lines live only in the artifact's store: keep the table's shape, drop the dead URLs.
html, n_lines = re.subn(r'\{u:"/_blob/[0-9a-f]+",t:', '{u:"",t:', html)
sub("const L=(LINES[leader]||{})[k]; if(!L||!sfxOn||!unlocked) return;", "const L=(LINES[leader]||{})[k]; if(!L||!L.u||!sfxOn||!unlocked) return;")

left = sorted(set(re.findall(r"/_blob/[0-9a-f]+", html)))
if left:
    sys.exit(f"import_artifact: {len(left)} artifact-store URLs are still in the page: {left[:4]}")

# ---------------------------------------------------------------- head: silence first, three.js local
sub("<!doctype html><html><head>", '<!doctype html><html><head><script src="/test-copy-silence.js"></script>')
three = ROOT / "node_modules" / "three" / "build" / "three.module.min.js"
txt = three.read_text(encoding="utf8")
if re.search(r"""from\s*['"]\./""", txt):
    sys.exit("import_artifact: this three.js build imports a sibling file; copy that too")
shutil.copyfile(three, OUT / "vendor" / "three.module.min.js")
rsub(r'<script type="importmap">\{"imports":\{"three":"[^"]+"\}\}</script>', '<script type="importmap">{"imports":{"three":"./vendor/three.module.min.js"}}</script>')

# ---------------------------------------------------------------- GAME MODE
import runpy
for old, new, *rest in runpy.run_path(str(Path(__file__).with_name("game_mode.py")))["PATCHES"]:
    sub(old, new, rest[0] if rest else 1)

(OUT / "index.html").write_text(html, encoding="utf8")
size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
print(f"wrote {OUT.relative_to(ROOT)}: index.html {len(html)//1024} KB, {sum(1 for _ in OUT.rglob('*.*'))} files, {size/1e6:.1f} MB; {n_lines} spoken lines left silent")
