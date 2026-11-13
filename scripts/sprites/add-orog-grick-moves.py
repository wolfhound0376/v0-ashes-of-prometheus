import sys, json, glob
from pathlib import Path
from PIL import Image, ImageOps
DIRS = ["south","south-east","east","north-east","north","north-west","west","south-west"]
REPO = Path("/home/claude/v0-ashes-of-prometheus/public/sprites")
def frames(root, anim, d): return [Image.open(f).convert("RGBA") for f in sorted(glob.glob(f"/home/claude/anim/{root}/*/animations/{anim}/{d}/frame_*.png"))]
def cell(im, c=128):
    x=(im.width-c)//2; y=(im.height-c)//2; return im.crop((x,y,x+c,y+c))
def dewhite(im, thr):
    # stray effect strokes are pure white; the figure never is
    px=im.load(); n=0
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a=px[x,y]
            if a and min(r,g,b)>=thr: px[x,y]=(0,0,0,0); n+=1
    return n
def despeck(im):
    # stray sparkles and swoosh arcs float free of the figure: keep the body, drop small detached bits
    import numpy as np
    from scipy import ndimage
    a=np.array(im); lab,n=ndimage.label(a[...,3]>0,structure=np.ones((3,3)))
    if n<2: return 0
    sizes=ndimage.sum(a[...,3]>0,lab,range(1,n+1)); big=sizes.max(); cut=0
    for i,sz in enumerate(sizes,1):
        if sz<big*0.12: a[lab==i]=0; cut+=int(sz)
    im.paste(Image.fromarray(a)); return cut
def build(slug, walk, attack, hit, thr, east_from=None, mirror_west=False):
    man=json.loads((REPO/slug/"sprite.json").read_text()); out={}
    w={d:[cell(f) for f in frames(slug,walk,d)[1:]] for d in DIRS}          # frame 0 is the reference still
    a={d:[cell(f) for f in frames(slug,attack,d)] for d in DIRS}
    if east_from: a["east"]=[cell(f) for f in frames(slug,east_from,"east")]
    if slug=="grick": a["west"][-1]=a["west"][-2].copy()   # the last west frame grew a white swoosh on the tentacle: hold the frame before it
    if mirror_west: a["west"]=[ImageOps.mirror(f) for f in a["east"]]
    cut=0
    for d in DIRS:
        for f in a[d]: cut+=dewhite(f,thr)+despeck(f)
        for f in w[d]: despeck(f)
    for name,by in (("walk",w),("attack",a)):
        n=max(len(v) for v in by.values()); assert all(len(v)==n for v in by.values()),(slug,name,{d:len(v) for d,v in by.items()})
        sh=Image.new("RGBA",(128*n,128*8),(0,0,0,0))
        for r,d in enumerate(DIRS):
            for c,f in enumerate(by[d]): sh.alpha_composite(f,(c*128,r*128))
        sh.save(REPO/slug/f"{name}.png",optimize=True); out[name]=n
    man["animations"]["walk"]={"sheet":"walk.png","frames":out["walk"],"fps":10,"loop":True}
    man["animations"]["attack"]={"sheet":"attack.png","frames":out["attack"],"fps":12,"loop":False,"hit":hit}
    (REPO/slug/"sprite.json").write_text(json.dumps(man,indent=2)+"\n"); print(slug,out,"white px cut:",cut)
build("orog","walk","attack-b",0.8,236,mirror_west=True)
build("grick","walk","attack-b",0.75,243,east_from="attack-east2")
