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
          # Sam, 2026-11-10: "Lift -> yes." This exit said "Passage to the lift" and led to Shoor's Quarters (8), and no
          # plate led to the Lift at all: the only way onto plate 5 was climbing back up from the cliff below it, which is
          # itself only reached from plate 5. OotA p.15: the lift is "attached to the edge of the barracks platform", the
          # platform the hall opens onto.
          dict(rect=[122, 208, 294, 393], to=[5], label="Passage to the lift"),
          # Shoor's rope bridge (plate 8's "Rope bridge west") still needs its end in the hall: the labor escort walks the
          # kitchen detail home over it (lib/labor-walk.mjs). PROPOSED position: the painted bridge that runs off the hall's
          # east edge, which had no exit on it; Claude's by eye, on Sam's painted floor.
          dict(rect=[2260, 590, 2400, 690], to=[8], label="PROPOSED: rope bridge east to Shoor's Quarters", proposed=True),
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
   # 2026-11-10: the walkway's label said the main hall and it led to the Barracks. It is the other end of the hall's
   # "Passage to the lift" now, so a party coming from the hall arrives on it. (Claude's call, following the label.)
   zones=[dict(rect=[150, 740, 260, 870], to=[3], label="Walkway to the main hall"),
          # Sam, 2026-10-24: "Lift basket goes to the plate pool" — the basket sets the party down on area 14 (Pool / Underground
          # River), which has its own ways out; it is not a way off the map. `kind="leave"` stays only because the page keys the
          # basket's climb-out button on it (template.html openLift); with a plate in `to`, goBeyond walks there.
          dict(rect=[1436, 819, 1526, 959], to=["wastes"], kind="leave", label="The lift basket: DC 18 Strength to crank, 4 rounds down to the Wastes (Sam, 2026-10-27; the book lowers it by the pool, OotA p.17–18)"),
          # 2026-11-10: was labelled "Down the Lift to the Wastes" (that is the basket above); it leads to the Barracks.
          dict(rect=[914, 1255, 1099, 1339], to=[2], label="Along the platform to the barracks"),
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
   floors=[dict(poly=P((1060,700),(1240,640),(1600,660),(1860,680),(1920,800),(1900,940),(1760,1020),(1400,1040),(1120,980),(1040,860))),dict(poly=P((320,840),(1100,899),(1100,954),(320,905))),dict(rect=[0,720,330,950]),dict(poly=P((1900,875),(2400,810),(2400,870),(1900,935)))],
   obstacles=[dict(cx=1478,cy=868,rx=135,ry=78),dict(cx=1780,cy=870,rx=60,ry=40)],
   # Walk check, 2026-10-29 (Sam: "make sure the painted sections allow the characters to theoretically walk from the pen to
   # the other end"): the west bridge's deck stopped 30 px short of the tower floor, so the tower and the ledge west were two
   # floors and nobody could walk from the pen toward the falls; the deck now runs onto the tower floor. The table's block
   # reaches its far edge, and the ledge-west exit is cut to the deck's height (it stood over the drop above and below it).
   zones=[dict(rect=[524, 852, 834, 948], to=[9], label="Ledge west, toward the priestess tower and the falls"),
          dict(rect=[2321, 777, 2427, 892], to=[11], label="Rope bridge east to the slave pen"),
          # Sam, 2026-10-27: "When I try to go up or down ... the characters just leave to the right of the screen then
          # appear to climb." Neither ladder had climb data, so the party walked off the plate's edge. On the painting the
          # hatch in the floor (its ladder going DOWN) is the way to the lower chamber, and the rope ladder on the back wall
          # is the way UP to the armory; until now the zone on the hatch led up and the lower chamber's sat off the floor.
          # `trigger` (Sam, 2026-11-15: "Can't get to the armory easily"): the hatch's box covered the floor all round the hole,
          # the way from the bridge to the armory's rope ladder ran across it, and the party went down the hatch instead. The
          # whole box is still the hatch to hover and click; only its south lip, where the ladder's foot is, takes you down.
          dict(rect=[1719, 822, 1840, 909], trigger=[1738, 900, 1822, 962], to=["10b"], label="The hatch: ladder down to the lower chamber", climb=dict(foot=[1780, 945], ladder=[1778, 872], dir="down")),
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
   # Walk check, 2026-10-29: the exit sat at the TOP of the ladder (y 2-316) with the painted floor starting at y ~780, so
   # a hero coming down landed on an island and could not reach the room. The exit is now the ladder's lower half, down to the floor.
   zones=[dict(rect=[840, 560, 1000, 830], to=[10], label="the ladder up to the upper chamber", climb=dict(foot=[887, 838], ladder=[887, 750], dir="up"))]),
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
           # RETRACED 2026-10-28 (Sam: "Fifi and Kenta and Shuushar are in the air. We need to make sure that no one is
           # actually in a chasm or the air"). The first trace ran its top edge along the foot of the cliff wall and its
           # left corner over the dark spire, so heroes stood on bare rock face and over the drop. This one follows the
           # dense sag of the webbing only: top edge along the main strands between the two anchor rings, bottom edge where
           # the mesh thins out, the left spire left out. By eye at full size, Claude.
           dict(poly=P((565,1092),(773,1071),(1014,1060),(1245,1113),(1508,1160),(1770,1155),(2033,1125),(2180,1102),
                       (2169,1270),(1875,1307),(1350,1322),(825,1322),(640,1302),(560,1200)))],
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
          dict(rect=[1800, 1135, 1960, 1210], to=[], kind="rappel", label="The net's anchor rope, back up to the lowest ledge",
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
          # Sam, 2026-11-10: "Going through the door should just pan to the next submap plate not ask you where you are
          # going." The landing was ONE zone with two ways, so stepping onto it asked "Where does the party head?" — the
          # only exit in the outpost that asked. The painting outside the gate (img/pen-outside.jpg) shows both ways, so
          # each is its own exit now and walking decides: out along the rope bridge is the Guard Tower, the head of the
          # stone stairs at the landing's south edge is the Quaggoth Den. The landing itself is just floor again.
          # Both stay `landing` (floor only while the gate stands open) and each takes its walk from story.json `cross`.
          dict(rect=[20,365,150,525], to=[10], label="The rope bridge: across the chasm to the Guard Tower", landing=True),
          dict(rect=[368,712,446,746], to=[12], label="The cliff stairs: down to the Quaggoth Den", landing=True)],
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
          # 2026-11-10: was labelled "north to the watch post"; it leads to the Guard Tower (the watch post is the exit below).
          dict(rect=[2101, 556, 2260, 721], to=[10], label="Perimeter walkway to the Guard Tower"),
          dict(rect=[891, 1211, 1079, 1441], to=[13], label="New exit")],
   hazard=dict(poly=P((620,500),(1900,440),(2040,700),(1880,1080),(720,1060),(480,800)), kind="ambush", foes=["quaggoth","quaggoth","quaggoth"], fromPlate=True, label="The quaggoths rise from their nests. You are not drow.")),
 13: dict(slug="node-13-northern-watch-post", name="Northern Watch Post", scale=1.0,
   floors=[dict(poly=P((540,720),(840,700),(1040,660),(1400,660),(1520,720),(1760,700),(1920,740),(1860,840),(1720,900),(1400,940),(1380,1020),(1320,1080),(1320,1339),(1080,1339),(1060,1080),(1000,1000),(960,940),(660,940),(520,840)))],
   obstacles=[dict(cx=1540,cy=800,rx=120,ry=60),dict(cx=840,cy=740,rx=35,ry=25)],
   # THE NORTH PASSAGE (Sam, 2026-11-10: "We can use your recommendation via the North Passage. Two long routes.").
   # OotA p.15: watch posts lie "near the northern and southern entrances to the cavern"; p.20: the north passage "leads
   # toward Menzoberranzan and Blingdenstone". Sam's 2026-10-24 re-trace had dropped this plate's way out, so the post led
   # nowhere. `via` names the hand-off (lib/travel/handoff.ts "north": the two book-distance routes, 156 and 180 miles).
   # PROPOSED position: the gap in the back rail under the painted cave mouth, Claude's by eye over the painted floor.
   zones=[dict(rect=[1080, 1260, 1320, 1339], to=[12], label="Walkway down to the den perimeter"),
          dict(rect=[1110, 650, 1290, 720], to=[], kind="leave", via="north", label="The north passage: toward Menzoberranzan and Blingdenstone (OotA p.20)")]),
 # THE GRAY OOZE LIVES IN THE POOL (Sam, 2026-11-23: "Lets have it in the pool"). OotA p.19, area 14 (campaign_chunks 1204):
 # "A gray ooze lurks in the pool's shallows, blending perfectly with the dark, wet stone ... In addition to attacking any
 # creature in the pool, the ooze surges up to 10 feet out of the pool to attack creatures at its edge. When it does so,
 # creatures within 30 feet of the ooze telepathically sense a voice cry out, 'Flesh for the Faceless Lord!'" So the
 # hazard is the water itself plus a band along its near edge (the 10 ft it surges out). It replaces the October staging,
 # where Malachar had it cross the rope bridge to the pen gate. `landFrom`: a drop through the falls (9) lands IN the
 # water (OotA p.18: "dive into the pool"), so the party is in the ooze's pool the moment they arrive. Polygon and landing
 # spot are Claude's, by eye over the painting and Sam's floor mask; the ooze's AC/HP/attack are its SRD block.
 14: dict(slug="node-14-pool-river", name="Pool / Underground River", scale=0.9,
   landFrom={"9": [880, 540]},
   hazard=dict(poly=P((470,470),(820,430),(1100,440),(1360,500),(1540,600),(1500,760),(1300,820),(1240,880),(900,870),(600,860),(460,780)),
               kind="ambush", foes=["gray-ooze"], rise=[1050, 720], film="gray-ooze-surges",   # where it lay: it heaves up out of the shallows there (its emerge sheet)
               label="The smooth stone in the shallows rears up out of the water, and a voice that is no voice fills every head at once: “Flesh for the Faceless Lord!”",
               # THE HUNT (Sam's go, 2026-11-23: "4 rounds"; lib/water.mjs): a fight here while the escape is hunted brings the
               # drow hunt in at the start of round 5. They come along the cavern floor from the lift (OotA p.17-18), so they
               # walk in from the shore at the bottom of the plate, not down the falls. [CLAUDE] the doorway, by eye.
               hunt=dict(at=[1150, 1280])),
   # THE DEEP WATER (Sam, 2026-11-23: "go water"; lib/water.mjs): the open pool under the falls, where a creature swims
   # (each foot costs 1 extra) and fights by the Underwater Combat rules. Below it the stepping stones and lily pads are
   # the shallows, where the ooze lies (OotA: "lurks in the pool's shallows"): ordinary footing. [CLAUDE] traced by eye
   # over the painting, inside Sam's floor mask. The river channel on the right is not drawn as deep water.
   deep=dict(poly=P((592,562),(675,502),(840,438),(1102,442),(1342,502),(1350,548),(1430,640),(1420,680),(1300,690),(1100,690),(900,685),(700,680),(575,670))),
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
          # Sam, 2026-11-10: "North passage can go to the wastes." The label used to promise the Northern Watch Post while the
          # exit led to the wastes; the destination stands, the label now says so.
          dict(rect=[477, 146, 781, 517], to=["wastes"], label="The north passage: on across the cavern floor to the wastes"),
          dict(rect=[103, 838, 243, 1178], to=["shore"], label="PROPOSED: on west to the Darklake", proposed=True),
          # Sam, 2026-11-10: "base it on the campaign literature." OotA p.20: the south passage "leads toward Gracklstugh".
          # This exit used to walk onto the lair plate every time (its label said "the road marker decides", and nothing
          # decided). It is the way off the outpost now: `roads` narrows this cavern's hand-off to the one road this mouth
          # opens (lib/travel/handoff.ts; road-15 is Sam's own pick for the south passage, Exit Picker 2026-10-24). The
          # lair is the Hook Horror Hunt of ch.2 (p.33), days down that road, not a neighbour of the outpost: its plate is
          # reached from the DM's jump list until road markers open their own plates.
          dict(rect=[1887, 289, 2232, 633], to=[], kind="leave", roads=["road-15"], label="Deeper in: the south passage runs on toward Gracklstugh (OotA p.20)"),
          # 2026-11-23, the deep caverns (DEEP, below): Claude's exit on Sam's painted floor, proposed
          dict(rect=[1950, 1149, 2150, 1309], to=["fork"], label="PROPOSED: a side crack in the east wall, into the Fork", proposed=True)]),
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
          # 2026-11-23: was the map hand-off itself (to=[], kind="leave"); it walks onto the Flooded Stair now, whose way down
          # carries the same hand-off (via="wastes"). Sam's rect, Sam's label kept.
          dict(rect=[969, 90, 1412, 433], to=["flooded-stair"], label="Tunnel to the Oozing Temple"),
          # 2026-11-23, the deep caverns (DEEP, below): Claude's exit on Sam's painted floor, proposed
          dict(rect=[1750, 669, 1950, 829], to=["gorge"], label="PROPOSED: along the chasm edge to the Gorge", proposed=True),
          dict(rect=[670, 1169, 870, 1329], to=["steam-vents"], label="PROPOSED: up a side passage to the Steam Vents", proposed=True)]),
 "lair": dict(slug="biome-lair", name="The lair", biome="tunnels", scale=1.0, img="biome-lair.jpg",
   # the lair floor; the bone pile and the wheel block
   floors=[dict(poly=P((420,630),(900,490),(1450,420),(1730,470),(1950,520),(2230,770),(2230,1120),(1800,1339),(520,1339),(210,1050),(150,900),(150,750),(280,770)))],
   obstacles=[dict(cx=780,cy=540,rx=230,ry=90)],
   zones=[# 2026-11-23: was to=["tunnels"] (one-way, nothing led in). The Clacking Gallery is the lair's way in and out now.
          dict(rect=[759, 1186, 1765, 1337], to=["clacking"], label="PROPOSED: back out through the Clacking Gallery", proposed=True),
          dict(rect=[1448, 262, 1730, 564], to=[], kind="leave", label="Hook Horror Layer"),
          # 2026-11-23, the deep caverns (DEEP, below): Claude's exit on Sam's painted floor, proposed
          dict(rect=[610, 749, 810, 909], to=["nest"], label="PROPOSED: climb the west wall to the Nest", proposed=True)]),
 "shore": dict(slug="biome-shore", name="The Darklake shore", biome="shore", scale=1.0, img="biome-shore.jpg",
   # the cobbled shore below the water line; the crates, the chest, the keelboat and the crystals block
   floors=[dict(poly=P((150,825),(180,700),(400,620),(725,690),(1000,675),(1400,690),(1750,725),(2050,800),(2200,1000),(2050,1339),(450,1339),(250,1125)))],
   obstacles=[dict(cx=725,cy=725,rx=60,ry=35),dict(cx=1750,cy=825,rx=70,ry=40),dict(cx=1500,cy=790,rx=160,ry=60),dict(cx=350,cy=1175,rx=120,ry=80),dict(cx=2075,cy=1125,rx=70,ry=60),dict(cx=500,cy=1050,rx=40,ry=60)],
   zones=[dict(rect=[882, 1134, 1537, 1337], to=["tunnels"], label="Back along the river  into the tunnels"),
          dict(rect=[176, 568, 499, 803], to=[14], label="Back to towards the underground river"),
          dict(rect=[1316, 512, 1653, 698], to=[], kind="leave", label="Traverse the Darklake"),
          # 2026-11-23, the deep caverns (DEEP, below): Claude's exit on Sam's painted floor, proposed
          dict(rect=[1910, 849, 2110, 1009], to=["jetty"], label="PROPOSED: along the rocks to the Broken Jetty", proposed=True)]),
 "grove": dict(slug="biome-grove", name="The grove", biome="fungal", scale=1.0, img="biome-grove.jpg",
   # the dirt clearing under the giant caps; the roots and the mushroom clumps block
   floors=[dict(poly=P((375,825),(650,625),(950,550),(1300,550),(1625,600),(1900,750),(2230,750),(2230,900),(2000,1075),(1700,1250),(1400,1339),(750,1339),(425,1200),(250,1000),(140,900),(140,700)))],
   obstacles=[dict(cx=375,cy=625,rx=80,ry=40),dict(cx=1650,cy=525,rx=80,ry=40),dict(cx=1825,cy=950,rx=80,ry=50),dict(cx=1525,cy=1100,rx=100,ry=60)],
   # OotA p.19: the river runs from the pool to the Darklake; the grove is reached along it from plate 14, so back is the pool.
   zones=[dict(rect=[0, 560, 140, 900], to=[14], label="Back up the river to the pool"),
          dict(rect=[2229, 665, 2400, 836], to=[], kind="leave", label="New exit"),
          # 2026-11-23, the deep caverns (DEEP, below): Claude's exit on Sam's painted floor, proposed
          dict(rect=[1150, 529, 1350, 689], to=["zurkhwood"], label="PROPOSED: between the trunks to the Zurkhwood Stand", proposed=True)]),
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

