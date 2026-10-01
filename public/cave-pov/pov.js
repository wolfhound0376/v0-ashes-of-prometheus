// ===== CAVE POV (Sam, 9/29–9/30): a Wolfenstein-style first-person view for the dungeon part.
// A grid raycaster: one ray per screen column finds the wall, the floor and ceiling are cast per pixel, creatures are
// flat sprites that turn to show the side you are looking at (8 facings, the repo's sprite sheets). Light is the lantern
// plus the crystals: nothing is lit that no light reaches.
// 9/30: strafe, sound, hands holding the weapon (dagger, sword, bow) or shaping a spell, weapon arcs, action cards 1–9
// from each character's own sheet, eerie music, roaring monsters, a fright save that makes your character swear in
// their own voice, foraging, chests.
const cv=document.getElementById("c"), ctx=cv.getContext("2d");
const RW=640, RH=360; cv.width=RW; cv.height=RH; ctx.imageSmoothingEnabled=false;
const buf=ctx.createImageData(RW,RH), px=new Uint32Array(buf.data.buffer);
const zbuf=new Float32Array(RW);
const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
const $=(id)=>document.getElementById(id);
// ---- THE DUNGEON (Sam, 9/30: "the cave is a template for dungeons"). The engine plays one dungeon record — map,
// creatures, chests, forage, props, traps, lore, dressing — from public/cave-pov/dungeons/<id>.json (?d=<id>, default
// darklake). A draft saved by the builder in this browser wins over the file (see BUILDER below).
// Map: # rock, C crystal-veined rock, . floor, * a crystal light on the floor.
const DQ=new URLSearchParams(location.search), DID=DQ.get("d")||"darklake";
const BLD={enabled:DQ.has("build")||!!A.__artifact,open:false};
let D=null; try{ const sd=localStorage.getItem("aop_dungeon_draft_"+DID); if(sd){ D=JSON.parse(sd); D.__draft=true; } }catch(e){}
if(!D) D=JSON.parse(JSON.stringify((A.dungeons&&(A.dungeons[DID]||Object.values(A.dungeons)[0]))||null));
for(const k of ["creatures","chests","forage","props","traps","lore","hazards"]) D[k]=D[k]||[];
D.dressing=Object.assign({seed:9301,stalactites:44,props:46,violets:7},D.dressing||{});
const MAP=D.map.map(r=>r.split("")), MH=MAP.length, MW=MAP[0].length;
const cell=(x,y)=>{ const r=MAP[Math.floor(y)]; return r?r[Math.floor(x)]||"#":"#"; };
const solid=(x,y)=>{ const c=cell(x,y); return c==="#"||c==="C"; };
function texFrom(img,size=128){ const c=document.createElement("canvas"); c.width=c.height=size; const g=c.getContext("2d"); g.drawImage(img,0,0,size,size); return {size,d:new Uint8ClampedArray(g.getImageData(0,0,size,size).data)}; }
const TEX={};
function loadImg(src){ return new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.onerror=()=>r(null); i.src=src; }); }
const LIGHTS=[]; for(let y=0;y<MH;y++) for(let x=0;x<MW;x++) if(MAP[y][x]==="*") LIGHTS.push({x:x+.5,y:y+.5,r:.35,g:.62,b:1.25,rad:3.4,cell:true});

// =====================================================================================================================
// THE PARTY — numbers from the characters table (9/30): HP, AC, ability modifiers, attacks, spells, slots, voice.
// Fifi's shortbow and 12 arrows are the field-game class kit (lib/camp-field.ts, Sam's house rule 9/28): rogues carry a shortbow.
// =====================================================================================================================
const PCS={
  fifi:  {name:"Fifi",   cls:"Rogue 1",    hp:8,  ac:13, mods:{str:-1,dex:3,con:0,wis:1}, skin:["#e9c29d","#b68762"], sleeve:"#5d5345", voice:"fifi", bowProf:true, speed:1, sprite:"freia",
          // Sam, 9/30: "Clear the text and options but keep the cards 2-8. Card two can have Search. 3. Dash. 4. Throw object.
          // 5-8 can stay clear. Card 1 should show Dagger / Shortbow." The mouse already does the rest: left = dagger, right =
          // bow, wheel tap/hold = crouch/hide, 0 = leap back; a thrown-away dagger leaves the left button punching.
          stealth:7, note:"Dagger · Shortbow (12 arrows) · Sneak Attack 1d6", cards:["daggerBow","search","dash","throwObj"], slots:8, bare:true, unarmed:{hit:1,flat:1}, arrows:12},
  kenta: {name:"Kenta",  cls:"Sorcerer 1", hp:8,  ac:10, mods:{str:1,dex:0,con:2,wis:-1}, skin:["#dcae86","#a67a57"], sleeve:"#4c4a52", voice:"kenta", bowProf:false, speed:0.72, sprite:"kenta", sorcerer:true,
          note:"4 cantrips · 2 first-level slots", cards:["rayOfFrost","shockingGrasp","chillTouch","minorIllusion","fogCloud","innate","dash","dodge","unarmed"], unarmed:{hit:3,flat:2}, spell:{hit:5,dc:13,mod:3}},
  samson:{name:"Samson", cls:"Cleric 1",   hp:9,  ac:10, mods:{str:0,dex:2,con:1,wis:3}, skin:["#c99672","#94664a"], sleeve:"#54483a", voice:"samson", bowProf:true, speed:1, sprite:"samson",
          note:"Toll the Dead · Guiding Bolt · Healing Word", cards:["tollTheDead","guidingBolt","healingWord","shieldOfFaith","sanctuary","guidance","thaumaturgy","dodge","unarmed"], unarmed:{hit:2,flat:1}, spell:{hit:5,dc:13,mod:3}},
  scott: {name:"Scott",  cls:"Bard 1",     hp:10, ac:12, mods:{str:1,dex:2,con:2,wis:1}, skin:["#e0b48e","#aa7d5a"], sleeve:"#584d3e", voice:"scott", bowProf:true, speed:0.72, sprite:"scott",
          note:"Vicious Mockery · Sleep · Dissonant Whispers", cards:["viciousMockery","dissonantWhispers","sleep","faerieFire","healingWord","mageHand","dash","dodge","unarmed"], unarmed:{hit:3,flat:2}, spell:{hit:5,dc:13,mod:3}},
};
// Voice lines, cut at the word gaps the transcript found: [start,end] seconds for "Shit!", "Fuck!", "What the hell was that?!"
const LINES={fifi:[[0,1.23],[1.23,2.49],[2.49,4.6]],kenta:[[0,1.08],[1.08,2.03],[2.03,3.8]],samson:[[0,1.37],[1.37,2.67],[2.67,4.15]],scott:[[0,.59],[.59,2.18],[2.18,4.0]]};
// Items: every find resolves to a row in the items catalog (slug → name). Nothing is invented.
const ITEMS={"bluecap":"Bluecap","barrelstalk":"Barrelstalk","trillimac":"Trillimac","waterorb":"Waterorb","ripplebark":"Ripplebark","fire-lichen":"Fire Lichen","torchstalk":"Torchstalk",
  "potion-of-healing":"Potion of Healing","gold-coin":"Gold coin","flint-shard":"Flint shard","silk-rope":"Silk rope","candle-of-the-deep":"Candle of the Deep","carnelian-gem":"Carnelian gem"};
const FORAGE=["bluecap","barrelstalk","trillimac","waterorb","ripplebark","fire-lichen","torchstalk"];
const CHEST_LOOT=[[["potion-of-healing",1],["gold-coin","2d6"]],[["flint-shard",1],["silk-rope",1]],[["candle-of-the-deep",1],["carnelian-gem",1]]];

// ---- the cards. kind decides how it is used; hand decides what you hold.
const CARD={
  dagger:{name:"Dagger",icon:"🗡",hand:"dagger",kind:"melee",hit:5,dice:[1,4],mod:3,type:"piercing",reach:1.6,finesse:true,sub:"+5 · 1d4+3"},
  throw:{name:"Throw dagger",icon:"➶",hand:"dagger",kind:"thrown",hit:5,dice:[1,4],mod:3,type:"piercing",range:[4,12],finesse:true,sub:"20/60 ft"},
  longsword:{name:"Longsword",icon:"⚔",hand:"sword",kind:"melee",hit:5,dice:[1,8],mod:3,type:"slashing",reach:1.7,sap:true,sub:"+5 · 1d8+3 · Sap"},
  fifiBow:{name:"Shortbow",icon:"🏹",hand:"bow",kind:"bow",hit:5,dice:[1,6],mod:3,type:"piercing",range:[16,64],finesse:true,ammo:true,sub:"hold · +5 · 1d6+3"},
  shortbow:{name:"Shortbow",icon:"🏹",hand:"bow",kind:"bow",hit:4,dice:[1,6],mod:2,type:"piercing",range:[16,64],sub:"hold to draw · 1d6+2"},
  unarmed:{name:"Unarmed strike",icon:"✊",hand:"fist",kind:"melee",reach:1.4,type:"bludgeoning",sub:""},
  rayOfFrost:{name:"Ray of Frost",icon:"❄",hand:"magic",color:"#9fdcff",kind:"spellAtk",dice:[1,8],type:"cold",range:12,fx:"slow",sub:"+5 · 1d8 cold"},
  shockingGrasp:{name:"Shocking Grasp",icon:"ϟ",hand:"magic",color:"#c9ecff",kind:"spellMelee",dice:[1,8],type:"lightning",reach:1.6,sub:"+5 · 1d8 lightning"},
  chillTouch:{name:"Chill Touch",icon:"☠",hand:"magic",color:"#8affc9",kind:"spellMelee",dice:[1,10],type:"necrotic",reach:1.6,sub:"+5 · 1d10 necrotic"},
  minorIllusion:{name:"Minor Illusion",icon:"◌",hand:"magic",color:"#d9c7ff",kind:"decoy",sub:"a sound 30 ft off"},
  fogCloud:{name:"Fog Cloud",icon:"☁",hand:"magic",color:"#dfe6f2",kind:"fog",slot:1,sub:"1st · 20-ft fog"},
  innate:{name:"Innate Sorcery",icon:"✹",hand:"magic",color:"#ffb36b",kind:"innate",self:true,uses:2,sub:"2/rest · 1 min"},
  tollTheDead:{name:"Toll the Dead",icon:"🔔",hand:"magic",color:"#9a8cff",kind:"spellSave",save:"wis",dice:[1,8],hurtDice:[1,12],type:"necrotic",range:12,sub:"WIS DC 13 · 1d8/1d12"},
  guidingBolt:{name:"Guiding Bolt",icon:"✦",hand:"magic",color:"#ffe38a",kind:"spellAtk",slot:1,dice:[4,6],type:"radiant",range:24,fx:"guided",sub:"1st · +5 · 4d6"},
  healingWord:{name:"Healing Word",icon:"✚",hand:"magic",color:"#9dffb0",kind:"heal",self:true,slot:1,dice:[2,4],sub:"1st · 2d4+3"},
  shieldOfFaith:{name:"Shield of Faith",icon:"⛨",hand:"magic",color:"#ffe9a8",kind:"buff",self:true,slot:1,buff:"sof",sub:"1st · +2 AC"},
  sanctuary:{name:"Sanctuary",icon:"☥",hand:"magic",color:"#fff4c9",kind:"buff",self:true,slot:1,buff:"sanct",sub:"1st · WIS save to hit you"},
  guidance:{name:"Guidance",icon:"☼",hand:"magic",color:"#ffe9a8",kind:"buff",self:true,buff:"guid",sub:"+1d4 next check"},
  thaumaturgy:{name:"Thaumaturgy",icon:"≋",hand:"magic",color:"#ffcf7a",kind:"thaum",self:true,sub:"the ground trembles"},
  viciousMockery:{name:"Vicious Mockery",icon:"☺",hand:"magic",color:"#e59bff",kind:"spellSave",save:"wis",dice:[1,6],type:"psychic",range:12,fx:"mocked",sub:"WIS DC 13 · 1d6"},
  dissonantWhispers:{name:"Dissonant Whispers",icon:"♪",hand:"magic",color:"#c78cff",kind:"spellSave",slot:1,save:"wis",dice:[3,6],half:true,type:"psychic",range:12,fx:"flee",sub:"1st · 3d6 · flees"},
  sleep:{name:"Sleep",icon:"☾",hand:"magic",color:"#b9c8ff",kind:"sleep",slot:1,save:"wis",range:12,sub:"1st · WIS DC 13"},
  faerieFire:{name:"Faerie Fire",icon:"✧",hand:"magic",color:"#d78cff",kind:"spellSave",slot:1,save:"dex",nodmg:true,range:12,fx:"faerie",sub:"1st · DEX · advantage"},
  mageHand:{name:"Mage Hand",icon:"✋",hand:"magic",color:"#bfe3ff",kind:"magehand",sub:"open a chest 30 ft off"},
  secondWind:{name:"Second Wind",icon:"❤",hand:"fist",kind:"heal",self:true,uses:2,dice:[1,10],mod:1,sub:"2/rest · 1d10+1"},
  hide:{name:"Hide",icon:"◐",hand:"dagger",kind:"hide",self:true,sub:"Stealth +7 vs DC 15"},
  search:{name:"Search",icon:"◉",kind:"search",self:true,sub:"Perception DC 13"},
  dash:{name:"Dash",icon:"»",kind:"dash",self:true,sub:"double speed · 6 s"},
  dodge:{name:"Dodge",icon:"⤺",kind:"dodge",self:true,sub:"attacks at disadvantage"},
};
// Fifi's card 1 is both weapons (left click dagger, right click bow) and card 4 throws what's in hand — today the dagger.
CARD.daggerBow={...CARD.dagger,name:"Dagger / Shortbow",both:true}; CARD.throwObj={...CARD.throw,name:"Throw object"};
// monster saves and details not carried in the build: bestiary rows (Giant Spider SRD 5.1; Hook Horror, Out of the Abyss)
const PRON={fifi:{his:"her",him:"her"}}; const PR=()=>PRON[PC.voice==='fifi'?'fifi':'x']||{his:"his",him:"him"}; const cap=(s)=>s[0].toUpperCase()+s.slice(1);
const MSAVE={spider:{wis:0,dex:3,con:1},hook:{wis:1,dex:0,con:2}};

// =====================================================================================================================
// STATE
// =====================================================================================================================
let PC=null, CARDS=[];
const P={x:D.start[0],y:D.start[1],a:D.start[2]||0,hp:8,max:8,ac:10,bob:0,cool:0,hurt:0,sel:0,
  act:null, drawing:false, draw:0, trail:[], dagger:true, slots:2, uses:{}, hidden:0, dodge:0, dash:0, jz:0, jv:0, air:false, jumpPre:0, land:0, crouch:false, poison:0, blur:0, reel:0, sporeGlow:0, leap:0, leapCd:0, leapV:{x:0,y:0}, fright:0, frightSrc:null,
  sanct:0, sof:0, guid:0, innate:0, eye:.5, pitch:0, zoom:1, lunge:0, hx:RW*.5, hy:RH*.5, bodyX:RW*.3, swayX:0, swayY:0, hold:null, power:0, moving:false, hurtAnim:0, deadT:0, slash:null, restrained:false, sneakT:0, revealT:0, shake:0, voiceT:0, dead:false};
const ENTS=[];
function addEnt(e){ const o={...e,id:ENTS.length,frame:0,ft:0,hp:e.hp??1,max:e.hp??1,cool:1.5,state:"idle",flash:0,dead:false,mode:"idle",home:[e.x,e.y],pops:[],
  webReady:e.sprite==="spider",webT:0,roarT:-99,sleep:0,incap:0,slow:0,faerie:0,guided:0,mocked:false,sapped:false,flee:0,lure:null,lastSeen:null,opened:false,spent:false}; ENTS.push(o); return o; }
// the record's pieces become entities; `src` points back at the record entry so the builder can erase it
function entFor(kind,o){ if(kind==="creature"){ const L=A.creatures[o.kind]; return L&&{...L,x:o.x,y:o.y,heading:o.heading??0,src:o}; }
  if(kind==="chest") return {name:"chest",sprite:"chest",x:o.x,y:o.y,scale:.45,solid:true,chest:true,loot:o.loot&&o.loot.length?o.loot:null,src:o};
  if(kind==="forage") return {name:"mushrooms",sprite:"p_fungi-bluecap",x:o.x,y:o.y,scale:.34,glow:"rgba(90,230,255,A)",forage:true,src:o};
  if(kind==="crystal") return {name:"crystal",sprite:"p_crystal-cluster",x:o.x,y:o.y,scale:.72,glow:"rgba(120,180,255,A)",solid:true,rad:.42,src:o};
  return null; }
for(const c of D.creatures){ const e=entFor("creature",c); if(e) addEnt(e); }
for(const c of D.chests) addEnt(entFor("chest",c));
for(const f of D.forage) addEnt(entFor("forage",f));
for(let y=0;y<MH;y++) for(let x=0;x<MW;x++) if(MAP[y][x]==="*") addEnt(entFor("crystal",{x:x+.5,y:y+.5,cell:true}));
let CHESTN=0; for(const e of ENTS) if(e.chest&&!e.loot) e.loot=CHEST_LOOT[(CHESTN++)%CHEST_LOOT.length];
const SPR={};
const FX=[];      // projectiles, bursts, fog puffs, decoys
const LATER=[];   // scheduled callbacks
const BAG={};
let showMap=true, t=0, started=false, searchT=0;
// ---- DRESSING (Sam, 9/30: "add some liquid, moisture dripping, and more mushrooms and stalactites"). Placed from a fixed
// seed so the cave is the same every visit: stalactites on the ceiling (water beads and drips from their tips, puddles
// below some), stalagmites by the walls, glowing mushroom clusters in three colours, a few of which light the rock.
function rng32(a){ return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const DECO_RND=rng32(D.dressing.seed);
const taken=new Set(ENTS.map(e=>Math.floor(e.x)+","+Math.floor(e.y))); taken.add(Math.floor(P.x)+","+Math.floor(P.y));
const openCells=[]; for(let y=1;y<MH-1;y++) for(let x=1;x<MW-1;x++){ if(solid(x+.5,y+.5)||MAP[y][x]==="*"||taken.has(x+","+y)) continue; const walls=[[1,0],[-1,0],[0,1],[0,-1]].filter(([a,b])=>solid(x+a+.5,y+b+.5)).length; openCells.push({x,y,walls}); }
const pick=(list)=>list.splice(Math.floor(DECO_RND()*list.length),1)[0];
const STALS=[], MUSHC=[{glow:"rgba(190,110,255,A)",hue:0,l:[.55,.3,1.1]},{glow:"rgba(90,230,255,A)",hue:190,l:[.25,.85,1.1]},{glow:"rgba(255,190,90,A)",hue:-70,l:[1.1,.7,.25]}];
{ const pool=openCells.slice(); for(let i=0;i<D.dressing.stalactites&&pool.length;i++){ const c=pick(pool); const s={name:"stalactite",sprite:"stalC"+(i%3),hang:true,deco:true,x:c.x+.2+DECO_RND()*.6,y:c.y+.2+DECO_RND()*.6,scale:.34+DECO_RND()*.34};
    ENTS.push({...s,id:ENTS.length,ft:0,state:"idle",pops:[],flash:0}); STALS.push(s); if(DECO_RND()<.45) FX.push({kind:"puddle",x:s.x,y:s.y,r:.16+DECO_RND()*.14,life:1e9,rip:0}); } }
// Sam, 9/30: the field games' pixel art in place of the painted cut-outs — crystals, fungi, stalagmites, rock — and you
// can't walk through the big ones. Solid pieces only go where the floor is open on most sides, so no corridor is blocked.
const roomy=(c)=>[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]].filter(([a,b])=>!solid(c.x+a+.5,c.y+b+.5)).length>=6;
const DECO=[ // sprite, height (a cave is 1 tall), solid radius (0 = walk-through), glow, light
  {s:"p_crystal-spire-large",h:.62,r:.3,glow:"rgba(150,120,255,A)",l:[.45,.3,1.1]},{s:"p_crystal-spire-small",h:.34,r:0,glow:"rgba(170,220,255,A)",l:[.3,.6,1.1]},
  {s:"p_crystal-violet-floor",h:.4,r:0,glow:"rgba(200,150,255,A)",l:[.55,.35,1.1]},{s:"p_crystal-cluster",h:.66,r:.4,glow:"rgba(120,180,255,A)",l:[.35,.62,1.25]},
  {s:"p_fungi-zurkhwood",h:1,r:.4},{s:"p_fungi-barrelstalk",h:.55,r:.32},{s:"p_fungi-timmask",h:.5,r:.28},{s:"p_fungi-ripplebark",h:.48,r:.34},{s:"p_fungi-trillimac",h:.4,r:0},
  {s:"p_fungi-waterorb",h:.42,r:0,glow:"rgba(170,230,255,A)"},{s:"p_fungi-bluecap",h:.26,r:0,glow:"rgba(90,230,255,A)",l:[.2,.8,1.1]},{s:"p_fungi-nightlight",h:.4,r:0,glow:"rgba(230,240,255,A)",l:[.6,.65,.7]},
  {s:"p_fungi-torchstalk",h:.52,r:0,glow:"rgba(255,160,70,A)",l:[1.2,.6,.2]},
  {s:"p_stalagmite-large",h:.75,r:.3},{s:"p_stalagmite-cluster",h:.5,r:.35},{s:"p_stalagmite-small",h:.3,r:0},{s:"p_rock-spire",h:.7,r:.28},{s:"p_boulder",h:.45,r:.38}];
{ const pool=openCells.filter(c=>c.walls>=1&&!taken.has(c.x+","+c.y)); for(let i=0;i<D.dressing.props&&pool.length;i++){ const c=pick(pool); const DD=DECO[i%DECO.length]; const solidOK=DD.r>0&&roomy(c);
    const d0=solidOK||DD.r===0?DD:DECO.find(x=>x.r===0&&x.s.startsWith(DD.s.slice(0,7)))||DECO[1];
    const e={name:d0.s.slice(2).replace(/-/g," "),sprite:d0.s,deco:true,x:c.x+.3+DECO_RND()*.4,y:c.y+.3+DECO_RND()*.4,scale:d0.h*(.85+DECO_RND()*.3),glow:d0.glow,solid:d0.r>0,rad:d0.r,id:ENTS.length,ft:0,state:"idle",pops:[],flash:0};
    ENTS.push(e); taken.add(c.x+","+c.y); if(d0.l&&i%2===0) LIGHTS.push({x:e.x,y:e.y,r:d0.l[0]*.55,g:d0.l[1]*.55,b:d0.l[2]*.55,rad:2.2}); } }
// ---- VIOLET FUNGI (Sam, 9/30): "walking past mushrooms like the tentacled one causes it to glow, make an eerie sound, and
// release glowing spores. DC check to determine if they are inhaled and poison you. The 1d4 to determine the effect."
// The tentacled sprite is the violet fungus; its tentacles writhe (12-frame loop, warped from the field-pack art — the cap
// holds still, the tentacles move more the further they reach). Seven grow in open floor away from the start.
const PLIGHT={x:0,y:0,r:0,g:0,b:0,rad:2.4}; LIGHTS.push(PLIGHT);
const SPORES=[]; { const pool=openCells.filter(c=>!taken.has(c.x+","+c.y)&&roomy(c)&&Math.hypot(c.x+.5-P.x,c.y+.5-P.y)>5);
  for(let i=0;i<D.dressing.violets&&pool.length;i++){ const c=pick(pool); const L={x:c.x+.5,y:c.y+.5,r:0,g:0,b:0,rad:2.6}; LIGHTS.push(L);
    const e={name:"violet fungus",sprite:"violet",deco:true,spore:true,x:c.x+.35+DECO_RND()*.3,y:c.y+.35+DECO_RND()*.3,scale:.62,solid:true,rad:.26,sporeCd:0,wake:0,light:L,id:ENTS.length,ft:DECO_RND()*3,state:"idle",pops:[],flash:0};
    L.x=e.x; L.y=e.y; ENTS.push(e); SPORES.push(e); taken.add(c.x+","+c.y); } }
// ---- CAVE FAUNA (Sam, 9/30): "Caves should have harmless fauna flying around like bats hanging that get startled when
// stirred and fly around. Insects should be moving around. Little spiders might be crawling." Harmless set dressing — no
// stat blocks, no rolls, nothing to fight. Tiny pixel bitmaps drawn in code (the view's own pixel look), lit by the cave
// light and clipped per column against the walls like every other sprite. Counts come from the record's `dressing`.
//  · bats roost on the ceiling in twos to fours; walk close (closer still if you crouch), dash, loose an arrow, land a blow,
//    land a jump or set off a roar nearby, and they drop, scatter and circle, squeaking, then settle somewhere else;
//  · moths and gnats dance in the light of the glowing fungi and crystals;
//  · little spiders creep along the floor by the walls in fits and starts, and scuttle off if you come near.
const FA_PAL={x:[37,28,31],h:[75,59,58],e:[170,60,46],s:[31,25,21],m:[122,102,80]};
const FA_ART={
  hang:[".x.x.",".xxx.","xxxxx","xxhxx",".xxx.",".xex.","x...x"],
  fly:[["x...........x",".x.........x.",".xx.x...x.xx.","..xxxhxhxxx..",".....xxx....."],
       [".....x.x.....",".xxx.xxx.xxx.","xxxxxhxhxxxxx","x...xxxxx...x",".....x.x....."],
       ["....x...x....","....xxxxx....","...xxhxhxx...",".xxx.xxx.xxx.","xx.........xx"]],
  spider:[["s.sss.s",".ssmss.","s.s.s.s"],[".s.s.s.","sssmsss","s.s.s.s"]]};
const BATS=[], SPIDS=[], MOTHS=[]; let batSqT=0, batFlushT=0;
D.dressing=Object.assign({bats:10,spiders:9,swarms:6},D.dressing);
{ const pool=openCells.filter(c=>Math.hypot(c.x+.5-P.x,c.y+.5-P.y)>4); let n=D.dressing.bats;
  while(n>0&&pool.length){ const c=pick(pool), k=Math.min(n,2+Math.floor(DECO_RND()*3)); n-=k;
    for(let i=0;i<k;i++) BATS.push({x:c.x+.2+DECO_RND()*.6,y:c.y+.2+DECO_RND()*.6,z:.95,st:"roost",ph:DECO_RND()*6,hd:0,vx:0,vy:0,tm:0,delay:0,tx:0,ty:0,flip:DECO_RND()<.5}); } }
{ const pool=openCells.filter(c=>c.walls>=1); for(let i=0;i<D.dressing.spiders&&pool.length;i++){ const c=pick(pool);
    SPIDS.push({x:c.x+.2+DECO_RND()*.6,y:c.y+.2+DECO_RND()*.6,hd:DECO_RND()*6.28,go:0,rest:DECO_RND()*2,step:0,sp:.7+DECO_RND()*.5}); } }
{ const glows=ENTS.filter(e=>e.deco&&e.glow&&!e.spore); for(let i=0;i<D.dressing.swarms&&glows.length;i++){ const e=glows.splice(Math.floor(DECO_RND()*glows.length),1)[0];
    for(let j=0;j<6+Math.floor(DECO_RND()*5);j++) MOTHS.push({cx:e.x,cy:e.y,cz:Math.min(.85,(e.scale||.5)*.9+.12),r:.12+DECO_RND()*.32,a:DECO_RND()*6.28,b:1.3+DECO_RND()*2.4,c:2+DECO_RND()*3,ph:DECO_RND()*6.28,x:e.x,y:e.y,z:.5,moth:DECO_RND()<.5}); } }
function startleBat(b,delay=0){ if(b.st!=="roost") return; b.st="flush"; b.delay=delay; }
function faunaNoise(x,y,r){ if(BLD.open) return; for(const b of BATS) if(Math.hypot(b.x-x,b.y-y)<r) startleBat(b,Math.random()*.25); }
function batOpen(x,y){ return !solid(x,y)&&!solid(x+.12,y)&&!solid(x-.12,y)&&!solid(x,y+.12)&&!solid(x,y-.12); }
function faunaTick(dt){ if(BLD.open) return;
  const near=(P.crouch||P.hidden)?1.4:P.dash>0?4.2:P.moving?2.8:2;
  batSqT-=dt; batFlushT-=dt;
  for(const b of BATS){ b.ph+=dt;
    if(b.st==="roost"){ if(!P.dead&&Math.hypot(b.x-P.x,b.y-P.y)<near) startleBat(b); continue; }
    if(b.st==="flush"){ b.delay-=dt; if(b.delay>0) continue; b.st="fly"; b.tm=3.5+Math.random()*3.5; b.zo=Math.random()*6.28; b.hd=Math.atan2(b.y-P.y,b.x-P.x)+(Math.random()-.5)*1.4; b.vx=b.vy=0;
      for(const o of BATS) if(o!==b&&Math.hypot(o.x-b.x,o.y-b.y)<2.4) startleBat(o,.05+Math.random()*.3); // the colony goes up together
      if(batFlushT<=0){ batFlushT=2.2; playBuf(Math.random()<.5?"batFlush":"batFlush2",{x:b.x,y:b.y,vol:.55,rate:.95+Math.random()*.12}); } }
    // flying: a jittery wander, quick turns off the walls, swooping up and down
    b.hd+=(Math.random()-.5)*dt*9;
    if(b.st==="home"){ const dh=Math.atan2(b.ty-b.y,b.tx-b.x)-b.hd; b.hd+=Math.atan2(Math.sin(dh),Math.cos(dh))*Math.min(1,dt*5); }
    else { b.tm-=dt; if(b.tm<=0){ // look for a new roost in sight, away from the player
        const cand=openCells.filter(c=>{ const x=c.x+.5, y=c.y+.5, dd=Math.hypot(x-b.x,y-b.y); return dd>1.5&&dd<7&&Math.hypot(x-P.x,y-P.y)>3.5&&clearLine(b.x,b.y,x,y); });
        if(cand.length){ const c=cand[Math.floor(Math.random()*cand.length)]; b.tx=c.x+.2+Math.random()*.6; b.ty=c.y+.2+Math.random()*.6; b.st="home"; } else b.tm=1; } }
    const sp=b.st==="home"?2.2:3; for(const tryA of [0,.9,-.9,1.8,-1.8,Math.PI]){ const a=b.hd+tryA; if(batOpen(b.x+Math.cos(a)*.45,b.y+Math.sin(a)*.45)){ b.hd=a; break; } }
    b.vx+=(Math.cos(b.hd)*sp-b.vx)*Math.min(1,dt*5); b.vy+=(Math.sin(b.hd)*sp-b.vy)*Math.min(1,dt*5);
    const nx=b.x+b.vx*dt, ny=b.y+b.vy*dt; if(batOpen(nx,b.y)) b.x=nx; else b.vx*=-.5; if(batOpen(b.x,ny)) b.y=ny; else b.vy*=-.5;
    const zt=b.st==="home"&&Math.hypot(b.tx-b.x,b.ty-b.y)<.6?.95:.58+.22*Math.sin(t*2.3+(b.zo||0))+.08*Math.sin(t*7.1+(b.zo||0)*2); b.z+=(zt-b.z)*Math.min(1,dt*4); b.flip=b.vx<0;
    if(b.st==="home"&&Math.hypot(b.tx-b.x,b.ty-b.y)<.18){ b.st="roost"; b.z=.95; }
    if(batSqT<=0&&Math.hypot(b.x-P.x,b.y-P.y)<7){ batSqT=.35+Math.random()*1.1; const n=1+Math.floor(Math.random()*5); playBuf("batSqueak",{x:b.x,y:b.y,vol:.28,rate:.9+Math.random()*.3,off:BAT_SQ[n-1][0],dur:BAT_SQ[n-1][1]}); } }
  for(const s of SPIDS){ const dp=Math.hypot(s.x-P.x,s.y-P.y);
    if(dp<1.6&&!P.dead){ s.hd=Math.atan2(s.y-P.y,s.x-P.x)+(Math.random()-.5)*.6; s.go=.5; s.rest=0; s.fast=1; }
    if(s.go>0){ s.go-=dt; const v=s.sp*(s.fast?2.4:1)*dt, nx=s.x+Math.cos(s.hd)*v, ny=s.y+Math.sin(s.hd)*v;
      if(!solid(nx+Math.cos(s.hd)*.08,ny+Math.sin(s.hd)*.08)){ s.x=nx; s.y=ny; s.step+=v; } else s.hd+=1.4+Math.random()*1.4;
      if(s.go<=0){ s.rest=.5+Math.random()*2.2; s.fast=0; } }
    else { s.rest-=dt; if(s.rest<=0){ s.go=.25+Math.random()*.8; s.hd+=(Math.random()-.5)*2.2; } } }
  for(const m of MOTHS){ m.x=m.cx+Math.sin(t*m.b+m.ph)*m.r+Math.sin(t*7.3+m.ph*3)*.03; m.y=m.cy+Math.cos(t*m.b*.83+m.ph)*m.r+Math.cos(t*6.1+m.ph*2)*.03; m.z=m.cz+Math.sin(t*m.c+m.ph)*.1; } }
