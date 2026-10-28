import os
"""Walk spec for the Velkynvelve exploration proof.
All coordinates are viewer-plate pixels (2400 x 1339). Traced by eye over gridded plates, 2026-10-10.
Rope bridges are the DECK ONLY (Sam, 2026-10-14: "characters shouldn't be on the ropes or in the air"): a sprite's feet
sit where its floor shape says, so a bridge shape that is taller than the planks puts people on the railings or in the drop.
floors: shapes the party may stand on (poly / ellipse / rect).  obstacles: circles/ellipses inside floors that block.
zones: exit hotspots. 'to' = registered V5 connections reachable from that spot (a list gives the player a choice).
'kind': walk (default) | water (9->14 descent) | gate (locked unless the DM opens it) | leave (out of Velkynvelve: 'to' names the
cavern plate in CAVERNS below that takes the party, and the page hands over to the travel map).
Exits re-traced by Sam in his editor, 2026-10-24 (every area but 9's falls and 11's gate, which keep the wiring that landed the same
day); 'proposed': Claude's draw from OotA p.17-20, not yet reviewed by Sam. Area 11's export put the gate zone at the plate's
west edge; that rect is NOT applied — the gate zone is what carries the lock, the leaf and the landing (doorGate in the page).
Which painted way-out maps to which neighbour is an APPROXIMATE call where the painting doesn't say; adjust freely.
mask (masks.json, Sam's editor export 2026-10-25): the PAINTED walkable floor of a plate, one bit per 20 px cell of the 120x67 walk
grid, RLE. When a plate has one the page walks the mask and ignores its traced floors and obstacles (buildGrid in template.html);
the traced shapes stay as the record of what was there before and as the fallback for a plate without a mask (area 10). The same
export nudged four exits (6->4, 14->grove, 10b->10, lair->tunnels) and the editor layout; areas 9 and 11 keep their wiring as above."""
import json

def P(*xy):  # flatten pairs
    return [list(p) for p in xy]

