"""Build public/velkynvelve-walk/index.html (the painted Velkynvelve map at /velkynvelve).

Python only (Sam's machine has no Node). From the repo root:  python scripts/velkynvelve-walk/build_walk.py

Inputs, all in this folder:
  template.html  the page (HTML + JS); placeholders /*__SPEC__*/ /*__FX__*/ /*__SPRITES__*/ /*__KIT__*/
                 (/*__KIT__*/ is filled from the BOARD's spell tables -- see build_kit_tables)
                 /*__RAGE__*/ is lib/rage.mjs pasted in whole (see rage_rules): Rage and Wounded Fury have ONE copy
                 /*__MARTIAL__*/ is lib/martial-arts-rules.mjs pasted in whole (see martial_rules): which hit spark a strike plays
  spec.json      per-plate walk floors, obstacles, exits, hazards, NPC spots, painted masks (built by spec.py from spec.py + masks.json); _handoffs = the cavern
                 plates a 'leave' exit hands the party to, _layout = Sam's editor board (not used by the page)
  story.json     who stands where, scripted crossings, chains; bark lines are placeholders
  fx.json        lamp/crystal glows and waterfall masks per plate
Sprite metadata is read from public/sprites/<slug>/sprite.json and inlined; the sheets are loaded at
runtime from /sprites. Plates, masks and music live in Supabase storage vtt-assets/scenes/velkynvelve/walk/.
"""
import json, os
import re
import numpy as np
from PIL import Image

# ── the board's spell tables, inherited rather than hand-copied ──────────────
#
# WHY THIS EXISTS. The walk used to carry its own transcription of the board's
# TYPES table. Nothing kept the two in step, so every VFX change on the board
# had to be copied across by hand and usually was not. On 2026-10-14 the board
# replaced Ray of Frost's art and DELETED the old frostGather sheet; the walk
# still asked for it, so it was requesting a file that no longer existed. That
# is the bug this closes: the walk now reads the board's tables at build time.
#
# WHAT IT IS NOT. This is not a copy -- the walk is a different surface with a
# different camera and some deliberate choices of its own. Those live in
# WALK_DIVERGES below, each with the reason it differs. Everything NOT listed
# there follows the board automatically.

KIT_TS = "components/tactical/spell-vfx-kit.ts"


def _ts_block(src, decl):
    """The balanced {...} literal that follows `decl` in the TypeScript."""
    i = src.index(decl)
    i = src.index("{", i)
    depth = 0
    for j in range(i, len(src)):
        if src[j] == "{":
            depth += 1
        elif src[j] == "}":
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
    raise ValueError("unbalanced block after " + decl)


def _ts_to_obj(js):
    """A TS object literal -> Python. Restricted syntax, so this is enough:
    strings are copied verbatim, comments dropped, 0xRRGGBB made decimal, bare
    keys quoted, .5 made 0.5, trailing commas and `undefined` removed."""
    out, i, n = [], 0, len(js)
    while i < n:
        c = js[i]
        if c == '"':
            j = i + 1
            while js[j] != '"' or js[j - 1] == "\\":
                j += 1
            out.append(js[i:j + 1]); i = j + 1; continue
        if js.startswith("//", i):
            i = js.find("\n", i); i = n if i < 0 else i; continue
        if js.startswith("/*", i):
            i = js.find("*/", i) + 2; continue
        out.append(c); i += 1
    s = "".join(out)
    s = re.sub(r"0x([0-9a-fA-F]+)", lambda m: str(int(m.group(1), 16)), s)
    s = re.sub(r'([{,]\s*)([A-Za-z_$][\w$]*)\s*:', r'\1"\2":', s)
    s = re.sub(r"(:\s*)\.(\d)", r"\g<1>0.\2", s)
    s = re.sub(r",(\s*[}\]])", r"\1", s)
    s = re.sub(r":\s*undefined", ": null", s)
    return json.loads(s)