# ── road battle plates, the pilot ────────────────────────────────────────────────────────────────────────────────────
# Sam, 2026-11-12: "we can create painted and pixel battle maps for the terrain encounters, creature encounters, ambush
# lair, ambushers, darklake encounters" -> "Go for pilot three rope bridge boneyards and webs" -> "Go with your picks"
# (Rope bridge A, Boneyard B, Webs B; Runway tasks f2366a55 / 7a043c02 / 15db6dcc, 2752x1536 Lanczos -> 2400x1339).
# The terrain names are the book's (OotA ch.2 Random Encounters, Terrain Encounters; our encounter_table_rows). Doc:
# claude/Battle_Plates_For_Road_Encounters_2026-11-12.md. Nothing links to these yet: the DM reaches them from the jump
# list, and the road's fight hand-off will open them (enterNode's `spawn`). Each has "back to the road" ways out that only
# say so until then. Floors, obstacles and zones traced by Claude by eye and walk-checked; NOT yet Sam's brush.
# Rope bridge: deck only (Sam, 2026-10-14) -- the chasm, the ropes and the posts are not floor.
# `arrive` is where the party stands when a road fight opens the plate (template.html roadFight): the near side, so the
# foes come at them across the plate.
ROAD_PLATES = {
 "road-rope-bridge": dict(slug="road-rope-bridge", arrive=[400, 700], name="Road: the rope bridge", scale=1.0, img="road-rope-bridge.jpg",
   floors=[dict(poly=P((0,615),(240,522),(450,492),(645,462),(693,502),(698,630),(712,638),(712,720),(698,735),(705,810),(645,840),(510,915),(375,960),(255,840),(90,780),(0,780))),   # the west ledge
           dict(poly=P((705,638),(975,670),(1200,686),(1425,670),(1695,630),(1695,717),(1425,750),(1200,765),(975,750),(705,720))),   # the plank deck, sagging in the middle
           dict(poly=P((1688,630),(1710,622),(1718,468),(1875,450),(2025,458),(2160,480),(2400,510),(2400,840),(2220,855),(2025,885),(1800,832),(1710,765),(1710,720),(1688,717)))],  # the east ledge
   obstacles=[dict(cx=90,cy=818,rx=60,ry=45),dict(cx=2205,cy=502,rx=68,ry=42)],   # the stalagmite foot, the crystal cluster
   zones=[dict(rect=[0, 615, 75, 780], to=[], kind="leave", label="Back to the road, west"),
          dict(rect=[2325, 510, 2400, 840], to=[], kind="leave", label="Back to the road, east")]),
 "road-boneyard": dict(slug="road-boneyard", arrive=[1200, 1090], name="Road: the boneyard", scale=1.0, img="road-boneyard.jpg",
   # the open floor ringed by the great skeletons; loose single bones are walked over, the skull and the rib pile block
   floors=[dict(poly=P((1050,300),(1290,292),(1320,375),(1395,465),(1680,495),(1792,518),(1808,630),(1785,750),(1800,855),(1830,930),(1800,1110),(1350,1200),(1050,1185),(840,1140),(810,1020),(570,1020),(600,900),(720,795),(750,705),(690,630),(870,540),(1035,465)))],
   obstacles=[dict(cx=1598,cy=998,rx=48,ry=33),dict(cx=1748,cy=948,rx=72,ry=39)],
   zones=[dict(rect=[1065, 292, 1275, 375], to=[], kind="leave", label="Back to the road")]),
 "road-webs": dict(slug="road-webs", arrive=[1180, 1250], name="Road: the webs", scale=1.0, img="road-webs.jpg",
   # the clearing under the arch, the gap in the web curtain, and the path below it; every web sheet and both posts are not floor
   floors=[dict(poly=P((1162,322),(1328,322),(1350,450),(1395,555),(1545,630),(1725,668),(1770,735),(1680,780),(1628,758),(1515,780),(1492,870),(1290,892),(1282,1050),(1455,1162),(1440,1340),(960,1340),(1020,1185),(1148,1050),(1148,885),(990,840),(960,810),(960,645),(1050,600),(1140,510),(1162,450)))],
   obstacles=[],
   zones=[dict(rect=[1170, 322, 1320, 405], to=[], kind="leave", label="Back to the road, through the arch"),
          dict(rect=[990, 1275, 1410, 1339], to=[], kind="leave", label="Back to the road, the way you came")]),
 # Sam's plate list, 2026-11-12: "Gricks and umber hulk: tunnels". The same painting as the tunnels cavern, as a plate of
 # its own so a road fight is not standing in Velkynvelve's back yard: its ways out are the road, not the outpost.
 # It walks Sam's own brush for the tunnels (the mask is shared below, after masks.json is read); floors are the fallback.
 "road-tunnels": dict(slug="road-tunnels", arrive=[1200, 1120], name="Road: the tunnels", scale=1.0, img="biome-tunnels.jpg",
   floors=[dict(poly=P((240,800),(450,590),(500,420),(780,330),(1050,520),(1800,560),(1900,330),(2230,330),(2300,700),(2300,900),(2100,1150),(1750,1339),(420,1339),(200,1150),(120,1000)))],
   obstacles=[],
   zones=[dict(rect=[892, 1224, 1523, 1339], to=[], kind="leave", label="Back to the road, the way you came"),
          dict(rect=[477, 146, 781, 517], to=[], kind="leave", label="Back to the road, on ahead")]),

 # THE TUNNEL PLATES (Sam, 2026-11-23: "create a few generic tunnel combat plates should we encounter something while
 # walking"). Three generic tunnel battle maps, painted on Runway in the rope bridge's approved style (tasks caa1f4e6,
 # 7c3f8831, b020e27a), rolled for any road fight that falls to the tunnels (lib/travel/battle.ts TUNNEL_PLATES).
 # Floors, obstacles and exits traced by Claude by eye and walk-checked; NOT yet Sam's brush.
 "road-tunnels-junction": dict(slug="road-tunnels-junction", arrive=[300, 780], name="Road: a tunnel junction", scale=1.0, img="road-tunnels-junction.jpg",
   # a broad floor east to west with a side passage north; the two stalagmite stands and the boulder tumble are cover
   floors=[dict(poly=P((0,560),(200,470),(400,440),(840,420),(1000,300),(1030,0),(1390,0),(1380,300),(1500,400),(1900,420),(2300,440),(2400,520),(2400,1000),(2200,1060),(1800,1120),(1200,1150),(700,1140),(380,1110),(200,1040),(0,900)))],
   obstacles=[dict(cx=510,cy=700,rx=110,ry=85),dict(cx=1790,cy=730,rx=160,ry=100),dict(cx=1030,cy=890,rx=250,ry=80),dict(cx=1290,cy=870,rx=40,ry=40)],
   zones=[dict(rect=[0, 580, 70, 880], to=[], kind="leave", label="Back to the road, the way you came"),
          dict(rect=[2330, 540, 2400, 980], to=[], kind="leave", label="Back to the road, on ahead"),
          dict(rect=[1060, 0, 1360, 70], to=[], kind="leave", label="Back to the road, up the side passage")]),
 "road-tunnels-winding": dict(slug="road-tunnels-winding", arrive=[150, 375], name="Road: a winding tunnel", scale=1.0, img="road-tunnels-winding.jpg",
   # one narrow passage that doubles back on itself to a stream crossing (the choke), opening into two chambers
   floors=[dict(ellipse=[0,380,85,85]),
           dict(ellipse=[120,375,85,85]),
           dict(ellipse=[250,370,85,85]),
           dict(ellipse=[380,365,85,85]),
           dict(ellipse=[500,360,85,85]),
           dict(ellipse=[620,380,85,85]),
           dict(ellipse=[700,410,85,85]),
           dict(ellipse=[770,470,85,85]),
           dict(ellipse=[800,540,85,85]),
           dict(ellipse=[790,620,85,85]),
           dict(ellipse=[750,700,85,85]),
           dict(ellipse=[690,780,85,85]),
           dict(ellipse=[640,860,85,85]),
           dict(ellipse=[620,940,85,85]),
           dict(ellipse=[650,1020,85,85]),
           dict(ellipse=[720,1080,85,85]),
           dict(ellipse=[820,1110,85,85]),
           dict(ellipse=[920,1100,85,85]),
           dict(ellipse=[1010,1050,85,85]),
           dict(ellipse=[1080,970,85,85]),
           dict(ellipse=[1120,880,85,85]),
           dict(ellipse=[1160,790,85,85]),
           dict(ellipse=[1210,700,85,85]),
           dict(ellipse=[1290,640,85,85]),
           dict(ellipse=[1380,640,85,85]),
           dict(ellipse=[1470,670,85,85]),
           dict(ellipse=[1560,720,85,85]),
           dict(ellipse=[1620,790,85,85]),
           dict(ellipse=[1650,860,85,85]),
           dict(ellipse=[1820,390,330,170]),dict(ellipse=[1540,520,150,110]),
           dict(ellipse=[1910,980,300,190]),dict(ellipse=[1700,880,140,110])],
   obstacles=[],
   zones=[dict(rect=[0, 300, 60, 450], to=[], kind="leave", label="Back to the road, the way you came"),
          dict(rect=[2080, 900, 2180, 1080], to=[], kind="leave", label="Back to the road, on ahead")]),
 "road-tunnels-ledge": dict(slug="road-tunnels-ledge", arrive=[420, 1000], name="Road: a split-level cavern", scale=1.0, img="road-tunnels-ledge.jpg",
   # a lower floor in front and a raised shelf behind, joined by the ramp on the right; two great pillars and the rubble are cover
   floors=[dict(poly=P((120,700),(400,640),(800,700),(1200,760),(1600,700),(1800,640),(2000,600),(2260,620),(2300,900),(2200,1150),(2000,1250),(1500,1339),(400,1339),(150,1200),(80,1000))),
           dict(poly=P((600,410),(1000,395),(1400,400),(1600,385),(1900,420),(2050,500),(2000,620),(1800,690),(1700,710),(1650,600),(1400,480),(1000,480),(620,480))),
           dict(poly=P((60,430),(300,390),(400,700),(150,900),(60,800))),
           dict(poly=P((2080,300),(2300,260),(2320,640),(2120,640)))],
   obstacles=[dict(cx=900,cy=640,rx=100,ry=55),dict(cx=1630,cy=610,rx=70,ry=40),dict(cx=700,cy=1140,rx=170,ry=70),dict(cx=1920,cy=980,rx=70,ry=50)],
   zones=[dict(rect=[60, 450, 140, 780], to=[], kind="leave", label="Back to the road, the way you came"),
          dict(rect=[2210, 300, 2300, 600], to=[], kind="leave", label="Back to the road, on ahead")]),
}
NODES.update(ROAD_PLATES)