NODES = {
 1: dict(slug="node-01-southern-watch-post", name="Southern Watch Post", scale=1.0,
   floors=[dict(poly=P((1100,140),(1300,140),(1320,470),(1380,500),(1640,520),(1860,580),(1960,690),(1880,840),(1660,860),(1440,940),(1400,1000),(1380,1339),(1020,1339),(1000,1000),(960,940),(760,860),(540,820),(460,690),(560,600),(780,580),(880,520),(1080,470)))],
   obstacles=[],
   zones=[dict(rect=[1110, 140, 1290, 330], to=[2], label="Stair up into the outpost"),
          dict(rect=[1030, 1230, 1370, 1339], to=["tunnels"], kind="leave", label="South passage — PROPOSED: south passage toward Gracklstugh (OotA p.20)", proposed=True)]),
 2: dict(slug="node-02-barracks", name="Barracks", scale=1.05,
   floors=[dict(poly=P((840,720),(1000,700),(1090,880),(1320,890),(1400,940),(1320,1040),(1200,1120),(1280,1220),(1120,1339),(800,1339),(760,1200),(800,1080),(720,1000),(600,940),(760,840)))],
   obstacles=[],
   zones=[dict(rect=[803, 132, 901, 290], to=[4], label="Timber stair to the upper walkways"),
          dict(rect=[671, 1264, 990, 1336], to=[1], label="Passage out of the barracks"),
          dict(rect=[1486, 127, 1638, 348], to=[3], label="New exit"),
          dict(rect=[2082, 343, 2149, 500], to=[4], label="New exit")],
   # Sam, 2026-10-27 (wiring board heights): the walkway along the top, with the chests and the three exits, is a gallery 10 ft
   # above the bunks; the big timber staircase is the way between them. Ront, Derendil and barbarians drop off the edge.
   heights=[dict(poly=P((760,100),(2250,100),(2250,520),(1493,460),(953,400),(760,330)), ft=10, label="the upper gallery"),
            dict(poly=P((789,288),(953,381),(1227,950),(1493,440),(2143,503)), stairs=True, label="the timber staircase")]),
 3: dict(slug="node-03-main-hall", name="Main Hall", scale=0.9,
   floors=[dict(poly=P((760,560),(1000,510),(1400,500),(1700,540),(1800,600),(1780,720),(1880,800),(1840,940),(1740,1060),(1600,1160),(1400,1200),(1200,1230),(940,1180),(660,1040),(520,900),(500,760),(600,660)))],
   obstacles=[dict(cx=890,cy=670,rx=120,ry=70),dict(cx=1350,cy=660,rx=120,ry=70),dict(cx=850,cy=890,rx=120,ry=70),dict(cx=1350,cy=890,rx=120,ry=70),dict(cx=1500,cy=470,rx=90,ry=50)],
   zones=[dict(rect=[942, 1214, 1194, 1417], to=[2], label="Rope walkway west"),
          dict(rect=[62, 786, 354, 941], to=[7], label="Walkway east"),
          dict(rect=[122, 208, 294, 393], to=[8], label="Passage to the lift"),
          # Hard Labor module (Sam, 2026-10-26): the kitchen is its own painted plate ("3k"), reached past the pantry
          # shelves at the back of the hall. PROPOSED: where the door sits is Claude's pick, on the painted floor by the counter.
          dict(rect=[1380, 480, 1560, 560], to=["3k"], label="PROPOSED: behind the serving counter, into the kitchen", proposed=True)]),
 4: dict(slug="node-04-elite-barracks", name="Elite Barracks", scale=0.85,
   floors=[dict(ellipse=[670,610,370,165]),dict(ellipse=[1730,610,370,165]),dict(rect=[1030,570,1370,660])],
   obstacles=[dict(cx=680,cy=560,rx=55,ry=40),dict(cx=1730,cy=560,rx=55,ry=40)],
   zones=[dict(rect=[634, 608, 734, 658], to=[2], label="Ladder down (west tower)"),
          dict(rect=[1686, 613, 1786, 663], to=[2], label="Ladder down (east tower)"),
          dict(rect=[2159, 1049, 2366, 1203], to=[1], label="Down the ladder towards watch post"),
          dict(rect=[74, 1049, 264, 1215], to=[6], label="Walk towards Shrine of Loth")]),
 5: dict(slug="node-05-lift", name="Lift", scale=0.95,
   floors=[dict(poly=P((740,640),(960,580),(1280,600),(1480,640),(1520,720),(1490,940),(1440,1040),(1200,1120),(940,1120),(700,1040),(640,940),(660,820),(700,740))),dict(rect=[160,750,720,860])],
   obstacles=[dict(cx=1140,cy=690,rx=150,ry=80)],
   zones=[dict(rect=[150, 740, 260, 870], to=[2], label="Walkway to the main hall"),
          # Sam, 2026-10-24: "Lift basket goes to the plate pool" — the basket sets the party down on area 14 (Pool / Underground
          # River), which has its own ways out; it is not a way off the map. `kind="leave"` stays only because the page keys the
          # basket's climb-out button on it (template.html openLift); with a plate in `to`, goBeyond walks there.
          dict(rect=[1436, 819, 1526, 959], to=["wastes"], kind="leave", label="The lift basket: DC 18 Strength to crank, 4 rounds down to the Wastes (Sam, 2026-10-27; the book lowers it by the pool, OotA p.17–18)"),
          dict(rect=[914, 1255, 1099, 1339], to=[2], label="Down the Lift to the Wastes"),
          # Hard Labor module (Sam, 2026-10-26), Lift Trouble (OotA Expanded p.45): goods fell off the lift and snagged on the
          # cliff below; the prisoners are sent down on two tattered 25-ft ropes, three rappels. PROPOSED: the spot on the rail is
          # Claude's pick. The rappel checks are not built yet (labor module PR 3); for now this simply walks.
          dict(rect=[1100, 1100, 1300, 1180], to=["5c"], label="PROPOSED: over the rail on a rope, down the cliff below the lift", proposed=True,
               rappel=dict(dir="down", entry=True))]),
 6: dict(slug="node-06-shrine", name="Shrine to Lolth", scale=1.0,
   floors=[dict(ellipse=[1200,750,620,250]),dict(rect=[1010,980,1390,1339]),dict(rect=[400,700,620,775]),dict(rect=[1800,700,1990,785])],
   obstacles=[dict(cx=1200,cy=665,rx=200,ry=95),dict(cx=780,cy=665,rx=60,ry=35),dict(cx=1610,cy=665,rx=60,ry=35)],
   zones=[dict(rect=[1020, 1260, 1380, 1339], to=[7], label="Stair down the priestess tower"),
          dict(rect=[51, 668, 221, 797], to=[10], label="Rope bridge west"),
          dict(rect=[2118, 662, 2389, 803], to=[4], label="Rope bridge towards Elite Barracks")],
   hazard=dict(poly=P((900,500),(1500,500),(1520,560),(880,560)), kind="ambush", foes=["giant-spider"], label="Something shifts among the cushions")),
 7: dict(slug="node-07-ilvara-quarters", name="Ilvara's Quarters", scale=1.0,
   floors=[dict(poly=P((660,660),(840,480),(1120,430),(1400,460),(1680,480),(1800,600),(1860,760),(1800,880),(1680,960),(1400,1000),(1120,1000),(840,940),(640,820))),dict(rect=[520,760,680,900]),dict(rect=[1175,995,1250,1112])],
   # the two ladders (Sam, 2026-10-14: "a point of entrance and exit (2) — characters climb up and down"):
   # the pit at the back with the ladder standing in it, up to the shrine (OotA: "A rope ladder leads down from the
   # shrine into this chamber"), blocked to walking except at its foot; and the gap in the front rail where the
   # ladder goes down to Shoor's chamber. `climb`: where to stand, where the ladder is, which way it goes.
   obstacles=[dict(cx=920,cy=600,rx=200,ry=110),dict(cx=1080,cy=770,rx=140,ry=55),dict(cx=1640,cy=550,rx=140,ry=75),dict(cx=1520,cy=865,rx=130,ry=60),dict(cx=1202,cy=476,rx=96,ry=36)],
   zones=[dict(rect=[1144, 435, 1263, 517], to=[6], label="Ladder up to the shrine", climb=dict(foot=[1210, 540], ladder=[1210, 494], dir="up")),
          dict(rect=[1175, 1156, 1271, 1233], to=[8], label="Ladder down to Shoor's chamber", climb=dict(foot=[1212, 1078], ladder=[1212, 1116], dir="down")),
          dict(rect=[2203, 885, 2398, 1085], to=[3], label="Rope bridge west"),
          dict(rect=[154, 871, 402, 1070], to=[3], label="To Main Hall")]),
 8: dict(slug="node-08-shoor-quarters", name="Shoor's Quarters", scale=1.0,
   floors=[dict(poly=P((760,480),(920,380),(1120,420),(1300,360),(1520,400),(1660,520),(1720,640),(1700,800),(1560,900),(1320,940),(1080,940),(860,880),(740,760),(720,600))),dict(rect=[1080,900,1300,1000])],
   obstacles=[dict(cx=1390,cy=710,rx=105,ry=60),dict(cx=1400,cy=410,rx=110,ry=55)],
   zones=[dict(rect=[1109, 186, 1243, 394], to=[7], label="Ladder up to Ilvara's quarters"),
          dict(rect=[318, 813, 501, 996], to=[3], label="Rope bridge west"),
          dict(rect=[1081, 1165, 1297, 1333], to=[9], label="Stair down toward the waterfall")]),
 9: dict(slug="node-09-waterfall", name="Waterfall", scale=0.85,
   floors=[dict(poly=P((320,660),(520,580),(800,580),(880,660),(880,800),(760,840),(500,840),(280,820),(240,740))),dict(poly=P((880,705),(1000,740),(1200,770),(1400,740),(1530,705),(1530,745),(1400,790),(1200,815),(1000,790),(880,745))),dict(poly=P((1540,640),(1760,600),(2000,680),(2120,800),(2000,860),(1720,860),(1560,800)))],
   obstacles=[],
   zones=[dict(rect=[148,1171,317,1306], to=[8], label="Rope bridge down-left"),
          dict(rect=[1990,800,2140,900], to=[10], label="Rope bridge down-right"),
          # Sam, 2026-10-24: the jump is offered only once someone has reason to think it survivable — a look over the edge
          # (Perception, DC homebrew) that finds the pool and the webs below, feather fall in the party, a barbarian who
          # would jump anyway, or someone already thrown in. The hover label gives nothing away; `secret` is what a look finds.
          dict(rect=[1100,760,1320,805], to=[14], kind="water", label="The falls: the bridge passes right over the drop",
               secret="Below, through the spray: the webs the drow keep stretched beneath the outpost (OotA p.14), and past them the falls pouring into a pool on the cavern floor (p.18). A drop here lands in water.")]),
 10: dict(slug="node-10-guard-tower", name="Guard Tower", scale=0.9,
   floors=[dict(poly=P((1060,700),(1240,640),(1600,660),(1860,680),(1920,800),(1900,940),(1760,1020),(1400,1040),(1120,980),(1040,860))),dict(poly=P((320,840),(1050,895),(1050,950),(320,905))),dict(rect=[0,720,330,950]),dict(poly=P((1900,875),(2400,810),(2400,870),(1900,935)))],
   obstacles=[dict(cx=1480,cy=880,rx=140,ry=60),dict(cx=1780,cy=870,rx=60,ry=40)],
   zones=[dict(rect=[524, 799, 834, 985], to=[9], label="Ledge west, toward the priestess tower and the falls"),
          dict(rect=[2321, 777, 2427, 892], to=[11], label="Rope bridge east to the slave pen"),
          # Sam, 2026-10-27: "When I try to go up or down ... the characters just leave to the right of the screen then
          # appear to climb." Neither ladder had climb data, so the party walked off the plate's edge. On the painting the
          # hatch in the floor (its ladder going DOWN) is the way to the lower chamber, and the rope ladder on the back wall
          # is the way UP to the armory; until now the zone on the hatch led up and the lower chamber's sat off the floor.
          dict(rect=[1719, 822, 1840, 909], to=["10b"], label="The hatch: ladder down to the lower chamber", climb=dict(foot=[1780, 945], ladder=[1778, 872], dir="down")),
          dict(rect=[1715, 690, 1815, 770], to=["10c"], label="Rope ladder up to the armory", climb=dict(foot=[1768, 740], ladder=[1768, 690], dir="up"))]),
 "10b": dict(slug="node-10b-guard-tower-lower", name="Guard Tower, lower chamber", scale=3.2, depth=[0.8, 1.6], img="node-10b-guard-tower-lower.jpg",
   # scale 3.2 and depth 0.8→1.6, not 0.95 and the default 0.8→1.12 (Sam, 2026-10-24: "fix both guard room and armory").
   # A close-up with steep perspective: ladder rungs at the back wall ~56 px/ft, the table and chairs mid-room ~105 px/ft.
   # Checked by compositing Samson (at the ladder), a drow guard (by the table) and Kenta (foreground) onto the plate.
   # OotA p.18 area 10, lower chamber: the guards' room (two drow and an elite warrior on duty, dice and cups).
   # Floor and blocking shapes traced by Sam in the editor, 2026-10-24. `img`: the plate ships in the repo
   # (public/velkynvelve-walk/img/, Sam's painting cut to 2400x1339) rather than the Supabase bucket, so no upload step.
   floors=[dict(poly=P((61,961),(580,838),(914,803),(2179,803),(2179,1031),(2400,1119),(2400,1339),(0,1339),(0,1066)))],
   obstacles=[dict(cx=1300,cy=803,rx=404,ry=193),dict(cx=2047,cy=750,rx=193,ry=105)],
   zones=[dict(rect=[870, 2, 1057, 316], to=[10], label="the ladder up to the upper chamber", climb=dict(foot=[887, 838], ladder=[887, 750], dir="up"))]),
 "10c": dict(slug="node-10c-guard-tower-armory", name="Guard Tower, armory (upper chamber)", scale=3.2, img="node-10c-guard-tower-armory.jpg",
   # scale 3.2, not 0.95 (Sam, 2026-10-24: "We are tiny in the armory. Make us proportionately bigger"). The plate is a
   # close-up interior: the mail shirts and sword racks on the back wall measure ~65 px per foot, so a 6-ft hero there
   # stands ~390 px; at 0.95 he stood ~100. Checked by compositing Samson, Kenta and a drow guard onto the plate.
   # OotA p.18 area 10, upper chamber: the armory. What is on the racks is in lib/walk-loot.ts (BOOK_CONTAINERS) and
   # story.json 10c.loot, every entry with its page.
   # Floor and blocking shapes traced by Sam in the editor, 2026-10-24. `img`: the plate ships in the repo (see 10b).
   floors=[dict(poly=P((804,814),(1220,792),(1722,792),(2239,864),(2400,993),(2400,1339),(0,1339),(0,1209),(775,1209),(775,907),(804,878)))],
   obstacles=[],
   zones=[dict(rect=[158, 922, 718, 1180], to=[10], label="PROPOSED: the trapdoor — ladder down to the guard room", climb=dict(foot=[804, 1079], ladder=[431, 1022], dir="down"))]),
 "5c": dict(slug="node-05c-lift-cliffside", name="The cliff below the lift", scale=2.2, depth=[0.8, 1.2], img="node-05c-lift-cliffside.jpg",
   # Hard Labor module plate A (Sam painted it in OpenAI from Claude's prompt, 2026-10-26; doc claude/Hard_Labor_Module_2026-10-26.md).
   # Lift Trouble, OotA Expanded p.45 (community supplement, not WotC): three ledges down a 45-degree cliff, goods snagged
   # between them, a web net with a giant spider 100 ft below for anyone who falls. Cut 1672x941 -> 2400x1339 (8 px trimmed,
   # Lanczos; not AI-upscaled). Floors traced by Claude by eye: the three ledges and the two scree ramps between them.
   # scale 2.2 is by eye from the burlap sacks (~40 px/ft mid-cliff), NOT checked by compositing a hero -- adjust after a look.
   floors=[dict(poly=P((201,303),(373,231),(689,202),(1249,210),(1263,267),(1091,296),(919,281),(804,339),(474,346),(230,339))),
           dict(poly=P((919,468),(1091,446),(1292,454),(1579,468),(1651,511),(1622,583),(1292,597),(1005,583),(876,540))),
           dict(poly=P((1421,812),(1794,791),(2096,805),(2153,856),(2124,927),(1794,949),(1507,942),(1414,884))),
           # the web net (Expanded p.45: "a spider web netting ... 100' below for those who fall"). Floor only for whoever
           # lands in it: no path joins it to the ledges, so the only ways in are a failed rappel and the only way out is
           # the net's anchor rope back up to the lowest ledge.
           dict(poly=P((474,913),(1005,999),(1435,1085),(2009,1056),(2182,1085),(2153,1286),(1722,1339),(574,1339),(431,1171)))],
   obstacles=[],
   # RAPPELS (Sam, 2026-10-26: "rappel checks and fall into the web net"). The scree between the ledges is not walkable:
   # each drop is a rope, crossed by a `rappel` zone that asks for Strength (Athletics) on the dashboard's dice
   # (lib/walk-roll.ts "cliff:rappel"). Success: the party goes down (or up) the rope together, `path` is the route
   # they take and `land` is the ledge they reach. Failure: whoever led falls into the net and the giant spider comes.
   # Three rappels in all, as the supplement says: lift rail -> top ledge (plate 5's zone), top -> middle, middle -> low.
   # Positions are Claude's by eye.
   zones=[dict(rect=[416, 0, 847, 167], to=[5], label="Climb back up the rope to the lift", climb=dict(foot=[700, 260], ladder=[630, 150], dir="up")),
          dict(rect=[1150, 230, 1260, 300], to=[], kind="rappel", label="The rope down to the middle ledge",
               rappel=dict(dir="down", path=[[1200, 330], [1180, 420], [1150, 510]])),
          dict(rect=[960, 470, 1080, 560], to=[], kind="rappel", label="The rope up to the top ledge",
               rappel=dict(dir="up", path=[[1060, 420], [1120, 330], [1080, 270]])),
          dict(rect=[1480, 470, 1600, 560], to=[], kind="rappel", label="The rope down to the lowest ledge",
               rappel=dict(dir="down", path=[[1500, 640], [1540, 760], [1600, 860]])),
          dict(rect=[1440, 830, 1560, 920], to=[], kind="rappel", label="The rope up to the middle ledge",
               rappel=dict(dir="up", path=[[1480, 760], [1440, 640], [1400, 540]])),
          dict(rect=[1800, 1040, 1960, 1120], to=[], kind="rappel", label="The net's anchor rope, back up to the lowest ledge",
               rappel=dict(dir="up", path=[[1860, 1000], [1860, 930], [1840, 880]], net=True))]),
 "3k": dict(slug="node-03k-kitchen", name="Main Hall kitchen", scale=2.4, depth=[0.8, 1.4], img="node-03k-kitchen.jpg",
   # Hard Labor module plate B (Sam, 2026-10-26). OotA p.12 lists food prep and service, and washing dishes, among the
   # prisoners' chores; plate 3 has a pantry but no stove, so the kitchen is its own close-up. Cut as plate A.
   # A steep close-up like 10b: the stove at the back ~67 px/ft, the near chairs ~135 px/ft. scale/depth by eye, NOT composited.
   floors=[dict(poly=P((632,475),(804,461),(1234,533),(1794,626),(1816,662),(2211,777),(2400,856),(2400,1229),(2297,1339),(330,1339),(172,1186),(57,999),(0,927),(0,669),(100,568)))],
   obstacles=[dict(cx=359, cy=741, rx=344, ry=237)],   # the card table and its four chairs
   zones=[dict(rect=[890, 1257, 1522, 1339], to=[3], label="Back out into the main hall")]),
 11: dict(slug="node-11-slave-pen", name="Slave Pen", scale=1.25,
   floors=[dict(poly=P((960,740),(1120,700),(1400,560),(1700,500),(2000,480),(2200,560),(2300,700),(2360,940),(2300,1200),(2200,1339),(900,1339),(760,1200),(620,1000),(640,900),(800,860),(920,780)))],
   obstacles=[],  # table and stool removed from the plate (take 35)
   # What blocks sight (Sam, 2026-10-22: line of sight). Traced along the FOOT of the pen's west wall, the line where the
   # floor meets the stone, because sight is tested foot to foot: anyone on the balcony, the bridge or Jorlan's landing is
   # behind it. The brick wall and the rock column below it are solid; the gate is iron bars (cover, not a wall) and
   # nothing at all once it stands open. North of the gate the wall turns up into the back of the cave.
   walls=[dict(line=P((500,1339),(620,1000),(640,900),(740,885)), label="the pen wall"),
          dict(line=P((740,885),(906,795)), kind="gate", label="the gate's bars"),
          dict(line=P((906,795),(960,740),(985,400),(1000,0)), label="the pen wall")],
   zones=[dict(rect=[730,790,915,940], to=[10,12], kind="gate", label="The pen gate: heavy iron bolted into the stone. Locked: DC 20 to pick or force (OotA p.18)"),
          # Sam, 2026-10-24: "walk out of the door ... as soon as you hit the gate you have the option of going down the
          # ladder to #12 the Quaggoth Den or to the right where the guard tower #10 is." The rock landing outside the bars
          # (story.json interact.gate.balcony.landing) is floor once the gate stands open; stepping onto it asks which way.
          # `landing` = only floor while the gate is open; `nosplit` = one zone with two ways, never cut into strips.
          dict(rect=[400,640,545,745], to=[10,12], label="The landing outside the gate: the rope bridge to the Guard Tower, or the cliff stairs down to the Quaggoth Den",
               landing=True, nosplit=True, routes={"10": "Across the rope bridge to the Guard Tower", "12": "Down the cliff stairs to the Quaggoth Den"})],
   npcs=[dict(id="ront",x=1700,y=760,face=2,talk=True,talkLine="Ront grunts and jerks his chin at you. He has a plan, and it involves drow throats.",barks=["Ront mutters something about orc blood and drow throats."]),
         dict(id="eldeth",x=1300,y=1000,face=6,talk=True,talkLine="Eldeth Feldrun catches your eye. She wants a word."),
         dict(id="derendil",x=2050,y=900,face=2,talk=True,talkLine="Derendil draws himself up. A prince of Nelrindenvane requires a word with you.",barks=["Derendil reminds everyone, again, that he is a prince of Nelrindenvane."]),
         dict(id="sarith",x=1500,y=1220,face=4,talk=False,barks=["Sarith stares at nothing and does not answer."]),
         dict(id="buppido",x=1100,y=1180,face=5,talk=True,talkLine="Buppido waves you over, smiling. He has a little idea he would love to share.",barks=["Buppido hums to himself, smiling too much."]),
         dict(id="jimjar",x=1840,y=1130,face=3,talk=True,talkLine="Jimjar wants to bet you something. Anything. Just come here.",barks=["Jimjar offers odds on which of you the drow will feed to the spiders first."]),
         dict(id="topsy",x=1980,y=1220,face=2,talk=False,barks=["The twins whisper to each other, then go quiet when you look over."]),
         dict(id="turvy",x=2050,y=1190,face=2,talk=False,barks=["Turvy nudges Topsy and points at the gate."]),
         dict(id="shuushar",x=1300,y=780,face=0,talk=True,talkLine="Shuushar opens his eyes. He would speak with you, when you are ready.",barks=["Shuushar stands very still, breathing slowly, as calm as deep water."]),
         dict(id="stool",x=1640,y=1060,face=4,talk=True,talkLine="A soft haze of spores drifts your way. Stool wants to talk, in its way.",barks=["Stool's cap sways. A faint, friendly haze of spores drifts your way."])]),
 12: dict(slug="node-12-quaggoth-den", name="Quaggoth Den", scale=0.75,
   floors=[dict(poly=P((520,460),(960,300),(1280,240),(1720,280),(2000,400),(2200,660),(2120,1040),(1800,1200),(1240,1180),(800,1120),(320,1000),(180,840),(280,600))),dict(rect=[1260,0,1440,280]),dict(rect=[880,1140,1200,1339])],
   obstacles=[dict(cx=x*2,cy=y*2,rx=95,ry=55) for (x,y) in [(350,270),(510,210),(630,260),(770,205),(880,265),(330,350),(500,320),(710,330),(935,350),(560,425),(770,410),(330,465),(960,440),(690,505),(930,570)]],
   zones=[dict(rect=[1276, 26, 1427, 232], to=[11], label="Stone steps up toward the slave pen"),
          dict(rect=[2101, 556, 2260, 721], to=[10], label="Perimeter walkway north to the watch post"),
          dict(rect=[891, 1211, 1079, 1441], to=[13], label="New exit")],
   hazard=dict(poly=P((620,500),(1900,440),(2040,700),(1880,1080),(720,1060),(480,800)), kind="ambush", foes=["quaggoth","quaggoth","quaggoth"], fromPlate=True, label="The quaggoths rise from their nests. You are not drow.")),
 13: dict(slug="node-13-northern-watch-post", name="Northern Watch Post", scale=1.0,
   floors=[dict(poly=P((540,720),(840,700),(1040,660),(1400,660),(1520,720),(1760,700),(1920,740),(1860,840),(1720,900),(1400,940),(1380,1020),(1320,1080),(1320,1339),(1080,1339),(1060,1080),(1000,1000),(960,940),(660,940),(520,840)))],
   obstacles=[dict(cx=1540,cy=800,rx=120,ry=60),dict(cx=840,cy=740,rx=35,ry=25)],
   zones=[dict(rect=[1080, 1260, 1320, 1339], to=[12], label="Walkway down to the den perimeter")]),
 14: dict(slug="node-14-pool-river", name="Pool / Underground River", scale=0.9,
   floors=[dict(poly=P((300,840),(640,790),(940,820),(1120,880),(1400,860),(1520,940),(1640,1120),(1760,1280),(1760,1339),(400,1339),(300,1120))),dict(poly=P((1640,660),(1900,580),(2120,640),(2200,800),(2080,940),(1800,940),(1600,860))),dict(poly=P((1400,840),(1600,800),(1640,920),(1520,960)))],
   obstacles=[],
   zones=[dict(rect=[884, 1223, 1420, 1367], to=["shore"], kind="leave", label="The underground river runs on toward the Darklake — PROPOSED: the river runs west to the Darklake (OotA p.18, p.20)", proposed=True),
          dict(rect=[831, 274, 1080, 484], to=["crystal"], label="(Hidden) Passage to ?"),
          dict(rect=[1975, 1074, 2237, 1302], to=["grove"], label="Follow river")]),
}