const BAT_SQ=[[.13,.34],[.48,.32],[.82,.26],[1.1,.32],[1.44,.22]]; // [start, length] of each squeak in audio-batSqueak (ElevenLabs SFX), cut at the onsets
// one pixel bitmap, at a world point, `size` squares wide; per-column wall clipping; lit by the cave light
function drawBM(rows,x,y,z,size,flip){ const pr=project(x,y,z); if(!pr||pr.x<-60||pr.x>RW+60) return; const w=rows[0].length, h=rows.length;
  const [lr,lg,lb]=light(x,y,pr.d); const k=Math.min(1.3,Math.max(.16,(lr+lg+lb)/3*1.3)); const ps=pr.s*size/w;
  ctx.save(); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1;
  if(ps<.55){ const cx=Math.round(pr.x); if(cx>=0&&cx<RW&&pr.d<zbuf[cx]){ ctx.fillStyle=shadeRGB(FA_PAL.x,k*1.4); ctx.fillRect(cx,Math.round(pr.y),1,1); } ctx.restore(); return; }
  const p=Math.max(1,Math.round(ps)), x0=Math.round(pr.x-w*p/2), y0=Math.round(pr.y-h*p/2);
  for(let j=0;j<h;j++) for(let i=0;i<w;i++){ const c=rows[j][flip?w-1-i:i]; if(c===".") continue; const sx=x0+i*p; if(sx+p<=0||sx>=RW) continue;
    if(pr.d>=zbuf[Math.max(0,Math.min(RW-1,sx))]) continue; ctx.fillStyle=shadeRGB(FA_PAL[c],c==="e"?Math.max(.6,k):k); ctx.fillRect(sx,y0+j*p,p,p); }
  ctx.restore(); }
function drawFauna(o){ if(o.kind==="bat"){ const b=o.o;
    if(b.st==="roost"||(b.st==="flush"&&b.delay>0)){ const sw=Math.sin(t*1.3+b.ph)*.004; drawBM(FA_ART.hang,b.x+sw,b.y,.95-.045,.075,b.flip); }
    else { const f=[0,1,2,1][Math.floor(b.ph*16)%4]; drawBM(FA_ART.fly[f],b.x,b.y,b.z,.2,b.flip); } }
  else if(o.kind==="spider"){ const s=o.o; drawBM(FA_ART.spider[Math.floor(s.step*40)%2],s.x,s.y,.03,.1,Math.cos(s.hd-P.a)<0); }
  else { const m=o.o, pr=project(m.x,m.y,m.z); if(!pr) return; const cx=Math.round(pr.x), cy=Math.round(pr.y); if(cx<1||cx>=RW-1||pr.d>=zbuf[cx]) return;
    const p=pr.s>170?2:1; ctx.save(); ctx.globalCompositeOperation="source-over";
    if(m.moth){ const up=Math.sin(t*16+m.ph*5)>0; ctx.fillStyle="rgba(236,226,198,.9)"; // a pale moth: body, wings beating up and down
      ctx.fillRect(cx,cy,p,p); ctx.fillStyle="rgba(214,202,170,.8)"; if(up){ ctx.fillRect(cx-p,cy-p,p,p); ctx.fillRect(cx+p,cy-p,p,p); } else { ctx.fillRect(cx-p,cy,p,p); ctx.fillRect(cx+p,cy,p,p); } }
    else { ctx.fillStyle=`rgba(24,20,18,${(.65+.3*Math.sin(t*31+m.ph*5)).toFixed(2)})`; ctx.fillRect(cx,cy,p,p); } // a gnat: a dark speck, flickering
    ctx.restore(); } }
// ---- PLACED PIECES (the dungeon record, and Sam's builder). Each entry keeps `src` = its record entry, so erasing it
// in the builder removes the right thing from both the world and the file.
function makeViolet(x,y,src){ const L={x,y,r:0,g:0,b:0,rad:2.6,src}; LIGHTS.push(L);
  const e={name:"violet fungus",sprite:"violet",deco:true,spore:true,x,y,scale:.62,solid:true,rad:.26,sporeCd:0,wake:0,light:L,id:ENTS.length,ft:Math.random()*3,state:"idle",pops:[],flash:0,src}; ENTS.push(e); SPORES.push(e); return e; }
function makeProp(o){ const DD=DECO.find(d=>d.s==="p_"+o.kind)||{s:"p_"+o.kind,h:.5,r:0};
  const e={name:o.kind.replace(/-/g," "),sprite:DD.s,deco:true,x:o.x,y:o.y,scale:o.h||DD.h,glow:DD.glow,solid:o.solid??DD.r>0,rad:DD.r||.3,id:ENTS.length,ft:0,state:"idle",pops:[],flash:0,src:o}; ENTS.push(e);
  if(DD.l) LIGHTS.push({x:o.x,y:o.y,r:DD.l[0]*.55,g:DD.l[1]*.55,b:DD.l[2]*.55,rad:2.2,src:o}); return e; }
// Lore (Sam, 9/30: "serious monsters, loot, and lore"): a journal, a loose page, a book on the floor, or a carved stone.
// E reads it; the text is canon, written by Sam or from the book — never improvised by the engine.
const LORE_KIND={journal:{sprite:"lore_journal",scale:.24,glow:"rgba(255,214,150,A)"},note:{sprite:"lore_note",scale:.22,glow:"rgba(255,236,190,A)"},
  book:{sprite:"lore_book",scale:.24,glow:"rgba(255,214,150,A)"},carving:{sprite:"p_rock-spire",scale:.7,glow:"rgba(120,220,255,A)",solid:true,rad:.28}};
const LORE_READ=new Set();
function makeLore(o){ const K=LORE_KIND[o.kind]||LORE_KIND.note; const e={name:o.title||"lore",sprite:K.sprite,deco:true,lore:o,x:o.x,y:o.y,scale:K.scale,glow:K.glow,solid:!!K.solid,rad:K.rad||.2,id:ENTS.length,ft:0,state:"idle",pops:[],flash:0,src:o};
  ENTS.push(e); return e; }
// Traps — SRD 5.1 sample traps, numbers from the SRD as best recalled (flagged in the design doc for a check):
//   pit    hidden pit: DC 15 Perception to notice; 10 ft deep, 1d6 bludgeoning. Climbing out takes a few seconds (HOUSE).
//   darts  poison darts: DC 15 to notice the plate; 1d3 darts, +8 to hit, 1d4 piercing + DC 15 CON or 2d10 poison (half on a save).
//   net    falling net: DC 10 to notice the trip wire; restrained; DC 10 Strength check (action) to get free.
// Disarm (darts, net): thieves' tools, DEX DC 15; failing by 5 or more sets it off. A jump carries you over a pit.
const TRAP_DEF={pit:{name:"hidden pit",dc:15},darts:{name:"poison-dart plate",dc:15},net:{name:"falling net",dc:10}};
const TRAPS=[], PITV=new Uint8Array(MW*MH);
function makeTrap(o){ const T={...TRAP_DEF[o.kind],kind:o.kind,x:Math.floor(o.x)+.5,y:Math.floor(o.y)+.5,cx:Math.floor(o.x),cy:Math.floor(o.y),hidden:o.hidden!==false,revealed:o.hidden===false,
  disarmed:false,spent:false,shots:3,noticed:false,src:o}; TRAPS.push(T); if(T.kind==="pit"&&T.revealed) PITV[T.cy*MW+T.cx]=1; FX.push({kind:"trapMark",x:T.x,y:T.y,z:.01,trap:T,life:1e9}); return T; }
for(const h of D.hazards) if(h.kind==="violet") makeViolet(h.x,h.y,h);
for(const p of D.props) makeProp(p);
for(const l of D.lore) makeLore(l);
for(const tr of D.traps) makeTrap(tr);
function revealTrap(T,how){ if(T.revealed||T.disarmed) return; T.revealed=true; if(T.kind==="pit") PITV[T.cy*MW+T.cx]=1; say(`${how}: ${PC.name} spots a ${T.name}.`,"#ffd36a"); SND.chime([660,990]); }
function passivePerception(){ return 10+PC.mods.wis; }
let trapCell=-1;
function trapsTick(dt){ if(!started||P.dead) return;
  for(const T of TRAPS){ if(T.revealed||T.disarmed||T.noticed) continue; if(Math.hypot(T.x-P.x,T.y-P.y)<2.6){ T.noticed=true; if(passivePerception()>=T.dc) revealTrap(T,`Passive Perception ${passivePerception()}`); } }
  if(P.inPit){ if(P.climb>0){ P.climb-=dt; if(P.climb<=0){ P.inPit=false; P.x=P.pitFrom.x; P.y=P.pitFrom.y; say(`${PC.name} hauls ${PR().him}self out of the pit.`,"#bfe3a0"); SND.step(1.2); } } return; }
  const c=Math.floor(P.y)*MW+Math.floor(P.x); if(c===trapCell) return; const prev=trapCell; trapCell=c;
  if(BLD.open) return; const T=TRAPS.find(t=>!t.disarmed&&t.cy*MW+t.cx===c); if(!T) return;
  if(T.kind==="pit"){ if(P.air) return; const px=prev>=0?(prev%MW)+.5:P.x, py=prev>=0?Math.floor(prev/MW)+.5:P.y; fallInPit(T,px,py); }
  else if(T.kind==="darts"&&T.shots>0) fireDarts(T);
  else if(T.kind==="net"&&!T.spent) dropNet(T); }
function fallInPit(T,fx,fy){ T.revealed=true; PITV[T.cy*MW+T.cx]=1; P.inPit=true; P.climb=0; P.pitFrom={x:fx,y:fy}; P.x=T.x; P.y=T.y; breakHide();
  const dmg=d(6); P.hp=Math.max(0,P.hp-dmg); P.hurt=.45; P.hurtAnim=.5; P.shake=Math.max(P.shake,.8); tone(.35,{f0:90,f1:40,vol:.7}); noise(.3,{type:"lowpass",f0:500,vol:.6});
  say(`The floor gives way — a ${T.name}! ${PC.name} drops 10 feet: ${dmg} bludgeoning. E to climb out.`,"#ff7a6a"); if(Math.random()<.6) swear(); renderBar(); if(P.hp<=0) fall(); }
function fireDarts(T){ T.shots--; T.revealed=true; const n=d(3); tone(.05,{f0:1800,vol:.25}); noise(.05,{f0:2400,q:6,vol:.3});
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]].map(([a,b])=>{ let k=0; while(k<6&&!solid(T.x+a*(k+1),T.y+b*(k+1))) k++; return {a,b,k}; }).filter(o=>o.k<6).sort((p,q)=>p.k-q.k);
  const from=dirs[0]||{a:1,b:0,k:2}; const ox=T.x+from.a*(from.k+.45), oy=T.y+from.b*(from.k+.45);
  say(`Click — a pressure plate. ${n>1?n+" darts hiss":"A dart hisses"} out of the wall.`,"#ff7a6a");
  for(let i=0;i<n;i++) later(i*.12,()=>shoot({fromWorld:{x:ox,y:oy},to:{x:P.x+(Math.random()-.5)*.2,y:P.y+(Math.random()-.5)*.2},speed:14,color:"#c9a55a",kind:"dart",onHit:()=>{
    const r=d20(false,P.dodge>0), tot=r.f+8, ac=P.ac+(P.sof>0?2:0); if(r.f!==1&&(r.f===20||tot>=ac)){ let dmg=d(4); const sv=d(20)+PC.mods.con; let pz=d(10)+d(10); if(sv>=15) pz=Math.floor(pz/2); dmg+=pz;
      P.hp=Math.max(0,P.hp-dmg); P.hurt=.45; P.hurtAnim=.5; SND.hit(); say(`Dart: ${r.txt}+8 = ${tot} vs AC ${ac} — hit, ${dmg} (CON ${sv} vs DC 15${sv>=15?", half the poison":""}).`,"#ff7a6a"); renderBar(); if(P.hp<=0) fall(); }
    else say(`Dart: ${r.txt}+8 = ${tot} vs AC ${ac} — it clicks off the rock.`,"#9ab8d8"); }})); }
function dropNet(T){ T.spent=true; T.revealed=true; P.restrained=true; P.netted=true; breakHide(); noise(.4,{type:"lowpass",f0:700,vol:.5}); tone(.2,{f0:160,f1:90,vol:.3});
  say(`A trip wire — a weighted net falls! RESTRAINED. E: Strength check DC 10 to get free.`,"#ff7a6a"); }
function trapNear(r=1.4){ let best=null, bd=r; for(const T of TRAPS){ if(!T.revealed||T.disarmed||T.kind==="pit"||(T.kind==="net"&&T.spent)) continue; const dd=Math.hypot(T.x-P.x,T.y-P.y); if(dd<bd){ bd=dd; best=T; } } return best; }
function disarm(T){ P.cool=1.2; const prof=/rogue/i.test(PC.cls)?2:0; const r=check(`Disarm the ${T.name} (thieves' tools)`,PC.mods.dex+prof,15);
  if(r.ok){ T.disarmed=true; SND.chime([523,784]); say(`The ${T.name} is safe now.`,"#bfe3a0"); } else if(r.tot<=10){ say(`Fumbled — it goes off!`,"#ff7a6a"); if(T.kind==="darts") fireDarts(T); else dropNet(T); } }
function readLore(L){ const o=L.lore; paused=true; keys.clear(); if(document.pointerLockElement) document.exitPointerLock();
  $("loret").textContent=o.title||"Untitled"; $("lorek").textContent=({journal:"A journal",note:"A loose page",book:"A book",carving:"Carved into the stone"})[o.kind]||""; $("lorex").textContent=o.text||""; $("lore").hidden=false;
  if(!LORE_READ.has(o)){ LORE_READ.add(o); SND.chime([440,660,880]); say(`Lore: ${o.title||"untitled"}.`,"#ffd36a"); } }
function closeLore(){ $("lore").hidden=true; paused=false; last=performance.now(); cv.focus(); }
// a pixel stalactite / stalagmite: a tapering cone of wet rock, lit from the left, a bright wet edge and a bead at the tip
function makeStal(seed,down){ const R=rng32(seed), S=64, c=document.createElement("canvas"); c.width=c.height=S; const g=c.getContext("2d");
  const w0=22+R()*16, L=34+R()*28, cx=32+(R()-.5)*6; const col=(k,lit)=>{ const b=[34,42,48], hi=[88,104,112]; const t=Math.max(0,Math.min(1,lit)); return `rgb(${Math.round(b[0]+(hi[0]-b[0])*t)},${Math.round(b[1]+(hi[1]-b[1])*t)},${Math.round(b[2]+(hi[2]-b[2])*t)})`; };
  for(let y=0;y<L;y++){ const k=y/L; const half=Math.max(.6,w0/2*Math.pow(1-k,1.25)*(1+.12*Math.sin(y*.7+seed))); const x0=Math.round(cx-half), x1=Math.round(cx+half); const yy=down?y:S-1-y;
    g.fillStyle="#141a1e"; g.fillRect(x0-1,yy,x1-x0+3,1);
    for(let x=x0;x<=x1;x++){ const u=(x-x0)/Math.max(1,x1-x0); const lit=.95-u*1.05+(R()-.5)*.18+(Math.sin(x*1.7+y*.3)>.8?.12:0); g.fillStyle=col(k,lit); g.fillRect(x,yy,1,1); }
    if(x1-x0>2){ g.fillStyle="rgba(190,225,240,.75)"; g.fillRect(x0+1,yy,1,1); } }
  const ty=down?Math.round(L):S-1-Math.round(L); g.fillStyle="#141a1e"; g.fillRect(Math.round(cx)-1,ty-1,3,3); g.fillStyle="#bfe6ff"; g.fillRect(Math.round(cx),ty,1,1);
  return c; }
function drawBlade(g,L,w,col){ g.lineWidth=2; g.strokeStyle="#15171b"; g.fillStyle=col; g.beginPath(); g.moveTo(-w,0); g.lineTo(-w*.8,-L*.85); g.lineTo(0,-L); g.lineTo(w*.8,-L*.85); g.lineTo(w,0); g.closePath(); g.fill(); g.stroke(); }
function drawTrail3(tr,fade){ if(!tr||tr.length<2) return; ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.lineCap="round"; let prev=null; const n=tr.length;
  tr.forEach((q,i)=>{ const pq=project(q.x,q.y,q.z); if(pq&&pq.d>.3){ const c2=Math.max(0,Math.min(RW-1,Math.floor(pq.x))); if(prev&&pq.d<zbuf[c2]+.2){ const k=(i+1)/n; ctx.strokeStyle=`rgba(255,228,170,${(fade*(.15+.55*k)).toFixed(2)})`; ctx.lineWidth=Math.max(1.5,Math.min(10,pq.s*.035))*(0.4+0.6*k); ctx.beginPath(); ctx.moveTo(prev.x,prev.y); ctx.lineTo(pq.x,pq.y); ctx.stroke(); } prev=pq; } }); ctx.restore(); }
