"""Sam's blood pack -> the Underwalk's blood sprites (public/vfx/lab/blood*.webp). Python + Pillow + numpy + scipy.
   python scripts/blood-pack/build.py"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from px import *
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'vfx', 'lab')
S = {}
S['bloodBurst'] = pixelize(crop('burst'), 44, hi=.05)
S['bloodBurstBig'] = pixelize(crop('burst'), 60, hi=.05)
S['bloodSpray'] = pixelize(crop('streak'), 68, rot=-48, hi=.05)          # lies along +x, the wound end on the left
for i,k in enumerate(['drop1','drop2','drop3','drop4']):
    S[f'bloodDrop{i+1}'] = pixelize(crop(k), 6, hi=.12, outline=False)     # hangs point-up: turned to its flight
for i,r in enumerate([0, 70, 150, 230]):
    S[f'bloodSplat{i+1}'] = pixelize(crop('burst'), 42, squash=.52, rot=r, pal=FLOOR, hi=.03, thr=.4)
S['bloodSmear'] = pixelize(crop('streak'), 74, squash=.5, rot=-48, pal=FLOOR, hi=.03, thr=.35)
for i in range(3): S[f'bloodPool{i+1}'] = pool(86, seed=i + 1)
for i,(k,r) in enumerate([('orb1',0),('drop2',90),('orb2',40)]):
    S[f'bloodFleck{i+1}'] = pixelize(crop(k), 7, squash=.6, rot=r, pal=FLOOR, hi=0, outline=False, thr=.3)
S = {k: (despeckle(v) if k.startswith(('bloodBurst','bloodSpray','bloodSplat','bloodSmear')) else v) for k, v in S.items()}
for k,v in S.items(): v.save(os.path.join(OUT, f'{k}.webp'), lossless=True)
print({k: v.size for k,v in S.items()})