# The walk's own decisions. Each key REPLACES that type's generated entry, and
# each one says why it is not simply following the board.
WALK_DIVERGES = {
    # The board lands a golden orb (healingShimmer) above the target. On the
    # plate that reads as a ball over the head, and a ball is the thing Sam
    # keeps saying healing is not. The walk keeps the board's golden
    # luminescence around the body and its motes, and leaves the orb out.
    # Then Sam sent his own healing sheet (2026-10-14): a ring of light opening
    # at the ally's feet and spiralling up through them (vfx/healRise). It rises
    # out of the floor, so it is not punched in like an impact, and it is lifted
    # down so the ring sits on the floor. It replaces the pixel glow ring, which
    # was drawn on top of it and hid it.
    "healing": {"route": "sky", "impact": "healRise", "impactScale": 1.45,
                "impactLift": -0.4, "noPunch": True,
                "burst": {"tint": "#ffe6a0", "sparks": 10, "ring": False,
                          "power": 0.6, "rise": 1.2, "noFlash": True}},
}
# Per-spell additions on top of the board's DELIVERY_BY_SPELL, merged into it.
WALK_BY_SPELL = {
    # SRD 5.1: "You create a ghostly, skeletal hand in the space of a creature
    # ... Until then [the start of your next turn], the hand clings to the
    # target." Sam's hand sheet (vfx/chillHand, 2026-10-14) forms on the target
    # and grips; `cling` keeps its last 6 frames cycling until the caster's next
    # turn starts. The board already delivers it impact-only; this adds the art.
    "Chill Touch": {"impact": "chillHand", "impactScale": 0.8, "noPunch": True, "cling": 6},
    # SRD 5.1: "You point at one creature you can see within range, and the sound of
    # a dolorous bell fills the air around it for a moment." Nothing crosses the room:
    # Sam's bell (vfx/tollBell, 2026-10-14) forms over the target, tolls (the ring on
    # the floor) and shatters into shards.
    "Toll the Dead": {"route": "sky", "impact": "tollBell", "impactScale": 1.05,
                      "impactLift": -0.15, "noPunch": True,
                      # the bell is the moment; no white flash over it
                      "burst": {"tint": "#9c6bff", "sparks": 12, "ring": False, "noFlash": True}},
    # SRD 5.2.1 Poison Spray (Kingasaur's cantrip, Sam 2026-10-25): a cloud of poisonous vapour released at one
    # creature. A SPRAY, not a thrown glob, so it rides the beam route: vfx/pxPoisonSpray (draw_pixel_vfx.py) is
    # stretched from the hand to the target, narrow at the fingers and fanning wide where it breaks on them. The
    # poison type's own impact (poisonCloud) and burst still land on a hit; on a miss the target ducks it.
    "Poison Spray": {"route": "beam", "travel": "pxPoisonSpray", "gather": None},
}
# Chromatic Orb (Sam's pack, 2026-10-25, scripts/vfx/bake_chromatic_orb.py): every element is thrown as its own
# orb and bursts as its own impact, whatever the damage type's default delivery is (cold is a beam, thunder radiates
# -- not for this spell: SRD "You hurl a 4-inch-diameter sphere of energy"). No `gather`: the orb is already in the
# caster's hand from the element picker, and the throw takes it from there.
for _el in ("acid", "cold", "fire", "lightning", "poison", "thunder"):
    _k = _el.capitalize()
    WALK_BY_SPELL[f"Chromatic Orb ({_el})"] = {"route": "ball", "motion": "dart", "speed": 16, "travel": f"orb{_k}Fly",
                                               "impact": f"orb{_k}Hit", "impactScale": 1.05, "gather": None}
# Per-type scale tweaks for the walk's camera, which sits closer than the
# board's. Applied on top of whatever the board says.
WALK_SCALE = {"fire": 2.2}
# Fields the walk's renderer has no use for.
WALK_DROPS = ("rune", "decal", "tint", "charge", "impactScale")


def _adapt(spec):
    """One board TypeSpec -> the shape the walk's renderer reads."""
    out = {}
    for k, v in spec.items():
        if k in WALK_DROPS or v is None:
            continue
        if k == "route":
            # the walk's renderer spells this one differently
            out[k] = "impact" if v == "impact-only" else v
        elif k == "burst":
            b = dict(v)
            b["tint"] = "#%06x" % b["tint"]          # the walk takes CSS colours
            out[k] = b
        elif k == "aftermath":
            a = dict(v)
            a["hold"] = int(a["hold"] * 1000)        # the walk counts in ms
            out[k] = a
        else:
            out[k] = v
    return out