# ── THE RUINS: six rooms behind the door on the tunnel road ─────────────────────────────────────────────────────────
# Sam, 2026-11-23: "Create some high quality painted plates maybe six. There should probably be some skeletons than will
# come out and some horror somewhere." -> the six paintings ("Looks good") -> "Wire them so they are connected like other
# painted plates, with this module having it's own sinister music from elevenlabs, each room passive rolls a dice for
# what you will find. Make sure you put some pixel art assets that are appropriate. Have some hidden item that are only
# available on a passive perception success."
# The paintings: Runway nano-banana-pro, 2752x1536 Lanczos -> 2400x1339, tasks 20b7fbc0 / e543f9f4 / c24ecd39 / 58a229d3 /
# 3ff87d62 / 6195c178. The place is the book's "Ruins" terrain encounter (OotA D&D Encounters ch.2 p.31): "a small ruin
# hidden in the Underdark". The book gives it no rooms; the six rooms and how they join are OURS:
#   road <-> Threshold <-> Ossuary <-> Great Hall <-> Flooded Crypt <-> Sanctum,  Great Hall <-> Reliquary
# The way in is the pixel road's Ruins (public/pixel-road, "Enter the ruins" -> /velkynvelve?ruins=1, template.html
# ruinsDoor); the Threshold's way out goes back to that road. What each room holds is rolled by lib/plate-director.mjs
# (RUIN_ROOMS); the searchable things are story.json loot spots.
# Floors, obstacles and exits traced by Claude by eye from the paintings and walk-checked; NOT yet Sam's brush.
RUINS_PLATES = {
 "ruins-threshold": dict(slug="ruins-threshold", arrive=[1200, 1150], name="The Ruins: the threshold", scale=1.0, img="ruins-threshold.jpg",
   # the colonnade hall: the cracked floor from the back wall to the bottom edge, and the sill of the violet doorway
   floors=[dict(poly=P((440,665),(1085,645),(1100,560),(1300,560),(1315,645),(1960,655),(2090,840),(2230,960),(2400,1130),(2400,1339),(0,1339),(0,1210),(70,1150),(210,960),(310,840))),],
   # the two fallen columns (two ellipses each, they lie on a slant), the rubble heap, the hole in the paving, the loose blocks
   obstacles=[dict(cx=600,cy=790,rx=115,ry=62),dict(cx=790,cy=715,rx=105,ry=58),dict(cx=1650,cy=770,rx=105,ry=56),dict(cx=1805,cy=705,rx=95,ry=56),
              dict(cx=450,cy=1065,rx=250,ry=85),dict(cx=1000,cy=790,rx=115,ry=52),dict(cx=1470,cy=825,rx=85,ry=32),dict(cx=690,cy=750,rx=32,ry=26)],
   zones=[dict(rect=[900, 1285, 1500, 1339], to=[], kind="leave", label="Out of the ruins: back to the tunnel road"),
          dict(rect=[1110, 560, 1290, 640], to=["ruins-ossuary"], label="The violet doorway: the Ossuary")]),
 "ruins-ossuary": dict(slug="ruins-ossuary", arrive=[1200, 1200], name="The Ruins: the ossuary", scale=1.0, img="ruins-ossuary.jpg",
   # the aisle between the six sarcophagi, out to the foot of the skull walls, and the sill of the far door
   floors=[dict(poly=P((1090,205),(1310,205),(1320,290),(1570,295),(1770,560),(1960,860),(2080,1180),(2010,1339),(400,1339),(330,1180),(470,860),(650,560),(840,295),(1080,290)))],
   # the six sarcophagi (far to near, left then right), the leaning lid, the two bone heaps, the two lids at the bottom edge
   obstacles=[dict(cx=930,cy=385,rx=88,ry=105),dict(cx=860,cy=615,rx=115,ry=140),dict(cx=760,cy=945,rx=135,ry=185),
              dict(cx=1455,cy=380,rx=78,ry=100),dict(cx=1545,cy=620,rx=112,ry=140),dict(cx=1655,cy=945,rx=152,ry=185),dict(cx=1850,cy=1050,rx=58,ry=85),
              dict(cx=440,cy=880,rx=105,ry=75),dict(cx=1965,cy=885,rx=95,ry=75),dict(cx=590,cy=1310,rx=150,ry=50),dict(cx=1760,cy=1310,rx=150,ry=50)],
   zones=[dict(rect=[1000, 1290, 1400, 1339], to=["ruins-threshold"], label="Back to the threshold"),
          dict(rect=[1100, 205, 1300, 285], to=["ruins-great-hall"], label="The far door: the Great Hall")]),
 "ruins-great-hall": dict(slug="ruins-great-hall", arrive=[1750, 1220], name="The Ruins: the great hall", scale=1.0, img="ruins-great-hall.jpg",
   # the paved floor east of the crack, from the rockfall down to the bottom edge. The ledge west of the crack is not
   # reached from here and is not floor; the crack itself is the way down.
   floors=[dict(poly=P((1260,690),(1700,700),(1830,755),(2060,800),(2240,820),(2255,1000),(2260,1180),(2260,1339),(1240,1339),(1235,1175),(835,1175),(900,1090),(855,1000),(905,890),(1090,785)))],
   # the five standing pillars' feet (near to far), the two fallen columns, the loose rocks, the column along the bottom
   obstacles=[dict(cx=1320,cy=1335,rx=88,ry=52),dict(cx=1570,cy=1270,rx=96,ry=46),dict(cx=1740,cy=1092,rx=70,ry=36),dict(cx=1880,cy=912,rx=70,ry=36),dict(cx=1985,cy=778,rx=58,ry=30),
              dict(cx=1530,cy=945,rx=165,ry=48),dict(cx=2055,cy=992,rx=140,ry=66),dict(cx=2092,cy=1100,rx=40,ry=28),dict(cx=2080,cy=1305,rx=235,ry=50)],
   zones=[dict(rect=[1660, 1285, 1850, 1339], to=["ruins-ossuary"], label="Back to the ossuary"),
          dict(rect=[860, 950, 960, 1050], to=["ruins-flooded-crypt"], label="The crack in the floor: down to the Flooded Crypt"),
          dict(rect=[2100, 805, 2240, 870], to=["ruins-reliquary"], label="The east arcade: the Reliquary")]),
 "ruins-flooded-crypt": dict(slug="ruins-flooded-crypt", arrive=[420, 1150], name="The Ruins: the flooded crypt", scale=1.0, img="ruins-flooded-crypt.jpg",
   # the near platform, the causeway across the black water, and the far platform up to the arch. The lit stair in the
   # far corner and the steps at the bottom right stand in water with no dry way to them: not floor.
   floors=[dict(poly=P((0,945),(300,815),(500,892),(1380,455),(1385,305),(1700,165),(1870,205),(2080,285),(2275,500),(2040,640),(1840,532),(1600,680),(825,1060),(1000,1150),(1000,1339),(0,1339)))],
   obstacles=[],
   zones=[dict(rect=[150, 1285, 650, 1339], to=["ruins-great-hall"], label="The climb: back up to the Great Hall"),
          dict(rect=[1890, 225, 2060, 310], to=["ruins-sanctum"], label="The arch across the water: the Sanctum")]),
 "ruins-sanctum": dict(slug="ruins-sanctum", arrive=[1580, 1230], name="The Ruins: the sanctum", scale=1.0, img="ruins-sanctum.jpg",
   # the round floor about the pit, under the chained idol
   floors=[dict(poly=P((330,565),(560,600),(900,520),(1300,472),(1700,492),(2000,562),(2200,722),(2280,1000),(2300,1339),(100,1339),(120,960),(180,760)))],
   # the pit, the idol's foot, the fallen slab, the three near benches, the four east benches
   obstacles=[dict(cx=980,cy=720,rx=405,ry=180),dict(cx=720,cy=530,rx=190,ry=75),dict(cx=490,cy=965,rx=200,ry=110),
              dict(cx=970,cy=958,rx=180,ry=62),dict(cx=1075,cy=1098,rx=195,ry=68),dict(cx=1210,cy=1222,rx=200,ry=72),
              dict(cx=1630,cy=758,rx=150,ry=56),dict(cx=1775,cy=852,rx=155,ry=58),dict(cx=1945,cy=944,rx=165,ry=62),dict(cx=2125,cy=1054,rx=165,ry=66),dict(cx=2070,cy=990,rx=26,ry=22)],
   zones=[dict(rect=[1440, 1290, 1740, 1339], to=["ruins-flooded-crypt"], label="Back to the flooded crypt")]),
 "ruins-reliquary": dict(slug="ruins-reliquary", arrive=[760, 900], name="The Ruins: the reliquary", scale=1.0, img="ruins-reliquary.jpg",
   # the vault floor between the alcove walls, and the lit sill of the open door
   floors=[dict(poly=P((560,705),(800,585),(1700,585),(1880,760),(2000,1000),(2080,1339),(560,1339),(520,1000),(520,985),(520,840),(600,820)))],
   # the two far coffers, the pots between them, the plinth, the near-left coffer, the near-right coffer, the fallen lid
   obstacles=[dict(cx=950,cy=640,rx=185,ry=92),dict(cx=1595,cy=670,rx=172,ry=90),dict(cx=1340,cy=620,rx=55,ry=32),dict(cx=1210,cy=950,rx=100,ry=50),
              dict(cx=640,cy=1210,rx=270,ry=125),dict(cx=1790,cy=1185,rx=200,ry=128),dict(cx=1460,cy=1120,rx=140,ry=58),dict(cx=790,cy=590,rx=24,ry=20),dict(cx=1690,cy=590,rx=24,ry=20)],
   zones=[dict(rect=[520, 840, 600, 985], to=["ruins-great-hall"], label="The door: back to the Great Hall")]),
 # THE NECROMANCER'S LABORATORY (Sam, 2026-11-24, on the Act One board: "A successful investigation check will identify a
 # sigil. A successful arcana check will activate it, opening a hidden room to the necromancers laboratory ... Interacting
 # with activated sigil teleports your party to that room." -> "The sigil plate in in the Ruins: the threshold on the
 # west wall" -> "Way back is through another sigil on the interior."). A room with NO doors: the only way in or out is
 # the sigil (story.json `sigil` loot spots; template.html THE SIGIL). Painting: Runway task e2851fdf (take 2 of 2, the
 # one with no doorway), styled from ruins-reliquary.jpg, 2752x1536 Lanczos -> 2400x1339. Floor and obstacles traced by
 # Claude by eye and walk-checked; NOT yet Sam's brush.
 "ruins-necro-lab": dict(slug="ruins-necro-lab", arrive=[1210, 1190], name="The Ruins: the necromancer's laboratory", scale=1.0, img="ruins-necro-lab.jpg",
   # the flagstones between the shelves, the workbench (left) and the staff wall (right), down to the bottom edge
   floors=[dict(poly=P((770,615),(1740,615),(1880,740),(2110,930),(2380,1180),(2400,1339),(330,1339),(500,1200),(700,820)))],
   # the lectern's foot, the skull and candle by the east wall
   obstacles=[dict(cx=1200,cy=640,rx=80,ry=40),dict(cx=1850,cy=730,rx=70,ry=40)],
   zones=[]),
}
NODES.update(RUINS_PLATES)