# ── beyond the edge ──────────────────────────────────────────────────────────────────────────────────────────────────
# The cavern plates a `leave` exit walks onto (Sam's editor export, 2026-10-24; Sam, same day: "Lets make all the sprite
# plates walkable"). They are plates of this page now: `img` is the painting, cut to 2400x1339 and shipped in the repo
# (public/velkynvelve-walk/img/), and `floors`/`obstacles` were PROVISIONAL, traced by eye from the painting by Claude --
# Sam's brush on the wiring board (walk_masks in his export, 2026-10-25) has replaced them as `mask` (masks.json, attached
# below; the page walks the mask and ignores the shapes when one is present). The zone rects are Sam's. `biome` is the camp plate that stands in for each
# on the travel map (lib/camp-plates.ts: tunnels | fungal | shore; anything unpainted camps in the tunnels, the same
# rule campBiomeFor applies). An outward exit with no `to` (kind="leave") is where the party steps off onto the
# Underdark map: lib/travel/handoff.ts reads which cavern they came out of. "PROPOSED" labels are Claude's draws
# from OotA p.17-20 that Sam has not reviewed; `proposed=True` marks the ones his export still lists as unreviewed.
CAVERNS = {
 "tunnels": dict(slug="biome-tunnels", name="The tunnels", biome="tunnels", scale=1.0, img="biome-tunnels.jpg",
   # the flat cave floor between the tunnel mouths; the crates and the stalagmites block
   floors=[dict(poly=P((240,800),(450,590),(500,420),(780,330),(1050,520),(1800,560),(1900,330),(2230,330),(2300,700),(2300,900),(2100,1150),(1750,1339),(420,1339),(200,1150),(120,1000)))],
   obstacles=[dict(cx=2060,cy=870,rx=60,ry=45),dict(cx=280,cy=770,rx=120,ry=55),dict(cx=420,cy=1150,rx=140,ry=70),dict(cx=1600,cy=560,rx=80,ry=35)],
   zones=[dict(rect=[892, 1224, 1523, 1404], to=[1], label="PROPOSED: back up the south passage to the Southern Watch Post", proposed=True),
          dict(rect=[477, 146, 781, 517], to=["wastes"], label="PROPOSED: back up the north passage to the Northern Watch Post"),
          dict(rect=[103, 838, 243, 1178], to=["shore"], label="PROPOSED: on west to the Darklake", proposed=True),
          dict(rect=[1887, 289, 2232, 633], to=["lair"], label="PROPOSED: deeper in — the road marker decides which biome")]),
 "crystal": dict(slug="biome-crystal", name="The crystal passage", biome="tunnels", scale=1.0, img="biome-crystal.jpg",
   # the pool of crystal-lit floor; the geodes and the big clusters block
   floors=[dict(poly=P((350,590),(800,490),(1500,450),(1700,330),(1820,330),(2060,590),(2230,900),(1950,1220),(1500,1339),(520,1339),(310,1050)))],
   obstacles=[dict(cx=380,cy=800,rx=70,ry=45),dict(cx=1950,cy=940,rx=90,ry=55),dict(cx=560,cy=1250,rx=130,ry=70),dict(cx=2050,cy=1250,rx=140,ry=70)],
   zones=[dict(rect=[1656, 231, 1821, 563], to=[14], label="Back through the waterfall")]),
 "wastes": dict(slug="biome-wastes", name="The wastes", biome="tunnels", scale=1.0, img="biome-wastes.jpg",
   # the bone-strewn floor up to the chasm on the right; the fallen pillars and the fire block
   floors=[dict(poly=P((350,520),(1000,430),(1400,430),(1680,420),(1850,590),(1880,1050),(1680,1339),(200,1339),(140,870),(140,700)))],
   obstacles=[dict(cx=450,cy=560,rx=70,ry=45),dict(cx=700,cy=575,rx=80,ry=40),dict(cx=1950,cy=575,rx=60,ry=45),dict(cx=310,cy=1150,rx=60,ry=90),dict(cx=800,cy=820,rx=40,ry=30)],
   zones=[dict(rect=[38, 685, 178, 1025], to=["tunnels"], label="PROPOSED: back to the tunnels", proposed=True),
          dict(rect=[969, 90, 1412, 433], to=[], kind="leave", label="Tunnel to the Oozing Temple")]),
 "lair": dict(slug="biome-lair", name="The lair", biome="tunnels", scale=1.0, img="biome-lair.jpg",
   # the lair floor; the bone pile and the wheel block
   floors=[dict(poly=P((420,630),(900,490),(1450,420),(1730,470),(1950,520),(2230,770),(2230,1120),(1800,1339),(520,1339),(210,1050),(150,900),(150,750),(280,770)))],
   obstacles=[dict(cx=780,cy=540,rx=230,ry=90)],
   zones=[dict(rect=[759, 1186, 1765, 1337], to=["tunnels"], label="PROPOSED: back to the tunnels", proposed=True),
          dict(rect=[1448, 262, 1730, 564], to=[], kind="leave", label="Hook Horror Layer")]),
 "shore": dict(slug="biome-shore", name="The Darklake shore", biome="shore", scale=1.0, img="biome-shore.jpg",
   # the cobbled shore below the water line; the crates, the chest, the keelboat and the crystals block
   floors=[dict(poly=P((150,825),(180,700),(400,620),(725,690),(1000,675),(1400,690),(1750,725),(2050,800),(2200,1000),(2050,1339),(450,1339),(250,1125)))],
   obstacles=[dict(cx=725,cy=725,rx=60,ry=35),dict(cx=1750,cy=825,rx=70,ry=40),dict(cx=1500,cy=790,rx=160,ry=60),dict(cx=350,cy=1175,rx=120,ry=80),dict(cx=2075,cy=1125,rx=70,ry=60),dict(cx=500,cy=1050,rx=40,ry=60)],
   zones=[dict(rect=[882, 1134, 1537, 1337], to=["tunnels"], label="Back along the river  into the tunnels"),
          dict(rect=[176, 568, 499, 803], to=[14], label="Back to towards the underground river"),
          dict(rect=[1316, 512, 1653, 698], to=[], kind="leave", label="Traverse the Darklake")]),
 "grove": dict(slug="biome-grove", name="The grove", biome="fungal", scale=1.0, img="biome-grove.jpg",
   # the dirt clearing under the giant caps; the roots and the mushroom clumps block
   floors=[dict(poly=P((375,825),(650,625),(950,550),(1300,550),(1625,600),(1900,750),(2230,750),(2230,900),(2000,1075),(1700,1250),(1400,1339),(750,1339),(425,1200),(250,1000),(140,900),(140,700)))],
   obstacles=[dict(cx=375,cy=625,rx=80,ry=40),dict(cx=1650,cy=525,rx=80,ry=40),dict(cx=1825,cy=950,rx=80,ry=50),dict(cx=1525,cy=1100,rx=100,ry=60)],
   zones=[dict(rect=[0, 560, 140, 900], to=[14], label="PROPOSED: back to the tunnels"),
          dict(rect=[2229, 665, 2400, 836], to=[], kind="leave", label="New exit")]),
}

