# forage-anim.py — how the per-character forage strips were made (2026-09-30). PixelLab "picking-up" template,
# back views; frames fitted to each repo sheet, framed by the character's own idle; see docs/design/claude_Cave_POV.md.
# pull.py <slug> <get_character dump> : download the "forage" (picking-up) NE/N/NW frames, fit them to the repo sheet
import sys, re, io, urllib.request, json
from PIL import Image
slug, dump = sys.argv[1], sys.argv[2]
txt = open(dump).read().split("\n")
REPO = "/home/claude/wt-cave-pov/public/sprites"
# the animation block: header line containing 'forage' or 'picking-up', then direction lines
start = next(i for i, l in enumerate(txt) if re.match(r"\s+(forage|picking-up) —", l))
dirs = {}
for l in txt[start + 1:]:
    m = re.match(r"\s{4}([a-z-]+): (https.*)", l)
    if not m: break
    dirs[m.group(1)] = [u.strip() for u in m.group(2).split(",")]
print(slug, {k: len(v) for k, v in dirs.items()})
import subprocess
get = lambda u: Image.open(io.BytesIO(subprocess.run(["curl","-sS","--fail",u],capture_output=True,check=True).stdout)).convert("RGBA")
# fit: compare the PixelLab north rotation with the repo's idle sheet north row, frame 0
rot = re.search(r"north: (https\S+/rotations/north\.png\S*)", "\n".join(txt)).group(1)
R = get(rot); rb = R.getbbox()
c = 128; idle = Image.open(f"{REPO}/{slug}/idle.png").convert("RGBA").crop((0, 4 * c, c, 5 * c)); ib = idle.getbbox()
s = (ib[3] - ib[1]) / (rb[3] - rb[1]); cx_r = (rb[0] + rb[2]) / 2; cx_i = (ib[0] + ib[2]) / 2
print("scale", round(s, 3), "raw", rb, "repo", ib)
def fit(im):
    w, h = im.size; im2 = im.resize((max(1, round(w * s)), max(1, round(h * s))), Image.NEAREST)
    out = Image.new("RGBA", (c, c)); dx = round(cx_i - cx_r * s); dy = round(ib[3] - rb[3] * s); out.alpha_composite(im2, (dx, dy)) if dx >= 0 and dy >= 0 else out.paste(im2, (dx, dy), im2); return out
rows = ["north-east", "north", "north-west"]
n = min(len(dirs[r]) for r in rows)
strip = Image.new("RGBA", (c * n, c * 3))
for j, r in enumerate(rows):
    for i, u in enumerate(dirs[r][:n]): strip.alpha_composite(fit(get(u)), (i * c, j * c))
strip.save(f"/tmp/claude-0/forage/{slug}.png"); print("frames", n)