def rage_rules(root):
    """lib/rage.mjs, pasted into the page whole minus its `export` keywords. The map then reads the SAME
    functions lib/rage.test.ts tests (Rage's damage bonus, uses, end-of-turn test; Wounded Fury's
    threshold; the tint), so there is no hand-typed copy in the page to drift. Plain JS on purpose:
    this build runs on Sam's machine, where there is no Node to compile TypeScript."""
    src = open(os.path.join(root, 'lib', 'rage.mjs'), encoding='utf-8').read()
    return re.sub(r'^export ', '', src, flags=re.M)


def area_cloud_rules(root):
    """lib/area-cloud.mjs, pasted into the page whole minus its `export` keywords -- the same pattern as
    rage_rules. The map draws Sam's skull cloud with the SAME timing and layout lib/area-cloud.test.ts tests
    (the grow played once, the hold ping-ponged, the puffs that fill the area)."""
    src = open(os.path.join(root, 'lib', 'area-cloud.mjs'), encoding='utf-8').read()
    return re.sub(r'^export ', '', src, flags=re.M)


def poison_cloud_rules(root):
    """lib/poison-clouds.mjs (Stinking Cloud and Cloudkill, SRD 5.1), pasted whole minus `export`, like rage_rules."""
    src = open(os.path.join(root, 'lib', 'poison-clouds.mjs'), encoding='utf-8').read()
    return re.sub(r'^export ', '', src, flags=re.M)


def martial_rules(root):
    """lib/martial-arts-rules.mjs, pasted into the page whole minus its `export` keywords, exactly as
    rage_rules does. The map picks a strike's hit spark (punch, kick, uppercut, sweep...) with the SAME
    functions lib/martial-arts.test.ts tests and the board reads, so there is no hand-typed strike
    table in the page to drift from the board's."""
    src = open(os.path.join(root, 'lib', 'martial-arts-rules.mjs'), encoding='utf-8').read()
    return re.sub(r'^export ', '', src, flags=re.M)


def surgeon_rules(root):
    """lib/drow-surgeon.mjs (The Drow Surgeon, Sam's homebrew for the pen gate), pasted whole minus `export`, like
    rage_rules. The map, app/api/drow-surgeon and lib/drow-surgeon.test.ts read the SAME table, bolt, potion and lines."""
    src = open(os.path.join(root, 'lib', 'drow-surgeon.mjs'), encoding='utf-8').read()
    return re.sub(r'^export ', '', src, flags=re.M)


def build_kit_tables(root):
    src = open(os.path.join(root, KIT_TS), encoding="utf-8").read()
    types = _ts_to_obj(_ts_block(src, "const TYPES"))
    by_spell = _ts_to_obj(_ts_block(src, "const DELIVERY_BY_SPELL"))

    kit = {}
    for name, spec in types.items():
        entry = WALK_DIVERGES.get(name) or _adapt(spec)
        if name in WALK_SCALE:
            entry = dict(entry, impactScale=WALK_SCALE[name])
        kit[name] = entry

    # DELIVERY_BY_SPELL is keyed lower-case on the board; the walk looks spells
    # up by their display name, so title-case the keys it will be asked for.
    named = {n.title(): _adapt(spec) for n, spec in by_spell.items()}
    for n, extra in WALK_BY_SPELL.items():
        named[n] = dict(named.get(n, {}), **extra)

    # Every sheet named has to exist, or the page silently draws less. This is
    # the check that would have caught the deleted frostGather.
    manifest = json.load(open(os.path.join(root, "public", "vfx", "manifest.json")))
    wanted = set()
    for tbl in (kit, named):
        for spec in tbl.values():
            for k in ("travel", "impact", "gather", "cloud"):
                if spec.get(k):
                    wanted.add(spec[k])
            if spec.get("aftermath"):
                wanted.add(spec["aftermath"]["sheet"])
    missing = sorted(w for w in wanted if w not in manifest)
    if missing:
        raise SystemExit("walk kit names sheets that are not in the manifest: "
                         + ", ".join(missing))

    return ("const KIT = " + json.dumps(kit, indent=2) + ";\n"
            + "const KIT_BY_SPELL = " + json.dumps(named, indent=2) + ";")


HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPR = os.path.join(ROOT, "public", "sprites")
P = ['kenta', 'samson', 'scott', 'freia']
# Heroes made at the Forge, with their own sprite (heroes.json: characters.id -> slug). Baked with the
# premades' sheets; a slug whose folder is not there yet is skipped so the page still builds.
HEROES = {k: v for k, v in json.load(open(os.path.join(HERE, 'heroes.json'))).items() if not k.startswith('_') and os.path.exists(os.path.join(SPR, v, 'sprite.json'))}
P = P + [v for v in HEROES.values() if v not in P]
N = ['ront', 'eldeth', 'derendil', 'sarith', 'buppido', 'jimjar', 'topsy', 'turvy', 'shuushar', 'stool', 'jorlan', 'drow-guard-male', 'drow-guard-female']
# Liana, the drow surgeon (The Drow Surgeon, Sam 2026-10-25): baked once her sheets are in the repo; until then the page
# dresses her in the female guard's sheets (lianaSprite in the template)
if os.path.exists(os.path.join(SPR, 'liana', 'sprite.json')): N.append('liana')
F = ['quaggoth', 'giant-spider', 'ghost-male', 'drow-elite-warrior', 'ilvara', 'shoor', 'asha', 'drow-lizard-rider']   # drow-lizard-rider: the mounted guard on the cliff below the lift (Sam, 2026-10-26); ghost-male: the bhut under Old Thessaly (Sam, 2026-10-24); the officers: Sam's playtest, 2026-10-24 (shoor and asha have idle sheets only)
V = ['giant-rat']  # vermin: set dressing, idle sheet only