function drawPuddle(f){ const pr=project(f.x,f.y,0); if(!pr) return; const col=Math.max(0,Math.min(RW-1,Math.floor(pr.x))); if(pr.d>=zbuf[col]) return;
  const w=pr.s*f.r*2, h=Math.max(1,w*Math.min(.45,Math.abs(pr.y-CAM.hz)/Math.max(1,pr.s)*.9)); const [lr,lg,lb]=light(f.x,f.y,pr.d); const br=Math.min(1,(lr+lg+lb)/3);
  ctx.save(); ctx.beginPath(); ctx.ellipse(pr.x,pr.y,w/2,h/2,0,0,6.28); ctx.fillStyle="rgba(6,10,14,.42)"; ctx.fill();
  const gr=ctx.createLinearGradient(pr.x-w/2,pr.y-h/2,pr.x+w/2,pr.y+h/2); gr.addColorStop(0,`rgba(150,200,230,${(.22*br+.03).toFixed(2)})`); gr.addColorStop(.5,"rgba(150,200,230,0)"); gr.addColorStop(1,`rgba(255,210,150,${(.18*br).toFixed(2)})`);
  ctx.fillStyle=gr; ctx.fill(); ctx.strokeStyle=`rgba(170,210,235,${(.1*br+.02).toFixed(2)})`; ctx.lineWidth=1; ctx.stroke();
  if(f.rip>0){ const k=1-f.rip/.8; ctx.strokeStyle=`rgba(200,230,250,${(.6*(1-k)).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(pr.x,pr.y,w/2*k,h/2*k,0,0,6.28); ctx.stroke(); }
  ctx.restore(); }
function spawnDrip(){ const near=STALS.filter(s=>Math.hypot(s.x-P.x,s.y-P.y)<9); if(!near.length) return; const s=near[Math.floor(Math.random()*near.length)];
  FX.push({kind:"drop",x:s.x,y:s.y,z:1-(s.scale*.9),vz:0,life:3}); }
function updateDrops(dt){ for(let i=FX.length-1;i>=0;i--){ const f=FX[i]; if(f.kind==="puddle"&&f.rip>0) f.rip-=dt; if(f.kind==="splash"){ continue; } if(f.kind!=="drop") continue; f.vz-=dt*3.2; f.z+=f.vz*dt;
    if(f.z<=0){ FX.splice(i,1); FX.push({kind:"splash",x:f.x,y:f.y,life:.45,max:.45}); const pd=FX.find(p=>p.kind==="puddle"&&Math.hypot(p.x-f.x,p.y-f.y)<.3); if(pd) pd.rip=.8;
      if(Math.hypot(f.x-P.x,f.y-P.y)<7){ if(BUF.wdrip1) if(Math.random()<.55) playBuf("wdrip"+d(4),{x:f.x,y:f.y,vol:pd?.22:.15,rate:.85+Math.random()*.3}); /* Sam 9/30: much more subtle */ /* Sam 9/30: real water drops (ElevenLabs) */ else { tone(.09,{f0:1300+Math.random()*700,f1:420,vol:.22,x:f.x,y:f.y}); if(pd) tone(.16,{f0:700,f1:1400,vol:.06,x:f.x,y:f.y,delay:.02}); } } } } }

const later=(dt,fn)=>LATER.push({t:dt,fn});

// =====================================================================================================================
// AUDIO — music, roars and voices are recorded; everything else is synthesized. A cave reverb sits under all of it.
// =====================================================================================================================
let AC=null, MASTER=null, SFXB=null, WET=null, MUS=null, NOISE=null; const BUF={};
function b64buf(src){ const b=atob(src.split(",")[1]); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u.buffer; }
function impulse(sec,decay){ const n=AC.sampleRate*sec, b=AC.createBuffer(2,n,AC.sampleRate); for(let c=0;c<2;c++){ const d=b.getChannelData(c); for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/n,decay); } return b; }
async function audioInit(){ if(AC) return; try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
  MASTER=AC.createGain(); MASTER.gain.value=.9; MASTER.connect(AC.destination);
  const conv=AC.createConvolver(); conv.buffer=impulse(3,2.4); WET=AC.createGain(); WET.gain.value=.42; WET.connect(conv); conv.connect(MASTER);
  SFXB=AC.createGain(); SFXB.connect(MASTER); SFXB.connect(WET);
  NOISE=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate); { const d=NOISE.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; }
  // data: URIs in the one-file artifact, URLs in the repo; fetched and decoded side by side, the long score last
  const ents=Object.entries(A.audio||{}); const load=async([k,src])=>{ try{ BUF[k]=await AC.decodeAudioData(src.startsWith("data:")?b64buf(src):await (await fetch(src)).arrayBuffer()); }catch(e){ console.warn("audio",k,e); } };
  await Promise.all(ents.filter(([k])=>k!=="music").map(load)); await Promise.all(ents.filter(([k])=>k==="music").map(load));
  if(BUF.music){ const s=AC.createBufferSource(); s.buffer=BUF.music; s.loop=true; MUS=AC.createGain(); MUS.gain.value=0; s.connect(MUS); MUS.connect(MASTER); s.start(); MUS.gain.linearRampToValueAtTime(.34,AC.currentTime+4); } }
// where a sound sits: pan from the angle to it, volume from the distance, muffled when rock is in the way
function place(node,x,y,vol=1){ if(x==null){ const g=AC.createGain(); g.gain.value=vol; node.connect(g); g.connect(SFXB); return g; }
  const dx=x-P.x, dy=y-P.y, d=Math.hypot(dx,dy)||.001; const rx=-Math.sin(P.a), ry=Math.cos(P.a); const pan=Math.max(-1,Math.min(1,(dx*rx+dy*ry)/d));
  const g=AC.createGain(); g.gain.value=vol/(1+d*.32); const p=AC.createStereoPanner?AC.createStereoPanner():null; const lp=AC.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=clearLine(P.x,P.y,x,y)?16000:900;
  node.connect(lp); lp.connect(g); if(p){ p.pan.value=pan; g.connect(p); p.connect(SFXB); } else g.connect(SFXB); return g; }
function playBuf(k,{x,y,vol=1,rate=1,off=0,dur}={}){ if(!AC||!BUF[k]) return; const s=AC.createBufferSource(); s.buffer=BUF[k]; s.playbackRate.value=rate; place(s,x,y,vol); dur?s.start(0,off,dur):s.start(0,off); }
function noise(dur,{type="bandpass",f0=800,f1=f0,q=1,vol=.4,x,y,attack=.01}={}){ if(!AC) return; const s=AC.createBufferSource(); s.buffer=NOISE; const f=AC.createBiquadFilter(); f.type=type; f.Q.value=q; const n=AC.currentTime;
  f.frequency.setValueAtTime(f0,n); f.frequency.exponentialRampToValueAtTime(Math.max(20,f1),n+dur); const g=AC.createGain(); g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(vol,n+attack); g.gain.exponentialRampToValueAtTime(.001,n+dur);
  s.connect(f); f.connect(g); place(g,x,y); s.start(n,Math.random()); s.stop(n+dur+.05); }
function tone(dur,{wave="sine",f0=440,f1=f0,vol=.3,x,y,attack=.005,delay=0}={}){ if(!AC) return; const o=AC.createOscillator(); o.type=wave; const n=AC.currentTime+delay; o.frequency.setValueAtTime(f0,n); o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),n+dur);
  const g=AC.createGain(); g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(vol,n+attack); g.gain.exponentialRampToValueAtTime(.001,n+dur); o.connect(g); place(g,x,y); o.start(n); o.stop(n+dur+.05); }
const SND={
  // Sam, 9/30: "subtle footstep sounds, like walking in a cave" — seven recorded steps on damp grit (ElevenLabs), picked at
  // random and nudged in pitch so no two in a row match; the synthesized tap stays as the fallback and the UI click.
  step:(k=1)=>{ const n=[0,1,2,3,4,5,6].filter(i=>BUF["cstep"+i]); if(!n.length) return SND.tap(k); let i; do{ i=n[Math.floor(Math.random()*n.length)]; }while(n.length>1&&i===SND._ls); SND._ls=i; playBuf("cstep"+i,{vol:.34*k,rate:.9+Math.random()*.2}); },
  tap:(k=1)=>noise(.07,{type:"lowpass",f0:(380+Math.random()*120)*(k<1?.7:1),vol:.16*k}),
  hide:()=>{ noise(.9,{type:"lowpass",f0:900,f1:200,vol:.28,attack:.05}); [523,392,311].forEach((f,i)=>tone(.7,{f0:f,vol:.13,delay:.1+i*.13,attack:.02})); tone(.9,{f0:98,f1:82,vol:.25,delay:.05}); },
  whoosh:(hi=1)=>noise(.26,{f0:500*hi,f1:2600*hi,q:1.4,vol:.5,attack:.06}),
  hit:(x,y)=>{ tone(.16,{f0:130,f1:45,vol:.55,x,y}); noise(.09,{type:"lowpass",f0:900,vol:.5,x,y}); },
  miss:(x,y)=>noise(.14,{type:"highpass",f0:2400,vol:.18,x,y}),
  twang:()=>{ tone(.35,{wave:"triangle",f0:230,f1:120,vol:.35}); noise(.05,{f0:1800,vol:.35}); },
  creak:(x,y,vol=.28)=>{ tone(.8,{wave:"sawtooth",f0:95,f1:70,vol,x,y,attack:.1}); tone(.6,{wave:"sawtooth",f0:140,f1:120,vol:vol*.5,x,y,delay:.15}); },
  draw:()=>{ if(!AC) return null; const n=AC.currentTime, out=AC.createGain(); out.gain.setValueAtTime(0,n); out.gain.linearRampToValueAtTime(.22,n+.12); place(out,null,null,1);
    const o=AC.createOscillator(); o.type="sawtooth"; o.frequency.setValueAtTime(62,n); o.frequency.linearRampToValueAtTime(118,n+.58); const lp=AC.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=520;
    const trem=AC.createGain(); trem.gain.value=.5; const lfo=AC.createOscillator(); lfo.frequency.setValueAtTime(9,n); lfo.frequency.linearRampToValueAtTime(26,n+.58); const lg=AC.createGain(); lg.gain.value=.5; lfo.connect(lg); lg.connect(trem.gain);
    o.connect(lp); lp.connect(trem); trem.connect(out);
    const ns=AC.createBufferSource(); ns.buffer=NOISE; ns.loop=true; const bp=AC.createBiquadFilter(); bp.type="bandpass"; bp.Q.value=9; bp.frequency.setValueAtTime(700,n); bp.frequency.linearRampToValueAtTime(2600,n+.58); const ng=AC.createGain(); ng.gain.value=.35; ns.connect(bp); bp.connect(ng); ng.connect(out);
    o.start(n); lfo.start(n); ns.start(n,Math.random()); return {stop:(snap)=>{ const m=AC.currentTime; out.gain.cancelScheduledValues(m); out.gain.setValueAtTime(out.gain.value,m); out.gain.linearRampToValueAtTime(0,m+(snap?.03:.12)); [o,lfo,ns].forEach(s=>s.stop(m+.2)); }}; },
  chime:(notes=[880,1320,1760])=>notes.forEach((f,i)=>tone(.9,{f0:f,vol:.16,delay:i*.07})),
  rustle:()=>{ for(let i=0;i<4;i++) setTimeout(()=>noise(.12,{type:"highpass",f0:2200,vol:.14}),i*140); },
  heart:()=>{ tone(.14,{f0:58,f1:40,vol:.55}); tone(.14,{f0:52,f1:36,vol:.4,delay:.2}); },
  drip:()=>{ const a=Math.random()*6.28, d=2+Math.random()*5; tone(.09,{f0:1500+Math.random()*600,f1:420,vol:.16,x:P.x+Math.cos(a)*d,y:P.y+Math.sin(a)*d}); },
  boom:()=>{ tone(1.1,{f0:48,f1:30,vol:.8}); noise(1,{type:"lowpass",f0:220,vol:.5,attack:.02}); },
  clatter:(x,y)=>{ for(let i=0;i<6;i++) setTimeout(()=>noise(.05,{f0:1400+Math.random()*1400,q:3,vol:.5,x,y}),i*90+Math.random()*60); },
  cast:(c,x,y)=>{ const ty=c.type||c.kind;
    if(ty==="cold"){ noise(.5,{f0:4200,f1:900,q:2,vol:.35}); tone(.6,{f0:1600,f1:2400,vol:.08}); }
    else if(ty==="lightning"){ for(let i=0;i<10;i++) setTimeout(()=>noise(.03,{type:"highpass",f0:2500,vol:.45}),i*28); }
    else if(ty==="necrotic"&&c.name==="Toll the Dead"){ [196,233,294,392].forEach((f,i)=>tone(2.6,{f0:f*(1+i*.013),vol:.2,x,y,attack:.005})); }
    else if(ty==="necrotic"){ noise(.4,{f0:300,f1:120,q:3,vol:.4}); }
    else if(ty==="radiant"){ [523,659,784,1046].forEach((f,i)=>tone(.9,{f0:f,vol:.14,delay:i*.04,attack:.1})); }
    else if(ty==="psychic"){ tone(.6,{wave:"sawtooth",f0:310,f1:190,vol:.12}); tone(.6,{wave:"sawtooth",f0:317,f1:200,vol:.12}); }
    else if(c.kind==="heal") SND.chime([660,880,1100,1320]);
    else if(c.kind==="fog") noise(1.6,{type:"lowpass",f0:300,f1:900,vol:.35,attack:.5});
    else if(c.kind==="sleep") [880,740,587,440].forEach((f,i)=>tone(.7,{f0:f,vol:.12,delay:i*.12}));
    else noise(.4,{f0:900,f1:3000,q:2,vol:.25,attack:.1}); },
};

// =====================================================================================================================
// INPUT
// =====================================================================================================================
const keys=new Set(); let mouseTurn=0, locked=false;
function typing(e){ const t=e.target; return t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"); }
// Controls (Sam, 9/30): the mouse looks around and the armed hands sway with it; ← → strafe, ↑ ↓ walk (W A S D too);
// the mouse buttons work as in foraging and hunting — LEFT tap strikes with the weapon, LEFT held is the class power,
// RIGHT fires the ranged attack (the bow draws while held), MIDDLE tapped crouches / stands, MIDDLE held hides (rogues). 1–9 are the action cards, E interacts.
addEventListener("keydown",e=>{ if(typing(e)||!started) return; const k=e.key.toLowerCase(); keys.add(k);
  if([" ","arrowleft","arrowright","arrowup","arrowdown"].includes(k)) e.preventDefault();
  if(k===" "&&!e.repeat) jump(); /* Sam 9/30: Space jumps (cards are used with the mouse) */
  if(/^[1-9]$/.test(k)) pressCard(+k-1);
  if(k==="0"&&!e.repeat) leapBack();
  if(k==="e"&&!e.repeat) interact();
  if(k==="m") showMap=!showMap;
  if(k==="b"&&!e.repeat) toggleBuilder();
  if(k==="escape"&&!$("lore").hidden) closeLore(); });
addEventListener("keyup",e=>{ const k=e.key.toLowerCase(); keys.delete(k); });
cv.addEventListener("click",()=>{ if(!started) return; if(!locked&&cv.requestPointerLock){ try{ const p=cv.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(e){} } });
document.addEventListener("pointerlockchange",()=>{ locked=document.pointerLockElement===cv; });
document.addEventListener("mousemove",e=>{ if(!started||!locked||paused) return; mouseTurn+=e.movementX*.0026; P.swayX=Math.max(-46,Math.min(46,P.swayX-e.movementX*.35)); P.swayY=Math.max(-22,Math.min(22,P.swayY+e.movementY*.25)); P.pitch=Math.max(-RH*.55,Math.min(RH*.55,P.pitch-e.movementY*.9*RH/cv.clientHeight*1.6)); });
cv.addEventListener("contextmenu",e=>e.preventDefault());
cv.addEventListener("auxclick",e=>{ if(e.button===1) e.preventDefault(); });
cv.addEventListener("mousedown",e=>{ if(!locked||!started||paused) return; if(e.button===1){ e.preventDefault(); P.mhold={t:performance.now()/1000,fired:false}; } if(e.button===0) holdStart(); if(e.button===2) rangedStart(); });
addEventListener("mouseup",e=>{ if(e.button===1){ const m=P.mhold; P.mhold=null; if(m&&!m.fired){ toggleCrouch(); } } if(e.button===0) holdEnd(); if(e.button===2&&P.drawing) loose(); });
cv.addEventListener("wheel",e=>{ if(!started) return; e.preventDefault(); const n=CARDS.length; P.sel=(P.sel+(e.deltaY>0?1:-1)+n)%n; renderBar(); },{passive:false});
let tX=null, tY=null, tMoved=false; cv.addEventListener("touchstart",e=>{ tX=e.touches[0].clientX; tY=e.touches[0].clientY; tMoved=false; },{passive:true});
cv.addEventListener("touchmove",e=>{ const x=e.touches[0].clientX, y=e.touches[0].clientY; P.pitch=Math.max(-RH*.55,Math.min(RH*.55,P.pitch-(y-tY)*RH/cv.clientHeight*1.6)); tY=y; mouseTurn+=(x-tX)*.006; P.swayX=Math.max(-46,Math.min(46,P.swayX-(x-tX)*.3)); if(Math.abs(x-tX)>3) tMoved=true; tX=x; },{passive:true});
cv.addEventListener("touchend",()=>{ if(!tMoved&&started) useCard(P.sel); });

// =====================================================================================================================
// DICE AND RULES (SRD 5.2.1)
// =====================================================================================================================
const d=(n)=>1+Math.floor(Math.random()*n);
const dice=(n,s)=>{ let r=0; for(let i=0;i<n;i++) r+=d(s); return r; };
function d20(adv,dis){ const a=d(20), b=d(20); if(adv&&!dis) return {f:Math.max(a,b),txt:`${a}/${b}↑`}; if(dis&&!adv) return {f:Math.min(a,b),txt:`${a}/${b}↓`}; return {f:a,txt:`${a}`}; }
let log=[]; const say=(txt,c="#ece2cc")=>{ log.unshift({t:txt,c,age:0}); if(log.length>6) log.pop(); };
const curCard=()=>CARDS[P.sel]||CARDS[0];
function clearLine(x0,y0,x1,y1){ const dx=x1-x0, dy=y1-y0, n=Math.ceil(Math.hypot(dx,dy)*6); for(let i=1;i<n;i++) if(solid(x0+dx*i/n,y0+dy*i/n)) return false; return true; }
function inFog(x,y){ for(const f of FX) if(f.kind==="fog"&&Math.hypot(x-f.x,y-f.y)<f.r) return true; return false; }
function fogBetween(x0,y0,x1,y1){ const n=12; for(let i=0;i<=n;i++) if(inFog(x0+(x1-x0)*i/n,y0+(y1-y0)*i/n)) return true; return false; }
// can this creature perceive her? blindsight inside its radius; otherwise sight — the lantern shows her unless fog or a good hide hides her
function perceives(e){ const dist=Math.hypot(P.x-e.x,P.y-e.y); if(!clearLine(e.x,e.y,P.x,P.y)) return false; if(dist<=e.blind) return true; if(dist>((P.crouch||P.hidden)&&!(P.sporeGlow>0)?8:12)) return false;
  if(fogBetween(e.x,e.y,P.x,P.y)) return false; if(P.hidden&&e.pp<P.hidden) return false; return true; }
// Sam, 9/30: "I was hiding; can you prove it beat my stealth" — whenever a creature finds a hidden character, the log says
// exactly why, with the numbers: blindsight (hiding does nothing inside it — the hook horror's is 60 ft, the giant
// spider's 10 ft), or its passive Perception against the Stealth roll she hid with.
function foundHidden(e,dist){ const ft=Math.round(dist*5), st=P.hidden; let why;
  if(dist<=e.blind) why=`blindsight ${e.blind*5} ft and ${PC.name} is ${ft} ft away — hiding doesn't work against blindsight (Stealth ${st} doesn't matter)`;
  else why=`its passive Perception ${e.pp} meets or beats ${PR().his} Stealth ${st}`;
  P.hidden=0; say(`${e.name} finds ${PC.name}: ${why}.`,"#ff9f7a"); e.pops.push({t:"!",c:"#ff9f7a",age:0}); renderBar(); }
function canSee(e){ return !e.dead&&clearLine(P.x,P.y,e.x,e.y)&&!fogBetween(P.x,P.y,e.x,e.y); }
// the creature in front of her: melee inside reach, ranged along the line of sight
function aimAngle(){ return P.a; }
function rectOf(e){ if(!CAM) return null; const pr=project(e.x,e.y,.5); if(!pr) return null; const h=Math.abs(VS()/pr.d)*(e.scale||1), w=h*(e.aspect||1)*.6; const top=CAM.hz+Math.abs(VS()/pr.d)*CAM.eye-h;
  const col=Math.max(0,Math.min(RW-1,Math.floor(pr.x))); if(pr.d>=zbuf[col]+.3) return null; return {x0:pr.x-w/2,x1:pr.x+w/2,y0:top,y1:top+h,d:pr.d}; }
// what the hand is over: the nearest creature (or chest) whose picture contains the glove
function aimTarget(reach,pred=(e)=>e.foe||e.chest){ let best=null, bd=1e9; for(const e of ENTS){ if(e.dead||!pred(e)||(e.chest&&e.opened)) continue; const rr=rectOf(e); if(!rr) continue; const pad=8;
    if(P.hx>=rr.x0-pad&&P.hx<=rr.x1+pad&&P.hy>=rr.y0-pad&&P.hy<=rr.y1+pad){ const dist=Math.hypot(e.x-P.x,e.y-P.y); if(dist<=reach&&dist<bd&&clearLine(P.x,P.y,e.x,e.y)){ bd=dist; best=e; } } } return best; }
function target(reach){ const hit=aimTarget(reach,e=>e.foe); if(hit) return hit; return targetCone(reach); }
function targetCone(reach){ let best=null, bd=reach; for(const e of ENTS){ if(e.dead||!e.foe) continue; const dx=e.x-P.x, dy=e.y-P.y, dist=Math.hypot(dx,dy); let da=Math.atan2(dy,dx)-aimAngle(); da=Math.atan2(Math.sin(da),Math.cos(da));
    const tol=Math.atan2(.55,dist)+.05; if(dist<bd&&Math.abs(da)<Math.max(tol,reach<3?.5:0)&&clearLine(P.x,P.y,e.x,e.y)){ bd=dist; best=e; } } return best; }
function aimPoint(max){ let x=P.x, y=P.y; const s=.1, a=aimAngle(); for(let i=0;i<max/s;i++){ const nx=x+Math.cos(a)*s, ny=y+Math.sin(a)*s; if(solid(nx,ny)) break; x=nx; y=ny; } return {x,y}; }
function frightDis(){ return P.fright>0&&P.frightSrc&&!P.frightSrc.dead&&canSee(P.frightSrc); }
function check(label,mod,dc,adv=false){ const dis=frightDis()||P.poison>0; const r=d20(adv,dis); let g=0; if(P.guid>0){ g=d(4); P.guid=0; } const tot=r.f+mod+g; const ok=tot>=dc;
  say(`${label}: ${r.txt}${mod>=0?"+":""}${mod}${g?` +${g} guidance`:""} = ${tot} vs DC ${dc} — ${ok?"success":"fail"}`,ok?"#bfe3a0":"#d7a08c"); return {ok,tot}; }
function spendSlot(c){ if(!c.slot) return true; if(P.slots<=0){ say(`No spell slots left for ${c.name}.`,"#9a8cff"); return false; } P.slots--; return true; }
function spendUse(k,c){ if(!c.uses) return true; const u=P.uses[k]??c.uses; if(u<=0){ say(`${c.name}: none left this rest.`,"#8a8078"); return false; } P.uses[k]=u-1; return true; }
function breakHide(){ if(P.hidden){ P.hidden=0; say(`${PC.name} is seen.`,"#d7a08c"); } if(P.sanct){ P.sanct=0; say(`Sanctuary ends — ${PC.name} attacked.`,"#fff4c9"); } }
function reveal(e){ if(!e.dead&&e.mode!=="hunt"&&!e.sleep&&!e.incap){ e.mode="hunt"; e.lastSeen={x:P.x,y:P.y}; roar(e); } }

// ---- damage to a creature
function hurt(e,dmg,type){ if(e.dead) return; e.hp-=dmg; e.flash=.25; e.state="hurt"; e.stun=.3; e.pops.push({t:`${dmg}`,c:"#ffd36a",age:0});
  if(e.sleep){ e.sleep=0; say(`The ${e.name.toLowerCase()} wakes with a start.`,"#b9c8ff"); }
  if(e.hp<=0){ e.dead=true; e.state="dead"; say(`The ${e.name.toLowerCase()} is dead.`,"#e3b95c"); playBuf(e.roar,{x:e.x,y:e.y,vol:.6,rate:.7}); if(P.frightSrc===e){ P.fright=0; } return; }
  reveal(e); }

// =====================================================================================================================
// THE CARDS IN USE
// =====================================================================================================================
function pressCard(i){ if(i>=CARDS.length) return; const c=CARDS[i]; if(c.self&&!c.hand) { useCard(i); return; } if(c.self){ useCard(i); return; }
  if(c.kind==="thrown"){ runCard(c); renderBar(); return; } // a throw goes on the key press; the lit card and left button stay the dagger
  P.sel=i; renderBar(); SND.tap(); }
function actCool(c){ const base=c.kind==="melee"?.85:c.self?.6:1.2; return base*((PC.sorcerer&&/spell|decoy|fog|sleep/.test(c.kind))?1.25:1); } // sorcerer spells 25% slower (Sam, camp ruling)
function attackRoll(c,e,ranged){ // advantage and disadvantage from what is going on right now
  let adv=false, dis=false, why=[];
  if(P.hidden){ adv=true; why.push("unseen"); } if(e.faerie>0){ adv=true; why.push("faerie fire"); } if(e.guided>0){ adv=true; why.push("guiding bolt"); e.guided=0; }
  if(e.sleep>0){ adv=true; why.push("asleep"); } if(P.innate>0&&/spell/.test(c.kind)){ adv=true; why.push("innate sorcery"); }
  if(frightDis()){ dis=true; why.push("frightened"); } if(P.poison>0){ dis=true; why.push("poisoned"); } if(P.restrained){ dis=true; why.push("restrained"); }
  if(ranged){ const near=ENTS.some(o=>!o.dead&&o.foe&&o.mode==="hunt"&&!o.sleep&&!o.incap&&Math.hypot(o.x-P.x,o.y-P.y)<1.2); if(near){ dis=true; why.push("foe within 5 ft"); }
    if(c.range&&Array.isArray(c.range)){ const dist=Math.hypot(e.x-P.x,e.y-P.y); if(dist>c.range[0]){ dis=true; why.push("long range"); } } }
  const r=d20(adv,dis); return {...r,adv:adv&&!dis,why}; }
function weaponHit(c,e,{ranged=false}={}){ const hitB=c.kind==="melee"&&c.name==="Unarmed strike"?PC.unarmed.hit:c.hit;
  const r=attackRoll(c,e,ranged), tot=r.f+hitB, crit=r.f===20, autoCrit=e.sleep>0&&!ranged, hit=r.f!==1&&(crit||tot>=e.ac);
  const tag=`${c.name}: ${r.txt}+${hitB} = ${tot} vs AC ${e.ac}${r.why.length?` (${r.why.join(", ")})`:""}`;
  if(!hit){ say(`${tag} — miss`,"#9ab8d8"); SND.miss(e.x,e.y); reveal(e); return; }
  const cr=crit||autoCrit; let dmg=c.name==="Unarmed strike"?PC.unarmed.flat:(dice(c.dice[0]*(cr?2:1),c.dice[1])+c.mod); let extra="";
  if(PC===PCS.fifi&&(c.finesse||ranged)&&r.adv&&P.sneakT<=0){ const s=dice(cr?2:1,6); dmg+=s; extra=` +${s} Sneak Attack`; P.sneakT=6; }
  if(c.sap){ e.sapped=true; extra+=" · Sap"; }
  say(`${tag} — ${cr?"CRITICAL, ":""}${dmg} ${c.type}${extra}`,"#ffd36a"); SND.hit(e.x,e.y); faunaNoise(e.x,e.y,4); if(P.act&&!ranged){ P.act.stopT=cr?.18:.11; P.shake=Math.max(P.shake,cr?.35:.2); } hurt(e,dmg,c.type); }

function useCard(i){ const c=CARDS[i]; if(!c) return; if(c.hand&&!c.self&&!P.cool) { P.sel=i; renderBar(); } runCard(c); }
function handFor(c){ return (c&&c.hand)||"fist"; }
function runCard(c){ if(!started||P.dead||paused||!c) return; const key=c.key;
  if(P.cool>0) return; if(P.act&&P.act.t<P.act.dur*.6) return;
  const hand=handFor(c);
  switch(c.kind){
    case "melee": case "spellMelee": { if(c.hand==="dagger"&&!P.dagger){ say(`${cap(PR().his)} dagger is on the floor — E picks it up.`,"#8a8078"); return; }
      P.act={kind:c.hand==="fist"?"punch":c.kind==="spellMelee"?"thrust":"swing",hand,t:0,dur:c.hand==="dagger"&&c.kind==="melee"?mrTotal()/SLASH_SPEED:(c.hand==="fist")&&c.kind==="melee"?SWIPE_LEN:c.hand==="sword"?.5:.45,color:c.color};  P.cool=actCool(c); later(c.hand==="dagger"?mrTiming("light").windup/1000/SLASH_SPEED:5*TIC*.8,()=>SND.whoosh(c.hand==="sword"?.8:1.1));
      const e=target(c.reach||1.5); if(c.kind==="spellMelee") SND.cast(c);
      later(c.hand==="dagger"&&c.kind==="melee"?mrHit()/SLASH_SPEED:.13,()=>{ if(!e){ return; } breakHide(); if(c.kind==="spellMelee") spellAttack(c,e,false); else weaponHit(c,e); }); break; }
    case "thrown": { if(!P.dagger){ say(`${cap(PR().his)} dagger is on the floor — E picks it up.`,"#8a8078"); return; } const e=target(c.range[1]); P.act={kind:"throw",hand,t:0,dur:.4}; P.cool=actCool(c); SND.whoosh(1.3);
      P.dagger=false; breakHide(); const to=e?{x:e.x,y:e.y}:aimPoint(c.range[1]); shoot({from:"hand",to,speed:14,color:"#d9dde2",kind:"blade",onHit:()=>{ if(e) weaponHit(c,e,{ranged:true}); dropDagger(to); }}); break; }
    case "bow": startDraw(c); break;
    case "spellAtk": { if(!spendSlot(c)) return; const e=target(c.range); P.act={kind:"cast",hand,t:0,dur:.5,color:c.color}; P.cool=actCool(c); SND.cast(c); breakHide();
      const to=e?{x:e.x,y:e.y}:aimPoint(c.range); shoot({from:"hand",to,speed:c.type==="cold"?22:16,color:c.color,kind:c.type==="cold"?"beam":"bolt",onHit:()=>{ if(e) spellAttack(c,e,true); }}); if(!e) say(`${c.name} — nothing there to hit.`,"#8a8078"); break; }
    case "spellSave": { const e=target(c.range); if(!e){ say(`${c.name}: no creature in sight ahead.`,"#8a8078"); return; } if(!spendSlot(c)) return;
      P.act={kind:"cast",hand,t:0,dur:.55,color:c.color}; P.cool=actCool(c); SND.cast(c,e.x,e.y); breakHide(); burstAt(e.x,e.y,c.color,c.name==="Toll the Dead"?"toll":"ring");
      later(.25,()=>spellSave(c,e)); break; }
    case "sleep": { const e=target(c.range); if(!e){ say("Sleep: no creature in sight ahead.","#8a8078"); return; } if(!spendSlot(c)) return; P.act={kind:"cast",hand,t:0,dur:.6,color:c.color}; P.cool=actCool(c); SND.cast(c); burstAt(e.x,e.y,c.color,"ring");
      later(.3,()=>{ for(const o of ENTS){ if(o.dead||!o.foe||Math.hypot(o.x-e.x,o.y-e.y)>1.1) continue; const sv=save(o,"wis"); if(sv.ok){ say(`Sleep: ${o.name} WIS ${sv.txt} vs DC 13 — resists.`,"#b9c8ff"); reveal(o); }
        else { o.incap=6; o.state="idle"; say(`Sleep: ${o.name} WIS ${sv.txt} vs DC 13 — drowsy, incapacitated. It saves again in 6 s.`,"#b9c8ff"); } } }); break; }
    case "decoy": { const pt=aimPoint(6); P.act={kind:"cast",hand,t:0,dur:.5,color:c.color}; P.cool=actCool(c); SND.cast(c); FX.push({kind:"decoy",x:pt.x,y:pt.y,life:60,color:c.color});
      later(.4,()=>SND.clatter(pt.x,pt.y)); for(const o of ENTS){ if(o.dead||!o.foe||o.sleep) continue; if(Math.hypot(o.x-pt.x,o.y-pt.y)<10&&!perceives(o)){ o.lure={x:pt.x,y:pt.y}; o.mode="lure"; } }
      say(`Minor Illusion: the clatter of falling stones, thirty feet off. Whatever cannot see ${PR().him} goes to look.`,"#d9c7ff"); break; }
    case "fog": { if(!spendSlot(c)) return; const pt=aimPoint(8); P.act={kind:"cast",hand,t:0,dur:.6,color:c.color}; P.cool=actCool(c); SND.cast(c); FX.push({kind:"fog",x:pt.x,y:pt.y,r:4,life:60,grow:0,puffs:Array.from({length:26},()=>({a:Math.random()*6.28,d:Math.sqrt(Math.random())*3.6,h:Math.random(),s:.7+Math.random()*.7}))});
      say("Fog Cloud: a 20-foot sphere of fog. Nothing sees into it or out of it.","#dfe6f2"); break; }
    case "innate": { if(!spendUse(key,c)) return; P.innate=60; P.act={kind:"cast",hand,t:0,dur:.5,color:c.color}; P.cool=.4; SND.cast(c); say(`Innate Sorcery: for a minute ${PR().his} spells are harder to resist (DC 14) and ${PR().his} spell attacks have advantage.`,"#ffb36b"); renderBar(); break; }
    case "heal": { if(c.slot&&!spendSlot(c)) return; if(c.uses&&!spendUse(key,c)) return; const mod=c.mod??PC.spell.mod; const h=dice(c.dice[0],c.dice[1])+mod; P.hp=Math.min(P.max,P.hp+h);
      P.act={kind:"cast",hand,t:0,dur:.5,color:c.color||"#ffd9a0"}; P.cool=.4; SND.cast(c); say(`${c.name}: ${c.dice[0]}d${c.dice[1]}+${mod} = ${h} hit points back. ${P.hp}/${P.max}.`,"#9dffb0"); renderBar(); break; }
    case "buff": { if(c.slot&&!spendSlot(c)) return; P.act={kind:"cast",hand,t:0,dur:.5,color:c.color}; P.cool=.5; SND.chime();
      if(c.buff==="sof"){ P.sof=600; say(`Shield of Faith: a shimmering field. +2 AC while ${PC.name} concentrates.`,"#ffe9a8"); }
      if(c.buff==="sanct"){ P.sanct=60; say(`Sanctuary: anything that tries to hit ${PR().him} must first pass a DC 13 Wisdom save.`,"#fff4c9"); }
      if(c.buff==="guid"){ P.guid=60; say(`Guidance: +1d4 on ${PR().his} next ability check.`,"#ffe9a8"); } renderBar(); break; }
    case "thaum": { P.act={kind:"cast",hand,t:0,dur:.6,color:c.color}; P.cool=.6; SND.boom(); P.shake=.8; say(`Thaumaturgy: the ground trembles under ${PR().his} voice. (Harmless — a showpiece.)`,"#ffcf7a"); break; }
    case "magehand": { const ch=aimTarget(6.2,o=>o.chest)||ENTS.find(o=>o.chest&&!o.opened&&Math.hypot(o.x-P.x,o.y-P.y)<=6.2&&clearLine(P.x,P.y,o.x,o.y)&&Math.abs(Math.atan2(Math.sin(Math.atan2(o.y-P.y,o.x-P.x)-aimAngle()),Math.cos(Math.atan2(o.y-P.y,o.x-P.x)-aimAngle())))<.5);
      P.act={kind:"cast",hand,t:0,dur:.5,color:c.color}; P.cool=.8; if(!ch){ say("Mage Hand: a spectral hand drifts out — nothing within 30 feet ahead to open.","#bfe3ff"); return; } SND.cast(c); burstAt(ch.x,ch.y,c.color,"ring"); later(.5,()=>openChest(ch,true)); break; }
    case "hide": { if(P.sporeGlow>0){ say(`Hide: not while ${PC.name} is breathing out violet light.`,"#d7a08c"); return; } const seen=ENTS.filter(o=>!o.dead&&o.foe&&o.mode==="hunt"&&!o.sleep&&!o.incap&&perceives(o)); if(seen.length){ say(`Hide: not while the ${seen[0].name.toLowerCase()} is watching ${PR().him}. Break its line of sight first.`,"#d7a08c"); return; }
      const r=check("Hide (Stealth)"+(P.crouch?" — crouched, advantage":""),PC.stealth,15,P.crouch); P.cool=.8; if(r.ok){ P.hidden=r.tot; P.crouch=true; SND.hide(); say(`Hidden (Stealth ${r.tot}). Unseen, ${PR().his} next strike has advantage — Sneak Attack. Anything with passive Perception ${r.tot} or more still finds ${PR().him}.`,"#bfe3a0"); } renderBar(); break; }
    case "search": { P.cool=.8; const r=check("Search (Perception)",PC.mods.wis,13); for(const T of TRAPS) if(!T.revealed&&!T.disarmed&&Math.hypot(T.x-P.x,T.y-P.y)<6&&r.tot>=T.dc) revealTrap(T,"Search"); if(r.ok){ searchT=12; say(`${PC.name} listens: every creature and chest nearby shows on the map for a while.`,"#bfe3a0"); } break; }
    case "dash": { P.dash=6; P.cool=.4; say("Dash: double speed for a few seconds.","#e3b95c"); break; }
    case "dodge": { P.dodge=6; P.cool=.4; say(`Dodge: attacks against ${PR().him} have disadvantage for a few seconds.`,"#e3b95c"); break; }
  } }
function spellAttack(c,e,ranged){ const r=attackRoll(c,e,ranged), tot=r.f+PC.spell.hit, crit=r.f===20, hit=r.f!==1&&(crit||tot>=e.ac); breakHide();
  const tag=`${c.name}: ${r.txt}+${PC.spell.hit} = ${tot} vs AC ${e.ac}${r.why.length?` (${r.why.join(", ")})`:""}`;
  if(!hit){ say(`${tag} — miss`,"#9ab8d8"); reveal(e); return; } const dmg=dice(c.dice[0]*(crit?2:1),c.dice[1]); let extra="";
  if(c.fx==="slow"){ e.slow=6; extra=" · slowed 10 ft"; } if(c.fx==="guided"){ e.guided=6; extra=" · next attack on it has advantage"; }
  say(`${tag} — ${crit?"CRITICAL, ":""}${dmg} ${c.type}${extra}`,"#ffd36a"); burstAt(e.x,e.y,c.color,"burst"); SND.hit(e.x,e.y); hurt(e,dmg,c.type); }
function save(e,ab){ const dc=PC.spell.dc+(P.innate>0?1:0); const r=d(20), m=(MSAVE[e.sprite]||{})[ab]||0; return {ok:r+m>=dc,txt:`${r}${m>=0?"+":""}${m} = ${r+m}`,dc}; }
function spellSave(c,e){ if(e.dead) return; const sv=save(e,c.save); const tag=`${c.name}: ${e.name} ${c.save.toUpperCase()} save ${sv.txt} vs DC ${sv.dc}`;
  if(c.nodmg){ if(sv.ok) { say(`${tag} — dodges the light.`,"#9ab8d8"); reveal(e); } else { e.faerie=60; say(`${tag} — outlined in violet light. Attacks against it have advantage.`,"#d78cff"); reveal(e); } return; }
  let dmg; if(sv.ok&&!c.half){ say(`${tag} — shrugs it off.`,"#9ab8d8"); reveal(e); return; }
  const dd=(c.hurtDice&&e.hp<e.max)?c.hurtDice:c.dice; dmg=dice(dd[0],dd[1]); if(sv.ok) dmg=Math.floor(dmg/2); let extra="";
  if(!sv.ok&&c.fx==="mocked"){ e.mocked=true; extra=" · disadvantage on its next attack"; } if(!sv.ok&&c.fx==="flee"){ e.flee=3; extra=` · it flees from ${PR().him}`; }
  if(c.fx==="mocked") mock(e);
  say(`${tag} — ${dmg} ${c.type}${dd!==c.dice?" (1d12: it's already hurt)":""}${sv.ok?" (half)":""}${extra}`,"#ffd36a"); hurt(e,dmg,c.type); }
const MOCKS=["Your mother was a lichen, and not a clever one.","You have eight eyes and still can't find a friend.","I've met stalagmites with more personality."];
function mock(e){ e.pops.push({t:MOCKS[d(3)-1],c:"#e59bff",age:0,long:true}); }

// ---- mouse buttons as in the field games: LEFT tap = the weapon, LEFT held = the class power, RIGHT = ranged, MIDDLE = speak
const HOLD=.45;
const KIT={fifi:{melee:"dagger",power:null,thrust:true,sneak:"hide",ranged:"fifiBow",uses:2},kenta:{melee:"unarmed",power:"shockingGrasp",ranged:"rayOfFrost",uses:3},
  samson:{melee:"unarmed",power:"guidingBolt",ranged:"tollTheDead",uses:3},scott:{melee:"unarmed",power:"viciousMockery",ranged:"viciousMockery",uses:3}};
const cardOf=(k)=>CARDS.find(c=>c.key===k)||(CARD[k]&&{...CARD[k],key:k});
function holdStart(){ if(P.dead||paused) return; P.hold={t:performance.now()/1000,fired:false}; }
function holdEnd(){ const h=P.hold; if(h&&!h.fired&&performance.now()/1000-h.t>=HOLD){ holdTick(); } P.hold=null; if(!h||h.fired) return; const kit=KIT[PC.voice]; const c=cardOf(kit.melee); if(c.hand==="dagger"&&!P.dagger) runCard(cardOf("unarmed")); else runCard(c); }
// ---- the thrust (Sam, 9/30): hold the left button with the dagger — she draws the blade back, drives it straight ahead
// and lunges half a square forward with a grunt. Same SRD dagger attack (+5, 1d4+3); the lunge is what buys the reach.
const THRUST=[{t:2,x:236,y:150,a:-1.9,s:1},{t:4,x:254,y:172,a:-1.75,s:1.06},{t:2,x:178,y:112,a:-1.57,s:.8,lines:1},{t:4,x:172,y:108,a:-1.57,s:.78,lines:.6},{t:4,x:222,y:150,a:-1.8,s:.95},{t:2,x:236,y:150,a:-1.9,s:1}];
const thrustLen=()=>THRUST.reduce((s,f)=>s+f.t,0)*TIC;
function thrust(){ if(P.dead||paused||P.cool>0) return; const c=cardOf("dagger"); const rig=!!(RIG&&RIG.dagger); P.act={kind:"thrust2",hand:"dagger",t:0,dur:rig?mrTotal():thrustLen()}; P.cool=actCool(c)*1.3;
  later(rig?mrTiming("light").windup/1000:4*TIC,()=>{ grunt(); SND.whoosh(1.4); P.lunge=.14; });
  later(rig?mrHit():6*TIC,()=>{ const e=target(2.3); if(e){ breakHide(); weaponHit({...c,name:"Dagger thrust"},e); } else SND.miss(); }); }
// Leap back (Sam, 9/30): 0 on the keyboard. Rogues, rangers and fighters hop ~8 ft backwards out of reach.
// House rule, not SRD: free; while in the air and for half a second after, attacks against
// them have disadvantage (the Dodge action's effect, borrowed). 3 s cooldown; always a grunt in their own voice. Cancels a bow draw. Doesn't break Hide.
const LEAP_T=.28, LEAP_DIST=1.6, LEAP_CD=3; // Sam 9/30: 3 s cooldown
function canLeap(){ return PC&&/rogue|ranger|fighter/i.test(PC.cls); }
function leapBack(){ if(!started||paused||P.dead) return;
  if(!canLeap()){ say(`Only rogues, rangers and fighters can leap back.`,"#8a8078"); return; }
  if(P.leapCd>0||P.leap>0) return;
  if(P.restrained){ say(`Webbed — ${PR().he} can't leap. E tears free.`,"#ff7a6a"); return; }
  if(P.drawing){ P.drawing=false; P.draw=0; if(P.drawSnd){ P.drawSnd.stop(true); P.drawSnd=null; } }
  const s=((keys.has("d")||keys.has("arrowright"))?1:0)-((keys.has("a")||keys.has("arrowleft"))?1:0); // held strafe tilts the hop sideways
  const bx=-Math.cos(P.a), by=-Math.sin(P.a), sx=-Math.sin(P.a)*s*.6, sy=Math.cos(P.a)*s*.6, n=Math.hypot(bx+sx,by+sy);
  P.leapV={x:(bx+sx)/n*LEAP_DIST/LEAP_T, y:(by+sy)/n*LEAP_DIST/LEAP_T}; P.leap=LEAP_T; P.leapCd=LEAP_CD; P.dodge=Math.max(P.dodge,LEAP_T+.5);
  P.swayY=Math.min(22,P.swayY+14); SND.whoosh(.75); grunt(); } // Sam 9/30: always grunts, in their own voice
