import os
"""Walk spec for the Velkynvelve exploration proof.
All coordinates are viewer-plate pixels (2400 x 1339). Traced by eye over gridded plates, 2026-10-10.
Rope bridges are the DECK ONLY (Sam, 2026-10-14: "characters shouldn't be on the ropes or in the air"): a sprite's feet
sit where its floor shape says, so a bridge shape that is taller than the planks puts people on the railings or in the drop.
floors: shapes the party may stand on (poly / ellipse / rect).  obstacles: circles/ellipses inside floors that block.
zones: exit hotspots. 'to' = registered V5 connections reachable from that spot (a list gives the player a choice).
'kind': walk (default) | water (9<->14 descent) | gate (locked unless the DM opens it) | leave (leaves Velkynvelve, not wired).
Which painted way-out maps to which neighbour is an APPROXIMATE call where the painting doesn't say; adjust freely."""
import json

def P(*xy):  # flatten pairs
    return [list(p) for p in xy]

NODES = {
 1: dict(slug="node-01-southern-watch-post", name="Southern Watch Post", scale=1.0,
   floors=[dict(poly=P((1100,140),(1300,140),(1320,470),(1380,500),(1640,520),(1860,580),(1960,690),(1880,840),(1660,860),(1440,940),(1400,1000),(1380,1339),(1020,1339),(1000,1000),(960,940),(760,860),(540,820),(460,690),(560,600),(780,580),(880,520),(1080,470)))],
   obstacles=[],
   zones=[dict(rect=[1110,140,1290,330], to=[2], label="Stair up into the outpost"),
          dict(rect=[1030,1230,1370,1339], to=[], kind="leave", label="South passage (leaves Velkynvelve)")]),
 2: dict(slug="node-02-barracks", name="Barracks", scale=1.05,
   floors=[dict(poly=P((840,720),(1000,700),(1090,880),(1320,890),(1400,940),(1320,1040),(1200,1120),(1280,1220),(1120,1339),(800,1339),(760,1200),(800,1080),(720,1000),(600,940),(760,840)))],
   obstacles=[],
   zones=[dict(rect=[1090,840,1310,905], to=[3,4], label="Timber stair to the upper walkways"),
          dict(rect=[800,1290,1120,1339], to=[1], label="Passage out of the barracks")]),
 3: dict(slug="node-03-main-hall", name="Main Hall", scale=0.9,
   floors=[dict(poly=P((760,560),(1000,510),(1400,500),(1700,540),(1800,600),(1780,720),(1880,800),(1840,940),(1740,1060),(1600,1160),(1400,1200),(1200,1230),(940,1180),(660,1040),(520,900),(500,760),(600,660)))],
   obstacles=[dict(cx=890,cy=670,rx=120,ry=70),dict(cx=1350,cy=660,rx=120,ry=70),dict(cx=850,cy=890,rx=120,ry=70),dict(cx=1350,cy=890,rx=120,ry=70),dict(cx=1500,cy=470,rx=90,ry=50)],
   zones=[dict(rect=[490,730,590,920], to=[2], label="Rope walkway west"),
          dict(rect=[1790,660,1900,960], to=[8], label="Walkway east"),
          dict(rect=[600,560,720,690], to=[5], label="Passage to the lift")]),
 4: dict(slug="node-04-elite-barracks", name="Elite Barracks", scale=0.85,
   floors=[dict(ellipse=[670,610,370,165]),dict(ellipse=[1730,610,370,165]),dict(rect=[1030,570,1370,660])],
   obstacles=[dict(cx=680,cy=560,rx=55,ry=40),dict(cx=1730,cy=560,rx=55,ry=40)],
   zones=[dict(rect=[630,740,730,790], to=[2], label="Ladder down (west tower)"),
          dict(rect=[1690,740,1790,790], to=[8], label="Ladder down (east tower)")]),
 5: dict(slug="node-05-lift", name="Lift", scale=0.95,
   floors=[dict(poly=P((740,640),(960,580),(1280,600),(1480,640),(1520,720),(1490,940),(1440,1040),(1200,1120),(940,1120),(700,1040),(640,940),(660,820),(700,740))),dict(rect=[160,750,720,860])],
   obstacles=[dict(cx=1140,cy=690,rx=150,ry=80)],
   zones=[dict(rect=[150,740,260,870], to=[3], label="Walkway to the main hall"),
          dict(rect=[1440,820,1530,960], to=[], kind="leave", label="The lift basket: DC 18 Strength to crank, 4 rounds to the cavern floor (leaves Velkynvelve)")]),
 6: dict(slug="node-06-shrine", name="Shrine to Lolth", scale=1.0,
   floors=[dict(ellipse=[1200,750,620,250]),dict(rect=[1010,980,1390,1339]),dict(rect=[400,700,620,775]),dict(rect=[1800,700,1990,785])],
   obstacles=[dict(cx=1200,cy=665,rx=200,ry=95),dict(cx=780,cy=665,rx=60,ry=35),dict(cx=1610,cy=665,rx=60,ry=35)],
   zones=[dict(rect=[1020,1260,1380,1339], to=[7], label="Stair down the priestess tower"),
          dict(rect=[420,700,500,775], to=[10], label="Rope bridge west")],
   hazard=dict(poly=P((900,500),(1500,500),(1520,560),(880,560)), kind="ambush", foes=["giant-spider"], label="Something shifts among the cushions")),
 7: dict(slug="node-07-ilvara-quarters", name="Ilvara's Quarters", scale=1.0,
   floors=[dict(poly=P((660,660),(840,480),(1120,430),(1400,460),(1680,480),(1800,600),(1860,760),(1800,880),(1680,960),(1400,1000),(1120,1000),(840,940),(640,820))),dict(rect=[520,760,680,900])],
   obstacles=[dict(cx=920,cy=600,rx=200,ry=110),dict(cx=1080,cy=770,rx=140,ry=55),dict(cx=1640,cy=550,rx=140,ry=75),dict(cx=1520,cy=865,rx=130,ry=60)],
   zones=[dict(rect=[1130,425,1250,500], to=[6], label="Hatch up to the shrine"),
          dict(rect=[1120,960,1360,1010], to=[8], label="Stair down to Shoor's chamber"),
          dict(rect=[520,750,600,910], to=[10], label="Rope bridge west")]),
 8: dict(slug="node-08-shoor-quarters", name="Shoor's Quarters", scale=1.0,
   floors=[dict(poly=P((760,480),(920,380),(1120,420),(1300,360),(1520,400),(1660,520),(1720,640),(1700,800),(1560,900),(1320,940),(1080,940),(860,880),(740,760),(720,600))),dict(rect=[1080,900,1300,1000])],
   obstacles=[dict(cx=1390,cy=710,rx=105,ry=60),dict(cx=1400,cy=410,rx=110,ry=55)],
   zones=[dict(rect=[1110,330,1250,420], to=[7], label="Ladder up to Ilvara's quarters"),
          dict(rect=[700,690,790,860], to=[3,4], label="Rope bridge west"),
          dict(rect=[1080,950,1300,1000], to=[9], label="Stair down toward the waterfall")]),
 9: dict(slug="node-09-waterfall", name="Waterfall", scale=0.85,
   floors=[dict(poly=P((320,660),(520,580),(800,580),(880,660),(880,800),(760,840),(500,840),(280,820),(240,740))),dict(poly=P((880,705),(1000,740),(1200,770),(1400,740),(1530,705),(1530,745),(1400,790),(1200,815),(1000,790),(880,745))),dict(poly=P((1540,640),(1760,600),(2000,680),(2120,800),(2000,860),(1720,860),(1560,800)))],
   obstacles=[],
   zones=[dict(rect=[240,790,420,870], to=[8], label="Rope bridge down-left"),
          dict(rect=[1990,800,2140,900], to=[10], label="Rope bridge down-right"),
          dict(rect=[1100,760,1320,805], to=[14], kind="water", label="Drop into the waterfall: you land in the pool for no damage")]),
 10: dict(slug="node-10-guard-tower", name="Guard Tower", scale=0.9,
   floors=[dict(poly=P((1060,700),(1240,640),(1600,660),(1860,680),(1920,800),(1900,940),(1760,1020),(1400,1040),(1120,980),(1040,860))),dict(poly=P((320,840),(1050,895),(1050,950),(320,905))),dict(rect=[0,720,330,950]),dict(poly=P((1900,875),(2400,810),(2400,870),(1900,935)))],
   obstacles=[dict(cx=1480,cy=880,rx=140,ry=60),dict(cx=1780,cy=870,rx=60,ry=40)],
   zones=[dict(rect=[0,720,110,950], to=[6,7,9], label="Ledge west, toward the priestess tower and the falls"),
          dict(rect=[2300,800,2400,875], to=[11], label="Rope bridge east to the slave pen")]),
 11: dict(slug="node-11-slave-pen", name="Slave Pen", scale=1.25,
   floors=[dict(poly=P((960,740),(1120,700),(1400,560),(1700,500),(2000,480),(2200,560),(2300,700),(2360,940),(2300,1200),(2200,1339),(900,1339),(760,1200),(620,1000),(640,900),(800,860),(920,780)))],
   obstacles=[],  # table and stool removed from the plate (take 35)
   zones=[dict(rect=[730,790,915,940], to=[10,12], kind="gate", label="The pen gate: heavy iron bolted into the stone. Locked: DC 20 to pick or force (OotA p.18)")],
   npcs=[dict(id="ront",x=1700,y=760,face=2,talk=False,barks=["Ront mutters something about orc blood and drow throats."]),
         dict(id="eldeth",x=1300,y=1000,face=6,talk=True,talkLine="Eldeth Feldrun catches your eye. She wants a word."),
         dict(id="derendil",x=2050,y=900,face=2,talk=False,barks=["Derendil reminds everyone, again, that he is a prince of Nelrindenvane."]),
         dict(id="sarith",x=1500,y=1220,face=4,talk=False,barks=["Sarith stares at nothing and does not answer."]),
         dict(id="buppido",x=1100,y=1180,face=5,talk=False,barks=["Buppido hums to himself, smiling too much."]),
         dict(id="jimjar",x=1840,y=1130,face=3,talk=False,barks=["Jimjar offers odds on which of you the drow will feed to the spiders first."]),
         dict(id="topsy",x=1980,y=1220,face=2,talk=False,barks=["The twins whisper to each other, then go quiet when you look over."]),
         dict(id="turvy",x=2050,y=1190,face=2,talk=False,barks=["Turvy nudges Topsy and points at the gate."]),
         dict(id="shuushar",x=1300,y=780,face=0,talk=False,barks=["Shuushar stands very still, breathing slowly, as calm as deep water."]),
         dict(id="stool",x=1640,y=1060,face=4,talk=False,barks=["Stool's cap sways. A faint, friendly haze of spores drifts your way."])]),
 12: dict(slug="node-12-quaggoth-den", name="Quaggoth Den", scale=0.75,
   floors=[dict(poly=P((520,460),(960,300),(1280,240),(1720,280),(2000,400),(2200,660),(2120,1040),(1800,1200),(1240,1180),(800,1120),(320,1000),(180,840),(280,600))),dict(rect=[1260,0,1440,280]),dict(rect=[880,1140,1200,1339])],
   obstacles=[dict(cx=x*2,cy=y*2,rx=95,ry=55) for (x,y) in [(350,270),(510,210),(630,260),(770,205),(880,265),(330,350),(500,320),(710,330),(935,350),(560,425),(770,410),(330,465),(960,440),(690,505),(930,570)]],
   zones=[dict(rect=[880,1260,1200,1339], to=[11], label="Stone steps up toward the slave pen"),
          dict(rect=[1260,0,1440,120], to=[13], label="Perimeter walkway north to the watch post")],
   hazard=dict(poly=P((620,500),(1900,440),(2040,700),(1880,1080),(720,1060),(480,800)), kind="ambush", foes=["quaggoth","quaggoth","quaggoth"], label="The quaggoths rise from their nests. You are not drow.")),
 13: dict(slug="node-13-northern-watch-post", name="Northern Watch Post", scale=1.0,
   floors=[dict(poly=P((540,720),(840,700),(1040,660),(1400,660),(1520,720),(1760,700),(1920,740),(1860,840),(1720,900),(1400,940),(1380,1020),(1320,1080),(1320,1339),(1080,1339),(1060,1080),(1000,1000),(960,940),(660,940),(520,840)))],
   obstacles=[dict(cx=1540,cy=800,rx=120,ry=60),dict(cx=840,cy=740,rx=35,ry=25)],
   zones=[dict(rect=[1080,1260,1320,1339], to=[12], label="Walkway down to the den perimeter"),
          dict(rect=[1080,640,1320,700], to=[], kind="leave", label="North tunnel (leaves Velkynvelve). Two sentries, passive Perception 12, and a warning horn.")]),
 14: dict(slug="node-14-pool-river", name="Pool / Underground River", scale=0.9,
   floors=[dict(poly=P((300,840),(640,790),(940,820),(1120,880),(1400,860),(1520,940),(1640,1120),(1760,1280),(1760,1339),(400,1339),(300,1120))),dict(poly=P((1640,660),(1900,580),(2120,640),(2200,800),(2080,940),(1800,940),(1600,860))),dict(poly=P((1400,840),(1600,800),(1640,920),(1520,960)))],
   obstacles=[],
   zones=[dict(rect=[800,790,1120,860], to=[9], kind="water", label="Climb the wet rock beside the fall (disadvantage on the climb)"),
          dict(rect=[2140,660,2240,900], to=[], kind="leave", label="The underground river runs on toward the Darklake (leaves Velkynvelve)")]),
}

# sanity: every registered connection has a zone on both sides
REG = {1:[2],2:[1,3,4],3:[2,5,8],4:[2,8],5:[3],6:[7,10],7:[6,8,10],8:[3,4,7,9],9:[8,10,14],10:[6,7,9,11],11:[10,12],12:[11,13],13:[12],14:[9]}
for n, node in NODES.items():
    reach = sorted({t for z in node['zones'] for t in z['to']})
    assert reach == sorted(REG[n]), (n, reach, REG[n])
    for t in REG[n]:
        assert n in REG[t], (n, t)
print("all", sum(len(v) for v in REG.values()) // 2, "connections have zones on both sides")
json.dump({str(k): v for k, v in NODES.items()}, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'spec.json'), 'w'), separators=(',', ':'))