# ── Gracklstugh, the first hub interiors ─────────────────────────────────────────────────────────────────────────────
# Sam, 2026-10-27, from the Top Heroes comparison: "lets create shops and taverns like this" -> two PixelLab pixel-art
# cutaway rooms (create_image_pro 688x384, jobs 55ad29a1 smithy / 0212db94 inn), Sam: "Keep as they are. Make sure you can
# walk down those steps." Hub doc: claude/Gracklstugh_Hub_Pilot_2026-10-27.md. The painted Blade Bazaar (Gracklstugh room
# plate 3, claude/Gracklstugh_Room_Plates_2026-10-13.md, Lanczos 2752x1536 -> 2400x1339) is their street. Keys carry a "g"
# so they never collide with Velkynvelve's numbers; nothing in Velkynvelve links here, so for now the DM reaches them from
# the jump list. Pixel rooms are cut by NEAREST x3.5 then centre-trimmed, so the pixels stay hard. Isometric art has no
# perspective, so their depth is flat. Floors, obstacles and zones traced by Claude by eye; scale NOT checked by compositing.
# Canon: Ghohlbrorn's Lair is an inn UNDER the Blade Bazaar, "frequently flooded" (OotA Expanded p.51); bazaar<->inn is the
# sourced subnodal link 3-6. The smithy is Claude's: a smith's stall in the bazaar (the painted plate has one, right side).
GRACKLSTUGH = {
 "g3": dict(slug="gr-03-blade-bazaar", name="Gracklstugh: the Blade Bazaar", scale=1.8, depth=[0.6, 1.3], img="gr-03-blade-bazaar.jpg",
   # the cobbled street between the stalls; the back stair climbs to the city (not walkable yet, so no zone)
   floors=[dict(poly=P((1180,900),(1470,900),(1560,960),(1620,1000),(1760,1060),(1900,1130),(2000,1150),(2050,1339),(680,1339),(660,1200),(700,1060),(900,990),(1060,960)))],
   obstacles=[dict(cx=757,cy=1035,rx=70,ry=45),dict(cx=1815,cy=1035,rx=70,ry=45),dict(cx=1095,cy=905,rx=40,ry=25),dict(cx=1545,cy=930,rx=40,ry=25),dict(cx=980,cy=975,rx=45,ry=35)],   # braziers, the barrel at the dagger stall
   zones=[dict(rect=[1050, 1260, 1500, 1339], to=["g6"], label="Down the steps under the bazaar to Ghohlbrorn's Lair"),
          dict(rect=[1600, 940, 1760, 1060], to=["g3f"], label="Into the smith's stall")]),
 "g6": dict(slug="gr-06-ghohlbrorns-lair", name="Ghohlbrorn's Lair", scale=1.0, depth=[1.0, 1.0], img="gr-06-ghohlbrorns-lair.png",
   # the flooded flagstones (the puddles are floor: shallow water, not a pool); the stair at the back-left is floor too,
   # so you walk up it and the zone at its head takes you to the bazaar. Hearth and bar cut out of the shape.
   floors=[dict(poly=P((440,580),(530,580),(545,840),(810,705),(1080,615),(1245,532),(1275,637),(1650,817),(1837,720),(2092,840),(1320,1275),(495,900),(290,880),(290,690),(400,620)))],
   obstacles=[dict(cx=660,cy=705,rx=70,ry=40),                        # glow-caps by the stair
              dict(cx=1395,cy=705,rx=35,ry=30),dict(cx=1522,cy=765,rx=35,ry=30),   # bar stools
              dict(cx=1900,cy=765,rx=95,ry=50),dict(cx=2010,cy=832,rx=30,ry=25),     # the dice table and its stool
              dict(cx=1500,cy=880,rx=130,ry=70),dict(cx=1680,cy=960,rx=120,ry=70),   # long table and benches
              dict(cx=1140,cy=1050,rx=140,ry=70),dict(cx=1330,cy=1140,rx=130,ry=70), # front table and benches
              dict(cx=1822,cy=900,rx=60,ry=35)],                                     # glow-caps by the dice table
   zones=[dict(rect=[400, 520, 560, 660], to=["g3"], label="Up the stone stair to the Blade Bazaar",
               # a `climb` (as on plate 7's ladder): arrivals come DOWN the steps to their foot and the company waits there, instead of
               # walking in from behind the stair, which is inside the wall
               climb=dict(foot=[540, 770], ladder=[480, 585], dir="up"))]),
 "g3f": dict(slug="gr-03f-bazaar-smithy", name="The smith's stall", scale=1.0, depth=[1.0, 1.0], img="gr-03f-bazaar-smithy.png",
   # the plank floor of the forge room; the forge, the anvil, the trough, the grindstones and the bench block
   floors=[dict(poly=P((435,862),(1200,502),(2002,900),(1245,1287)))],
   obstacles=[dict(cx=862,cy=720,rx=180,ry=90),dict(cx=592,cy=750,rx=150,ry=80),dict(cx=607,cy=870,rx=85,ry=45),dict(cx=1050,cy=585,rx=60,ry=50),
              dict(cx=1185,cy=802,rx=90,ry=70),dict(cx=1357,cy=765,rx=125,ry=70),dict(cx=1515,cy=630,rx=90,ry=65),dict(cx=1785,cy=720,rx=165,ry=90),
              dict(cx=1683,cy=772,rx=30,ry=25),dict(cx=1125,cy=1110,rx=165,ry=90),dict(cx=1372,cy=1065,rx=90,ry=80)],
   zones=[dict(rect=[1500, 960, 1800, 1100], to=["g3"], label="Out through the shopfront into the Blade Bazaar")]),
}
NODES.update(GRACKLSTUGH)