// House rules (the book is silent on a violet fungus's spores; DC 12 CON is the guide's DC for the Underdark's magic fungi,
// and the timmask's spore cloud "put the bandit under a confusion spell" — effect 3 nods to that). Fail = the SRD Poisoned
// condition (disadvantage on attack rolls and ability checks) for 60 s, plus one effect on 1d4:
//   1 Choking fit — 1d4 poison damage; the coughing gives you away (Hide ends; hunters within 8 squares come for you).
//   2 Swimming sight — the view blurs and swims for 30 s.
//   3 Reeling — the cave tilts: the view drifts and your steps veer for 20 s.
//   4 Spore-lit lungs — you breathe out violet light for 60 s: no hiding, anything with eyes sees you from 12 squares.
const SPORE_DC=12, SPORE_R=1.35, SPORE_CLOUD=1.8;
function updateSpores(dt){ for(const e of SPORES){ e.sporeCd-=dt; e.ft+=0;
    if(e.wake>0){ e.wake-=dt; e.state="glow"; const k=Math.min(1,e.wake/1.2)*(.75+.25*Math.sin(t*9)); e.light.r=.9*k; e.light.g=.35*k; e.light.b=1.3*k; e.glow="rgba(205,120,255,A)"; }
    else { e.state="idle"; e.light.r=e.light.g=e.light.b=0; e.glow=null; }
    if(started&&!P.dead&&!BLD.open&&e.sporeCd<=0&&Math.hypot(e.x-P.x,e.y-P.y)<SPORE_R) sporeBurst(e); } }
function sporeBurst(e){ e.sporeCd=30; e.wake=4.2;
  playBuf("sfung2",{x:e.x,y:e.y,vol:1.6}); tone(3,{f0:196,f1:174,vol:.05,x:e.x,y:e.y,attack:.6}); tone(3,{f0:294,f1:262,vol:.035,x:e.x,y:e.y,attack:.8,wave:"triangle"});
  say("The violet fungus stirs — its tentacles curl and it begins to glow.","#d7a0ff");
  later(.55,()=>{ playBuf("sfung4",{x:e.x,y:e.y,vol:1.4}); playBuf("sfung1",{x:e.x,y:e.y,vol:.7,rate:.8});
    for(let i=0;i<46;i++){ const a=Math.random()*6.28, v=.25+Math.random()*.7; FX.push({kind:"spore",x:e.x,y:e.y,z:.28+Math.random()*.2,vx:Math.cos(a)*v,vy:Math.sin(a)*v,vz:.12+Math.random()*.35,life:3+Math.random()*2.5,max:5.5,hue:Math.random()<.7?0:1,ph:Math.random()*6}); }
    if(Math.hypot(e.x-P.x,e.y-P.y)<SPORE_CLOUD&&!P.dead) sporeSave(); }); }
function sporeSave(){ const r=d20(false,false), m=PC.mods.con, tot=r.f+m, ok=tot>=SPORE_DC;
  say(`Spores — CON save: ${r.txt}${m>=0?"+":""}${m} = ${tot} vs DC ${SPORE_DC} — ${ok?`${PC.name} holds ${PR().his} breath`:"inhaled"}`,ok?"#bfe3a0":"#d7a08c");
  if(ok) return;
  P.poison=60; const k=d(4); playBuf("coughB",{vol:.9});
  if(k===1){ const dmg=d(4); P.hp=Math.max(0,P.hp-dmg); P.hurt=.45; P.hurtAnim=.5; later(.4,()=>playBuf("cough",{vol:1.1})); breakHide();
    for(const o of ENTS) if(o.foe&&!o.dead&&Math.hypot(o.x-P.x,o.y-P.y)<8) reveal(o);
    say(`Poisoned — d4: 1, a choking fit. ${dmg} poison damage, and the coughing carries.`,"#b8e07a"); if(P.hp<=0) fall(); }
  else if(k===2){ P.blur=30; say("Poisoned — d4: 2, swimming sight. The cave smears and bends.","#b8e07a"); }
  else if(k===3){ P.reel=20; say("Poisoned — d4: 3, reeling. The floor tilts under every step.","#b8e07a"); }
  else { P.sporeGlow=60; breakHide(); say(`Poisoned — d4: 4, spore-lit lungs. ${PC.name} breathes out violet light — no hiding like this.`,"#b8e07a"); }
  say("POISONED (60 s): disadvantage on attack rolls and ability checks.","#b8e07a"); renderBar(); }
// Breathing (Sam, 9/30, ElevenLabs): quiet and slow; faster and louder after a scare, a dash, a leap or the spores;
// barely there while crouched or hidden.
let breathT=1.5; function breathe(dt){ if(!BUF.breath||P.dead||!started||paused) return; breathT-=dt; if(breathT>0) return;
  const hard=P.fright>0||P.dash>0||P.poison>0||P.leapCd>1.5||P.hurt>0, low=P.crouch||P.hidden; const rate=hard?1.22:1;
  const bk=Math.random()<.8||!BUF.breathB?"breath":"breathB"; playBuf(bk,{vol:(hard?.1:.045)*(low?.6:1),rate}); /* Sam 9/30: much more subtle */ breathT=BUF[bk].duration/rate+.3+Math.random()*(hard?.3:1.4); }
// Jump (Sam, 9/30: "space to be jumping … a little hop based on strength. It should look natural"). The SRD's standing
// high jump: (3 + STR modifier) feet, halved without a run-up — so Fifi (STR -1) clears 1 ft, Kenta and Scott (+1) 2 ft.
// Real gravity (32 ft/s²), a short knee-dip before take-off, the knees taking the landing, a scuff and a soft landing.
const FT=.5/5.2; // the eye sits at 0.5 of the cave's height, about 5 ft 2 in off the floor
function jump(){ if(!started||paused||P.dead||P.air||P.jumpPre>0||P.leap>0||P.restrained) return;
  if(P.crouch){ P.crouch=false; } P.jumpPre=.07; }
function takeOff(){ const run=(keys.has("w")||keys.has("arrowup"))&&!P.drawing; const ft=Math.max(.5,(3+PC.mods.str)*(run?.75:.5)); // a moving hop gets a little more
  const g=32*FT; P.jv=Math.sqrt(2*g*ft*FT); P.air=true; P.jz=0;
  SND.step(.8); noise(.16,{type:"bandpass",f0:600,f1:1400,q:.8,vol:.07,attack:.02}); }
function jumpTick(dt){ if(P.jumpPre>0){ P.jumpPre-=dt; if(P.jumpPre<=0){ P.jumpPre=0; takeOff(); } }
  if(P.air){ P.jv-=32*FT*dt; P.jz+=P.jv*dt; if(P.jz<=0){ const hard=Math.min(1,-P.jv/(32*FT*.5)); P.jz=0; P.air=false; P.jv=0; P.land=.22;
      P.swayY=Math.min(22,P.swayY+6+8*hard); SND.step(.9+.4*hard); later(.05,()=>SND.step(.5)); faunaNoise(P.x,P.y,P.crouch?1.5:3); } }
  if(P.land>0) P.land=Math.max(0,P.land-dt); }
// the eye's offset from the hop: dip before take-off, the arc, the knees giving on landing
function hopZ(){ const dip=P.jumpPre>0?-.025*Math.sin(Math.PI*(1-P.jumpPre/.07)*.5):0; const land=P.land>0?-.03*Math.sin(Math.PI*(1-P.land/.22)):0; return P.jz+dip+land; }
function grunt(){ const L=GRUNTS[PC.voice]; if(!L||!BUF[PC.voice+"Grunt"]) return; const seg=L[d(L.length)-1]; playBuf(PC.voice+"Grunt",{off:seg[0],dur:seg[1]-seg[0],vol:1.3}); }
function sneakPower(){ const kit=KIT[PC.voice]; const c=cardOf(kit.sneak); if(P.power<=0){ say(`${c.name} (power): none left this outing.`,"#8a8078"); return; } P.cool=0; const h0=P.hidden; runCard(c); if(P.hidden&&!h0){ P.power--; say(`Sneak — ${P.power} left this outing.`,"#e3b95c"); } renderBar(); }
function midTick(){ const m=P.mhold; if(!m||m.fired||performance.now()/1000-m.t<HOLD) return; m.fired=true; if(KIT[PC.voice].sneak) sneakPower(); }
function holdTick(){ midTick(); const h=P.hold; if(!h||h.fired||performance.now()/1000-h.t<HOLD) return; const kit=KIT[PC.voice]; if(kit.thrust&&P.dagger){ h.fired=true; thrust(); return; } if(!kit.power) return; h.fired=true; const c=cardOf(kit.power);
  if(P.power<=0){ say(`${c.name} (power): none left this outing.`,"#8a8078"); return; } P.cool=0; const before=P.slots, a0=P.act, h0=P.hidden; runCard({...c,slot:0}); if((P.act&&P.act!==a0)||(P.hidden&&!h0)){ P.power--; say(`Power: ${c.name} — ${P.power} left this outing.`,"#e3b95c"); } P.slots=before; renderBar(); }
function rangedStart(){ const c=cardOf(KIT[PC.voice].ranged); if(c.kind==="bow") startDraw(c); else runCard(c); }
// Crouch (Sam, 9/30): TAP the mouse wheel to crouch or stand; HOLD it to Hide (rogues — Cunning Action).
// Crouched: slower (55%), quieter footsteps, advantage on Stealth checks, and creatures without blindsight only
// pick you out within 8 squares instead of 12 (house rule — the SRD has no crouch). Hiding crouches you;
// standing up ends Hide.
function toggleCrouch(){ if(P.dead) return;
  if(P.crouch||P.hidden){ P.crouch=false; if(P.hidden){ P.hidden=0; say(`${PC.name} stands up — no longer hidden.`,"#d7a08c"); } else say(`${PC.name} stands.`,"#9d9281"); }
  else { P.crouch=true; say(`${PC.name} crouches — slower and quieter; advantage on Stealth checks.`,"#bfe3a0"); }
  noise(.18,{type:"lowpass",f0:700,f1:300,vol:.2,attack:.03}); renderBar(); }
function speak(){ say("She calls into the dark. Nothing here answers — Speak with Animals needs an animal.".replace("She",PC.name),"#9d9281"); }
// ---- the bow: hold to draw, let go to loose
function startDraw(c){ if(!c||c.kind!=="bow"||P.cool>0||P.dead) return; P.bowCard=c; if(c.ammo&&P.arrows<=0){ say("No arrows left in the quiver.","#8a8078"); return; } P.drawing=true; P.draw=0; if(P.drawSnd) P.drawSnd.stop(true); P.drawSnd=SND.draw(); }
function loose(){ const c=P.bowCard||curCard(); P.drawing=false; if(P.drawSnd){ P.drawSnd.stop(P.draw>=.35); P.drawSnd=null; } if(P.draw<.35){ P.draw=0; return; } const e=target(c.range[1]); P.looseFrom=P.draw; P.act={kind:"loose",hand:"bow",t:0,dur:.35}; P.cool=.9; P.draw=0; SND.twang(); faunaNoise(P.x,P.y,3.5); breakHide(); if(c.ammo){ P.arrows--; renderBar(); }
  fireArrow(c); }
// ---- ARROW PHYSICS (Sam, 9/30 — house rules on top of the SRD roll): the arrow is a real object in flight.
//  • Speed and force from STRENGTH: (20 + 3 per STR modifier, never under 12) × 1.3 squares a second (Sam 9/30: +30%); force shoves a creature back.
//  • Gravity pulls it down (3.2 cave-heights a second², a game-feel value, gentler than Earth's) — long shots must be aimed
//    high. An enchanted bow's arrows fly true (no drop).
//  • DEXTERITY makes the aim forgiving: the arrow counts as reaching a creature within 0.25 + 0.07 × DEX mod squares of it.
//  • Reaching the creature isn't hitting it: the SRD attack roll against its AC still decides, and the damage is the SRD's.
// Skyrim-style (Sam, 9/30): the arrow leaves from your eye and flies through the centre of the crosshair. It is launched a
// touch high so its arc crosses the crosshair line again at ZERO squares (as a sighted bow would be zeroed) — a hair
// above the crosshair before that, dropping below it beyond; the landing ring shows how far. Speed 20 squares a second
// + 3 per STR modifier; gravity 2.4 cave-heights/s² (gentle, game-feel); an enchanted bow's arrows don't drop.
const ARROW_G=2.4, ZERO=8;
function launch(c){ const str=PC.mods.str, S=Math.max(12,20+3*str)*1.3, /* Sam 9/30: arrows 30% faster */ slope=P.pitch/(RH*P.zoom); const vh=S/Math.sqrt(1+slope*slope), g=c&&c.enchanted?0:ARROW_G;
  const drop=.1; // it leaves from the bow, just under your eye, and rises to meet the crosshair line at ZERO
  return {x:P.x,y:P.y,z:P.eye+hopZ()-drop,vx:Math.cos(P.a)*vh,vy:Math.sin(P.a)*vh,vz:vh*slope+g*(ZERO/vh)/2+drop*vh/ZERO,g,reach:.25+.07*Math.max(0,PC.mods.dex),force:Math.max(.2,1+str*.25)}; }
// Where a spent arrow ends up (Sam, 9/30): it sticks where it struck, at the height it struck — in the rock (most of the
// time; otherwise it snaps and drops), in the floor, or in the creature it wounded (it rides along with it, and stays in
// the body). One that clatters off falls to the floor. Any that survive can be pulled out with E (SRD: half your arrows
// are recoverable after a fight — here, the ones that stuck or lie whole).
// Sam, 9/30: "why is this arrow in the air … it should be impaling this mushroom." Arrows used to stop at an invisible
// cylinder round each solid prop, so they hung in the air beside it. Now a prop is hit only where its picture is: the
// arrow is tested where it crosses the prop's billboard plane, against that frame's own pixels — and small props count too.
const MASKS=new Map();
function alphaAt(im,x,y){ let m=MASKS.get(im); if(!m){ try{ const c=document.createElement("canvas"); c.width=im.width; c.height=im.height; const g=c.getContext("2d"); g.drawImage(im,0,0); m=g.getImageData(0,0,im.width,im.height).data; }catch(e){ m=null; } MASKS.set(im,m); } if(!m) return 255; return m[(Math.min(im.height-1,Math.max(0,y))*im.width+Math.min(im.width-1,Math.max(0,x)))*4+3]; }
function propHit(ax,ay,az,bx,by,bz){ if(!CAM) return null; const cx=Math.cos(P.a), cy=Math.sin(P.a);
  for(const e of ENTS){ if(!(e.deco||e.forage)||e.hang||(e.forage&&e.spent)) continue; const sc=e.scale||1; if(Math.hypot(e.x-bx,e.y-by)>sc*.8+.3) continue;
    const a0=(ax-e.x)*cx+(ay-e.y)*cy, a1=(bx-e.x)*cx+(by-e.y)*cy; if(!(a0<0&&a1>=0)) continue; const k=-a0/(a1-a0);
    const x=ax+(bx-ax)*k, y=ay+(by-ay)*k, z=az+(bz-az)*k; if(z<0||z>sc) continue;
    const img=spriteFrame(e); if(!img) continue; const pe=project(e.x,e.y,.5), pc=project(x,y,z); if(!pe||!pc) continue;
    const hh=Math.abs(VS()/pe.d)*sc, ww=hh*(e.aspect||1), top=CAM.hz+Math.abs(VS()/pe.d)*CAM.eye-hh; const col=(pc.x-(pe.x-ww/2))/ww, row=(pc.y-top)/hh;
    if(col<0||col>=1||row<0||row>=1) continue; if(alphaAt(img.im,Math.floor(img.sx+col*img.sw),Math.floor(img.sy+row*img.sh))>60) return {e,x,y,z}; }
  return null; }
function landArrow(f,res){ const sp=Math.hypot(f.vx,f.vy,f.vz)||1, dir={x:f.vx/sp,y:f.vy/sp,z:f.vz/sp};
  const drop=()=>{ if(Math.random()<.5) FX.push({kind:"arrowGround",x:f.x-dir.x*.2,y:f.y-dir.y*.2,a:Math.atan2(f.vy,f.vx),life:1e9}); };
  if(res==="hit"){ const e=f.hitEnt; if(e&&f.struck&&Math.random()<.6){ FX.push({kind:"arrowStuck",ent:e,ox:f.x-e.x-dir.x*.12,oy:f.y-e.y-dir.y*.12,z:Math.max(.05,f.z),dir,life:1e9}); } else if(e&&!f.struck){ noise(.04,{f0:2200,q:5,vol:.25,x:f.x,y:f.y}); drop(); } return; }
  SND.miss(f.x,f.y);
  if(res==="prop"){ const e=f.prop, soft=/fungi|violet|mushroom/.test(e.sprite||"");
    if(soft){ noise(.07,{type:"lowpass",f0:700,vol:.35,x:f.x,y:f.y}); tone(.1,{f0:140,f1:90,vol:.15,x:f.x,y:f.y}); } else { noise(.05,{f0:1500,q:4,vol:.35,x:f.x,y:f.y}); tone(.12,{f0:180,f1:120,vol:.2,x:f.x,y:f.y}); }
    if(e.spore&&e.sporeCd<=0) sporeBurst(e); // shooting a violet fungus wakes it too
    if(Math.random()<(soft?.9:.4)) FX.push({kind:"arrowStuck",x:f.x,y:f.y,z:Math.max(.02,f.z),dir,life:1e9}); else drop(); return; }
  if(res==="wall"){ noise(.05,{f0:1500,q:4,vol:.35,x:f.x,y:f.y}); tone(.12,{f0:180,f1:120,vol:.2,x:f.x,y:f.y}); if(Math.random()<.7) FX.push({kind:"arrowStuck",x:f.x,y:f.y,z:Math.max(.02,Math.min(.98,f.z)),dir,life:1e9}); else drop(); return; }
  if(res==="floor"){ noise(.05,{f0:1800,q:4,vol:.3,x:f.x,y:f.y}); if(Math.random()<.45) FX.push({kind:"arrowStuck",x:f.x,y:f.y,z:0,dir,life:1e9}); else drop(); return; }
  drop(); }
function stuckPos(f){ return f.ent?{x:f.ent.x+f.ox,y:f.ent.y+f.oy,z:f.z}:{x:f.x,y:f.y,z:f.z}; }
function predictArrow(c){ if(!c) return null; const f=launch(c); const h=1/90; let flown=0;
  for(let i=0;i<360;i++){ f.vz-=f.g*h; f.x+=f.vx*h; f.y+=f.vy*h; f.z+=f.vz*h; flown+=Math.hypot(f.vx,f.vy)*h; if(flown<.3) continue;
    for(const e of ENTS){ if(e.dead||!e.foe) continue; const top=(e.scale||1)*.95; if(Math.hypot(e.x-f.x,e.y-f.y)<f.reach&&f.z>-.02&&f.z<top+.1) return {x:f.x,y:f.y,z:f.z,hit:e}; }
    if(solid(f.x,f.y)||f.z<=0||f.z>=1) return {x:f.x,y:f.y,z:Math.max(0,Math.min(1,f.z)),hit:null}; }
  return {x:f.x,y:f.y,z:f.z,hit:null}; }
function fireArrow(c){ const f=launch(c); FX.push({kind:"arrow3d",...f,card:c,life:4,trail:[],flown:0}); }
function flyArrow(f,dt){ f.trail.push({x:f.x,y:f.y,z:f.z}); if(f.trail.length>40) f.trail.shift(); const n=Math.max(1,Math.ceil(Math.hypot(f.vx,f.vy)*dt/.2));
  for(let s=0;s<n;s++){ const h=dt/n; f.vz-=f.g*h; f.x+=f.vx*h; f.y+=f.vy*h; f.z+=f.vz*h; f.flown+=Math.hypot(f.vx,f.vy)*h; if(f.flown<.3) continue;
    for(const e of ENTS){ if(e.dead||!e.foe) continue; const top=(e.scale||1)*.95; if(Math.hypot(e.x-f.x,e.y-f.y)<f.reach&&f.z>-.02&&f.z<top+.1){ // reached it: now the dice
        const hp0=e.hp; weaponHit(f.card,e,{ranged:true}); f.hitEnt=e; f.struck=e.hp<hp0; if(!e.dead){ const d=Math.hypot(f.vx,f.vy)||1, k=.12*f.force; const nx=e.x+f.vx/d*k, ny=e.y+f.vy/d*k; if(!solid(nx,ny)){ e.x=nx; e.y=ny; } e.stun=Math.max(e.stun||0,.15*f.force); } return "hit"; } }
    { const px=f.x-f.vx*h, py=f.y-f.vy*h, pz=f.z-f.vz*h; const hit=propHit(px,py,pz,f.x,f.y,f.z); if(hit){ const sp=Math.hypot(f.vx,f.vy,f.vz)||1; f.x=hit.x+f.vx/sp*.03; f.y=hit.y+f.vy/sp*.03; f.z=hit.z+f.vz/sp*.03; f.prop=hit.e; return "prop"; } }
    if(solid(f.x,f.y)){ for(let k=0;k<30&&solid(f.x,f.y);k++){ f.x-=f.vx*h*.08; f.y-=f.vy*h*.08; f.z-=f.vz*h*.08; } return "wall"; } if(f.z<=0){ f.z=0; return "floor"; } if(f.z>=1) return "ceiling"; }
  return null; }
function dropDagger(pt){ const q=aimSafe(pt); FX.push({kind:"dagger",x:q.x,y:q.y,life:1e9}); }
function aimSafe(pt){ let x=pt.x, y=pt.y; for(let k=0;k<10&&solid(x,y);k++){ x-=Math.cos(P.a)*.2; y-=Math.sin(P.a)*.2; } return {x,y}; }

// ---- E: whatever is in front of her
function nearest(pred,r=1.4){ let best=null, bd=r; for(const e of ENTS){ if(!pred(e)) continue; const dd=Math.hypot(e.x-P.x,e.y-P.y); if(dd<bd){ bd=dd; best=e; } } return best; }
function interact(){ if(!$("lore").hidden){ closeLore(); return; } if(!started||P.dead) return;
  if(P.restrained&&P.netted){ const r=check("Get free of the net (Strength)",PC.mods.str,10); P.cool=1; if(r.ok){ P.restrained=false; P.netted=false; say(`${PC.name} throws off the net.`,"#bfe3a0"); } return; }
  if(P.restrained){ const r=check("Break the web (Strength)",PC.mods.str,12); P.cool=1; if(r.ok){ P.restrained=false; say(`${PC.name} tears free of the webbing.`,"#bfe3a0"); } return; }
  if(P.inPit){ if(!(P.climb>0)){ P.climb=2.5; say(`${PC.name} starts climbing the pit wall…`,"#9d9281"); noise(.4,{type:"lowpass",f0:600,vol:.25}); } return; }
  { const L=nearest(e=>e.lore&&!e.removed,1.4); if(L){ readLore(L); return; } }
  { const T=trapNear(); if(T){ disarm(T); return; } }
  const as=FX.find(f=>{ if(f.kind!=="arrowStuck"||(f.ent&&!f.ent.dead)) return false; const q=stuckPos(f); return Math.hypot(q.x-P.x,q.y-P.y)<1.3; }); if(as){ FX.splice(FX.indexOf(as),1); P.arrows++; say(`Arrow pulled free — ${P.arrows} in the quiver.`,"#e3b95c"); noise(.12,{f0:900,q:2,vol:.25}); renderBar(); return; }
  const ag=FX.find(f=>f.kind==="arrowGround"&&Math.hypot(f.x-P.x,f.y-P.y)<1.3); if(ag){ FX.splice(FX.indexOf(ag),1); P.arrows++; say(`Arrow recovered — ${P.arrows} in the quiver.`,"#e3b95c"); renderBar(); return; }
  const dg=FX.find(f=>f.kind==="dagger"&&Math.hypot(f.x-P.x,f.y-P.y)<1.3); if(dg){ FX.splice(FX.indexOf(dg),1); P.dagger=true; say("Dagger back in hand.","#e3b95c"); SND.chime([990]); renderBar(); return; }
  const ch=nearest(e=>e.chest&&!e.opened); if(ch){ openChest(ch,false); return; }
  const m=nearest(e=>e.forage&&!e.spent); if(m){ forage(m); return; } }
function openChest(ch,magic){ ch.opened=true; SND.creak(ch.x,ch.y,.35); burstAt(ch.x,ch.y,"#ffd36a","sparkle");
  later(.6,()=>{ const got=ch.loot.map(([slug,q])=>{ const n=typeof q==="string"?dice(+q[0],+q.slice(2)):q; BAG[slug]=(BAG[slug]||0)+n; return `${ITEMS[slug]}${n>1?` ×${n}`:""}`; });
    SND.chime(); say(`${magic?"Mage Hand lifts the lid. ":""}Chest: ${got.join(", ")}.`,"#ffd36a"); }); }
// Sam, 9/30: on a find the character says one of three things, in their own ElevenLabs voice (characters.voice_id).
// One take per character, cut at the pauses: [start,end] seconds, in the order of FOUND_TXT.
const FOUND_TXT=["This might be edible.","I bet I can make something from this.","This is probably garbage… but maybe…"];
const FOUND_CUT={fifi:[[0,1.5],[2.55,4.62],[5.78,8.91]],kenta:[[0,1.7],[2.82,5.02],[6.28,9.33]],samson:[[0,1.06],[2.35,3.88],[5.3,8.02]],scott:[[0,1.15],[2.48,4.56],[5.98,9.85]]};
function foundLine(){ const k=PC.voice, i=d(3)-1, seg=(FOUND_CUT[k]||[])[i]; say(`${PC.name}: “${FOUND_TXT[i]}”`,"#e8dcc0");
  if(seg&&BUF[k+"Forage"]){ P.voiceT=t; later(.35,()=>playBuf(k+"Forage",{off:seg[0],dur:seg[1]-seg[0],vol:1.3})); } }
function forage(m){ if(P.cool>0) return; m.spent=true; P.act={kind:"forage",hand:"open",t:0,dur:1.1}; P.cool=1.2; SND.rustle();
  later(1.0,()=>{ const r=check("Forage (Survival)",PC.mods.wis,15); if(r.ok){ const slug=FORAGE[d(FORAGE.length)-1], n=d(3); BAG[slug]=(BAG[slug]||0)+n; SND.chime([700,1050]); say(`Foraged: ${ITEMS[slug]} ×${n}.`,"#bfe3a0"); foundLine(); }
    else say(`Nothing here ${PC.name} would trust in ${PR().his} mouth.`,"#d7a08c"); }); }

// =====================================================================================================================
// FRIGHT — Sam, 9/30: "the monsters should roar and scare the crap out of us". DM ruling, not an SRD rule: when a
// creature finds her and roars, a Wisdom save (DC 11 spider, 13 hook horror). Fail: Frightened (SRD condition) for a few
// seconds — disadvantage on attacks and checks while it is in sight, can't move closer — and she swears out loud.
// =====================================================================================================================
// Sam, 9/30: the hook horror's first sighting plays its cinematic before the roar
let paused=false;
function cinematic(src,then){ const ov=$("film"), v=$("filmv"); paused=true; keys.clear(); P.drawing=false; if(document.pointerLockElement) document.exitPointerLock();
  if(MUS&&AC) MUS.gain.setTargetAtTime(.05,AC.currentTime,.2); let done=false;
  const fin=()=>{ if(done) return; done=true; v.pause(); ov.hidden=true; paused=false; last=performance.now(); if(MUS&&AC) MUS.gain.setTargetAtTime(.34,AC.currentTime,.6); removeEventListener("keydown",esc,true); cv.focus(); then&&then(); };
  const esc=(ev)=>{ if(["Escape"," ","Enter"].includes(ev.key)){ ev.preventDefault(); ev.stopPropagation(); fin(); } };
  v.src=src; v.currentTime=0; v.muted=false; v.onended=fin; v.onerror=fin; ov.onclick=fin; $("filmx").onclick=(ev)=>{ ev.stopPropagation(); fin(); }; addEventListener("keydown",esc,true); ov.hidden=false;
  const pr=v.play(); if(pr&&pr.catch) pr.catch(()=>{ v.muted=true; v.play().catch(fin); }); }