# ── battle plates for fights inside the outpost ─────────────────────────────────────────────────────────────────────
# Sam, 2026-11-13, on a pen fight where an ally walked through the open gate mid-fight: "This is why we need to have a
# separate battle screen for now. This is a bit complicated, so lets simplify it." -> a NEW, LARGER dedicated painting for
# the pen gate (not the landing close-up, not the rope bridge plate), and every Velkynvelve fight to move to a battle
# screen in time. -> "C is good" (candidate C of four; Runway task 2f7629a9, painted from the landing close-up
# pen-outside.jpg, 2752x1536 Lanczos -> 2400x1339). -> "loot on the battle screen first": the fight ends here, the dead
# lie here to be searched, and the party leaves by one of the plate's own ways out. Doc: claude/Separate_Battle_Screen_2026-11-13.md.
# The landing outside the pen gate, drawn about one and a half times the close-up's floor, with a second ledge across the
# bridge. Figures stand at scale 1.0 here (the pen draws them at 1.25), so the same floor holds more squares.
# `stands_for`: the plate this one is a bigger picture of. Its neighbours have no way in "from the battle plate", so an
# arrival from here comes in by their door from THAT plate (template.html enterNode).
# Floors, obstacles and exits traced by Claude by eye from the painting and walk-checked; NOT yet Sam's brush.
# Rope bridge: deck only (Sam, 2026-10-14). The gate is painted shut: its exit is the foot of it, not a doorway to walk.
# WIRED 2026-11-13 (Sam: "go"): a fight with the gate watch on the landing is played here (template.html THE BATTLE SCREEN).
# `foes_at`: where the watch stands when the fight opens -- the bridge's near end, the deck, then the far ledge.
BATTLE_PLATES = {
 "battle-pen-gate": dict(slug="battle-pen-gate", stands_for=11, arrive=[2050, 760], foes_at=[[1210,800],[900,768],[330,600],[180,580]], name="The landing outside the pen gate", scale=1.0, img="battle-pen-gate.jpg",
   floors=[dict(poly=P((0,470),(150,450),(380,440),(470,500),(505,595),(430,690),(300,715),(150,700),(0,640))),                       # the far ledge, across the bridge
           dict(poly=P((425,692),(520,600),(650,655),(800,700),(1000,705),(1105,698),(1048,802),(900,822),(740,815),(600,775))),     # the plank deck, sagging in the middle
           dict(poly=P((1040,800),(1100,700),(1190,690),(1250,640),(1360,610),(1500,540),(1700,520),(1850,505),(2040,560),(2110,600),  # the landing
                       (2200,650),(2330,715),(2390,770),(2390,900),(2290,930),(2230,1000),(2150,1090),(2080,1160),(2050,1339),(1800,1339),
                       (1790,1200),(1620,1180),(1560,1110),(1450,1040),(1300,1015),(1160,985),(1060,880)))],
   # the crate by the lamp, the fallen pillar (the crate beside it was painted out for the loot chest, 2026-11-15), the standing pillar, the stool, the two runs of
   # low rubble wall, the stalagmites at the stairhead, the small chest, the crystals on the lip
   obstacles=[dict(cx=1380,cy=578,rx=64,ry=48),dict(cx=1660,cy=650,rx=108,ry=46),dict(cx=1700,cy=490,rx=56,ry=28),
              dict(cx=1945,cy=515,rx=36,ry=26),dict(cx=2030,cy=935,rx=78,ry=40),dict(cx=2160,cy=835,rx=62,ry=56),dict(cx=1680,cy=1040,rx=135,ry=62),
              dict(cx=1520,cy=990,rx=95,ry=82),dict(cx=1872,cy=1072,rx=36,ry=26),dict(cx=1215,cy=965,rx=80,ry=58)],
   zones=[dict(rect=[2190, 650, 2340, 740], to=[11], label="The pen gate: back into the slave pen"),
          dict(rect=[0, 470, 70, 640], to=[10], label="The far ledge: on to the Guard Tower"),
          dict(rect=[1290, 1000, 1450, 1040], to=[12], label="The cliff stairs: down to the Quaggoth Den")],
   # THE CHASM ON THE BATTLE PLATE (Sam's playtest, 2026-11-15: "Shove NEVER caused characters to fall into the chasm").
   # Every pen-gate fight moved here on 2026-11-13 (PR #1340), but the chasm rule read only the pen's own balcony, so on
   # this plate a shove off the bridge or the landing just slid the target to the nearest floor. Same rule as the pen's
   # (story.json 11/interact/gate/balcony/chasm): a push that lands in `webs` is caught unhurt and restrained, one that
   # lands in `drops` goes into the dark. Traced by Claude from the painting (2400x1339): webs hang under both ends of the
   # bridge and on the far ledge's cliff; the open drop is the gap above and below the planks and the cliffs under the
   # landing and the far ledge. Only these shapes count: a push into a crate or a wall is an ordinary push.
   chasm=dict(
     webs=[P((780,735),(1060,712),(1045,880),(900,945)), P((400,718),(520,700),(500,862),(410,935)),
           P((120,828),(300,818),(262,952),(140,945))],
     drops=[P((380,715),(1062,700),(1062,880),(1000,1339),(380,1339)),
            P((1000,860),(1160,995),(1245,1035),(1245,1339),(1000,1339)),
            P((0,650),(150,705),(300,722),(430,700),(380,1339),(0,1339)),
            P((470,500),(560,420),(1220,420),(1250,638),(1100,698),(1000,703),(800,698),(650,653),(520,598))])),
}
NODES.update(BATTLE_PLATES)