# Sam's editor layout (export 2026-10-25): where each plate sits on the overview board (editor pixels). Data for the editor, not for the page.
LAYOUT = {
  "1": [80, 1180],
  "2": [81, 899],
  "3": [460, 900],
  "4": [81, 619],
  "5": [460, 620],
  "6": [838, 339],
  "7": [841, 619],
  "8": [838, 899],
  "9": [1220, 900],
  "10": [1219, 618],
  "11": [1600, 619],
  "12": [1600, 340],
  "13": [1601, 59],
  "14": [1222, 1180],
  "tunnels": [-359, 902],
  "shore": [1600, 1180],
  "crystal": [-360, 1460],
  "wastes": [80, 1460],
  "lair": [460, 1460],
  "grove": [839, 1458],
  "10b": [1221, 339],
  "10c": [1217, 57],
  "5c": [460, 340],
  "3k": [460, 1180]
}

# ── the painted floor ───────────────────────────────────────────────────────────────────────────────────────────────
# masks.json is Sam's brush, straight from his editor export (walk_masks). Each plate that has one gets it as `mask`; the
# page then walks the painting, not the traced shapes. Checked here so a bad paste fails the build, not a player's walk:
# the grid must be the page's (20 px cells, 120 x 67), every key must be a plate, and every RLE must sum to exactly one grid.
_M = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'masks.json')))
assert (_M['cell'], _M['w'], _M['h']) == (20, 120, 67), ('masks.json grid is not the page\'s', _M['cell'], _M['w'], _M['h'])
_PLATES = {str(k): v for k, v in NODES.items()}; _PLATES.update(CAVERNS)
for _k, _rle in _M['masks'].items():
    assert _k in _PLATES, ('masks.json names a plate that does not exist', _k)
    _runs = [int(r) for r in _rle.split(',')]
    assert all(r >= 0 for r in _runs) and sum(_runs) == _M['w'] * _M['h'], ('mask does not cover exactly one grid', _k, sum(_runs))
    assert sum(_runs[1::2]) > 0, ('mask paints no floor at all', _k)
    _PLATES[_k]['mask'] = _rle