function roar(e){ if(e.sprite==="hook"&&!e.filmed&&A.film&&A.film.hook&&!P.dead){ e.filmed=true; cinematic(document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"')?A.film.hook:A.film.hookWebm,()=>{ e.roarT=-99; roar(e); }); return; }
  if(t-e.roarT<18) return; e.roarT=t; faunaNoise(e.x,e.y,9); playBuf(e.roar,{x:e.x,y:e.y,vol:e.sprite==="hook"?1.9:1.6,rate:.95+Math.random()*.1}); P.shake=Math.max(P.shake,.5);
  const dist=Math.hypot(e.x-P.x,e.y-P.y); if(dist>11||P.dead) return; later(.35,()=>frightSave(e)); }
function frightSave(e){ const r=d(20), m=PC.mods.wis, tot=r+m, dc=e.dc; if(tot>=dc){ say(`Fright — WIS save ${r}${m>=0?"+":""}${m} = ${tot} vs DC ${dc}: ${PC.name} holds ${PR().his} nerve.`,"#bfe3a0"); return; }
  P.fright=6; P.frightSrc=e; P.shake=1; say(`Fright — WIS save ${r}${m>=0?"+":""}${m} = ${tot} vs DC ${dc}: FRIGHTENED of the ${e.name.toLowerCase()}.`,"#ff7a6a"); swear(); }
function swear(){ if(t-P.voiceT<3) return; P.voiceT=t; const k=PC.voice, L=LINES[k]; if(!L) return; const seg=L[d(3)-1]; playBuf(k,{off:seg[0],dur:seg[1]-seg[0],vol:1.5}); }

// =====================================================================================================================
// CREATURES
// =====================================================================================================================
// distance field over the grid toward a goal cell, so they walk round corners instead of into rock
const fields=new Map();
function field(gx,gy){ const key=gx+","+gy; const f=fields.get(key); if(f&&t-f.t<.4) return f.d; const dd=new Int16Array(MW*MH).fill(-1); const q=[gy*MW+gx]; dd[q[0]]=0;
  for(let h=0;h<q.length;h++){ const i=q[h], x=i%MW, y=(i/MW)|0; for(const [ax,ay] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+ax, ny=y+ay; if(nx<0||ny<0||nx>=MW||ny>=MH) continue; const j=ny*MW+nx; if(dd[j]>=0||solid(nx+.5,ny+.5)) continue; dd[j]=dd[i]+1; q.push(j); } }
  fields.set(key,{t,d:dd}); return dd; }
function steer(e,tx,ty,dt,away=false){ const spd=(e.speed||1.4)*(e.slow>0?.66:1)*dt; let hx, hy;
  if(!away&&clearLine(e.x,e.y,tx,ty)&&Math.hypot(tx-e.x,ty-e.y)<3){ hx=tx; hy=ty; }
  else { const dd=field(Math.floor(tx),Math.floor(ty)); const cx=Math.floor(e.x), cy=Math.floor(e.y); let best=null, bv=away?-1:1e9; const cur=dd[cy*MW+cx];
    for(const [ax,ay] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=cx+ax, ny=cy+ay; if(nx<0||ny<0||nx>=MW||ny>=MH) continue; const v=dd[ny*MW+nx]; if(v<0) continue; if(away?v>bv:v<bv){ bv=v; best=[nx+.5,ny+.5]; } }
    if(!best||(!away&&cur>=0&&bv>=cur&&cur<=1)){ hx=tx; hy=ty; } else { hx=best[0]; hy=best[1]; } }
  const a=Math.atan2(hy-e.y,hx-e.x); e.heading=away?Math.atan2(P.y-e.y,P.x-e.x)+Math.PI:a; const nx=e.x+Math.cos(a)*spd, ny=e.y+Math.sin(a)*spd;
  const bl=(x,y)=>ENTS.some(o=>o!==e&&o.deco&&o.solid&&Math.hypot(o.x-x,o.y-y)<o.rad+.25); if(!solid(nx,e.y)&&!bl(nx,e.y)&&Math.hypot(nx-P.x,e.y-P.y)>.7) e.x=nx; if(!solid(e.x,ny)&&!bl(e.x,ny)&&Math.hypot(e.x-P.x,ny-P.y)>.7) e.y=ny; e.state="walk"; }
function updateEnts(dt){ for(const e of ENTS){ e.pops.forEach(p=>p.age+=dt); e.pops=e.pops.filter(p=>p.age<(p.long?3.2:1.2)); if(e.dead) continue;
    e.flash=Math.max(0,e.flash-dt); e.ft+=dt; e.cool-=dt; for(const k of ["slow","faerie","guided","flee"]) if(e[k]>0) e[k]-=dt;
    if(!e.foe) continue;
    if(BLD.open){ e.state="idle"; continue; } // the builder freezes the dungeon
    if(e.incap>0){ e.incap-=dt; e.state="idle"; if(e.incap<=0){ const sv=save(e,"wis"); if(sv.ok){ say(`Sleep: ${e.name} shakes it off (WIS ${sv.txt}).`,"#b9c8ff"); reveal(e); } else { e.sleep=60; say(`Sleep: ${e.name} fails again (WIS ${sv.txt}) — unconscious. Damage wakes it.`,"#b9c8ff"); } } continue; }
    if(e.sleep>0){ e.sleep-=dt; e.state="idle"; if(e.sleep<=0) reveal(e); continue; }
    if(e.stun>0){ e.stun-=dt; continue; }
    const dx=P.x-e.x, dy=P.y-e.y, dist=Math.hypot(dx,dy), sees=!P.dead&&perceives(e);
    if(sees&&P.hidden) foundHidden(e,dist);
    // hidden: a creature whose passive Perception beats her Stealth finds her
    if(sees){ e.lastSeen={x:P.x,y:P.y}; if(e.mode!=="hunt"){ e.mode="hunt"; roar(e); } }
    else if(e.mode==="hunt"&&!P.dead){ if(e.lastSeen&&Math.hypot(e.lastSeen.x-e.x,e.lastSeen.y-e.y)<.6){ e.mode="search"; e.searchT=6; } }
    if(e.flee>0){ steer(e,P.x,P.y,dt,true); continue; }
    if(e.mode==="lure"&&e.lure){ if(sees){ e.mode="hunt"; } else { if(Math.hypot(e.lure.x-e.x,e.lure.y-e.y)>.8) steer(e,e.lure.x,e.lure.y,dt); else { e.mode="search"; e.searchT=5; e.lure=null; } continue; } }
    if(e.mode==="hunt"&&!P.dead){ const reach=e.reach||1.1; e.heading=Math.atan2(dy,dx);
      // the spider's web (Recharge 5–6): range 30/60 ft, +5, restrains
      if(e.sprite==="spider"){ e.webT-=dt; if(!e.webReady&&e.webT<=0){ e.webT=6; if(d(6)>=5) e.webReady=true; }
        if(e.webReady&&sees&&dist>2&&dist<7&&e.cool<=0){ e.webReady=false; e.webT=6; e.cool=1.6; e.state="attack"; e.atkT=.55; shootWeb(e); continue; } }
      if(dist>reach){ const tgt=sees?{x:P.x,y:P.y}:(e.lastSeen||{x:P.x,y:P.y}); steer(e,tgt.x,tgt.y,dt); }
      else { e.state="idle"; if(e.cool<=0&&sees){ e.cool=e.sprite==="hook"?2.6:2.1; e.state="attack"; e.atkT=.55; for(let k=0;k<(e.multi||1);k++) later(.3+k*.45,()=>strike(e)); } }
      // behind her and close: a second scare
      if(dist<1.6&&!e.behindScare){ let da=Math.atan2(e.y-P.y,e.x-P.x)-P.a; da=Math.atan2(Math.sin(da),Math.cos(da)); if(Math.abs(da)>1.9){ e.behindScare=true; e.roarT=-99; roar(e); } }
      continue; }
    if(e.mode==="search"){ e.searchT-=dt; if(e.searchT<=0){ e.mode="idle"; } else { if(!e.wander||Math.hypot(e.wander.x-e.x,e.wander.y-e.y)<.5){ const a=Math.random()*6.28; const w={x:e.x+Math.cos(a)*2,y:e.y+Math.sin(a)*2}; e.wander=solid(w.x,w.y)?null:w; } if(e.wander) steer(e,e.wander.x,e.wander.y,dt*.6); } continue; }
    e.state="idle"; } }
// SRD attacks. Giant Spider — Bite +5, 1d8+3 piercing plus DC 11 CON or 2d8 poison (half on a save). Hook Horror — two Hooks, +6, 2d6+4.
const ATK={bite:{name:"bite",hit:5,n:1,d:8,mod:3,poison:{dc:11,n:2,d:8}},hook:{name:"hook",hit:6,n:2,d:6,mod:4}};
function strike(e){ if(e.dead||e.incap||e.sleep||P.dead) return; const A2=ATK[e.atk]||ATK.bite; const ac=P.ac+(P.sof>0?2:0);
  // Sam, 9/30: "it should be able to reach you" — checked again on the frame the blow lands: its real reach (spider bite
  // 5 ft = 1.1 squares, hook horror 10 ft = 2), plus 0.1 square for the body jostling, and nothing solid in between.
  // Step back during its wind-up and the blow falls short.
  { const dd=Math.hypot(P.x-e.x,P.y-e.y), R=e.reach||1.1; if(dd>R+.1||!clearLine(e.x,e.y,P.x,P.y)){ say(`${e.name} ${A2.name} — ${PC.name} is out of reach (${Math.round(dd*5)} ft, reach ${Math.floor(R*5)} ft).`,"#9ab8d8"); SND.miss(e.x,e.y); return; } }
  if(P.sanct>0){ const r=d(20), m=(MSAVE[e.sprite]||{}).wis||0; if(r+m<13){ say(`Sanctuary: the ${e.name.toLowerCase()} (WIS ${r+m} vs DC 13) can't bring itself to strike ${PR().him}.`,"#fff4c9"); return; } }
  let adv=P.restrained, dis=P.dodge>0||!!P.hidden||e.mocked||e.sapped; const why=[P.dodge>0&&"dodging",P.hidden&&"unseen",e.mocked&&"mocked",e.sapped&&"sapped",P.restrained&&"restrained"].filter(Boolean); e.mocked=false; e.sapped=false;
  const r=d20(adv,dis), tot=r.f+A2.hit, crit=r.f===20;
  if(r.f===1||(!crit&&tot<ac)){ say(`${e.name} ${A2.name}: ${r.txt}+${A2.hit} = ${tot} vs AC ${ac}${why.length?` (${why.join(", ")})`:""} — miss`,"#9ab8d8"); SND.miss(e.x,e.y); return; }
  let dmg=A2.mod; for(let i=0;i<A2.n*(crit?2:1);i++) dmg+=d(A2.d); let extra="";
  if(A2.poison){ const sv=d(20)+PC.mods.con; let pz=0; for(let i=0;i<A2.poison.n;i++) pz+=d(A2.poison.d); if(sv>=A2.poison.dc) pz=Math.floor(pz/2); dmg+=pz; extra=` (+${pz} poison, CON ${sv} vs DC ${A2.poison.dc})`; }
  P.hp=Math.max(0,P.hp-dmg); P.hurt=.45; P.hurtAnim=.5; P.shake=Math.max(P.shake,.35); SND.hit(); say(`${e.name} ${A2.name}: ${r.txt}+${A2.hit} = ${tot} vs AC ${ac} — ${crit?"CRITICAL, ":""}${dmg} damage${extra}`,"#ff7a6a");
  if(P.hidden) P.hidden=0; if(dmg>=5&&Math.random()<.5) swear(); if(P.hp<=0) fall(); renderBar(); }
function shootWeb(e){ playBuf("spider",{x:e.x,y:e.y,vol:.7,rate:1.4}); const r=d20(P.restrained,P.dodge>0), tot=r.f+5, ac=P.ac+(P.sof>0?2:0);
  shoot({fromWorld:{x:e.x,y:e.y},to:{x:P.x,y:P.y},speed:9,color:"#e8e8e0",kind:"web",onHit:()=>{ if(r.f!==1&&(r.f===20||tot>=ac)){ P.restrained=true; say(`Web: ${r.txt}+5 = ${tot} vs AC ${ac} — RESTRAINED. E: Strength check DC 12 to tear free.`,"#ff7a6a"); } else say(`Web: ${r.txt}+5 = ${tot} vs AC ${ac} — it misses.`,"#9ab8d8"); }}); }
function fall(){ P.dead=true; P.fright=0; say(`${PC.name} falls. (In the real game: death saving throws.)`,"#ff5a4a"); if(document.pointerLockElement) document.exitPointerLock();
  later(1.4,()=>{ $("deadt").textContent=`${PC.name.toUpperCase()} FALLS`; $("deadp").textContent="At 0 hit points. In the campaign this is where the death saves begin."; $("dead").hidden=false; }); }

// =====================================================================================================================
// EFFECTS
// =====================================================================================================================
function shoot(o){ const from=o.fromWorld||{x:P.x+Math.cos(P.a)*.3,y:P.y+Math.sin(P.a)*.3}; const dx=o.to.x-from.x, dy=o.to.y-from.y, dist=Math.hypot(dx,dy)||.01;
  FX.push({kind:"proj",style:o.kind,x:from.x,y:from.y,vx:dx/dist*o.speed,vy:dy/dist*o.speed,left:dist,color:o.color,onHit:o.onHit,life:5,z:o.fromWorld?.35:.52}); }
function burstAt(x,y,color,style){ FX.push({kind:"burst",x,y,color,style,life:style==="toll"?1.6:.7,max:style==="toll"?1.6:.7}); }
function updateFX(dt){ for(let i=FX.length-1;i>=0;i--){ const f=FX[i]; f.life-=dt;
    if(f.kind==="trailFade"){ if(f.life<=0) FX.splice(i,1); continue; }
    if(f.kind==="arrow3d"){ const res=flyArrow(f,dt); if(res||f.life<=0){ FX.splice(i,1); FX.push({kind:"trailFade",trail:f.trail.concat([{x:f.x,y:f.y,z:f.z}]),life:.45,max:.45}); if(res) landArrow(f,res); } continue; }
    if(f.kind==="proj"){ const s=Math.hypot(f.vx,f.vy)*dt; f.x+=f.vx*dt; f.y+=f.vy*dt; f.left-=s; if(f.left<=0||solid(f.x,f.y)){ f.onHit&&f.onHit(); FX.splice(i,1); continue; } }
    if(f.kind==="fog") f.grow=Math.min(1,f.grow+dt*.8);
    if(f.kind==="spore"){ f.x+=f.vx*dt; f.y+=f.vy*dt; f.z=Math.min(.95,f.z+f.vz*dt); f.vx*=Math.pow(.35,dt); f.vy*=Math.pow(.35,dt); f.vz*=Math.pow(.6,dt); f.x+=Math.sin(t*1.7+f.ph)*.06*dt; if(solid(f.x,f.y)){ f.vx*=-.5; f.vy*=-.5; } }
    if(f.life<=0) FX.splice(i,1); }
  for(let i=LATER.length-1;i>=0;i--){ LATER[i].t-=dt; if(LATER[i].t<=0){ const fn=LATER[i].fn; LATER.splice(i,1); fn(); } } }

// =====================================================================================================================
// RENDER
// =====================================================================================================================
function light(wx,wy,dist){ const fl=reduce?1:1+.05*Math.sin(t*9)+.03*Math.sin(t*23); const L=Math.max(0,1-dist/(6.5*fl)); let r=L*L*1.35, g=L*L*1.1, b=L*L*.85;
  for(const s of LIGHTS){ const dd=Math.hypot(wx-s.x,wy-s.y); if(dd<s.rad){ const k=(1-dd/s.rad); const q=k*k*(.85+.15*Math.sin(t*1.3+s.x)); r+=s.r*q; g+=s.g*q; b+=s.b*q; } }
  return [r+.07,g+.08,b+.12]; }
let CAM=null;
function project(x,y,z=.5){ const {dirX,dirY,plX,plY,inv,hz}=CAM; const sx=x-P.x, sy=y-P.y, tX=inv*(dirY*sx-dirX*sy), tY=inv*(-plY*sx+plX*sy); if(tY<=.12) return null;
  const scr=RW/2*(1+tX/tY), scale=VS()/tY; return {x:scr,y:hz+scale*(CAM.eye-z),s:scale,d:tY}; }
const VS=()=>RH*P.zoom;
function render(){ const VS=RH*P.zoom;
  const dirX=Math.cos(P.a), dirY=Math.sin(P.a), plX=-dirY*.66/P.zoom, plY=dirX*.66/P.zoom;
  const bob=Math.sin(P.bob)*3*(P.eye<.45?.5:1), hz=RH/2+P.pitch+bob-50*forageK(), eye=P.eye+hopZ()-.1*forageK()-(P.inPit?.32:0)+(P.leap>0?Math.sin(Math.PI*(1-P.leap/LEAP_T))*.09:0); CAM={dirX,dirY,plX,plY,inv:1/(plX*dirY-dirX*plY),hz,eye};
  const W=TEX.wall, Wc=TEX.crystal||TEX.wall, Fl=TEX.floor, Ce=TEX.ceil||TEX.wall;
  for(let y=0;y<RH;y++){ const isF=y>hz; const p=isF?y-hz:hz-y; if(p<1){ for(let x=0;x<RW;x++) px[y*RW+x]=0xff000000; continue; }
    const rowD=(VS*(isF?eye:1-eye))/p; const sx=rowD*2*plX/RW, sy=rowD*2*plY/RW; let fx=P.x+rowD*(dirX-plX), fy=P.y+rowD*(dirY-plY);
    const T=isF?Fl:Ce, S=T.size, D=T.d; const dim=isF?1:.55; let [lr,lg,lb]=light(fx,fy,rowD);
    for(let x=0;x<RW;x++){ if((x&15)===0){ [lr,lg,lb]=light(fx,fy,rowD); } const tx=((fx*S)|0)&(S-1), ty=((fy*S)|0)&(S-1), i=(ty*S+tx)*4;
      let r=Math.min(255,D[i]*lr*dim), g=Math.min(255,D[i+1]*lg*dim), b=Math.min(255,D[i+2]*lb*dim);
      if(isF){ const cx=fx|0, cy=fy|0; if(cx>=0&&cy>=0&&cx<MW&&cy<MH&&PITV[cy*MW+cx]&&!P.inPit){ const ex=fx-cx, ey=fy-cy, m=Math.min(ex,ey,1-ex,1-ey); if(m>.06){ r=r*.06; g=g*.05; b=b*.07; } else { r*=.45; g*=.4; b*=.38; } } } // a pit: the hole and its broken lip
      px[y*RW+x]=0xff000000|(b<<16)|(g<<8)|r; fx+=sx; fy+=sy; } }
  for(let x=0;x<RW;x++){ const cam=2*x/RW-1, rdx=dirX+plX*cam, rdy=dirY+plY*cam; let mx=Math.floor(P.x), my=Math.floor(P.y);
    const ddx=Math.abs(1/rdx), ddy=Math.abs(1/rdy); let stx,sty,sdx,sdy; if(rdx<0){ stx=-1; sdx=(P.x-mx)*ddx; } else { stx=1; sdx=(mx+1-P.x)*ddx; } if(rdy<0){ sty=-1; sdy=(P.y-my)*ddy; } else { sty=1; sdy=(my+1-P.y)*ddy; }
    let side=0, hit="#", n=0; while(n++<64){ if(sdx<sdy){ sdx+=ddx; mx+=stx; side=0; } else { sdy+=ddy; my+=sty; side=1; } const c=(MAP[my]||"")[mx]; if(c==="#"||c==="C"||c===undefined){ hit=c||"#"; break; } }
    const pd=side===0?(sdx-ddx):(sdy-ddy); zbuf[x]=pd; const lh=Math.floor(VS/pd); let y0=Math.floor(hz-lh*(1-eye)), y1=Math.floor(hz+lh*eye);
    let wx=side===0?P.y+pd*rdy:P.x+pd*rdx; wx-=Math.floor(wx); const T=hit==="C"?Wc:W, S=T.size, D=T.d; let tx=Math.floor(wx*S); if((side===0&&rdx>0)||(side===1&&rdy<0)) tx=S-tx-1;
    const hx=P.x+pd*rdx, hy=P.y+pd*rdy; let [lr,lg,lb]=light(hx-(side===0?stx*.01:0),hy-(side===1?sty*.01:0),pd); if(side===1){ lr*=.82; lg*=.82; lb*=.82; }
    const glow=hit==="C"?.55+.25*Math.sin(t*1.6+mx):0; const ys=Math.max(0,y0), ye=Math.min(RH-1,y1);
    for(let y=ys;y<=ye;y++){ const ty=Math.floor((y-y0)/lh*S)&(S-1), i=(ty*S+tx)*4; let r=D[i]*lr, g=D[i+1]*lg, b=D[i+2]*lb;
      if(glow&&D[i+2]>150&&D[i+2]>D[i]+30){ r+=D[i]*glow*.6; g+=D[i+1]*glow*.8; b+=D[i+2]*glow; }
      px[y*RW+x]=0xff000000|(Math.min(255,b)<<16)|(Math.min(255,g)<<8)|Math.min(255,r); } }
  ctx.putImageData(buf,0,0);
  // sprites and effects, far to near, clipped by the wall depth per column
  const items=[]; for(const e of ENTS){ items.push({k:"e",o:e,d:(e.x-P.x)**2+(e.y-P.y)**2}); }
  for(const f of FX){ if(f.kind==="fog"){ for(const p of f.puffs) items.push({k:"puff",o:p,f,d:(f.x+Math.cos(p.a)*p.d*f.grow-P.x)**2+(f.y+Math.sin(p.a)*p.d*f.grow-P.y)**2}); } else if(f.kind!=="arrow3d"&&f.kind!=="trailFade"){ const q=f.kind==="arrowStuck"?(()=>{ const p=stuckPos(f); return {x:p.x-f.dir.x*ARROW_L*.6,y:p.y-f.dir.y*ARROW_L*.6}; })():f; items.push({k:"fx",o:f,d:(q.x-P.x)**2+(q.y-P.y)**2-(f.ent?.05:0)}); } }
  for(const b of BATS) items.push({k:"fa",o:{kind:"bat",o:b},d:(b.x-P.x)**2+(b.y-P.y)**2}); for(const sp of SPIDS) items.push({k:"fa",o:{kind:"spider",o:sp},d:(sp.x-P.x)**2+(sp.y-P.y)**2});
  for(const m of MOTHS) items.push({k:"fa",o:{kind:"moth",o:m},d:(m.x-P.x)**2+(m.y-P.y)**2});
  items.sort((a,b)=>b.d-a.d);
  for(const it of items){ if(it.k==="e") drawEnt(it.o); else if(it.k==="fa") drawFauna(it.o); else if(it.k==="puff") drawPuff(it.o,it.f); else drawFx(it.o); }
  drawSlash(ctx); drawBody(); for(const f of FX) if(f.kind==="arrow3d"||f.kind==="trailFade") drawFx(f); drawCursor(ctx); drawBuildRing(); drawRig();
  // edges of the lantern light, fright, hurt
  const v=ctx.createRadialGradient(RW/2,RH*.55,RH*.25,RW/2,RH*.55,RW*.7); v.addColorStop(0,"rgba(0,0,0,0)"); v.addColorStop(1,"rgba(0,0,0,.55)"); ctx.fillStyle=v; ctx.fillRect(0,0,RW,RH);
  if(P.inPit){ const pv=ctx.createRadialGradient(RW/2,RH*.5,RH*.18,RW/2,RH*.5,RW*.48); pv.addColorStop(0,"rgba(0,0,0,0)"); pv.addColorStop(.7,"rgba(8,6,5,.85)"); pv.addColorStop(1,"rgba(0,0,0,.98)"); ctx.fillStyle=pv; ctx.fillRect(0,0,RW,RH); }
  if(P.netted){ ctx.save(); ctx.strokeStyle="rgba(70,52,34,.85)"; ctx.lineWidth=2; ctx.beginPath(); for(let k=-RH;k<RW+RH;k+=34){ ctx.moveTo(k,0); ctx.lineTo(k+RH*.8,RH); ctx.moveTo(k+RH*.8,0); ctx.lineTo(k,RH); } ctx.stroke(); ctx.restore(); }
  if(P.fright>0){ const k=.35+.25*Math.sin(t*9); const fv=ctx.createRadialGradient(RW/2,RH/2,RH*.2,RW/2,RH/2,RW*.62); fv.addColorStop(0,"rgba(0,0,0,0)"); fv.addColorStop(1,`rgba(90,0,10,${k})`); ctx.fillStyle=fv; ctx.fillRect(0,0,RW,RH); }
  if(P.restrained){ ctx.strokeStyle="rgba(230,230,220,.35)"; ctx.lineWidth=1; for(let i=0;i<14;i++){ ctx.beginPath(); ctx.moveTo((i*97)%RW,0); ctx.quadraticCurveTo(RW/2+Math.sin(i)*80,RH/2,(i*151)%RW,RH); ctx.stroke(); } }
  if(P.hurt>0){ ctx.fillStyle=`rgba(190,20,30,${P.hurt*.8})`; ctx.fillRect(0,0,RW,RH); }
  if(P.hidden){ ctx.fillStyle="rgba(10,14,30,.28)"; ctx.fillRect(0,0,RW,RH); }
  drawHUD(); }
function drawEnt(e){ if(e.removed) return; const pr=project(e.x,e.y,.5); if(!pr) return; const tY=pr.d; if(e.forage&&e.spent) return;
  const h=Math.abs(VS()/tY)*(e.scale||1), w=h*(e.aspect||1); const top=e.hang?CAM.hz-Math.abs(VS()/tY)*(1-CAM.eye):CAM.hz+Math.abs(VS()/tY)*CAM.eye-h; const scrX=Math.floor(pr.x);
  const img=spriteFrame(e); if(!img) return; const [lr,lg,lb]=light(e.x,e.y,tY); const br=Math.min(1.6,(lr+lg+lb)/3*1.25);
  const x0=Math.floor(scrX-w/2), x1=Math.floor(scrX+w/2);
  ctx.save(); ctx.filter=`brightness(${Math.max(.05,br+(e.faerie>0?.35:0)).toFixed(2)})${e.hue?` hue-rotate(${e.hue}deg)`:""}${e.slow>0?" hue-rotate(160deg) saturate(1.6)":""}${e.flash>0?" saturate(0) brightness(2.2)":""}${e.dead?" grayscale(.8) brightness(.6)":""}${e.opened?" brightness(1.3) sepia(.4)":""}`;
  for(let x=Math.max(0,x0);x<Math.min(RW,x1);x++){ if(tY>=zbuf[x]) continue; const u=(x-x0)/(x1-x0); ctx.drawImage(img.im,img.sx+Math.floor(u*img.sw),img.sy,1,img.sh,x,top,1,h); }
  ctx.restore();
  const visible=scrX>=0&&scrX<RW&&tY<zbuf[Math.max(0,Math.min(RW-1,scrX))];
  const glowC=e.faerie>0?"rgba(215,140,255,A)":e.glow; if(glowC&&!(e.forage&&e.spent)&&visible){ const r=h*.9; const gr=ctx.createRadialGradient(scrX,top+h*.6,2,scrX,top+h*.6,r); gr.addColorStop(0,glowC.replace("A",(.3*Math.min(1,br+.4)).toFixed(2))); gr.addColorStop(1,glowC.replace("A","0")); ctx.globalCompositeOperation="lighter"; ctx.fillStyle=gr; ctx.fillRect(scrX-r,top+h*.6-r,r*2,r*2); ctx.globalCompositeOperation="source-over"; }
  if(!visible) return;
  ctx.textAlign="center"; ctx.font="700 11px Cinzel, Georgia, serif";
  if(e.sleep>0||e.incap>0){ ctx.fillStyle="#b9c8ff"; ctx.fillText(e.sleep>0?"z Z z":"z…",scrX,top-4-Math.sin(t*2)*3); }
  e.pops.forEach((p,i)=>{ ctx.globalAlpha=Math.max(0,1-p.age/(p.long?3.2:1.2)); ctx.fillStyle=p.c; ctx.font=p.long?"italic 600 11px 'Crimson Text', Georgia, serif":"700 14px Cinzel, Georgia, serif"; ctx.fillText(p.t,scrX,top-10-i*14-p.age*(p.long?4:18)); }); ctx.globalAlpha=1;
  if(e.foe&&!e.dead&&e.hp<e.max){ ctx.fillStyle="rgba(0,0,0,.6)"; ctx.fillRect(scrX-16,top-3,32,3); ctx.fillStyle="#d8243a"; ctx.fillRect(scrX-16,top-3,32*e.hp/e.max,3); } }
function drawPuff(p,f){ const x=f.x+Math.cos(p.a)*p.d*f.grow, y=f.y+Math.sin(p.a)*p.d*f.grow; const pr=project(x,y,.35+p.h*.6); if(!pr) return; const r=pr.s*.9*p.s*f.grow; const cx=Math.floor(pr.x);
  if(cx+r<0||cx-r>RW) return; const col=Math.max(0,Math.min(RW-1,cx)); if(pr.d>=zbuf[col]+.5) return; const a=Math.min(1,f.life/3)*.5;
  const g=ctx.createRadialGradient(pr.x,pr.y,0,pr.x,pr.y,r); g.addColorStop(0,`rgba(205,212,225,${a})`); g.addColorStop(1,"rgba(205,212,225,0)"); ctx.fillStyle=g; ctx.fillRect(pr.x-r,pr.y-r,r*2,r*2); }
const ARROW_L=.34; // Sam 9/30: "a little long" — was .45 in flight, .38 stuck
function shadeRGB(rgb,k){ return `rgb(${Math.round(rgb[0]*k)},${Math.round(rgb[1]*k)},${Math.round(rgb[2]*k)})`; }
function drawArrowShape(tip,tail,s,br){ const dx=tip.x-tail.x, dy=tip.y-tail.y, L=Math.hypot(dx,dy); const k=Math.max(.25,Math.min(1.1,br));
  const full=s*ARROW_L, fore=Math.min(1,L/Math.max(1,full)); const ux=L>.01?dx/L:0, uy=L>.01?dy/L:-1, nx=-uy, ny=ux;
  ctx.save(); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=1; ctx.lineCap="round"; // (drawFx blends additively — an arrow is solid)
  const sw=Math.max(1,s*.006); if(sw>=1.6){ ctx.strokeStyle=shadeRGB([14,11,13],1); ctx.lineWidth=sw+1; ctx.beginPath(); ctx.moveTo(tail.x,tail.y); ctx.lineTo(tip.x,tip.y); ctx.stroke(); }
  ctx.strokeStyle=shadeRGB([78,70,80],k); ctx.lineWidth=sw; ctx.beginPath(); ctx.moveTo(tail.x,tail.y); ctx.lineTo(tip.x,tip.y); ctx.stroke();
  // fletching: side-on it is two swept vanes along the last fifth; end-on it is a small three-pointed star
  const vl=L*.2, vw=Math.max(1.2,s*.011); ctx.fillStyle=shadeRGB([88,66,112],k);
  if(fore>.35){ for(const sg of [1,-1]){ ctx.beginPath(); ctx.moveTo(tail.x+ux*vl,tail.y+uy*vl); ctx.lineTo(tail.x+ux*vl*.15+nx*vw*sg,tail.y+uy*vl*.15+ny*vw*sg); ctx.lineTo(tail.x+nx*vw*sg*.8,tail.y+ny*vw*sg*.8); ctx.lineTo(tail.x+ux*vl*.3,tail.y+uy*vl*.3); ctx.fill(); } }
  else { ctx.strokeStyle=shadeRGB([88,66,112],k); ctx.lineWidth=Math.max(1,vw*.5); ctx.beginPath(); for(const a of [-Math.PI/2,Math.PI/6,Math.PI*5/6]){ ctx.moveTo(tail.x,tail.y); ctx.lineTo(tail.x+Math.cos(a)*vw*1.4,tail.y+Math.sin(a)*vw*1.4); } ctx.stroke(); }
  // barbed bronze head: the point, two barbs swept back, the notch between them on the shaft
  const hl=Math.max(2,s*.03*Math.max(.35,fore)), hw=Math.max(1.2,s*.011); const bx=tip.x-ux*hl, by=tip.y-uy*hl;
  ctx.fillStyle=shadeRGB([20,15,12],1); ctx.beginPath(); ctx.moveTo(tip.x+ux,tip.y+uy); ctx.lineTo(bx+nx*(hw+1)-ux,by+ny*(hw+1)-uy); ctx.lineTo(tip.x-ux*hl*.62,tip.y-uy*hl*.62); ctx.lineTo(bx-nx*(hw+1)-ux,by-ny*(hw+1)-uy); ctx.closePath(); ctx.fill();
  ctx.fillStyle=shadeRGB([201,165,90],k); ctx.beginPath(); ctx.moveTo(tip.x,tip.y); ctx.lineTo(bx+nx*hw,by+ny*hw); ctx.lineTo(tip.x-ux*hl*.62,tip.y-uy*hl*.62); ctx.lineTo(bx-nx*hw,by-ny*hw); ctx.closePath(); ctx.fill();
  ctx.fillStyle=shadeRGB([240,216,144],k); ctx.fillRect(Math.round(tip.x-ux*hl*.3),Math.round(tip.y-uy*hl*.3),1,1);
  ctx.restore(); }
function drawFx(f){ const pr=project(f.x,f.y,f.z??.5); if(!pr) return; const col=Math.max(0,Math.min(RW-1,Math.floor(pr.x))); if(pr.d>=zbuf[col]) return; const s=pr.s;
  ctx.globalCompositeOperation="lighter";
  if(f.kind==="proj"){ const r=Math.max(2,s*(f.style==="bolt"?.09:f.style==="beam"?.06:.04)); const g=ctx.createRadialGradient(pr.x,pr.y,0,pr.x,pr.y,r*3); g.addColorStop(0,f.color); g.addColorStop(.3,f.color+"99"); g.addColorStop(1,f.color+"00"); ctx.fillStyle=g; ctx.fillRect(pr.x-r*3,pr.y-r*3,r*6,r*6);
    if(f.style==="arrow"||f.style==="blade"){ ctx.globalCompositeOperation="source-over"; ctx.strokeStyle=f.color; ctx.lineWidth=Math.max(1,s*.015); ctx.beginPath(); ctx.moveTo(pr.x-r*2,pr.y+r); ctx.lineTo(pr.x+r*2,pr.y-r); ctx.stroke(); } }
  if(f.kind==="spore"){ const a=Math.max(0,Math.min(1,f.life/1.2))*(.7+.3*Math.sin(t*6+f.ph)); const r=Math.max(1,s*.022); const c=f.hue?"150,255,170":"215,140,255";
    const g=ctx.createRadialGradient(pr.x,pr.y,0,pr.x,pr.y,r*3); g.addColorStop(0,`rgba(${c},${a})`); g.addColorStop(.35,`rgba(${c},${a*.45})`); g.addColorStop(1,`rgba(${c},0)`); ctx.fillStyle=g; ctx.fillRect(pr.x-r*3,pr.y-r*3,r*6,r*6); }
  if(f.kind==="trapMark"){ const T=f.trap; const show=(T.revealed&&!T.disarmed&&T.kind!=="pit"&&!(T.kind==="net"&&T.spent))||(BLD.open&&!T.disarmed); if(!show) return;
    const cs=[[-.3,-.3],[.3,-.3],[.3,.3],[-.3,.3]].map(([a,b])=>project(T.x+a,T.y+b,.01)); if(cs.some(q=>!q)) return; ctx.save(); ctx.globalCompositeOperation="source-over";
    ctx.strokeStyle=BLD.open?"rgba(255,70,60,.95)":T.kind==="net"?"rgba(200,180,140,.8)":"rgba(201,165,90,.85)"; ctx.lineWidth=1; ctx.beginPath(); cs.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.closePath(); ctx.stroke();
    if(BLD.open){ ctx.fillStyle="rgba(255,70,60,.95)"; ctx.font="700 9px Cinzel, Georgia, serif"; ctx.textAlign="center"; const c0=project(T.x,T.y,.05); if(c0) ctx.fillText(T.kind.toUpperCase()+(T.hidden?" (hidden)":""),c0.x,c0.y); }
    ctx.restore(); return; }
  if(f.kind==="burst"){ const k=1-f.life/f.max; const r=s*(f.style==="toll"?.9:.6)*(.3+k); ctx.strokeStyle=f.color; ctx.globalAlpha=Math.max(0,1-k); ctx.lineWidth=Math.max(1,s*.03);
    ctx.beginPath(); ctx.arc(pr.x,pr.y,r,0,6.28); ctx.stroke(); if(f.style==="toll"){ ctx.beginPath(); ctx.arc(pr.x,pr.y,r*.6,0,6.28); ctx.stroke(); }
    if(f.style==="sparkle"||f.style==="burst"){ for(let i=0;i<10;i++){ const a=i*.63+k*2, rr=r*(.5+.5*((i*37)%10)/10); ctx.fillStyle=f.color; ctx.fillRect(pr.x+Math.cos(a)*rr,pr.y+Math.sin(a)*rr-k*s*.2,2,2); } } ctx.globalAlpha=1; }
  if(f.kind==="decoy"){ const a=.25+.15*Math.sin(t*4); ctx.fillStyle=`rgba(217,199,255,${a})`; ctx.beginPath(); ctx.arc(pr.x,pr.y+s*.4,s*.08,0,6.28); ctx.fill(); }
  ctx.globalCompositeOperation="source-over";
  if(f.kind==="puddle"){ drawPuddle(f); return; }
  if(f.kind==="trailFade"){ drawTrail3(f.trail,Math.max(0,f.life/f.max)); return; }
  if(f.kind==="arrowStuck"){ const q=stuckPos(f), D=f.dir; const tip=project(q.x,q.y,q.z), tail=project(q.x-D.x*ARROW_L,q.y-D.y*ARROW_L,q.z-D.z*ARROW_L); if(!tip||!tail) return;
    const ct=Math.max(0,Math.min(RW-1,Math.floor(tail.x))); if(tail.d>=zbuf[ct]+.05) return; const [lr,lg,lb]=light(q.x,q.y,tail.d); const br=Math.min(1,(lr+lg+lb)/3+.12);
    drawArrowShape(tip,tail,(tip.s+tail.s)/2,br); return; }
  if(f.kind==="arrow3d"){ drawTrail3(f.trail,1); const sp=Math.hypot(f.vx,f.vy,f.vz)||1, ux=f.vx/sp, uy=f.vy/sp, uz=f.vz/sp; const head=project(f.x,f.y,f.z), tail=project(f.x-ux*ARROW_L,f.y-uy*ARROW_L,f.z-uz*ARROW_L); if(!head||!tail||tail.d<.35) return;
    const c2=Math.max(0,Math.min(RW-1,Math.floor(head.x))); if(head.d>=zbuf[c2]+.1) return;
    { const gr=Math.max(9,head.s*.2); const G=ctx.createRadialGradient(head.x,head.y,0,head.x,head.y,gr); G.addColorStop(0,"rgba(255,236,190,.55)"); G.addColorStop(.35,"rgba(255,210,140,.2)"); G.addColorStop(1,"rgba(255,210,140,0)"); ctx.save(); ctx.globalCompositeOperation="lighter"; ctx.fillStyle=G; ctx.fillRect(head.x-gr,head.y-gr,gr*2,gr*2); ctx.restore(); }
    ctx.globalCompositeOperation="source-over"; drawArrowShape(head,tail,(head.s+tail.s)/2,1); return; }
  if(f.kind==="arrowGround"){ const h2=ARROW_L/2, a2=project(f.x-Math.cos(f.a)*h2,f.y-Math.sin(f.a)*h2,.015), b2=project(f.x+Math.cos(f.a)*h2,f.y+Math.sin(f.a)*h2,.015); if(a2&&b2){ const c2=Math.max(0,Math.min(RW-1,Math.floor(a2.x))); if(a2.d<zbuf[c2]){ const [lr,lg,lb]=light(f.x,f.y,a2.d); ctx.globalCompositeOperation="source-over"; drawArrowShape(b2,a2,(a2.s+b2.s)/2,Math.min(1,(lr+lg+lb)/3+.12)); } } return; }
  if(f.kind==="drop"){ const p2=project(f.x,f.y,f.z); if(p2){ const c2=Math.max(0,Math.min(RW-1,Math.floor(p2.x))); if(p2.d<zbuf[c2]){ const L=Math.max(2,p2.s*.05); ctx.fillStyle="rgba(200,235,255,.85)"; ctx.fillRect(Math.round(p2.x),Math.round(p2.y-L),1,Math.ceil(L)); } } return; }
  if(f.kind==="splash"){ const p2=project(f.x,f.y,0); if(p2){ const c2=Math.max(0,Math.min(RW-1,Math.floor(p2.x))); if(p2.d<zbuf[c2]){ const k=1-f.life/f.max, w=p2.s*.18*(.3+k); ctx.strokeStyle=`rgba(200,235,255,${(.7*(1-k)).toFixed(2)})`; ctx.lineWidth=1; ctx.beginPath(); ctx.ellipse(p2.x,p2.y,w,w*.3,0,0,6.28); ctx.stroke();
    for(let q=0;q<3;q++){ ctx.fillStyle=`rgba(200,235,255,${(.8*(1-k)).toFixed(2)})`; ctx.fillRect(Math.round(p2.x+(q-1)*w*.6),Math.round(p2.y-p2.s*.06*Math.sin(k*3.14)*(q===1?1.4:1)),1,1); } } } return; }
  if(f.kind==="dagger"){ const p2=project(f.x,f.y,.02); if(p2){ ctx.save(); ctx.translate(p2.x,p2.y); ctx.rotate(.4); const L=p2.s*.22; drawBlade(ctx,L,L*.09,"#c9ccd2"); ctx.restore(); ctx.fillStyle="rgba(255,230,160,.5)"; ctx.fillRect(p2.x-1,p2.y-p2.s*.05-2*Math.abs(Math.sin(t*3)),2,2); } } }
function spriteFrame(e){ const S=SPR[e.sprite]; if(!S) return null; const st=e.dead?"idle":e.state==="hurt"?"dodge":e.state; const anim=S[st]||S.walk||S.idle; const im=anim.im; if(!im||!im.width) return null;
  const cw=anim.cell, rows=Math.round(im.height/cw); let row=0; if(rows>=8){ const toP=Math.atan2(P.y-e.y,P.x-e.x); const rel=(e.heading??0)-toP; const k=((Math.round(rel/(Math.PI/4))%8)+8)%8; row=[0,7,6,5,4,3,2,1][k]; }
  const n=Math.max(1,Math.round(im.width/cw)); const f=e.dead?0:e.state==="attack"?Math.min(n-1,Math.floor((1-Math.max(0,e.atkT||0)/.55)*n)):Math.floor(e.ft*(anim.fps||8))%n;
  return {im,sx:f*cw,sy:row*cw,sw:cw,sh:cw}; }

// ---- THE BODY (Sam, 9/30: "replaced with the pixel art and animations we created already for each character … our hand
// becomes the cursor"). Over the shoulder: the character's own sprite seen from behind fills the bottom of the view in big
// chunky pixels and plays their real sheets — idle, walk, attack, cast, hurt, dead (Scott performs his spells). The
// mouse moves the hand: a pixel glove the character aims at; the body leans after it, and pushing it past the edge turns.
const BODY={};
function bodyState(){ if(P.dead) return {anim:"dead",once:true,k:Math.min(1,P.deadT/1.2)};
  if(P.hurtAnim>0) return {anim:"hurt",once:true,k:1-P.hurtAnim/.5};
  if(P.act){ const k=Math.min(1,P.act.t/P.act.dur); const ak=P.act.kind;
    if(ak==="forage") return {anim:BODY.forage?"forage":"eat",once:true,k}; // Sam 9/30: each character's own pick-up (PixelLab picking-up, back views)
    if(ak==="cast"||ak==="thrust") return {anim:"cast",once:true,k};
    return {anim:"attack",once:true,k}; }
  if(P.drawing) return {anim:"attack",once:true,k:.25+P.draw*.2};
  if(P.moving) return {anim:"walk"}; return {anim:"idle"}; }
const FW=320, FH=180; const FPB=document.createElement("canvas"); FPB.width=FW; FPB.height=FH; const fpg=FPB.getContext("2d");
function px1(x,y,c){ fpg.fillStyle=c; fpg.fillRect(Math.round(x),Math.round(y),1,1); }
function line1(x0,y0,x1,y1,w,c){ const n=Math.max(1,Math.ceil(Math.hypot(x1-x0,y1-y0))); fpg.fillStyle=c; for(let i=0;i<=n;i++){ const x=x0+(x1-x0)*i/n, y=y0+(y1-y0)*i/n; fpg.fillRect(Math.round(x-w/2),Math.round(y-w/2),w,w); } }
function quad1(x0,y0,cx,cy,x1,y1,w,c){ let px=x0, py=y0; for(let i=1;i<=40;i++){ const k=i/40, x=(1-k)*(1-k)*x0+2*(1-k)*k*cx+k*k*x1, y=(1-k)*(1-k)*y0+2*(1-k)*k*cy+k*k*y1; line1(px,py,x,y,w,c); px=x; py=y; } }
// ---- pixel hands, shaded like the sprites: each hand is a stack of rounded forms (palm, knuckles, fingers, thumb,
// sleeve), lit from the upper left, quantised to four skin tones, with a dark outline round the whole and along every
// seam between forms — the seams are what make the fingers read.
function shadeHand(w,h,parts,pal){ const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d"); const im=g.createImageData(w,h), D=im.data;
  const H=new Float32Array(w*h).fill(-1), ID=new Int16Array(w*h).fill(-1);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ for(let k=0;k<parts.length;k++){ const p=parts[k]; const dx=(x+.5-p.x)/p.rx, dy=(y+.5-p.y)/p.ry, d2=dx*dx+dy*dy; if(d2<1){ const z=p.z+Math.sqrt(1-d2)*(p.rz||Math.min(p.rx,p.ry)); if(z>H[y*w+x]){ H[y*w+x]=z; ID[y*w+x]=k; } } } }
  const L=[-.55,-.65,.52], ln=Math.hypot(...L); L[0]/=ln; L[1]/=ln; L[2]/=ln; const hex=(s)=>[parseInt(s.slice(1,3),16),parseInt(s.slice(3,5),16),parseInt(s.slice(5,7),16)];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=y*w+x; if(ID[i]<0) continue; const k=ID[i];
    const hx=(x+1<w&&ID[i+1]===k?H[i+1]:H[i])-(x>0&&ID[i-1]===k?H[i-1]:H[i]), hy=(y+1<h&&ID[i+w]===k?H[i+w]:H[i])-(y>0&&ID[i-w]===k?H[i-w]:H[i]);
    let n=[-hx,-hy,2]; const nl=Math.hypot(...n); n=n.map(v=>v/nl); const lam=n[0]*L[0]+n[1]*L[1]+n[2]*L[2]; const P2=pal[parts[k].pal||"skin"];
    const tone=lam>.78?0:lam>.55?1:lam>.3?2:3; let col=hex(P2[tone]);
    // seam: a neighbouring pixel belongs to another form that sits clearly in front → outline
    let seam=false; for(const j of [i-1,i+1,i-w,i+w]){ if(j<0||j>=w*h) continue; if(ID[j]>=0&&ID[j]!==k&&H[j]>H[i]+1.2) seam=true; }
    if(seam) col=hex(pal.line);
    D[i*4]=col[0]; D[i*4+1]=col[1]; D[i*4+2]=col[2]; D[i*4+3]=255; }
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){ const i=y*w+x; if(ID[i]>=0) continue; let edge=false; for(const [ax,ay] of [[1,0],[-1,0],[0,1],[0,-1]]){ const xx=x+ax, yy=y+ay; if(xx>=0&&yy>=0&&xx<w&&yy<h&&ID[yy*w+xx]>=0) edge=true; }
    if(edge){ const col=hex(pal.line); D[i*4]=col[0]; D[i*4+1]=col[1]; D[i*4+2]=col[2]; D[i*4+3]=255; } }
  g.putImageData(im,0,0); return c; }
