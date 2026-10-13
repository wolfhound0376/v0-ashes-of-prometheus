"""Build public/velkynvelve-walk/index.html (the painted Velkynvelve map at /velkynvelve).

Python only (Sam's machine has no Node). From the repo root:  python scripts/velkynvelve-walk/build_walk.py

Inputs, all in this folder:
  template.html  the page (HTML + JS); placeholders /*__SPEC__*/ /*__FX__*/ /*__SPRITES__*/
  spec.json      per-plate walk floors, obstacles, exits, hazards, NPC spots (built by spec.py)
  story.json     who stands where, scripted crossings, chains; bark lines are placeholders
  fx.json        lamp/crystal glows and waterfall masks per plate
Sprite metadata is read from public/sprites/<slug>/sprite.json and inlined; the sheets are loaded at
runtime from /sprites. Plates, masks and music live in Supabase storage vtt-assets/scenes/velkynvelve/walk/.
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
SPR = os.path.join(ROOT, "public", "sprites")
P = ['kenta', 'samson', 'scott', 'freia']
N = ['ront', 'eldeth', 'derendil', 'sarith', 'buppido', 'jimjar', 'topsy', 'turvy', 'shuushar', 'stool', 'jorlan', 'drow-guard-male', 'drow-guard-female']
F = ['quaggoth', 'giant-spider']

meta = {}
for i in P + N + F:
    sh = ['idle', 'walk'] + (['attack', 'sit', 'eat', 'sleep', 'hurt', 'dead', 'cast'] if i in P else []) + (['attack', 'dodge', 'hurt', 'dead'] if i in F else [])
    if i in ['ront', 'eldeth', 'derendil', 'sarith']: sh += ['sit', 'eat', 'sleep']
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
story = json.load(open(os.path.join(HERE, 'story.json')))
for k, v in story.items():
    if k.startswith('_'): continue
    n = spec[k]; n['npcs'] = n.get('npcs', []) + v.get('npcs', [])
    for f in ('chains', 'hostileLabel', 'interact', 'arrivals', 'wards'):
        if f in v: n[f] = v[f]
    n['cross'] = v.get('cross', {})
# exits that lead to several places become one strip per destination, split across the way out
for k, n in spec.items():
    out = []
    for z in n['zones']:
        if len(z['to']) <= 1 or z.get('kind') == 'gate': out.append(z); continue
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
        elif z['to'] and str(z['to'][0]) in n.get('cross', {}): z['cross'] = n['cross'][str(z['to'][0])]

fx = open(os.path.join(HERE, 'fx.json')).read()
t = open(os.path.join(HERE, 'template.html')).read()
t = (t.replace('/*__SPEC__*/', json.dumps(spec, separators=(',', ':'))).replace('/*__FX__*/', fx)
      .replace('/*__SPRITES__*/', json.dumps(meta, separators=(',', ':')))
      .replace('/*__VOICE_BANK__*/{}', open(os.path.join(HERE, 'voice-bank.json')).read())
      .replace('const APP = /*__APP__*/false;', 'const APP = true;').replace('<title>Velkynvelve Walk</title>', '<title>Velkynvelve</title>'))
out = os.path.join(ROOT, 'public', 'velkynvelve-walk'); os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(t)
print('wrote', os.path.join(out, 'index.html'), len(t), 'bytes')