print(len(_M['masks']), 'plates walk Sam\'s painted floor; traced shapes still used by:', ', '.join(k for k in _PLATES if k not in _M['masks']))

# ── height on a plate ─────────────────────────────────────────────────────────────────────────────────────────────────
# Optional per plate: heights=[dict(poly=P(...) | rect=[x0,y0,x1,y1] | ellipse=[cx,cy,rx,ry], ft=20, label="the gallery"),
#                              dict(poly=P(...), stairs=True, label="the steps up")]
# `ft` is how far that ledge stands above the plate's floor; walking never steps 10 ft or more up or down except on a
# `stairs` shape, and Ront, Derendil and barbarians drop off it to close on a foe, taking the SRD fall (1d6 per 10 ft).
# Checked here so a typo fails the build, not a fight.
for _k, _n in _PLATES.items():
    for _h in _n.get('heights', []):
        assert sum(s in _h for s in ('poly', 'rect', 'ellipse')) == 1, ('a height needs exactly one shape', _k, _h.get('label'))
        assert _h.get('stairs') or (isinstance(_h.get('ft'), (int, float)) and 0 < _h['ft'] <= 255), ('a height needs ft between 1 and 255 (or stairs=True)', _k, _h.get('label'))

# sanity. Every way out must lead to a plate that exists. A walk link is expected to have a zone on both sides; the ones
# that do not are listed here so they are a known gap and not a surprise (Sam's export, 2026-10-24: one_way_links_to_fix).
# A new one-way link fails the build until it gets its return zone or is added here on purpose.
KNOWN_ONE_WAY = {("4", "1"), ("5", "2"), ("5", "wastes"), ("6", "10"), ("9", "14"), ("12", "10")}
ALL = {str(k): v for k, v in NODES.items()}; ALL.update(CAVERNS)
links = {(a, str(t)) for a, node in ALL.items() for z in node["zones"] for t in z["to"]}
for a, b in links:
    assert b in ALL, (a, b, "leads nowhere that exists")
one_way = {(a, b) for (a, b) in links if (b, a) not in links}
unexpected = one_way - KNOWN_ONE_WAY
assert not unexpected, ("one-way links not on the known list", sorted(unexpected))
print(len(links), "ways out across", len(ALL), "plates;", len(one_way), "one-way (known):", ", ".join(f"{a}→{b}" for a, b in sorted(one_way)))
print("still PROPOSED, unreviewed:", "; ".join(f"{a}: {z['label'].split(':')[0]} → {','.join(map(str, z['to']))}" for a, node in ALL.items() for z in node["zones"] if z.get("proposed")))
out = {str(k): v for k, v in NODES.items()}
out.update({k: {kk: vv for kk, vv in v.items() if kk != "biome"} for k, v in CAVERNS.items()})   # walkable plates of the page
out["_handoffs"] = {k: dict(name=v["name"], biome=v["biome"]) for k, v in CAVERNS.items()}; out["_layout"] = LAYOUT
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'spec.json'), 'w'), separators=(',', ':'))