function shade(hexc,f){ const r=parseInt(hexc.slice(1,3),16), g=parseInt(hexc.slice(3,5),16), b=parseInt(hexc.slice(5,7),16); const m=(v)=>Math.max(0,Math.min(255,Math.round(v*f))); return "#"+[m(r),m(g),m(b)].map(v=>v.toString(16).padStart(2,"0")).join(""); }
let HANDS=null;
function buildHands(){ const [sk]=PC.skin; const pal={skin:[shade(sk,1.12),sk,shade(sk,.8),shade(sk,.6)],nail:[shade(sk,1.25),shade(sk,1.1),shade(sk,.9),shade(sk,.7)],cloth:[shade(PC.sleeve,1.05),shade(PC.sleeve,.82),shade(PC.sleeve,.62),shade(PC.sleeve,.45)],line:"#1a110c"};
  // left hand round the grip, seen from above and behind: back of the hand, four knuckles, fingers curled down over the wood, thumb across
  const grip=[{x:20,y:21,rx:12,ry:9,z:2},
    ...[0,1,2,3].map(i=>({x:12+i*5.3,y:14.5-(i===1||i===2?1:0),rx:3.2,ry:3,z:5})),
    ...[0,1,2,3].map(i=>({x:12.5+i*5.3,y:26,rx:2.9,ry:4.6,z:7})),
    ...[0,1,2,3].map(i=>({x:12.5+i*5.3,y:30.5,rx:2.1,ry:1.3,z:9.5,pal:"nail"})),
    {x:33,y:21,rx:5.2,ry:3.4,z:6},{x:37,y:23,rx:3,ry:2.6,z:8}];
  // right hand on the string, close to you: back of the hand, three fingers hooked on the string, thumb along the side
  const pull=[{x:22,y:24,rx:13,ry:10,z:3},
    ...[0,1,2].map(i=>({x:14+i*6.8,y:13,rx:3.6,ry:4.2,z:7})),
    ...[0,1,2].map(i=>({x:14+i*6.8,y:9.5,rx:2.4,ry:1.6,z:10,pal:"nail"})),
    {x:8.5,y:24,rx:3.6,ry:6.5,z:6}];
  HANDS={grip:shadeHand(46,38,grip,pal),pull:shadeHand(44,40,pull,pal),pal}; }
// a sleeve: a shaded band from the screen edge to the wrist
function sleeve1(x0,y0,x1,y1,w,pal){ // a tapered rag sleeve from the screen edge to the wrist: wide at the elbow, frayed at the cuff
  const a=Math.atan2(y1-y0,x1-x0)+Math.PI/2, c=Math.cos(a), s=Math.sin(a), w0=w*1.25, w1=w*.42;
  const poly=(k0,k1,col)=>{ fpg.fillStyle=col; fpg.beginPath(); fpg.moveTo(x0+c*w0*k0,y0+s*w0*k0); fpg.lineTo(x1+c*w1*k0,y1+s*w1*k0); fpg.lineTo(x1+c*w1*k1,y1+s*w1*k1); fpg.lineTo(x0+c*w0*k1,y0+s*w0*k1); fpg.closePath(); fpg.fill(); };
  poly(-1.12,1.12,pal.line); poly(-1,1,pal.cloth[1]); poly(-1,-.35,pal.cloth[0]); poly(.45,1,pal.cloth[2]); poly(.8,1,pal.cloth[3]);
  for(const [k0,k1,t0] of [[-.55,-.25,.1],[.1,.3,.25],[.55,.35,.05],[-.2,.05,.45]]){ const xa=x0+c*w0*k0+(x1-x0)*t0, ya=y0+s*w0*k0+(y1-y0)*t0, xb=x1+c*w1*k1-(x1-x0)*.08, yb=y1+s*w1*k1-(y1-y0)*.08; line1(xa,ya,xb,yb,1,pal.cloth[3]); }
  for(let i=-3;i<=3;i++){ const k=i/3.2; px1(x1+c*w1*k+(x1-x0)*.02,y1+s*w1*k+(y1-y0)*.02+((i&1)?2:0),pal.cloth[2]); } }
// ---- the drawn bow, first person (Sam, 9/30, with a reference): the bow held out across the bottom of the view, the
// arrow up the middle at what you aim at, the string pulled back toward you. The body sprite steps aside while it's drawn.
// How it works (real archery + FPS games, Sam 9/30): the arrow is nocked square on the string and lies on the rest at the
// riser, so it always runs at right angles to the bow's crest. Drawing pulls the nock back toward you and the arrow slides
// back through the rest, so its point closes on the riser — at full draw the point sits just past the riser's front edge.
// In games the whole weapon is one rigid model that lags behind the mouse (translates and rolls a little) and springs
// back; the crosshair stays true. So the rig below is drawn in its own frame (origin = the arrow rest, crest along x,
// arrow along −y) and then moved as one piece.
function drawBowFP(){ const g=ctx; if(!HANDS) buildHands(); fpg.setTransform(1,0,0,1,0,0); fpg.clearRect(0,0,FW,FH); const O="#1a110c";
  const loosing=!P.drawing&&P.act&&P.act.kind==="loose"; const lk=loosing?Math.min(1,P.act.t/P.act.dur):0;
  const pull=P.drawing?P.draw:Math.max(0,.9*(1-lk*4));
  const bobY=(P.moving?Math.abs(Math.sin(P.bob*.5))*3:0)+(P.eye<.45?-6:0);
  // Sam, 9/30: a proficient archer's bow follows the cursor almost exactly; an unproficient one wanders (the SRD's
  // shortbow is a Simple weapon: rogues, clerics, bards are proficient; a sorcerer is not).
  const wob=PC.bowProf?.1:1, drift=PC.bowProf?0:Math.sin(t*1.3)*4+Math.sin(t*2.9)*2;
  const ox=FW/2+P.swayX*.35*wob+drift, oy=98+P.swayY*.35*wob+bobY+drift*.5, rot=(P.swayX*.005+drift*.004)*wob+(P.moving?Math.sin(P.bob*.5)*.012*wob:0);
  fpg.setTransform(Math.cos(rot),Math.sin(rot),-Math.sin(rot),Math.cos(rot),ox,oy);
  const DL=58, T=30-pull*5, bend=pull*12, Lx=-150+bend, Rx=150-bend; // tips bend in and forward as the limbs load
  const nx=0, ny=T+pull*DL+(loosing&&lk<.25?Math.sin(lk*60)*4:0), AL=DL+25+4; // full draw (T=25): the point sits at the riser's top edge
  line1(Lx,T,nx,ny,2,"#e9dfc6"); line1(Rx,T,nx,ny,2,"#e9dfc6");
  quad1(Lx,T,0,-24,Rx,T,9,O); quad1(Lx,T-1,0,-25,Rx,T-1,6,"#7a4d27"); quad1(Lx,T-3,0,-27,Rx,T-3,2,"#b07a44");
  line1(Lx-5,T+3,Lx,T,4,O); line1(Rx+5,T+3,Rx,T,4,O);
  if(!(loosing&&lk>.12)&&(P.arrows>0||P.drawing)){ // square to the string, straight through the rest
    const hy=ny-AL; line1(0,ny,0,hy,4,O); line1(0,ny,0,hy,2,"#c39a62");
    fpg.fillStyle=O; fpg.beginPath(); fpg.moveTo(-6,hy+1); fpg.lineTo(0,hy-11); fpg.lineTo(6,hy+1); fpg.fill(); fpg.fillStyle="#c9ccd2"; fpg.beginPath(); fpg.moveTo(-3,hy); fpg.lineTo(0,hy-8); fpg.lineTo(3,hy); fpg.fill(); px1(-1,hy-6,"#eef0f3");
    fpg.fillStyle="#a33030"; fpg.fillRect(-5,Math.round(ny)-14,2,10); fpg.fillRect(4,Math.round(ny)-14,2,10); }
  fpg.imageSmoothingEnabled=false; sleeve1(-78,110,-14,10,20,HANDS.pal); fpg.drawImage(HANDS.grip,-22,-4); // below the arrow rest, so the point and the crosshair stay clear
  sleeve1(70,ny+60,10,ny+20,22,HANDS.pal); fpg.drawImage(HANDS.pull,Math.round(nx-22),Math.round(ny-12));
  fpg.setTransform(1,0,0,1,0,0);
  const [lr,lg,lb]=light(P.x,P.y,.6); const br=Math.min(.92,(lr+lg+lb)/3*.8+.25);
  g.save(); g.imageSmoothingEnabled=false; if(P.hidden) g.globalAlpha=.55; g.filter=`brightness(${br.toFixed(2)})${P.hidden?" saturate(.5)":""}`; g.drawImage(FPB,0,0,FW,FH,0,0,RW,RH); g.restore(); }
// ---- the dagger (and the fist), first person, the DOOM way (Sam, 9/30): DOOM draws its weapons as 2-D sprites over
// the view and steps them through a short list of frames, each held a set number of tics (35 a second), with a bob while
// walking. Fighting games give the strike its snap: a few START-UP frames, one or two ACTIVE frames with a smear across the
// swing, then RECOVERY — and a HIT-STOP, the frame freezing for a beat when the blow lands. So: no tweening; the hand jumps
// from pose to pose. Frames: [ready, wind-up, smear, follow-through, recover, ready], tics [2,3,2,2,4,2].
const GRUNTS={fifi:[[0,.46],[2.35,3.08],[4.11,4.72],[6.19,6.72]]}; // Fifi's own voice (ElevenLabs), cut at the gaps
const TIC=1/35, SWIPE=[{t:2,x:236,y:150,a:-2.0,s:1},{t:3,x:262,y:118,a:-.85,s:1.06},{t:2,x:176,y:108,a:-2.95,s:1.14,smear:[-.35,-2.2]},{t:2,x:100,y:132,a:2.55,s:1.08,smear:[-1.4,-3.3]},{t:4,x:150,y:164,a:-2.4,s:1},{t:2,x:236,y:150,a:-2.0,s:1}];
const SWIPE_LEN=SWIPE.reduce((s,f)=>s+f.t,0)*TIC;
function swipeFrame(tm,list=SWIPE){ let acc=0; for(const f of list){ acc+=f.t*TIC; if(tm<acc) return f; } return list[list.length-1]; }
function smear1(a0,a1,fade){ // a pixel crescent behind the blade: three bands, bright to faint, thick in the middle of the sweep
  const cx=196, cy=178, R=112; for(let b=0;b<3;b++){ const col=b===0?`rgba(255,248,226,${.95*fade})`:b===1?`rgba(255,226,160,${.6*fade})`:`rgba(255,200,120,${.3*fade})`; fpg.fillStyle=col;
    for(let i=0;i<=60;i++){ const k=i/60, a=a0+(a1-a0)*k, w=Math.max(1,Math.round(Math.sin(k*Math.PI)*(9-b*2))); const r=R-b*7; fpg.fillRect(Math.round(cx+Math.cos(a)*r),Math.round(cy+Math.sin(a)*r),w,w); } } }
function drawDaggerFP(act){ const g=ctx; if(!HANDS) buildHands(); fpg.setTransform(1,0,0,1,0,0); fpg.clearRect(0,0,FW,FH);
  const f=swipeFrame(act.t,act.kind==="thrust2"?THRUST:SWIPE); const bob=P.moving?Math.abs(Math.sin(P.bob*.5))*3:0; const x=f.x+P.swayX*.3, y=f.y+P.swayY*.3+bob;
  if(f.smear) smear1(f.smear[0],f.smear[1],act.stopT>0?1:.85);
  if(f.lines){ fpg.fillStyle=`rgba(255,240,210,${.7*f.lines})`; for(let i=0;i<10;i++){ const a=i*.63+1.3, r0=70+(i%3)*12, r1=r0+22+(i%2)*12; for(let q=r0;q<r1;q+=2) fpg.fillRect(Math.round(FW/2+Math.cos(a)*q),Math.round(FH/2+Math.sin(a)*q),1,1); } }
  sleeve1(x+70,FH+30,x+10,y+14,22,HANDS.pal);
  fpg.imageSmoothingEnabled=false; fpg.save(); fpg.translate(x,y);
  if(act.hand==="dagger"&&SPR.dagger&&SPR.dagger.width){ // the blade out of the thumb side of the fist; icon grip at (31,17), blade points down-left (135°)
    fpg.save(); fpg.rotate(f.a-2.356); const k=1.55*f.s; fpg.drawImage(SPR.dagger,-31*k,-17*k,48*k,48*k); fpg.restore(); }
  const k=f.s*(act.hand==="fist"&&f.smear?1.3:1); fpg.rotate((f.a+Math.PI/2)*.25); fpg.drawImage(HANDS.grip,-23*k,-16*k,46*k,38*k); fpg.restore();
  const [lr,lg,lb]=light(P.x,P.y,.6); const br=Math.min(.92,(lr+lg+lb)/3*.8+.25);
  g.save(); g.imageSmoothingEnabled=false; if(P.hidden) g.globalAlpha=.55; g.filter=`brightness(${br.toFixed(2)})`; g.drawImage(FPB,0,0,FW,FH,0,0,RW,RH); g.restore(); }