meta = {}
for i in P + N + F + V:
    # 'jump' is asked for on both sides now that heroes long-jump too (arcTo/planLeap in the
    # page). A slug whose sprite has no jump.png is filtered out on the next line and falls
    # back to the walk sheet in the air, so asking for it early costs nothing.
    sh = ['idle', 'walk'] + (['attack', 'sit', 'eat', 'sleep', 'hurt', 'dead', 'cast', 'jump', 'shoot'] if i in P else []) + (['attack', 'dodge', 'hurt', 'dead', 'jump', 'rage', 'curse'] if i in F else [])
    # the four allies fight beside the party (Sam, 2026-10-15), so they need their combat sheets too:
    # without 'attack' a swing has no hit frame and the roll never happens
    if i in ['ront', 'eldeth', 'derendil', 'sarith']: sh += ['sit', 'eat', 'sleep', 'attack', 'hurt', 'dead', 'dodge']
    if i == 'scott': sh.append('perform')
    if i in ['jorlan', 'drow-guard-male', 'drow-guard-female']: sh += ['attack', 'dodge', 'hurt', 'dead']
    j = json.load(open(os.path.join(SPR, i, 'sprite.json')))
    sh = [s for s in sh if s in j['animations'] and os.path.exists(os.path.join(SPR, i, s + '.png'))]
    j['animations'] = {k: v for k, v in j['animations'].items() if k in sh}
    # stand sprites on their feet: if the drawn feet sit well above the pivot, move the pivot to them
    cw, ch = j['cell']; A = np.array(Image.open(os.path.join(SPR, i, 'idle.png')).convert('RGBA'))[:, :, 3]; bots = []
    for r in range(8):
        for f in range(A.shape[1] // cw):
            ys = np.where(A[r * ch:(r + 1) * ch, f * cw:(f + 1) * cw].max(1) > 20)[0]
            if len(ys): bots.append(ys.max())
    foot = int(np.median(bots)) + 1
    if j['pivot'][1] - foot > 6: j['pivot'] = [j['pivot'][0], foot]
    meta[i] = {'json': j, 'sheets': sh}

spec = json.load(open(os.path.join(HERE, 'spec.json')))
# beyond the edge (spec.py CAVERNS / LAYOUT): not plates of this page. The hand-offs reach the page as HANDOFFS so a
# 'leave' exit knows where it sends the party; the editor layout stays in spec.json only.
handoffs = spec.pop('_handoffs', {}); spec.pop('_layout', None)
story = json.load(open(os.path.join(HERE, 'story.json')))
for k, v in story.items():
    if k.startswith('_'): continue
    n = spec[k]; n['npcs'] = n.get('npcs', []) + v.get('npcs', [])
    for f in ('chains', 'hostileLabel', 'interact', 'arrivals', 'wards', 'spots', 'props', 'loot', 'lift', 'objects', 'rolls', 'watch', 'decor', 'rest'):
        if f in v: n[f] = v[f]
    n['cross'] = v.get('cross', {})
# exits that lead to several places become one strip per destination, split across the way out
for k, n in spec.items():
    out = []
    for z in n['zones']:
        if len(z['to']) <= 1 or z.get('kind') == 'gate' or z.get('nosplit'): out.append(z); continue
        x0, y0, x1, y1 = z['rect']; m = len(z['to'])
        xs, ys = [], []
        for f in n['floors']:
            if 'poly' in f: xs += [q[0] for q in f['poly']]; ys += [q[1] for q in f['poly']]
            elif 'ellipse' in f: cx, cy, rx, ry = f['ellipse']; xs += [cx - rx, cx + rx]; ys += [cy - ry, cy + ry]
            else: xs += [f['rect'][0], f['rect'][2]]; ys += [f['rect'][1], f['rect'][3]]
        ex = (x0 + x1) / 2 - (min(xs) + max(xs)) / 2; ey = (y0 + y1) / 2 - (min(ys) + max(ys)) / 2
        horiz = abs(ey) > abs(ex)
        if not horiz and (y1 - y0) / m < 60: horiz = True
        if horiz and (x1 - x0) / m < 60: horiz = False
        for i, t in enumerate(z['to']):
            r = [x0 + (x1 - x0) * i / m, y0, x0 + (x1 - x0) * (i + 1) / m, y1] if horiz else [x0, y0 + (y1 - y0) * i / m, x1, y0 + (y1 - y0) * (i + 1) / m]
            out.append(dict(z, rect=[round(c) for c in r], to=[t]))
    n['zones'] = out
    for z in n['zones']:
        if z.get('kind') == 'gate': z['crossBy'] = n.get('cross', {}); z['interact'] = n.get('interact', {}).get('gate')
        elif z.get('nosplit'): z['crossBy'] = n.get('cross', {})
        elif z['to'] and str(z['to'][0]) in n.get('cross', {}): z['cross'] = n['cross'][str(z['to'][0])]

fx = open(os.path.join(HERE, 'fx.json')).read()
t = open(os.path.join(HERE, 'template.html')).read()
t = (t.replace('/*__KIT__*/', build_kit_tables(ROOT)).replace('/*__RAGE__*/', rage_rules(ROOT)).replace('/*__AREA_CLOUD__*/', area_cloud_rules(ROOT)).replace('/*__POISON_CLOUDS__*/', poison_cloud_rules(ROOT))
      .replace('/*__MARTIAL__*/', martial_rules(ROOT)).replace('/*__DROW_SURGEON__*/', surgeon_rules(ROOT))
      .replace('/*__SPEC__*/', json.dumps(spec, separators=(',', ':'))).replace('/*__FX__*/', fx)
      .replace('/*__HANDOFFS__*/{}', json.dumps(handoffs, separators=(',', ':')))
      .replace('/*__SPRITES__*/', json.dumps(meta, separators=(',', ':')))
      .replace('/*__HEROES__*/{}', json.dumps(HEROES, separators=(',', ':')))
      .replace('/*__VOICE_BANK__*/{}', open(os.path.join(HERE, 'voice-bank.json')).read())
      .replace('/*__ITEMS__*/[]', open(os.path.join(HERE, 'items.json')).read())
      .replace('const APP = /*__APP__*/false;', 'const APP = true;').replace('<title>Velkynvelve Walk</title>', '<title>Velkynvelve</title>'))
out = os.path.join(ROOT, 'public', 'velkynvelve-walk'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(t)
print('wrote', os.path.join(out, 'index.html'), len(t), 'bytes')