# ── the deep caverns ─────────────────────────────────────────────────────────────────────────────────────────────────
# Sam, 2026-11-23, on the wiring board: "create more plates that are unique and inspired by out of the abyss campaign to
# connect everything well to give the caverns some depth ... I want to be able to get lost." -> fifteen plates, three
# behind each of the tunnels, the wastes, the lair, the Darklake shore and the grove ("Keep all. Go ahead."; the Fork's
# three passages redone to look nothing alike: "Fork is better. Wire it."). PixelLab create_image_pro 688x384, styled on
# the cavern paintings, cut NEAREST x3.5 and centre-trimmed like the Gracklstugh rooms. The hooks are the D&D Encounters
# edition's ch.2 terrain and set encounters (page numbers per plate, from campaign_chunks); what is homebrew says so.
# They loop: tunnels -> fork -> faerzress -> steam vents -> wastes -> tunnels, and lair -> nest -> gnoll camp -> gorge ->
# wastes. Four ways are ONE WAY by design (a drop, a slide, a current); every plate still has a walk back to the outpost.
# THE LAIR IS NOW A WALK FROM THE OUTPOST (faerzress -> clacking -> lair). That reverses the 2026-11-10 note on the
# tunnels' "deeper in" exit (the lair "days down that road, not a neighbour"); Sam approved the table that says so on
# 2026-11-23, and it is flagged in the PR for him to confirm.
# Exits: Claude's, on the painted openings, all `proposed`. Floors: masks.json carries a FIRST PASS drawn by Claude from
# simple outlines (NOT Sam's brush yet); the `floors` poly here is the same outline as the fallback.
DEEP = {
 # Warning Sign terrain (OotA Encounters p.32): a drow sigil, 'Demons ahead!'
 "fork": dict(slug="deep-fork", name="The Fork", scale=1.0, img="deep-fork.png",
   floors=[dict(poly=P((101,820), (206,750), (661,715), (871,662), (941,575), (1151,540), (1326,558), (1396,610), (1571,698), (1816,610), (1991,558), (2236,575), (2096,698), (2166,872), (2404,942), (2404,1342), (241,1342), (66,1152), (-4,1048), (-4,872)))], obstacles=[],
   zones=[dict(rect=[696, 1205, 1746, 1339], to=["tunnels"], label="Back to the tunnels", proposed=True),
          dict(rect=[206, 330, 644, 750], to=["faerzress"], label="Left passage: a violet glow far down it", proposed=True),
          dict(rect=[1098, 312, 1326, 610], to=["sinkhole"], label="Centre passage, past the warning sigil: the floor sounds hollow", proposed=True),
          dict(rect=[1991, 242, 2254, 592], to=["tunnels"], label="Right passage: it bends round on itself and comes out where you started", proposed=True)]),
 # HOMEBREW: a faerzress-lit gallery; the exit shuffle (DC 10 Survival, p.25 navigation) is NOT in this PR
 "faerzress": dict(slug="deep-faerzress", name="The Faerzress Gallery", scale=1.0, img="deep-faerzress.png",
   floors=[dict(poly=P((-4,662), (311,628), (451,645), (871,592), (1011,558), (1151,522), (1431,522), (1536,592), (1816,645), (2131,662), (2404,698), (2404,1048), (2271,1342), (136,1342), (-4,1048)))], obstacles=[],
   zones=[dict(rect=[766, 1205, 1641, 1339], to=["fork"], label="Back toward the Fork", proposed=True),
          dict(rect=[0, 312, 311, 698], to=["clacking"], label="West: a faint clacking echoes up this way", proposed=True),
          dict(rect=[2131, 592, 2400, 942], to=["steam-vents"], label="East: warm, wet air", proposed=True),
          dict(rect=[1116, 242, 1431, 575], to=["spore-hollow"], label="North: the air smells of rot and mushrooms", proposed=True)]),
 # Sinkhole terrain (OotA Encounters p.30 table). One way down
 "sinkhole": dict(slug="deep-sinkhole", name="The Sinkhole", scale=1.0, img="deep-sinkhole.png",
   floors=[dict(poly=P((66,592), (346,522), (521,382), (871,382), (1046,348), (1361,348), (1501,400), (1956,488), (2404,628), (2404,1342), (136,1342), (-4,1048), (-4,698)))], obstacles=[],
   zones=[# 2026-11-23 (the cast PR): with no way back, an arrival had no door to come in by, so the page stood the party at the
          # plate's middle, which is the hole, and they dropped straight through to the Stone Teeth without ever seeing this
          # plate. The tunnel mouth they came in by is a way back now; the drop below is still one way.
          dict(rect=[1050, 150, 1360, 350], to=["fork"], label="Back up the passage to the Fork", proposed=True),
          dict(rect=[1011, 1048, 1536, 1230], to=["stone-teeth"], label="Down the hole: a drop into cold shallow water. No way back up", proposed=True)]),
 # Rope Bridge terrain: a ravine spanned by an old rope bridge (p.31). Deck only (Sam, 2026-10-14)
 "gorge": dict(slug="deep-gorge", name="The Gorge", scale=1.0, img="deep-gorge.png",
   floors=[dict(poly=P((-4,330), (696,312), (836,382), (941,522), (958,838), (871,1048), (696,1152), (626,1342), (-4,1342)))], obstacles=[],
   zones=[dict(rect=[0, 348, 171, 802], to=["wastes"], label="Back to the wastes", proposed=True),
          dict(rect=[2236, 592, 2400, 1048], to=["gnoll-camp"], label="Across the rope bridge: smoke and hyena laughter beyond", proposed=True)]),
 # Steam Vent / Gas Leak terrain (p.31)
 "steam-vents": dict(slug="deep-steam-vents", name="The Steam Vents", scale=1.0, img="deep-steam-vents.png",
   floors=[dict(poly=P((-4,698), (206,558), (486,522), (801,418), (836,522), (1046,575), (1291,592), (1396,662), (1326,750), (1501,872), (1956,872), (2096,768), (2404,802), (2404,1342), (-4,1342)))], obstacles=[],
   zones=[dict(rect=[801, 1205, 1676, 1339], to=["wastes"], label="Down to the wastes", proposed=True),
          dict(rect=[136, 242, 486, 610], to=["faerzress"], label="West: a violet glow", proposed=True)]),
 # The approach to the Oozing Temple (p.39); its way down is the wastes' old map hand-off
 "flooded-stair": dict(slug="deep-flooded-stair", name="The Flooded Stair", scale=1.0, img="deep-flooded-stair.png",
   floors=[dict(poly=P((136,820), (451,750), (836,715), (976,750), (1536,750), (1676,698), (1886,785), (2166,872), (2306,1048), (2236,1342), (206,1342), (66,1048)))], obstacles=[],
   zones=[dict(rect=[801, 1205, 1676, 1339], to=["wastes"], label="Back up to the wastes", proposed=True),
          dict(rect=[1011, 452, 1501, 750], to=[], kind="leave", via="wastes", label="Down the stair: into the Oozing Temple", proposed=True)]),
 # Hook Horror Lair features: narrow passages (p.37). The clacking is homebrew flavour
 "clacking": dict(slug="deep-clacking", name="The Clacking Gallery", scale=1.0, img="deep-clacking.png",
   floors=[dict(poly=P((1186,382), (1396,382), (1361,522), (1501,698), (1956,750), (2306,785), (2404,908), (2404,1342), (276,1342), (206,1048), (381,872), (871,820), (1011,662), (1186,522)))], obstacles=[],
   zones=[dict(rect=[1991, 382, 2341, 802], to=["faerzress"], label="Back toward the violet glow", proposed=True),
          dict(rect=[696, 1205, 1641, 1339], to=["lair"], label="Down into the lair", proposed=True)]),
 # Hook horror eggs (rules for raising a hatchling, p.38)
 "nest": dict(slug="deep-nest", name="The Nest", scale=1.0, img="deep-nest.png",
   floors=[dict(poly=P((136,698), (381,575), (906,592), (1151,645), (1501,662), (1676,610), (1956,592), (1886,680), (1641,698), (1396,750), (1396,872), (1641,960), (1676,1006), (136,988), (66,802)))], obstacles=[],
   zones=[dict(rect=[451, 838, 871, 1048], to=["lair"], label="Climb back down into the lair", proposed=True),
          dict(rect=[1501, 750, 1956, 1118], to=["gnoll-camp"], label="Off the back of the ledge: a long slide down scree. No way back up", proposed=True)]),
 # Hook Horror Hunt: the gnoll hunters' camp (p.37)
 "gnoll-camp": dict(slug="deep-gnoll-camp", name="The Gnoll Camp", scale=1.0, img="deep-gnoll-camp.png",
   floors=[dict(poly=P((-4,732), (416,680), (626,732), (836,750), (1151,662), (1326,575), (1536,558), (1676,662), (2096,750), (2271,908), (2404,978), (2404,1342), (-4,1342)))], obstacles=[],
   zones=[dict(rect=[48, 382, 398, 750], to=["gorge"], label="West: the rope bridge over the gorge", proposed=True)]),
 # A kuo-toa mooring (kuo-toa in a keelboat is a Darklake encounter, p.47)
 "jetty": dict(slug="deep-jetty", name="The Broken Jetty", scale=1.0, img="deep-jetty.png",
   floors=[dict(poly=P((486,558), (871,522), (976,575), (1326,592), (1536,662), (1746,750), (1816,820), (1571,925), (1501,1048), (1571,1152), (1396,1342), (-4,1342), (-4,820), (206,768), (381,698)))], obstacles=[],
   zones=[dict(rect=[0, 820, 171, 1152], to=["shore"], label="Back along the shore", proposed=True),
          dict(rect=[1886, 942, 2236, 1188], to=["stone-teeth"], label="Wade out between the stalagmites", proposed=True)]),
 # Low clearance over the water (p.46). The name is homebrew
 "stone-teeth": dict(slug="deep-stone-teeth", name="The Stone Teeth", scale=1.0, img="deep-stone-teeth.png",
   floors=[dict(poly=P((836,558), (1046,575), (976,645), (871,715), (976,838), (1221,890), (1431,978), (1466,1048), (1326,1152), (1046,1222), (1046,1342), (276,1342), (381,1152), (661,1012), (556,872), (661,768), (731,662)))], obstacles=[],
   zones=[dict(rect=[346, 1118, 1046, 1339], to=["jetty"], label="Wade back to the jetty", proposed=True),
          dict(rect=[784, 488, 1081, 645], to=["islet"], label="Wade on to the islet", proposed=True)]),
 # Island (p.46): a place for a long rest
 "islet": dict(slug="deep-islet", name="The Islet", scale=1.0, img="deep-islet.png",
   floors=[dict(poly=P((521,522), (696,382), (976,330), (1396,348), (1571,452), (1676,558), (1641,732), (1501,872), (1326,942), (871,942), (626,872), (486,732)))], obstacles=[],
   zones=[dict(rect=[941, 1188, 1536, 1339], to=["stone-teeth"], label="Wade back through the stone teeth", proposed=True),
          dict(rect=[1711, 802, 2096, 1118], to=["stream-sump"], label="Into the current: it pulls you under the rock. No way back", proposed=True)]),
 # Fungi of the Underdark (ch.2): zurkhwood
 "zurkhwood": dict(slug="deep-zurkhwood", name="The Zurkhwood Stand", scale=1.0, img="deep-zurkhwood.png",
   floors=[dict(poly=P((1151,522), (1326,522), (1361,662), (1571,750), (1746,872), (1816,1012), (1676,1152), (1641,1342), (801,1342), (661,1152), (556,1012), (661,890), (871,785), (1046,698), (1116,610)))], obstacles=[],
   zones=[dict(rect=[836, 1205, 1606, 1339], to=["grove"], label="Back to the grove", proposed=True),
          dict(rect=[1081, 470, 1378, 645], to=["spore-hollow"], label="Deeper in: the caps close overhead", proposed=True)]),
 # Timmask and tongue of madness (p.28). HOMEBREW exit shuffle NOT in this PR
 "spore-hollow": dict(slug="deep-spore-hollow", name="The Spore Hollow", scale=1.0, img="deep-spore-hollow.png",
   floors=[dict(poly=P((591,942), (871,802), (1151,715), (1571,732), (1886,838), (1991,1012), (1816,1152), (1571,1342), (871,1342), (626,1188), (521,1048)))], obstacles=[],
   zones=[dict(rect=[871, 1205, 1571, 1339], to=["zurkhwood"], label="Back to the zurkhwood stand", proposed=True),
          dict(rect=[1991, 452, 2288, 750], to=["stream-sump"], label="Follow the sound of water", proposed=True),
          dict(rect=[171, 522, 434, 872], to=["faerzress"], label="A crack in the rock with violet light in it", proposed=True)]),
 # Underground Stream terrain (p.32)
 "stream-sump": dict(slug="deep-stream-sump", name="The Stream Sump", scale=1.0, img="deep-stream-sump.png",
   floors=[dict(poly=P((-4,680), (311,592), (696,575), (1011,610), (1151,662), (1396,750), (1466,872), (1396,1012), (1151,1082), (871,1152), (521,1188), (206,1048), (-4,1012)))], obstacles=[],
   zones=[dict(rect=[0, 628, 154, 1048], to=["spore-hollow"], label="Up the bank into the spore hollow", proposed=True)]),
}
NODES.update(DEEP)

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
  "3k": [460, 1180],
  "fork": [-360, 1640],
  "faerzress": [-360, 1790],
  "sinkhole": [-360, 1940],
  "gorge": [80, 1640],
  "steam-vents": [80, 1790],
  "flooded-stair": [80, 1940],
  "clacking": [520, 1640],
  "nest": [520, 1790],
  "gnoll-camp": [520, 1940],
  "jetty": [1400, 1640],
  "stone-teeth": [1400, 1790],
  "islet": [1400, 1940],
  "zurkhwood": [960, 1640],
  "spore-hollow": [960, 1790],
  "stream-sump": [960, 1940]
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
# DOOR CELLS (Sam, 2026-10-28): painted floor that is only floor while that plate's gate stands open (buildGrid).
for _k, _rle in _M.get('doors', {}).items():
    if _k.startswith('_'): continue
    assert _k in _M['masks'], ('masks.json doors names a plate with no painted mask', _k)
    _runs = [int(r) for r in _rle.split(',')]
    assert sum(_runs) == _M['w'] * _M['h'], ('door cells do not cover exactly one grid', _k, sum(_runs))
    _PLATES[_k]['doorMask'] = _rle