// ---- FIRST-PERSON BOW RIG (Sam, 9/30: "Use this new bow rig.") -------------------------------------------------
// Ported from feat/bow-draw-rig — components/weapons/bow-draw.tsx, spec docs/design/claude_Bow_Draw_Rig.md.
// Two sprites (plate = arm, glove, stave; arrow alone) plus a string drawn in code, all in the plate's own pixel
// space; the constants below were measured off the art — do not tune them by eye. It is drawn on its own
// full-resolution canvas over the 640x360 view so the art stays crisp instead of being blown up into blocks.
// Draw order is load-bearing: plate, then string, then arrow (the nock covers the string's apex).
const RG={NOCK:{x:602.2274,y:615.9743},AX:{x:.6113,y:.7914},AN:{x:-.7914,y:.6113},T:3.15,LA:{x:1242.3,y:-43.4},LB:{x:-155.9,y:1397},SN:449,SR:80,SF:597};
// The plate point that sits under the crosshair: 26 px straight above the arrow's point at full draw (476,446), so the
// crosshair rides "just a few millimetres above the tip" (Sam, 9/30) at the bow's apex.
const RIG_PAD=700, RIG_AIM={x:476,y:420}, RIG_SCALE=.00103; // plate px per screen-height px: the forearm runs off the bottom edge
const HUD=document.getElementById("hud"), hg=HUD.getContext("2d"); let RIG=null, hudDirty=false;
Promise.all([loadImg(A.rig.plate),loadImg(A.rig.arrow),A.rig.dagger?loadImg(A.rig.dagger):null]).then(([pl,ar,dg])=>{ if(pl&&ar) RIG={plate:pl,arrow:ar,dagger:dg}; });

// ---- FIRST-PERSON DAGGER (Sam, 9/30: "replace the dagger animation like we did for the bow and arrow").
// Ported from feat/bow-draw-rig — lib/weapon-rig.ts (pure geometry) and the painted dagger, spec
// docs/design/claude_Melee_Attack_Rig.md. Path clips never rotate the hand (Sam: "don't rotate the hand/blade AT ALL");
// the slash slides the whole hand along a bowed arc, the thrust drives out along the blade's own axis (-75.4°).
// Numbers live in the rig's 900x520 stage; drawn on the full-resolution #hud like the bow, the arc trail goes into the
// 640x360 view as hard pixels (FX_PX = 1, alpha threshold 110, four-colour snap).
const MR={ELBOW:{x:620,y:600},FOREARM:240,REST:{dx:0,dy:0,a1:-28,a2:-20,sc:1},
  CLIPS:{slash_d:{cock:{dx:16,dy:-6,a1:22,a2:4,sc:.97},hit:{dx:-18,dy:10,a1:-78,a2:4,sc:1.05},path:{s:[770,470],e:[290,470],lift:150}},
         // Sam, 9/30: "the slash from medially go lateral" — a backhand. The hand cocks across the body to the left, then
         // sweeps out to the right along the same bowed arc. (slash_d above is the rig's own inward cut, kept as ported.)
         // Sam, 9/30 (later): "The blade moves left then swipes right currently. Lets have it start left then just slash
         // right." So `left`: no travel across from the middle — the hand rises into view already on the left, slashes
         // right, and drops away off the bottom on the right instead of sliding back to the middle.
         slash_out:{cock:{dx:16,dy:-6,a1:22,a2:4,sc:.97},hit:{dx:-18,dy:10,a1:-78,a2:4,sc:1.05},path:{s:[240,478],e:[790,452],lift:150},left:true},
         // Sam, 9/30: the thrust "should just go a little in front of the character and come from the center POV; similar to
         // what we had previously" — the old pixel thrust slid in toward the middle and shrank as the blade went away. So:
         // pull back toward the viewer (bigger), then a short drive in to just under the crosshair (smaller).
         thrust_c:{cock:{dx:0,dy:0,a1:0,a2:0,sc:1.05},hit:{dx:0,dy:0,a1:0,a2:0,sc:.8},path:{s:[528,436],e:[425,398],lift:6}},
         jab:{cock:{dx:-18,dy:13,a1:-38,a2:-28,sc:.97},hit:{dx:27,dy:-29,a1:-16,a2:-8,sc:1.15},path:{s:[484,475],e:[560,185],lift:14}},
         thrust:{cock:{dx:-30,dy:22,a1:-46,a2:-36,sc:.94},hit:{dx:42,dy:-46,a1:-12,a2:-6,sc:1.22},path:{s:[477,504],e:[575,127],lift:20}}},
  TIMING:{windup:220,strike:90,recover:300},WEIGHT:{light:.78,mid:1,heavy:1.36},
  BANDS:[{w:42,c:"#16243f"},{w:32,c:"#2f4f86"},{w:19,c:"#79b2e8"},{w:8,c:"#eef7ff"}],RGB:[[22,36,63],[47,79,134],[121,178,232],[238,247,255]],
  DAG:{grip:{x:145,y:413},tipOffset:[107,-412],scale:.62}};
MR.REST_ANGLE=(MR.REST.a1+MR.REST.a2-90)*Math.PI/180;
const mrTiming=(w)=>{ const m=MR.WEIGHT[w]||1; return {windup:MR.TIMING.windup*m,strike:MR.TIMING.strike,recover:MR.TIMING.recover*m}; };
const mrTotal=(w="light")=>{ const d=mrTiming(w); return (d.windup+d.strike+d.recover)/1000; };
const SLASH_SPEED=1.3; // Sam, 9/30: "swipe 30% faster" — the whole slash (rise, cut, drop) runs in 1/1.3 of the time; the hit and whoosh keep their place in it. The thrust is unchanged.
const mrHit=(w="light")=>{ const d=mrTiming(w); return (d.windup+d.strike)/1000; };
function mrWrist(p){ const r=(p.a1-90)*Math.PI/180; return [MR.ELBOW.x+p.dx+Math.cos(r)*MR.FOREARM, MR.ELBOW.y+p.dy+Math.sin(r)*MR.FOREARM]; }
const MR_REST_WRIST=mrWrist(MR.REST);
function mrLerp(a,b,p){ return {dx:a.dx+(b.dx-a.dx)*p,dy:a.dy+(b.dy-a.dy)*p,a1:a.a1+(b.a1-a.a1)*p,a2:a.a2+(b.a2-a.a2)*p,sc:a.sc+(b.sc-a.sc)*p}; }
function mrBez(P2,u){ const mx=(P2.s[0]+P2.e[0])/2, my=(P2.s[1]+P2.e[1])/2-2*P2.lift, v=1-u; return [v*v*P2.s[0]+2*v*u*mx+u*u*P2.e[0], v*v*P2.s[1]+2*v*u*my+u*u*P2.e[1]]; }
function rigAt(clip,t,w="light"){ const C=MR.CLIPS[clip]||MR.CLIPS.jab, d=mrTiming(w), T=d.windup+d.strike+d.recover; const ms=Math.max(0,Math.min(1,t))*T;
  const eOut=p=>1-(1-p)*(1-p), eIn=p=>Math.pow(p,1.7), eBack=(p,k)=>1+(k+1)*Math.pow(p-1,3)+k*Math.pow(p-1,2); let phase,u,pose;
  if(ms<d.windup){ phase="windup"; u=ms/d.windup; pose=mrLerp(MR.REST,C.cock,eOut(u)); }
  else if(ms-d.windup<d.strike){ phase="strike"; u=(ms-d.windup)/d.strike; pose=mrLerp(C.cock,C.hit,eIn(u)); }
  else { phase="recover"; u=(ms-d.windup-d.strike)/d.recover; const k=w==="heavy"?1.5:w==="mid"?1.05:.75; pose=mrLerp(C.hit,MR.REST,Math.min(1,eBack(u,k))); }
  const a=mrBez(C.path,0), b=mrBez(C.path,1); let pt;
  if(C.left){ // starts on the left, slashes right, and is gone — never crosses back
    if(phase==="windup"){ const q=eOut(Math.min(1,u*1.6)); pt=[a[0], a[1]+260*(1-q)]; } // straight up from below, already on the left
    else if(phase==="strike") pt=mrBez(C.path,eIn(u));
    else { const q=Math.min(1,u); pt=[b[0]+40*q, b[1]+330*q*q]; } } // follow through, then down out of the frame
  else if(phase==="windup"){ const q=eOut(u); pt=[MR_REST_WRIST[0]+(a[0]-MR_REST_WRIST[0])*q, MR_REST_WRIST[1]+(a[1]-MR_REST_WRIST[1])*q]; }
  else if(phase==="strike") pt=mrBez(C.path,eIn(u));
  else { const q=eOut(Math.min(1,u)); pt=[b[0]+(MR_REST_WRIST[0]-b[0])*q, b[1]+(MR_REST_WRIST[1]-b[1])*q]; }
  return {x:pt[0],y:pt[1],angle:MR.REST_ANGLE,scale:pose.sc,phase}; }
function arcAt(clip,t,tip,w="light",samples=40){ const d=mrTiming(w), T=d.windup+d.strike+d.recover, a=d.windup/T, b=(d.windup+d.strike)/T, tt=Math.max(0,Math.min(1,t)); if(tt<a) return null;
  let head,tail,alpha; if(tt<=b){ const p=(tt-a)/(b-a); head=p; tail=Math.max(0,p-.55); alpha=1; } else { const q=(tt-b)/(1-b); head=1; tail=Math.min(1,.45+q*.8); alpha=Math.max(0,1-q/.5); }
  if(alpha<=0||head-tail<.03) return null; const pts=[];
  for(let i=0;i<=samples;i++){ const u=tail+(head-tail)*(i/samples), r=rigAt(clip,a+(b-a)*u,w); pts.push([r.x+tip[0]*r.scale, r.y+tip[1]*r.scale]); }
  const kw=MR.WEIGHT[w]||1; return {alpha,bands:MR.BANDS.map(B=>({c:B.c,pts:mrRibbon(pts,B.w*kw)}))}; }
function mrRibbon(pts,maxW){ const L=[],R=[],n=pts.length; for(let i=0;i<n;i++){ const u=i/(n-1), w=maxW*Math.pow(Math.sin(Math.PI*u),.7), p0=pts[Math.max(0,i-1)], p1=pts[Math.min(n-1,i+1)];
  const dx=p1[0]-p0[0], dy=p1[1]-p0[1], m=Math.hypot(dx,dy)||1, nx=-dy/m*w/2, ny=dx/m*w/2; L.push([pts[i][0]+nx,pts[i][1]+ny]); R.push([pts[i][0]-nx,pts[i][1]-ny]); } return L.concat(R.reverse()); }
// which clip the current act plays: a quick click slashes, the held thrust drives out along the blade
function daggerClip(){ const a=P.act; if(!a||P.dead||a.hand!=="dagger") return null; if(a.kind==="swing") return "slash_out"; if(a.kind==="thrust2") return "thrust_c"; return null; }
// stage (900x520) -> a surface of height H: scaled to the view, smaller and lower than the sandbox (doc §4)
const MR_K=.58, MR_DROP=0; // MR_K: fraction of the sandbox scale; MR_DROP: stage units lower
function mrMap(x,y,W,H){ const k=H/520; return [W/2+(x-450)*k, H/2+(y-260+MR_DROP)*k]; }
// The strike's trail, the old pixel look (Sam, 9/30: "more like it looked before. Street Fighter type of arc"): a warm
// crescent stamped as square pixels on the 320x180 first-person canvas (so each is 2x2 in the view), three bands —
// cream on the outside edge, gold, then a faint orange inside — fat through the middle of the sweep, dotted at the ends.
// It follows the painted dagger's real tip path. The thrust gets the old speed lines toward the centre instead.
const SMEAR=[{c:[255,200,120],a:.3,off:14,w:5},{c:[255,226,160],a:.6,off:7,w:7},{c:[255,248,226],a:.95,off:0,w:9}];
function arcTrail(clip,t,tip,w="light",samples=90){ const d=mrTiming(w), T=d.windup+d.strike+d.recover, a=d.windup/T, b=(d.windup+d.strike)/T, tt=Math.max(0,Math.min(1,t)); if(tt<a) return null;
  let head,tail,alpha; if(tt<=b){ const p=(tt-a)/(b-a); head=p; tail=Math.max(0,p-.7); alpha=1; } else { const q=(tt-b)/(1-b); head=1; tail=Math.min(1,.3+q*.9); alpha=Math.max(0,1-q/.45); }
  if(alpha<=0||head-tail<.03) return null; const pts=[];
  for(let i=0;i<=samples;i++){ const u=tail+(head-tail)*(i/samples), r=rigAt(clip,a+(b-a)*u,w); pts.push([r.x+tip[0]*r.scale, r.y+tip[1]*r.scale]); }
  return {alpha,pts,strike:tt<=b}; }
// Sam, 9/30: "rotate the blade and hand drawing by 30 degrees and fix it there", then "rotate the blade and hand ... 60
// degrees counter clockwise now" — so the fixed tilt is 30° counter-clockwise of the rig's own pose (blade leaning left),
// held through every frame. Still never rotates mid-swing. (Canvas angles: negative = counter-clockwise.)
const MR_TILT=-30*Math.PI/180, MR_TC=Math.cos(MR_TILT), MR_TS=Math.sin(MR_TILT);
function drawDaggerArc(clip,t){ const t0=[MR.DAG.tipOffset[0]*MR.DAG.scale*MR_K, MR.DAG.tipOffset[1]*MR.DAG.scale*MR_K];
  const tip=[t0[0]*MR_TC-t0[1]*MR_TS, t0[0]*MR_TS+t0[1]*MR_TC]; // the trail follows the tilted tip
  const fade=(P.act&&P.act.stopT>0)?1:.85; fpg.setTransform(1,0,0,1,0,0); fpg.clearRect(0,0,FW,FH); const sx=P.swayX*.0175, sy=P.swayY*.0175;
  if(clip==="thrust_c"){ const d=mrTiming("light"), T=d.windup+d.strike+d.recover, a=d.windup/T, tt=Math.max(0,Math.min(1,t)); if(tt<a) return;
    const k=Math.max(0,1-(tt-a)/(1-a)/.6)*fade; if(k<=0) return; fpg.fillStyle=`rgba(255,240,210,${(.7*k).toFixed(2)})`; // old THRUST "lines"
    for(let i=0;i<10;i++){ const an=i*.63+1.3, r0=70+(i%3)*12, r1=r0+22+(i%2)*12; for(let q=r0;q<r1;q+=2) fpg.fillRect(Math.round(FW/2+Math.cos(an)*q+sx),Math.round(FH/2+Math.sin(an)*q+sy),1,1); } }
  else { const tr=arcTrail(clip,t,tip); if(!tr) return; const pts=tr.pts.map(([x,y])=>mrMap(x,y,FW,FH)), n=pts.length;
    for(const B of SMEAR){ fpg.fillStyle=`rgba(${B.c[0]},${B.c[1]},${B.c[2]},${(B.a*fade*tr.alpha).toFixed(3)})`;
      for(let i=0;i<n;i++){ const u=i/(n-1), p0=pts[Math.max(0,i-1)], p1=pts[Math.min(n-1,i+1)], tx=p1[0]-p0[0], ty=p1[1]-p0[1], m=Math.hypot(tx,ty)||1;
        let nx=-ty/m, ny=tx/m; if(ny>0||(ny===0&&nx<0)){ nx=-nx; ny=-ny; } // the outside of the bow (upward)
        const prof=Math.sin(Math.PI*Math.pow(u,.8)), wd=Math.max(1,Math.round(prof*B.w)), off=B.off*prof; // tapers to dots at both ends
        fpg.fillRect(Math.round(pts[i][0]-nx*off-wd/2+sx),Math.round(pts[i][1]-ny*off-wd/2+sy),wd,wd); } } }
  ctx.save(); ctx.imageSmoothingEnabled=false; ctx.globalCompositeOperation="source-over"; ctx.drawImage(FPB,0,0,FW,FH,0,0,RW,RH); ctx.restore(); }
function drawDaggerHUD(W,H,clip,t){ const r=rigAt(clip,t); const [X,Y]=mrMap(r.x,r.y,W,H); const s=MR.DAG.scale*MR_K*r.scale*(H/520);
  const sx=P.swayX*.35*.1*(W/RW), sy=P.swayY*.35*.1*(W/RW);
  const [lr,lg,lb]=light(P.x,P.y,.6); const br=Math.min(1,(lr+lg+lb)/3*.75+.32);
  hg.save(); hg.translate(X+sx,Y+sy); hg.rotate(r.angle-MR.REST_ANGLE+MR_TILT); hg.scale(s,s); hg.imageSmoothingEnabled=true; hg.imageSmoothingQuality="high";
  hg.globalAlpha=P.hidden?.55:1; hg.filter=`brightness(${br.toFixed(2)})${P.hidden?" saturate(.5)":""}`; hg.drawImage(RIG.dagger,-MR.DAG.grip.x,-MR.DAG.grip.y); hg.restore(); }
function drawRig(){ const dpr=Math.min(2,window.devicePixelRatio||1), W=Math.round(HUD.clientWidth*dpr), H=Math.round(HUD.clientHeight*dpr);
  if(HUD.width!==W||HUD.height!==H){ HUD.width=W; HUD.height=H; }
  const loosing=!P.drawing&&P.act&&P.act.kind==="loose"; const dclip=RIG&&RIG.dagger?daggerClip():null;
  if(dclip&&!paused){ hg.setTransform(1,0,0,1,0,0); hg.clearRect(0,0,W,H); hudDirty=true; const tt=P.act.t/P.act.dur; drawDaggerArc(dclip,tt); drawDaggerHUD(W,H,dclip,tt); return; }
  if(!RIG||P.dead||paused||!(P.drawing||loosing)){ if(hudDirty){ hg.setTransform(1,0,0,1,0,0); hg.clearRect(0,0,W,H); hudDirty=false; } return; }
  hudDirty=true; hg.setTransform(1,0,0,1,0,0); hg.clearRect(0,0,W,H);
  const lt=loosing?P.act.t:0;
  // loose: the string snaps home in ~90 ms and the arrow is gone on the same frame (spec §4)
  const pull=Math.max(0,Math.min(1,P.drawing?P.draw:(P.looseFrom||1)*(1-lt/.09)));
  const ease=pull*pull*(3-2*pull), S=RG.SR+ease*(RG.SF-RG.SR);
  const hum=loosing&&lt<.3?Math.sin(lt*70)*9*(1-lt/.3):0; // the string shivers after the release
  const nx=RG.NOCK.x+RG.AX.x*S+RG.AN.x*(RG.T+hum), ny=RG.NOCK.y+RG.AX.y*S+RG.AN.y*(RG.T+hum);
  const ox=RG.AX.x*(S-RG.SN), oy=RG.AX.y*(S-RG.SN);
  // Sam, 9/30: a proficient archer's bow follows the cursor almost exactly; an unproficient one wanders
  const wob=PC.bowProf?.1:1, drift=PC.bowProf?0:Math.sin(t*1.3)*4+Math.sin(t*2.9)*2, u=W/RW;
  const bobY=(P.moving?Math.abs(Math.sin(P.bob*.5))*3:0)+(P.eye<.45?-6:0);
  const rise=P.drawing?Math.min(1,P.draw*5):Math.min(1,Math.max(0,(P.act.dur-lt)/.15)); // comes up in ~0.1 s, drops away after the loose
  const sx=(P.swayX*.35*wob+drift)*u, sy=(P.swayY*.35*wob+bobY+drift*.5)*u+(1-rise)*(1-rise)*H*.35;
  const rot=(P.swayX*.005+drift*.004)*wob+(P.moving?Math.sin(P.bob*.5)*.012*wob:0), k=H*RIG_SCALE;
  const [lr,lg,lb]=light(P.x,P.y,.6); const br=Math.min(1,(lr+lg+lb)/3*.75+.32); // the lantern lights the arm, not daylight
  hg.save(); hg.translate(W/2+sx,H/2+sy); hg.rotate(rot); hg.scale(k,k); hg.translate(-RIG_AIM.x,-RIG_AIM.y);
  hg.imageSmoothingEnabled=true; hg.imageSmoothingQuality="high"; hg.globalAlpha=P.hidden?.55:1; hg.filter=`brightness(${br.toFixed(2)})${P.hidden?" saturate(.5)":""}`;
  hg.drawImage(RIG.plate,-RIG_PAD,0); // plate_ext: the source plate with the forearm continued 700 px down-left so it runs off the screen edge
  hg.lineCap="round"; hg.lineJoin="round"; hg.beginPath(); hg.moveTo(RG.LA.x,RG.LA.y); hg.lineTo(nx,ny); hg.lineTo(RG.LB.x,RG.LB.y);
  const a0=hg.globalAlpha; hg.globalAlpha=a0*.43; hg.strokeStyle="#1a1614"; hg.lineWidth=7; hg.stroke(); hg.globalAlpha=a0; hg.strokeStyle="#fcfcfd"; hg.lineWidth=5; hg.stroke();
  if(!loosing&&(P.arrows>0||!P.bowCard||!P.bowCard.ammo)) hg.drawImage(RIG.arrow,ox,oy);
  hg.restore(); }
const TOPS=new Map(); // first opaque row of a sheet cell, cached
function topRow(im,f,row,cell){ const key=im.src.length+":"+f+":"+row; if(TOPS.has(key)) return TOPS.get(key); let top=0; for(let y=0;y<cell;y++){ let hit=false; for(let x=0;x<cell;x+=2){ if(alphaAt(im,f*cell+x,row*cell+y)>60){ hit=true; break; } } if(hit){ top=y; break; } } TOPS.set(key,top); return top; }
function forageK(){ return P.act&&P.act.kind==="forage"?Math.sin(Math.PI*Math.min(1,P.act.t/P.act.dur)):0; } // 0→1→0 over the pick-up
function drawBody(){ const g=ctx; if(!P.dead&&(P.drawing||(P.act&&P.act.kind==="loose"))){ if(!RIG) drawBowFP(); return; } // the rig draws on #hud
  if(!P.dead&&P.act&&(P.act.kind==="swing"||P.act.kind==="punch"||P.act.kind==="thrust2")&&(P.act.hand==="dagger"||P.act.hand==="fist")){ if(!(P.act.hand==="dagger"&&RIG&&RIG.dagger)) drawDaggerFP(P.act); return; } const st=bodyState(); const A2=BODY[st.anim]||BODY.idle; if(!A2||!A2.im) return;
  const n=A2.n, f=st.once?Math.min(n-1,Math.floor(st.k*n)):Math.floor(t*A2.fps)%n;
  // facing: straight ahead, or turned toward the hand when it is far to one side
  const row=P.swayX<-20?0:P.swayX>20?2:1; // rows in the build: NE, N, NW
  const S=4, dw=A2.cell*S; const bob=P.moving?Math.abs(Math.sin(P.bob*.5))*4:Math.sin(t*1.6)*1.5;
  const crouch=(.5-P.eye)/.2; const x=Math.round(P.bodyX-dw/2), y=Math.round(RH*.40-10*S+bob+P.swayY+(P.dead?40:0)+crouch*46);
  const [lr,lg,lb]=light(P.x,P.y,.6); const br=Math.min(1.15,(lr+lg+lb)/3*.9+.25);
  g.save(); g.imageSmoothingEnabled=false; g.filter=`brightness(${br.toFixed(2)})${P.hurtAnim>0?" sepia(.6) saturate(3) hue-rotate(-30deg)":""}${P.hidden?" saturate(.3) brightness(1.25) hue-rotate(190deg)":""}`; if(P.hidden) g.globalAlpha=.55;
  // foraging (Sam, 9/30): the character's own pick-up. The figure drops in its cell as it crouches; lift it so the
  // reach to the floor stays in view instead of ducking out of the bottom of the screen.
  const lift=st.anim==="forage"?(topRow(A2.im,f,row,A2.cell)-topRow(A2.im,0,row,A2.cell))*S*.72:0;
  g.drawImage(A2.im,f*A2.cell,row*A2.cell,A2.cell,A2.cell,x,y-lift,dw,dw);
  // the pixel shortbow from the item art, held out in her left hand when the bow card is up
  const c=P.drawing?P.bowCard:curCard(); if(c&&c.kind==="bow"&&SPR.bow&&SPR.bow.width&&!P.dead){ const bs=4.2, bw=SPR.bow.width*bs; const bx=P.bodyX-24*S, by=y+50*S;
    g.translate(bx,by); g.rotate(-.78+(P.drawing?-.1:0)); g.drawImage(SPR.bow,-bw/2,-bw/2,bw,bw); g.setTransform(1,0,0,1,0,0);
}
  g.restore(); }
function drawSlash(g){ const s=P.slash; if(!s) return; const k=(t-s.t)/.22; if(k>1){ P.slash=null; return; }
  g.save(); g.globalCompositeOperation="lighter"; const r=s.r, a0=-2.4+k*.2, a1=a0+Math.min(1,k*1.6)*2.6;
  for(let i=0;i<3;i++){ g.strokeStyle=`rgba(255,${236-i*30},${190-i*40},${((1-k)*(.8-i*.22)).toFixed(2)})`; g.lineWidth=(4-i)*2; g.beginPath(); g.arc(s.x,s.y,r-i*5,a0,a1); g.stroke(); }
  g.restore(); }
// The crosshair (Sam, 9/30): fixed at the apex of the bow, a hair above the arrow point at full draw. It turns blood red
// over anything you could hit or use, and its arms open out in proportion to the zoom. With the bow up, a small ring
// shows where the arrow will really come down — gravity, speed and all — so you can see how much to hold over.
function drawCursor(g){ if(P.dead) return; const c=curCard(); const col=c&&c.color&&c.kind!=="bow"?c.color:null; const x=Math.round(P.hx), y=Math.round(P.hy);
  if(col){ const gr=g.createRadialGradient(x,y,0,x,y,26); gr.addColorStop(0,col+"cc"); gr.addColorStop(1,col+"00"); g.save(); g.globalCompositeOperation="lighter"; g.fillStyle=gr; g.fillRect(x-26,y-26,52,52); g.restore(); }
  const bow=(c&&c.kind==="bow")||P.drawing; const over=aimTarget(99,(e)=>e.foe||e.chest||(e.forage&&!e.spent));
  if(bow&&CAM){ const pred=predictArrow(P.drawing?P.bowCard:c); const pp=pred&&project(pred.x,pred.y,pred.z);
    if(pp&&Math.hypot(pp.x-x,pp.y-y)>3){ g.strokeStyle=pred.hit?"rgba(255,70,70,.9)":"rgba(236,226,204,.55)"; g.lineWidth=1; g.beginPath(); g.arc(pp.x,pp.y,3,0,6.28); g.stroke(); g.fillStyle=g.strokeStyle; g.fillRect(Math.round(pp.x),Math.round(pp.y),1,1); } }
  const gap=3+Math.round((P.zoom-1)*26), arm=5; const bars=[[-1,-gap-arm,2,arm],[-1,gap,2,arm],[-gap-arm,-1,arm,2],[gap,-1,arm,2]];
  if(over){ g.fillStyle="#1a0004"; for(const [a,b,w,h] of bars) g.fillRect(x+a-1,y+b-1,w+2,h+2); g.fillStyle="#c1001c"; } else g.fillStyle="rgba(236,226,204,.85)";
  for(const [a,b,w,h] of bars) g.fillRect(x+a,y+b,w,h);
  if(P.hold&&!P.hold.fired){ const k=Math.min(1,(performance.now()/1000-P.hold.t)/HOLD); g.strokeStyle="#e3b95c"; g.lineWidth=2; g.beginPath(); g.arc(x,y,gap+arm+4,-Math.PI/2,-Math.PI/2+k*6.28); g.stroke(); } }
function drawHUD(){ const g=ctx; g.textAlign="left";
  g.fillStyle="rgba(6,5,10,.72)"; g.fillRect(8,8,176,50); g.font="700 12px Cinzel, Georgia, serif"; g.fillStyle="#e3b95c"; g.fillText(PC.name.toUpperCase(),14,22); const nw=g.measureText(PC.name.toUpperCase()).width; g.font="600 10px Cinzel, Georgia, serif"; g.fillStyle="#9d9281"; g.fillText(`${PC.cls} · AC ${P.ac+(P.sof>0?2:0)}`,14+nw+8,22);
  g.fillStyle="rgba(0,0,0,.6)"; g.fillRect(14,28,164,11); g.fillStyle="#d8243a"; g.fillRect(14,28,164*P.hp/P.max,11); g.fillStyle="#ece2cc"; g.font="600 9px Cinzel, Georgia, serif"; g.fillText(`${P.hp}/${P.max} HP`,18,37);
  const conds=[P.fright>0&&"FRIGHTENED",P.restrained&&"RESTRAINED",P.hidden&&`HIDDEN ${P.hidden}`,P.crouch&&!P.hidden&&"CROUCHED",P.poison>0&&"POISONED",P.blur>0&&"SWIMMING SIGHT",P.reel>0&&"REELING",P.sporeGlow>0&&"SPORE-LIT",P.dodge>0&&"DODGE",P.dash>0&&"DASH",P.sanct>0&&"SANCTUARY",P.sof>0&&"SHIELD OF FAITH",P.guid>0&&"GUIDANCE",P.innate>0&&"INNATE SORCERY"].filter(Boolean);
  g.font="600 9px Cinzel, Georgia, serif"; g.fillStyle=P.fright>0?"#ff7a6a":"#bfe3a0"; g.fillText(conds.join(" · ")||(PC.spell?`1st-level slots ${"●".repeat(P.slots)}${"○".repeat(2-P.slots)}`:""),14,52);
  if(PC.spell&&conds.length){ }
  const dirs=["E","SE","S","SW","W","NW","N","NE"]; const ai=((Math.round(P.a/(Math.PI/4))%8)+8)%8; g.textAlign="center"; g.fillStyle="#e3b95c"; g.font="600 12px Cinzel, Georgia, serif"; g.fillText(dirs[ai],RW/2,18);
  g.fillStyle="rgba(236,226,204,.7)"; g.fillRect(RW/2-1,RH/2-1+Math.sin(P.bob)*3,2,2);
  const bagN=Object.keys(BAG).length; if(bagN){ g.textAlign="left"; g.font="600 9px Cinzel, Georgia, serif"; g.fillStyle="#b9a36a"; let y=72; g.fillText("PACK",14,y); for(const [s,n] of Object.entries(BAG)){ y+=11; g.fillStyle="#d8ccb0"; g.fillText(`${ITEMS[s]} ×${n}`,14,y); } }
  log.forEach((l,i)=>{ g.globalAlpha=Math.max(0,1-l.age/8); g.textAlign="left"; g.font="600 10px Cinzel, Georgia, serif"; const w=g.measureText(l.t).width; g.fillStyle="rgba(6,5,10,.55)"; g.fillRect(10,RH-78-i*13-9,w+8,12); g.fillStyle=l.c; g.fillText(l.t,14,RH-78-i*13); }); g.globalAlpha=1;
  if(showMap){ const s=5, ox=RW-MW*s-10, oy=10; g.globalAlpha=.82; for(let y=0;y<MH;y++) for(let x=0;x<MW;x++){ const c=MAP[y][x]; if(c==="#"||c==="C"){ g.fillStyle=c==="C"?"#3c5a9a":"#2a2433"; g.fillRect(ox+x*s,oy+y*s,s,s); } }
    for(const f of FX){ if(f.kind==="fog"){ g.fillStyle="rgba(220,226,240,.35)"; g.beginPath(); g.arc(ox+f.x*s,oy+f.y*s,f.r*s*f.grow,0,6.28); g.fill(); } if(f.kind==="dagger"){ g.fillStyle="#e3e3e3"; g.fillRect(ox+f.x*s-1,oy+f.y*s-1,2,2); } }
    for(const e of ENTS){ if(e.chest&&!e.opened&&(searchT>0||Math.hypot(e.x-P.x,e.y-P.y)<5)){ g.fillStyle="#e3b95c"; g.fillRect(ox+e.x*s-1.5,oy+e.y*s-1.5,3,3); } if(e.forage&&!e.spent&&Math.hypot(e.x-P.x,e.y-P.y)<6){ g.fillStyle="#b36bff"; g.fillRect(ox+e.x*s-1,oy+e.y*s-1,2,2); } }
    g.fillStyle="#e3b95c"; g.fillRect(ox+P.x*s-2,oy+P.y*s-2,4,4); g.strokeStyle="#e3b95c"; g.beginPath(); g.moveTo(ox+P.x*s,oy+P.y*s); g.lineTo(ox+(P.x+Math.cos(P.a)*2)*s,oy+(P.y+Math.sin(P.a)*2)*s); g.stroke();
    for(const e of ENTS){ if(e.dead||!e.foe||!(e.mode==="hunt"||searchT>0)) continue; g.fillStyle="#ff5a4a"; g.fillRect(ox+e.x*s-1.5,oy+e.y*s-1.5,3,3); } g.globalAlpha=1; } }

