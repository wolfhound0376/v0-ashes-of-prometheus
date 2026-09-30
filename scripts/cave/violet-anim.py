# Violet fungus: 12-frame writhing loop. Cap stays nearly still; tentacles sway more the further they are from the cap.
from PIL import Image, ImageEnhance
import numpy as np, math
src=Image.open('/tmp/claude-0/fungi-violet.png').convert('RGBA'); src=src.crop(src.getbbox())
W,H=src.size; pad=6; S=max(W,H)+pad*2
base=Image.new('RGBA',(S,S)); base.alpha_composite(src,((S-W)//2,S-H)); A=np.array(base)
cx,cy=S/2,(S-H)+13  # cap centre
N=12; yy,xx=np.mgrid[0:S,0:S].astype(float)
d=np.hypot((xx-cx)/1.1,(yy-cy)); amp=np.clip((d-11)/22,0,1)**1.3*2.3
frames=[];glows=[]
for f in range(N):
    ph=2*math.pi*f/N
    ang=np.arctan2(yy-cy,xx-cx)
    dx=amp*np.sin(ph+d*.17+ang*1.0)
    dy=amp*.6*np.cos(ph+d*.15-ang*.8)
    sx=np.clip(np.round(xx-dx),0,S-1).astype(int); sy=np.clip(np.round(yy-dy),0,S-1).astype(int)
    out=A[sy,sx].copy()
    capbob=round(math.sin(ph)*.6)
    im=Image.fromarray(out)
    if capbob: im=im.transform(im.size,Image.AFFINE,(1,0,0,0,1,-capbob),Image.NEAREST)
    frames.append(im)
    g=np.array(im).astype(float); a=g[...,3:4]>0
    g[...,0]=np.where(a[...,0],np.minimum(255,g[...,0]*1.5+60),g[...,0]); g[...,1]=np.where(a[...,0],np.minimum(255,g[...,1]*1.25+40),g[...,1]); g[...,2]=np.where(a[...,0],np.minimum(255,g[...,2]*1.5+90),g[...,2])
    glows.append(Image.fromarray(g.astype(np.uint8)))
for name,fr in [('idle',frames),('glow',glows)]:
    strip=Image.new('RGBA',(S*N,S))
    for i,im in enumerate(fr): strip.alpha_composite(im,(i*S,0))
    strip.save(f'/tmp/claude-0/violet_{name}.png')
prev=Image.new('RGBA',(S*6*4,S*4),(30,36,50,255))
for i in range(6): prev.alpha_composite(frames[i*2].resize((S*4,S*4),Image.NEAREST),(i*S*4,0))
prev.save('/tmp/claude-0/violet_prev.png'); print(S)