_PLATES['road-tunnels']['mask'] = _PLATES['tunnels']['mask']   # the road's tunnels walk the tunnels' painted floor
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
KNOWN_ONE_WAY = {("4", "1"), ("5", "2"), ("5", "wastes"), ("6", "10"), ("9", "14"), ("12", "10"),
                 # 2026-11-13: a battle plate is entered by a fight, never by a door, so its ways out are one-way by design
                 ("battle-pen-gate", "10"), ("battle-pen-gate", "11"), ("battle-pen-gate", "12"),
                 # 2026-11-23, the deep caverns: a drop, a hole, a scree slide and a current, one-way on purpose. ("lair", "tunnels")
                 # is gone: the lair's way out is the Clacking Gallery, which leads back.
                 ("sinkhole", "stone-teeth"), ("nest", "gnoll-camp"), ("islet", "stream-sump")}
ALL = {str(k): v for k, v in NODES.items()}; ALL.update(CAVERNS)
links = {(a, str(t)) for a, node in ALL.items() for z in node["zones"] for t in z["to"]}
for a, b in links:
    assert b in ALL, (a, b, "leads nowhere that exists")
one_way = {(a, b) for (a, b) in links if (b, a) not in links}
unexpected = one_way - KNOWN_ONE_WAY
assert not unexpected, ("one-way links not on the known list", sorted(unexpected))
print(len(links), "ways out across", len(ALL), "plates;", len(one_way), "one-way (known):", ", ".join(f"{a}→{b}" for a, b in sorted(one_way)))
# A LABEL MUST NOT NAME A PLACE ITS EXIT DOES NOT LEAD TO (Sam, 2026-11-10: "I'm not sure they were wired correctly").
# Four exits promised one plate and led to another; the tunnels' "north passage to the Northern Watch Post" took a whole
# party to the wastes. Each phrase below names the plate(s) a label using it may lead to. An exit that leaves for the
# map (no `to`) and a label naming its own plate are not checked. KNOWN_LABEL_MISMATCH are exits from Sam's 2026-10-24
# re-trace whose label and destination disagree and where which of the two is right is HIS call: (plate, phrase, where it goes).
# A new mismatch fails the build.
PLACE_WORDS = {"southern watch post": {"1"}, "northern watch post": {"13"}, "watch post": {"1", "13"}, "main hall": {"3"},
               "kitchen": {"3k"}, "elite barracks": {"4"}, "the lift": {"5"}, "shrine": {"6"}, "ilvara": {"7"}, "shoor": {"8"},
               "toward the waterfall": {"9"}, "guard tower": {"10"}, "lower chamber": {"10b"}, "armory": {"10c"},
               "slave pen": {"11"}, "quaggoth den": {"12"}, "to the pool": {"14"}, "the wastes": {"wastes"},
               "the tunnels": {"tunnels"}, "darklake": {"shore"}, "the lair": {"lair"}, "the grove": {"grove"}}