// ---- the hotbar (HTML, so the text stays crisp)
function renderBar(){ const bar=$("bar"); bar.innerHTML=CARDS.map((c,i)=>{ let sub=c.sub; if(c.key==="unarmed") sub=`+${PC.unarmed.hit} · ${PC.unarmed.flat}`;
    let off=false; if(c.slot&&P.slots<=0) off=true; if(c.uses&&(P.uses[c.key]??c.uses)<=0) off=true; if(c.hand==="dagger"&&c.kind!=="hide"&&!c.both&&!P.dagger) off=true;
    if(c.slot) sub=`${sub} · ${P.slots}/2`; if(c.ammo) { sub=`${P.arrows} arrows · 1d6+3`; if(P.arrows<=0) off=true; } if(c.uses) sub=`${sub.split(" · ")[0]} · ${P.uses[c.key]??c.uses} left`;
    if(PC.bare) sub=""; // Sam, 9/30: names only
    return `<button class="card ${i===P.sel?"on":""} ${off?"off":""}" data-i="${i}" title="${c.name}"><b>${i+1}</b><i>${c.icon}</i><span>${c.name}</span><small>${sub}</small><div class="cd"></div></button>`; }).join("")
    + Array.from({length:Math.max(0,(PC.slots||0)-CARDS.length)},(_,j)=>`<div class="card empty" aria-hidden="true"><b>${CARDS.length+j+1}</b></div>`).join(""); // open slots, kept for later
  bar.classList.toggle("bare",!!PC.bare); bar.style.gridTemplateColumns=`repeat(${Math.max(CARDS.length,PC.slots||0)},1fr)`;
  bar.querySelectorAll("button.card").forEach(b=>b.onclick=(ev)=>{ ev.stopPropagation(); pressCard(+b.dataset.i); cv.focus(); }); }
function updateBarCooldown(){ const bo=P.drawing||(P.act&&P.act.kind==="loose")?".18":"1"; if($("bar").style.opacity!==bo) $("bar").style.opacity=bo; const els=$("bar").querySelectorAll(".cd"); const k=P.cool>0?Math.min(1,P.cool/1.5):0; els.forEach(el=>el.style.height=`${k*100}%`); }
function prompt(){ let s=""; if(P.dead) s=""; else if(BLD.open) s="BUILDER — the ring on the floor is where things go";
  else if(P.restrained&&P.netted) s="E — get free of the net (Strength DC 10)"; else if(P.restrained) s="E — tear free of the web (Strength DC 12)";
  else if(P.inPit) s=P.climb>0?"Climbing out…":"E — climb out of the pit";
  else if(nearest(e=>e.lore&&!e.removed,1.4)) s=`E — read: ${nearest(e=>e.lore&&!e.removed,1.4).lore.title||"lore"}`;
  else if(trapNear()) s=`E — disarm the ${trapNear().name} (thieves' tools, DEX DC 15)`;
  else if(FX.some(f=>f.kind==="dagger"&&Math.hypot(f.x-P.x,f.y-P.y)<1.3)) s="E — pick up the dagger";
  else if(FX.some(f=>f.kind==="arrowGround"&&Math.hypot(f.x-P.x,f.y-P.y)<1.3)) s="E — pick up the arrow";
  else if(FX.some(f=>{ if(f.kind!=="arrowStuck"||(f.ent&&!f.ent.dead)) return false; const q=stuckPos(f); return Math.hypot(q.x-P.x,q.y-P.y)<1.3; })) s="E — pull the arrow free";
  else { const ch=nearest(e=>e.chest&&!e.opened); if(ch) s="E — open the chest"; else { const m=nearest(e=>e.forage&&!e.spent); if(m) s="E — forage (Survival DC 15)"; else if(!locked&&started) s="Click the view to look around with the mouse"; } }
  if($("prompt").textContent!==s) $("prompt").textContent=s; }

// =====================================================================================================================
// THE LOOP
// =====================================================================================================================
let last=performance.now(), stepAcc=0, dripT=2, ambT=40, heartT=0;
function frame(now){ const dt=Math.min(.05,(now-last)/1000); last=now; t+=dt;
  P.moving=false; if(P.dead) P.deadT+=dt;
  P.hx=RW/2; P.hy=RH/2; P.zoom+=((P.drawing?1+(.2+.05*Math.max(0,PC?PC.mods.dex:0))*Math.min(1,P.draw*1.6):1)-P.zoom)*Math.min(1,dt*8); /* Sam 9/30: drawing the bow zooms in ~20% on the crosshair */ P.eye+=(((P.hidden||P.crouch)&&!P.dead?.3:.5)-P.eye)*Math.min(1,dt*6); P.swayX*=Math.pow(.02,dt); P.swayY*=Math.pow(.02,dt); P.bodyX=RW*.3+P.swayX;
  if(started&&!P.dead&&!paused){ const turn=mouseTurn; mouseTurn=0; P.a+=turn;
    const f=((keys.has("w")||keys.has("arrowup"))?1:0)-((keys.has("s")||keys.has("arrowdown"))?1:0), s=((keys.has("d")||keys.has("arrowright"))?1:0)-((keys.has("a")||keys.has("arrowleft"))?1:0);
    const sp=2.6*(PC.speed||1)*dt*(P.dash>0?2:1)*(P.drawing?.5:1)*((P.hidden||P.crouch)?.55:1);
    if(P.reel>0) P.a+=Math.sin(t*1.1)*dt*.45; // reeling: the view drifts
    if((f||s)&&!P.restrained&&!P.inPit){ const n=Math.hypot(f,s); let mx=(Math.cos(P.a)*f-Math.sin(P.a)*s)/n*sp, my=(Math.sin(P.a)*f+Math.cos(P.a)*s)/n*sp;
      if(P.reel>0){ const v=Math.sin(t*1.7)*.7; mx+=-Math.sin(P.a)*v*sp; my+=Math.cos(P.a)*v*sp; } // …and the steps veer
      // frightened: can't move closer to what scared her while it's in sight
      if(frightDis()){ const src=P.frightSrc; const d0=Math.hypot(src.x-P.x,src.y-P.y), d1=Math.hypot(src.x-P.x-mx,src.y-P.y-my); if(d1<d0){ mx=0; my=0; } }
      tryMove(mx,my); P.moving=!P.air; if(!P.air){ P.bob+=dt*9; stepAcc+=dt*(P.dash>0?2:1); if(stepAcc>((P.hidden||P.crouch)?.6:.42)){ stepAcc=0; SND.step((P.hidden||P.crouch)?.35:1); } } } }
  if(P.drawing) P.draw=Math.min(1,P.draw+dt/.5); /* Sam 9/30: draw 20% faster (was .6 s to full draw) */ holdTick();
  jumpTick(dt);
  if(P.leap>0&&!P.dead){ const k=Math.min(P.leap,dt); tryMove(P.leapV.x*k,P.leapV.y*k); P.leap-=dt; if(P.leap<=0){ P.leap=0; SND.step(P.hidden?.6:1.6); P.shake=Math.max(P.shake,.08); } }
  if(P.lunge>0&&!P.dead){ const k=Math.min(P.lunge,dt); tryMove(Math.cos(P.a)*3.6*k,Math.sin(P.a)*3.6*k); P.lunge-=dt; P.bob+=dt*14; }
  if(P.act){ if(P.act.stopT>0) P.act.stopT-=dt; else P.act.t+=dt; if(P.act.t>=P.act.dur) P.act=null; }
  for(const k of ["hurtAnim","cool","hurt","dodge","dash","sanct","sof","guid","innate","sneakT","shake","leapCd","blur","reel","sporeGlow"]) P[k]=Math.max(0,P[k]-dt);
  if(P.poison>0){ P.poison-=dt; if(P.poison<=0){ P.poison=0; say(`${PC.name} is no longer poisoned.`,"#bfe3a0"); } }
  if(P.fright>0){ P.fright-=dt; heartT-=dt; if(heartT<=0){ heartT=.62; SND.heart(); } if(P.fright<=0){ P.fright=0; say(`${PC.name} is no longer frightened.`,"#bfe3a0"); } }
  searchT=Math.max(0,searchT-dt);
  for(const e of ENTS){ if(e.atkT>0) e.atkT-=dt; if(e.atkT<=0&&e.state==="attack") e.state="idle"; if(e.state==="hurt"&&!(e.stun>0)) e.state="idle"; }
  log.forEach(l=>l.age+=dt);
  if(paused){ /* the film is playing: the world waits */ }
  else if(started){ updateEnts(dt); updateFX(dt);
    updateSpores(dt); breathe(dt); trapsTick(dt); faunaTick(dt);
    dripT-=dt; if(dripT<=0){ dripT=.5+Math.random()*1.1; spawnDrip(); } updateDrops(dt);
    ambT-=dt; if(ambT<=0){ ambT=35+Math.random()*40; if(!ENTS.some(e=>!e.dead&&e.foe&&e.mode==="hunt")){ const a=Math.random()*6.28; playBuf(Math.random()<.5?"hook":"spider",{x:P.x+Math.cos(a)*14,y:P.y+Math.sin(a)*14,vol:.9,rate:.8}); } }
    // walking over the thrown dagger picks it up
    const ag=FX.find(f=>f.kind==="arrowGround"&&Math.hypot(f.x-P.x,f.y-P.y)<.5); if(ag){ FX.splice(FX.indexOf(ag),1); P.arrows++; say(`Arrow recovered — ${P.arrows} in the quiver.`,"#e3b95c"); renderBar(); }
    const dg=FX.find(f=>f.kind==="dagger"&&Math.hypot(f.x-P.x,f.y-P.y)<.5); if(dg){ FX.splice(FX.indexOf(dg),1); P.dagger=true; say("Dagger back in hand.","#e3b95c"); renderBar(); }
    prompt(); updateBarCooldown(); }
  { const bl=P.blur>0&&!reduce?Math.min(1,P.blur/4)*(1.1+.5*Math.sin(t*2.3)):0, want=bl?`blur(${bl.toFixed(2)}px) hue-rotate(${Math.round(Math.sin(t*.9)*25)}deg) saturate(1.3)`:(P.poison>0?"saturate(.85) sepia(.12) hue-rotate(40deg)":""); if(cv.style.filter!==want) cv.style.filter=want; }
  if(P.sporeGlow>0){ PLIGHT.x=P.x; PLIGHT.y=P.y; const k=Math.min(1,P.sporeGlow/3)*(.8+.2*Math.sin(t*3)); PLIGHT.r=.55*k; PLIGHT.g=.25*k; PLIGHT.b=.85*k; } else PLIGHT.r=PLIGHT.g=PLIGHT.b=0;
  const sh=P.shake>0&&!reduce?P.shake*6:0; cv.style.transform=sh?`translate(${(Math.random()-.5)*sh}px,${(Math.random()-.5)*sh}px)`:"";
  if(TEX.wall&&PC) render(); else if(TEX.wall){ PC=PCS.fifi; render(); PC=null; }
  requestAnimationFrame(frame); }
function tryMove(dx,dy){ const r=.22; if(!solid(P.x+dx+Math.sign(dx)*r,P.y)&&!blockedByEnt(P.x+dx,P.y)) P.x+=dx; if(!solid(P.x,P.y+dy+Math.sign(dy)*r)&&!blockedByEnt(P.x,P.y+dy)) P.y+=dy; }
function blockedByEnt(x,y){ for(const e of ENTS) if(!(e.dead&&!e.deco)&&e.solid&&Math.hypot(e.x-x,e.y-y)<(e.rad!=null?e.rad+.2:.5)) return true; return false; }

// =====================================================================================================================
// START
// =====================================================================================================================
async function loadBody(){ BODY.idle=null; for(const [an,a] of Object.entries(A.party[PC.sprite]||{})){ BODY[an]={im:await loadImg(a.src),cell:a.cell,n:a.n,fps:a.fps}; } }
function begin(key){ PC=PCS[key]; loadBody(); CARDS=PC.cards.map(k=>({...CARD[k],key:k})); P.hp=P.max=PC.hp; P.ac=PC.ac; P.power=KIT[PC.voice].uses; P.arrows=PC.arrows||0; P.sel=0; $("start").hidden=true; started=true; renderBar();
  audioInit(); cv.focus(); try{ const p=cv.requestPointerLock&&cv.requestPointerLock(); if(p&&p.catch) p.catch(()=>{}); }catch(e){}
  say(`${PC.name} starts rested: full hit points${PC.spell?", both spell slots":""}.`,"#9d9281");
  say(D.intro||`${D.name}.`,"#b9a36a"); if(D.__draft) say("(Builder draft from this browser — B → Reset to go back to the file.)","#8a8078"); }
$("picks").innerHTML=Object.entries(PCS).map(([k,p])=>`<button class="pick ${p.test?"test":""}" data-k="${k}"><b>${p.name.toUpperCase()}</b><small>${p.cls} · ${p.hp} HP · AC ${p.ac}</small><small>${p.note}</small></button>`).join("");
$("picks").querySelectorAll(".pick").forEach(b=>b.onclick=()=>begin(b.dataset.k));
$("again").onclick=()=>location.reload();
(async()=>{ const [w,c,f]=await Promise.all([loadImg(A.tex.wall),loadImg(A.tex.crystal),loadImg(A.tex.floor)]);
  TEX.wall=texFrom(w); TEX.crystal=c?texFrom(c):null; TEX.floor=texFrom(f); const cc=document.createElement("canvas"); cc.width=cc.height=128; const g=cc.getContext("2d"); g.filter="brightness(.45) saturate(.7)"; g.drawImage(w,0,0,128,128); TEX.ceil=texFrom(cc);
  for(const [k,s] of Object.entries(A.sprites)){ SPR[k]={}; for(const [st,a] of Object.entries(s)){ SPR[k][st]={im:await loadImg(a.src),cell:a.cell,fps:a.fps}; } }
  for(const [k,a] of Object.entries(A.props||{})) SPR["p_"+k]={idle:{im:await loadImg(a.src),cell:a.cell,fps:1}};
  for(let k=0;k<3;k++){ SPR["stalC"+k]={idle:{im:makeStal(11+k*7,true),cell:64,fps:1}}; SPR["stalF"+k]={idle:{im:makeStal(29+k*5,false),cell:64,fps:1}}; }
  for(const [k,src] of Object.entries(A.loreIcons||{})){ const im=await loadImg(src); if(im) SPR["lore_"+k]={idle:{im,cell:im.height,fps:1}}; }
  SPR.glove=await loadImg(A.glove); SPR.dagger=await loadImg(A.daggerIcon); SPR.bow=await loadImg(A.bowIcon);
  requestAnimationFrame(frame); })();
// =====================================================================================================================
// BUILDER (Sam, 9/30: "describe and you build, and the ability for me to add assets, chests, traps, lore").
// B opens it (DM link /cave?build, or any preview). Walk to a spot, pick what to add, press Place: it goes on the ring
// in front of you and into this dungeon's record at once. Every change is kept as a draft in this browser; Export saves
// the record as <id>.json — send it to Claude, who checks it in as public/cave-pov/dungeons/<id>.json for everyone.
// Chests take items from the real catalog only (live from Supabase in the app); lore text is yours, read back verbatim.
let CATALOG=null, SUPA=null;
addEventListener("message",e=>{ if(e.origin!==location.origin) return; const m=e.data; if(m&&m.aop==="config"&&m.url&&m.key){ SUPA=m; CATALOG=null; } });
async function loadCatalog(){ if(CATALOG) return CATALOG;
  if(SUPA){ try{ const r=await fetch(`${SUPA.url}/rest/v1/items?select=slug,name,item_type,rarity&order=name`,{headers:{apikey:SUPA.key,Authorization:`Bearer ${SUPA.key}`}}); if(r.ok){ CATALOG=await r.json(); for(const it of CATALOG) ITEMS[it.slug]=it.name; return CATALOG; } }catch(e){} }
  CATALOG=Object.entries(ITEMS).map(([slug,name])=>({slug,name,item_type:"",rarity:""})); return CATALOG; }
const B={tab:"chest",loot:[],last:[]};
function bTarget(){ let d=1.7; for(let k=.2;k<=1.7;k+=.05){ if(solid(P.x+Math.cos(P.a)*k,P.y+Math.sin(P.a)*k)){ d=k-.35; break; } } d=Math.max(.55,d); return {x:+(P.x+Math.cos(P.a)*d).toFixed(2),y:+(P.y+Math.sin(P.a)*d).toFixed(2)}; }
function bStatus(t){ $("bstat").textContent=t; }
function saveDraft(){ try{ const o={...D}; delete o.__draft; localStorage.setItem("aop_dungeon_draft_"+DID,JSON.stringify(o)); bStatus(`Draft saved in this browser · ${D.chests.length} chests · ${D.traps.length} traps · ${D.lore.length} lore · ${D.props.length} props · ${D.creatures.length} creatures`); }catch(e){ bStatus("This browser won't keep a draft — Export to keep your work."); } }
function toggleBuilder(){ if(!BLD.enabled) return; BLD.open=!BLD.open; $("build").hidden=!BLD.open; if(BLD.open){ if(document.pointerLockElement) document.exitPointerLock(); keys.clear(); P.drawing=false; $("bname").value=D.name||""; bTab(B.tab); saveDraft(); } else cv.focus(); }
const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
function bTab(tab){ B.tab=tab; document.querySelectorAll("#btabs button").forEach(b=>b.classList.toggle("on",b.dataset.t===tab)); const F=$("bform");
  if(tab==="chest"){ F.innerHTML=`<label>Find an item <input id="bq" placeholder="type to search the catalog"></label><div id="bres" class="blist"></div><div class="bh">In the chest</div><div id="bloot" class="blist"></div>`;
    const draw=()=>{ $("bloot").innerHTML=B.loot.length?B.loot.map((l,i)=>`<div class="brow"><span>${esc(ITEMS[l[0]]||l[0])}</span><input data-i="${i}" value="${esc(l[1])}" title="number, or dice like 2d6" size="4"><button data-x="${i}" aria-label="remove">✕</button></div>`).join(""):`<div class="bnote">Empty — search above and click to add.</div>`;
      $("bloot").querySelectorAll("input").forEach(inp=>inp.oninput=()=>{ const v=inp.value.trim(); B.loot[+inp.dataset.i][1]=/^\d+d\d+$/.test(v)?v:Math.max(1,parseInt(v)||1); });
      $("bloot").querySelectorAll("button").forEach(b=>b.onclick=()=>{ B.loot.splice(+b.dataset.x,1); draw(); }); };
    const search=async()=>{ const cat=await loadCatalog(), q=$("bq").value.toLowerCase().trim(); const hits=cat.filter(it=>!q||it.name.toLowerCase().includes(q)||it.slug.includes(q)).slice(0,40);
      $("bres").innerHTML=hits.map(it=>`<button class="bitem" data-s="${esc(it.slug)}">${esc(it.name)}<small>${esc(it.item_type||"")}${it.rarity&&it.rarity!=="common"?" · "+esc(it.rarity):""}</small></button>`).join("")||`<div class="bnote">No match in the catalog.</div>`;
      $("bres").querySelectorAll("button").forEach(b=>b.onclick=()=>{ B.loot.push([b.dataset.s,1]); draw(); }); };
    $("bq").oninput=search; search(); draw(); }
  else if(tab==="trap") F.innerHTML=`<label>Trap <select id="btk"><option value="pit">Hidden pit — fall 10 ft, 1d6 (spot DC 15)</option><option value="darts">Poison darts — pressure plate (spot DC 15)</option><option value="net">Falling net — trip wire (spot DC 10)</option><option value="violet">Violet fungus — spores (CON DC 12)</option></select></label><label class="bchk"><input type="checkbox" id="bth" checked> Hidden until spotted</label><div class="bnote">Traps fill the square under the ring.</div>`;
  else if(tab==="lore") F.innerHTML=`<label>Kind <select id="blk"><option value="journal">Journal on the floor</option><option value="note">Loose page</option><option value="book">Book</option><option value="carving">Carving on a standing stone</option></select></label><label>Title <input id="blt" placeholder="e.g. The Zhent's last entry"></label><label>Text <textarea id="blx" rows="7" placeholder="Exactly what the players read."></textarea></label>`;
  else if(tab==="prop") F.innerHTML=`<label>Piece <select id="bpk">${Object.keys(A.props).map(k=>`<option value="${k}">${k.replace(/-/g," ")}</option>`).join("")}</select></label><div class="bnote">Big crystals, big mushrooms, stalagmites and boulders are solid.</div>`;
  else if(tab==="creature") F.innerHTML=`<label>Creature <select id="bck">${Object.entries(A.creatures).map(([k,c])=>`<option value="${k}">${esc(c.name)} — AC ${c.ac}, ${c.hp} HP</option>`).join("")}</select></label><div class="bnote">Only creatures with cave art can go in for now. It faces you; it wakes when the builder closes.</div>`;
  else if(tab==="forage") F.innerHTML=`<div class="bnote">A bluecap patch to forage (Survival DC 15).</div>`;
  else if(tab==="light") F.innerHTML=`<div class="bnote">A glowing crystal cluster that lights the rock around it. Fills the square under the ring.</div>`;
  else if(tab==="erase") F.innerHTML=`<div class="bnote">Removes the placed thing nearest the ring (chests, traps, lore, props, creatures, lights). The random cave dressing stays.</div>`;
  $("bplace").textContent=tab==="erase"?"Erase at the ring":"Place at the ring"; }
function bPlace(){ const p=bTarget(), tab=B.tab;
  if(tab==="chest"){ if(!B.loot.length){ bStatus("Add at least one item to the chest first."); return; } const o={x:p.x,y:p.y,loot:B.loot.map(l=>[l[0],l[1]])}; D.chests.push(o); addEnt(entFor("chest",o)); B.loot=[]; bTab("chest"); }
  else if(tab==="trap"){ const k=$("btk").value, cx=Math.floor(p.x), cy=Math.floor(p.y); if(solid(cx+.5,cy+.5)){ bStatus("That square is rock."); return; }
    if(k==="violet"){ const o={kind:"violet",x:p.x,y:p.y}; D.hazards.push(o); makeViolet(o.x,o.y,o); } else { const o={kind:k,x:cx+.5,y:cy+.5,hidden:$("bth").checked}; D.traps.push(o); makeTrap(o); } }
  else if(tab==="lore"){ const o={kind:$("blk").value,x:p.x,y:p.y,title:$("blt").value.trim()||"Untitled",text:$("blx").value}; if(!o.text.trim()){ bStatus("Write what the players will read first."); return; } D.lore.push(o); makeLore(o); }
  else if(tab==="prop"){ const o={kind:$("bpk").value,x:p.x,y:p.y}; D.props.push(o); makeProp(o); }
  else if(tab==="creature"){ const o={kind:$("bck").value,x:p.x,y:p.y,heading:+(Math.atan2(P.y-p.y,P.x-p.x)).toFixed(2)}; D.creatures.push(o); const e=entFor("creature",o); if(e) addEnt(e); }
  else if(tab==="forage"){ const o={x:p.x,y:p.y}; D.forage.push(o); addEnt(entFor("forage",o)); }
  else if(tab==="light"){ const cx=Math.floor(p.x), cy=Math.floor(p.y); if(MAP[cy][cx]!=="."){ bStatus("Put a light on open floor."); return; } MAP[cy][cx]="*"; D.map[cy]=MAP[cy].join(""); LIGHTS.push({x:cx+.5,y:cy+.5,r:.35,g:.62,b:1.25,rad:3.4,cell:true}); addEnt(entFor("crystal",{x:cx+.5,y:cy+.5,cell:true})); }
  else if(tab==="erase"){ bErase(p); return; }
  SND.chime([660,990]); saveDraft(); }
function bErase(p){ let best=null, bd=1.3;
  for(const e of ENTS){ if(e.removed||!e.src) continue; const dd=Math.hypot(e.x-p.x,e.y-p.y); if(dd<bd){ bd=dd; best={e}; } }
  for(const T of TRAPS){ const dd=Math.hypot(T.x-p.x,T.y-p.y); if(dd<bd){ bd=dd; best={T}; } }
  if(!best){ bStatus("Nothing placed near the ring."); return; }
  const src=best.e?best.e.src:best.T.src; for(const k of ["creatures","chests","forage","props","traps","lore","hazards"]){ const i=D[k].indexOf(src); if(i>=0) D[k].splice(i,1); }
  for(let i=LIGHTS.length-1;i>=0;i--) if(LIGHTS[i].src===src) LIGHTS.splice(i,1);
  if(best.e){ const e=best.e; e.removed=true; e.dead=true; e.solid=false; if(e.spore){ SPORES.splice(SPORES.indexOf(e),1); } if(src.cell){ const cx=Math.floor(e.x), cy=Math.floor(e.y); MAP[cy][cx]="."; D.map[cy]=MAP[cy].join(""); for(let i=LIGHTS.length-1;i>=0;i--) if(LIGHTS[i].cell&&Math.floor(LIGHTS[i].x)===cx&&Math.floor(LIGHTS[i].y)===cy) LIGHTS.splice(i,1); } }
  else { const T=best.T; TRAPS.splice(TRAPS.indexOf(T),1); PITV[T.cy*MW+T.cx]=0; const fi=FX.findIndex(f=>f.kind==="trapMark"&&f.trap===T); if(fi>=0) FX.splice(fi,1); }
  noise(.15,{type:"lowpass",f0:500,vol:.3}); saveDraft(); }
/* In the claude.ai preview a plain download link does nothing; the viewer's `downloads` capability saves the file
   (with a confirmation). In the app window.claude is absent and the plain link runs. */
let DLS=null; try{ if(window.claude&&window.claude.use) window.claude.use("downloads").then(d=>{ DLS=d; }).catch(()=>{}); }catch(e){}
function bExport(){ D.name=$("bname").value.trim()||D.name; const o={...D}; delete o.__draft; const txt=JSON.stringify(o,null,1);
  if(DLS){ try{ navigator.clipboard&&navigator.clipboard.writeText(txt); }catch(e){} saveDraft();
    DLS.save({filename:`${D.id||DID}.json`,data:txt}).then(()=>bStatus(`Exported ${D.id||DID}.json. Send it to Claude to make it the dungeon everyone gets.`),
      e=>bStatus(e&&e.code==="declined"?"Export cancelled. The draft is still saved in this browser.":"Couldn't save the file here; it was copied to the clipboard instead."));
    return; }
  try{ const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([txt],{type:"application/json"})); a.download=`${D.id||DID}.json`; document.body.appendChild(a); a.click(); a.remove(); }catch(e){}
  try{ navigator.clipboard&&navigator.clipboard.writeText(txt); }catch(e){}
  saveDraft(); bStatus(`Exported ${D.id||DID}.json (also copied). Send it to Claude to make it the dungeon everyone gets.`); }
function bReset(){ try{ localStorage.removeItem("aop_dungeon_draft_"+DID); }catch(e){} location.reload(); }
function drawBuildRing(){ if(!BLD.open) return; const p=bTarget(); ctx.save(); ctx.globalCompositeOperation="source-over";
  if(B.tab==="trap"||B.tab==="light"){ const cx=Math.floor(p.x), cy=Math.floor(p.y); const cs=[[0,0],[1,0],[1,1],[0,1]].map(([a,b])=>project(cx+a,cy+b,.01)); if(!cs.some(q=>!q)){ ctx.strokeStyle="rgba(255,90,70,.95)"; ctx.setLineDash([3,2]); ctx.beginPath(); cs.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)); ctx.closePath(); ctx.stroke(); } }
  ctx.setLineDash([]); ctx.strokeStyle=B.tab==="erase"?"rgba(255,80,70,.95)":"rgba(227,185,92,.95)"; ctx.beginPath(); let first=true;
  for(let i=0;i<=24;i++){ const a=i/24*6.283, q=project(p.x+Math.cos(a)*.3,p.y+Math.sin(a)*.3,.01); if(!q){ first=true; continue; } if(first){ ctx.moveTo(q.x,q.y); first=false; } else ctx.lineTo(q.x,q.y); } ctx.stroke(); ctx.restore(); }
$("lorec").onclick=closeLore;
if(BLD.enabled){ $("bhint").hidden=false; document.querySelectorAll("#btabs button").forEach(b=>b.onclick=()=>bTab(b.dataset.t)); $("bplace").onclick=bPlace; $("bexport").onclick=bExport; $("breset").onclick=bReset; $("bclose").onclick=toggleBuilder;
  $("bname").oninput=()=>{ D.name=$("bname").value; saveDraft(); }; }
window.__pov={BATS,SPIDS,MOTHS,faunaNoise,BLD,D,bPlace,bTab,bErase,TRAPS,makeTrap,makeLore,readLore,closeLore,solid,clearLine,propHit,landArrow,jump,SPORES,sporeBurst,sporeSave,toggleCrouch,sneakPower,perceives,P,ENTS,FX,CARDS:()=>CARDS,begin,useCard,interact,holdStart,holdEnd,rangedStart,loose,BAG,log:()=>log,AC:()=>AC,BUF};