KNOWN_LABEL_MISMATCH = set()   # the four from the 2026-10-24 re-trace were settled 2026-11-10 (Sam: "Lift -> yes")
mismatch = set()
for a, node in ALL.items():
    for z in node["zones"]:
        dest = {str(t) for t in z["to"]}
        if not dest: continue
        lab = z["label"].lower()
        for phrase, ok in PLACE_WORDS.items():
            if phrase in lab and a not in ok and not (dest & ok): mismatch.add((a, phrase, ",".join(sorted(dest))))
assert not (mismatch - KNOWN_LABEL_MISMATCH), ("an exit's label names a place it does not lead to", sorted(mismatch - KNOWN_LABEL_MISMATCH))
print("labels that name another place (known, Sam's call):", "; ".join(f"{a}: '{p}' → {d}" for a, p, d in sorted(mismatch)) or "none")
print("still PROPOSED, unreviewed:", "; ".join(f"{a}: {z['label'].split(':')[0]} → {','.join(map(str, z['to']))}" for a, node in ALL.items() for z in node["zones"] if z.get("proposed")))
out = {str(k): v for k, v in NODES.items()}
out.update({k: {kk: vv for kk, vv in v.items() if kk != "biome"} for k, v in CAVERNS.items()})   # walkable plates of the page
out["_handoffs"] = {k: dict(name=v["name"], biome=v["biome"]) for k, v in CAVERNS.items()}; out["_layout"] = LAYOUT
# a way off the outpost that is not a cavern plate: an exit names it with `via` (plate 13's north passage)
out["_handoffs"]["north"] = dict(name="The north passage", biome="tunnels")
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'spec.json'), 'w'), separators=(',', ':'))
