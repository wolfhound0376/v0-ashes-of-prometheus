// The camp field game (Forage / Hunt), from the Camp at the Fire page, lines 1923-2992 verbatim but for the marked
// edits in build.py; then the painted-scene world layer (painted.js) in place of the tile map.
window.AOPField=function(host){
// ---- What the camp page provides around the field game. The lines marked "camp" are copied from the Camp at the Fire
// page (BIOMES, dirFrom, the mock PACK, sheetOf, Fifi's PARTY row); the rest is this page's plumbing.
const $=(id)=>document.getElementById(id);
const rng=Math.random;
let ME=0, supplies=20; const budget=[2]; const PACKS={}; const CATALOG={}; const C=window.Camp; let dmView=false;
const BIOMES={tunnels:{name:"Drow tunnels below Velkynvelve",grade:null},fungal:{name:"Fungal grove",grade:"rgba(120,40,170,.18)"},shore:{name:"Darklake shore",grade:"rgba(30,90,150,.2)"}};
const dirFrom=(dx,dy)=>((Math.round((Math.PI/2-Math.atan2(dy,dx))/(Math.PI/4))%8)+8)%8;
const PACK={"waterorb":2,"ormu-moss":3,"nightlight-fungus":1,"fire-lichen":2,"lamp-oil":1,"spider-venom-gland":1,"ripplebark":0,"gray-ooze-residue":0};
const sheetOf=(p)=>({id:p.slug,name:p.name,level:p.level,str_score:10,dex_score:10,con_score:p.con,int_score:10,wis_score:p.wis,cha_score:10,sheet_skill_proficiencies:p.skills});
const PARTY=[{slug:"freia",   name:"Fifi",     cls:"Rogue 1",    hp:8, hpMax:8,  con:10, level:1, xp:0,  hd:"1d8", hdLeft:1, wis:12, skills:{stealth:"expertise"}, pc:true}];
let biome="tunnels";   // set from the scene when an outing starts
// as the camp builds them (figures = PARTY.map(p=>({...p,i,img,...}))), for the one character here
const figures=PARTY.map((p,i)=>({...p,i,img:host.heroImg}));
const me=()=>figures[ME];
function speak(html){ host.speak(html); }
function flash(text,hostile){ host.flash(text,hostile); }
function playFilm(k,cb){ if(cb) cb(); }   // the camp's films are not carried over; the game goes straight on
function refresh(){}
// depth: a painted scene shrinks what stands toward the back (the camp's sizes are for its flat map)
let __ZS=null; const __zs=(y)=>__ZS!=null?__ZS:host.zs(y);

const FROWS=[{"table_key":"underdark_ambush","roll_min":1,"roll_max":2,"result":"1 chuul lurking in a pool of water","detail":{"count":1,"bestiary":"Chuul"}},{"table_key":"underdark_ambush","roll_min":3,"roll_max":3,"result":"1d6 giant spiders clinging to walls or ceiling","detail":{"count":"1d6","bestiary":"Giant Spider"}},{"table_key":"underdark_ambush","roll_min":4,"roll_max":5,"result":"1 grell floating near the high ceiling","detail":{"count":1,"bestiary":"Grell"}},{"table_key":"underdark_ambush","roll_min":6,"roll_max":9,"result":"1d4 gricks hiding in a crevice","detail":{"count":"1d4","bestiary":"Grick"}},{"table_key":"underdark_ambush","roll_min":10,"roll_max":15,"result":"1d4 orogs perching on ledges","detail":{"count":"1d4","bestiary":"Orog"}},{"table_key":"underdark_ambush","roll_min":16,"roll_max":17,"result":"1d6 piercers masquerading as stalactites","detail":{"count":"1d6","bestiary":"Piercer"}},{"table_key":"underdark_ambush","roll_min":18,"roll_max":20,"result":"1 umber hulk bursting out of a nearby wall","detail":{"count":1,"bestiary":"Umber Hulk"}},{"table_key":"underdark_creature","roll_min":1,"roll_max":2,"result":"Ambushers","detail":{"note":"reroll this result if the characters are resting","rolls":["underdark_ambush"]}},{"table_key":"underdark_creature","roll_min":3,"roll_max":3,"result":"Carrion crawler","detail":{"bestiary":"Carrion Crawler"}},{"table_key":"underdark_creature","roll_min":4,"roll_max":5,"result":"Escaped slaves","detail":{}},{"table_key":"underdark_creature","roll_min":6,"roll_max":7,"result":"Fungi","detail":{}},{"table_key":"underdark_creature","roll_min":8,"roll_max":9,"result":"Giant fire beetles","detail":{"bestiary":"Giant Fire Beetle"}},{"table_key":"underdark_creature","roll_min":10,"roll_max":11,"result":"Giant \"rocktopus\"","detail":{}},{"table_key":"underdark_creature","roll_min":12,"roll_max":12,"result":"Mad creature","detail":{}},{"table_key":"underdark_creature","roll_min":13,"roll_max":13,"result":"Ochre jelly","detail":{"bestiary":"Ochre Jelly"}},{"table_key":"underdark_creature","roll_min":14,"roll_max":15,"result":"Raiders","detail":{}},{"table_key":"underdark_creature","roll_min":16,"roll_max":16,"result":"Scouts","detail":{}},{"table_key":"underdark_creature","roll_min":17,"roll_max":17,"result":"Society of Brilliance","detail":{}},{"table_key":"underdark_creature","roll_min":18,"roll_max":18,"result":"Spore servants","detail":{}},{"table_key":"underdark_creature","roll_min":19,"roll_max":20,"result":"Traders","detail":{}},{"table_key":"underdark_discovery","roll_min":1,"roll_max":10,"result":"Nothing","detail":{}},{"table_key":"underdark_discovery","roll_min":11,"roll_max":12,"result":"A corpse clutching a salvageable nonmagical weapon","detail":{}},{"table_key":"underdark_discovery","roll_min":13,"roll_max":14,"result":"A corpse wearing a salvageable suit of nonmagical armour","detail":{}},{"table_key":"underdark_discovery","roll_min":15,"roll_max":17,"result":"1d6 gems worth 50 gp each","detail":{"count":"1d6","value_gp":50}},{"table_key":"underdark_discovery","roll_min":18,"roll_max":19,"result":"A corpse carrying a random magic item (DMG Table B)","detail":{"dmg_table":"B"}},{"table_key":"underdark_discovery","roll_min":20,"roll_max":20,"result":"A hoard: 2d6 50 gp gems and 1d4 rolls on DMG Table C","detail":{"dmg_table":"C"}},{"table_key":"underdark_random","roll_min":1,"roll_max":13,"result":"No encounter","detail":{"rolls":[]}},{"table_key":"underdark_random","roll_min":14,"roll_max":15,"result":"Terrain","detail":{"rolls":["underdark_terrain"]}},{"table_key":"underdark_random","roll_min":16,"roll_max":17,"result":"One or more creatures","detail":{"rolls":["underdark_creature"]}},{"table_key":"underdark_random","roll_min":18,"roll_max":20,"result":"Terrain featuring one or more creatures","detail":{"rolls":["underdark_terrain","underdark_creature"]}},{"table_key":"underdark_terrain","roll_min":1,"roll_max":1,"result":"Boneyard","detail":{}},{"table_key":"underdark_terrain","roll_min":2,"roll_max":2,"result":"Cliff and ladder","detail":{}},{"table_key":"underdark_terrain","roll_min":3,"roll_max":3,"result":"Crystal clusters","detail":{}},{"table_key":"underdark_terrain","roll_min":4,"roll_max":4,"result":"Fungus cavern","detail":{}},{"table_key":"underdark_terrain","roll_min":5,"roll_max":5,"result":"Gas leak","detail":{}},{"table_key":"underdark_terrain","roll_min":6,"roll_max":6,"result":"Gorge","detail":{}},{"table_key":"underdark_terrain","roll_min":7,"roll_max":7,"result":"High ledge","detail":{}},{"table_key":"underdark_terrain","roll_min":8,"roll_max":8,"result":"Horrid sounds","detail":{}},{"table_key":"underdark_terrain","roll_min":9,"roll_max":9,"result":"Lava swell","detail":{}},{"table_key":"underdark_terrain","roll_min":10,"roll_max":10,"result":"Muck pit","detail":{}},{"table_key":"underdark_terrain","roll_min":11,"roll_max":11,"result":"Rockfall","detail":{}},{"table_key":"underdark_terrain","roll_min":12,"roll_max":12,"result":"Rope bridge","detail":{}},{"table_key":"underdark_terrain","roll_min":13,"roll_max":13,"result":"Ruins","detail":{}},{"table_key":"underdark_terrain","roll_min":14,"roll_max":14,"result":"Shelter","detail":{}},{"table_key":"underdark_terrain","roll_min":15,"roll_max":15,"result":"Sinkhole","detail":{}},{"table_key":"underdark_terrain","roll_min":16,"roll_max":16,"result":"Slime or mold","detail":{}},{"table_key":"underdark_terrain","roll_min":17,"roll_max":17,"result":"Steam vent","detail":{}},{"table_key":"underdark_terrain","roll_min":18,"roll_max":18,"result":"Underground stream","detail":{}},{"table_key":"underdark_terrain","roll_min":19,"roll_max":19,"result":"Warning sign","detail":{}},{"table_key":"underdark_terrain","roll_min":20,"roll_max":20,"result":"Webs","detail":{}}];
const FCAT=[{"slug": "barrelstalk", "name": "Barrelstalk", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "battleaxe", "name": "Battleaxe", "item_type": "weapon", "rarity": "common", "value": 10}, {"slug": "blowgun", "name": "Blowgun", "item_type": "weapon", "rarity": "common", "value": 10}, {"slug": "bluecap", "name": "Bluecap", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "carnelian-gem", "name": "Carnelian gem", "item_type": "misc", "rarity": "common", "value": 10}, {"slug": "chain-shirt", "name": "Chain Shirt", "item_type": "armor", "rarity": "common", "value": 50}, {"slug": "club", "name": "Club", "item_type": "weapon", "rarity": "common", "value": 0}, {"slug": "dagger", "name": "Dagger", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "dart", "name": "Dart", "item_type": "weapon", "rarity": "common", "value": 0}, {"slug": "deep-rothe-leather", "name": "Deep Roth\u00e9 Leather", "item_type": "misc", "rarity": "common", "value": 1}, {"slug": "edible-mushrooms", "name": "Edible mushrooms", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "fire-lichen", "name": "Fire Lichen", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "hand-crossbow", "name": "Hand crossbow", "item_type": "weapon", "rarity": "common", "value": 75}, {"slug": "handaxe", "name": "Handaxe", "item_type": "weapon", "rarity": "common", "value": 5}, {"slug": "javelin", "name": "Javelin", "item_type": "weapon", "rarity": "common", "value": 0}, {"slug": "leather-armor", "name": "Leather Armor", "item_type": "armor", "rarity": "common", "value": 10}, {"slug": "light-crossbow", "name": "Light Crossbow", "item_type": "weapon", "rarity": "common", "value": 25}, {"slug": "light-hammer", "name": "Light Hammer", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "longbow", "name": "Longbow", "item_type": "weapon", "rarity": "common", "value": 50}, {"slug": "longsword", "name": "Longsword", "item_type": "weapon", "rarity": "common", "value": 15}, {"slug": "mace", "name": "Mace", "item_type": "weapon", "rarity": "common", "value": 5}, {"slug": "morningstar", "name": "Morningstar", "item_type": "weapon", "rarity": "common", "value": 15}, {"slug": "net", "name": "Net", "item_type": "weapon", "rarity": "common", "value": 1}, {"slug": "nightlight-fungus", "name": "Nightlight", "item_type": "misc", "rarity": "common", "value": 1}, {"slug": "obsidian-flake-dagger", "name": "Obsidian flake dagger", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "obsidian-shard", "name": "Obsidian Shard", "item_type": "weapon", "rarity": "common", "value": 0}, {"slug": "ormu-moss", "name": "Ormu", "item_type": "misc", "rarity": "common", "value": 1}, {"slug": "pike", "name": "Pike", "item_type": "weapon", "rarity": "common", "value": 5}, {"slug": "pitchfork", "name": "Pitchfork", "item_type": "weapon", "rarity": "common", "value": 1}, {"slug": "quarterstaff", "name": "Quarterstaff", "item_type": "weapon", "rarity": "common", "value": 0}, {"slug": "rags", "name": "Rags", "item_type": "armor", "rarity": "common", "value": 0}, {"slug": "rapier", "name": "Rapier", "item_type": "weapon", "rarity": "common", "value": 25}, {"slug": "ripplebark", "name": "Ripplebark", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "rusted-battleaxe", "name": "Rusted Battleaxe", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "rusted-iron-bar", "name": "Rusted iron bar", "item_type": "weapon", "rarity": "common", "value": 1}, {"slug": "rusted-longsword", "name": "Rusted Longsword", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "rusted-morningstar", "name": "Rusted Morningstar", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "rusted-pike", "name": "Rusted Pike", "item_type": "weapon", "rarity": "common", "value": 1}, {"slug": "rusted-scimitar", "name": "Rusted Scimitar", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "rusted-war-pick", "name": "Rusted War Pick", "item_type": "weapon", "rarity": "common", "value": 1}, {"slug": "rusted-warhammer", "name": "Rusted Warhammer", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "scimitar", "name": "Scimitar", "item_type": "weapon", "rarity": "common", "value": 25}, {"slug": "scourge", "name": "Scourge", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "shield", "name": "Shield", "item_type": "armor", "rarity": "common", "value": 10}, {"slug": "shortbow", "name": "Shortbow", "item_type": "weapon", "rarity": "common", "value": 25}, {"slug": "shortsword", "name": "Shortsword", "item_type": "weapon", "rarity": "common", "value": 10}, {"slug": "shuriken", "name": "Shuriken", "item_type": "weapon", "rarity": "common", "value": 1}, {"slug": "sling", "name": "Sling", "item_type": "weapon", "rarity": "common", "value": 0}, {"slug": "spear", "name": "Spear", "item_type": "weapon", "rarity": "common", "value": 1}, {"slug": "spiked-gauntlets", "name": "Spiked Gauntlets", "item_type": "weapon", "rarity": "common", "value": 10}, {"slug": "studded-leather-armor", "name": "Studded Leather Armor", "item_type": "armor", "rarity": "common", "value": 45}, {"slug": "timmask", "name": "Timmask", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "tongue-of-madness", "name": "Tongue of Madness", "item_type": "consumable", "rarity": "common", "value": 50}, {"slug": "trillimac", "name": "Trillimac", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "war-pick", "name": "War Pick", "item_type": "weapon", "rarity": "common", "value": 5}, {"slug": "warhammer", "name": "Warhammer", "item_type": "weapon", "rarity": "common", "value": 15}, {"slug": "waterorb", "name": "Waterorb", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "whip", "name": "Whip", "item_type": "weapon", "rarity": "common", "value": 2}, {"slug": "zurkhwood", "name": "Zurkhwood", "item_type": "misc", "rarity": "common", "value": 1}, {"slug": "torchstalk", "name": "Torchstalk", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "nilhoggs-nose", "name": "Nilhogg's Nose", "item_type": "consumable", "rarity": "common", "value": 1}, {"slug": "spider-venom-gland", "name": "Spider Venom Gland", "item_type": "misc", "rarity": "common", "value": 1}, {"slug": "cavern-lizard-meat", "name": "Cavern Lizard Meat", "item_type": "consumable", "rarity": "common", "value": 0}, {"slug": "steeder-silk-spinneret", "name": "Steeder Silk Spinneret", "item_type": "misc", "rarity": "common", "value": null}];
// Every picture here is a sprite (Sam, 9/28: "Use sprites for everything"): the map-prop library (vtt-assets/props,
// PixelLab), the repo's creature sheets, PixelLab rotations of the bestiary's generated monsters, the item pixel icons,
// and a PixelLab Wang tileset for cave floor and walls.
const FA=window.AOP_FA;
const fImg=(src)=>{ const im=new Image(); im.src=src; return im; };
const fProp={}; Object.entries(FA.props).forEach(([k,v])=>fProp[k]=fImg(v));
const fMon={}; Object.entries(FA.mons).forEach(([k,v])=>fMon[k]={e:fImg(v.e),w:fImg(v.w)});
const fItem={}; Object.entries(FA.items).forEach(([k,v])=>fItem[k]=fImg(v));
const fTiles=new Image();
// Which sprite stands for each encounter row. Bestiary rows use the creature's own sprite. Rows with no stat block
// (raiders, traders, scouts...) show a representative figure — a picture only; the DM still stages them.
const MONKEY={"Female Steeder":"female-steeder","Chuul":"chuul","Giant Spider":"giant-spider","Grell":"grell","Grick":"grick","Orog":"orog","Piercer":"piercer","Umber Hulk":"umber-hulk","Carrion Crawler":"carrion-crawler","Giant Fire Beetle":"giant-fire-beetle","Ochre Jelly":"ochre-jelly",
  "Escaped slaves":"deep-gnome","Fungi":"prop:fungi-violet","Giant \"rocktopus\"":"rocktopus","Mad creature":"hook-horror","Raiders":"bandit","Scouts":"drow-rogue-hooded","Society of Brilliance":"mind-flayer","Spore servants":"zombie-rotting","Traders":"wandering-peddler"};
// On-screen height in px — the hero is ~90 px for ~6 ft, so ~15 px a foot (5e sizes where the book gives no height).
const MONH={"giant-toad":64,"giant-lizard":66,"male-steeder":56,"female-steeder":84,"giant-rat":40,"giant-bat":64,"giant-fire-beetle":40,"deep-rothe":66,"grick":72,"carrion-crawler":78,"chuul":112,"umber-hulk":138,"grell":84,"piercer":64,"ochre-jelly":78,"orog":104,"giant-spider":84,"deep-gnome":50,"mind-flayer":96,"zombie-rotting":90,"hook-horror":128,"bandit":92,"wandering-peddler":90,"drow-rogue-hooded":92,"rocktopus":110};
// Monsters move (Sam, 9/28: "animate the fauna and monsters"). The three roamers have PixelLab cycles (scurry, crawl,
// flap); everything else breathes and sways procedurally off its one drawing. `still` freezes a sleeping or held foe.
const fMonAnim={}; Object.entries(FA.monanim||{}).forEach(([k,v])=>{ fMonAnim[k]={e:v.e.map(fImg),w:(v.w||[]).map(fImg),fps:v.fps||10}; });
function fDrawMon(key,x,y,faceRight,alpha,bob,still,moving){ if(!key) return false; if(key.startsWith("prop:")){ fDrawProp(key.slice(5),x,y,90,alpha); return true; }
  const t=performance.now()/1000, ph=(x*.013+y*.007)%6.28; const A=fMonAnim[key]; let im=null;
  if(A){ const fr=faceRight||!A.w.length?A.e:A.w; const n=fr.length; const f=still?0:Math.floor(t*A.fps*(moving===false?.45:1)+ph*3)%n; im=fr[f]; if(!im||!im.width) im=null; }
  const m=fMon[key]; if(!im) im=m&&(faceRight?m.e:m.w); if(!im||!im.width) return false; const h=(MONH[key]||90)*__zs(y), w=im.width*h/im.height;
  const flip=A&&!faceRight&&!A.w.length; // no west cycle: mirror the east one
  // procedural life for the rest: a slow breath and a little weight shift
  const sy=A||still?1:1+Math.sin(t*(moving?9:2.4)+ph)*(moving?.05:.035), sx=A||still?1:1-Math.sin(t*(moving?9:2.4)+ph)*.03, tilt=A||still?0:Math.sin(t*(moving?9:1.7)+ph)*(moving?.08:.035);
  fg.save(); fg.globalAlpha=alpha??1; fg.fillStyle="rgba(0,0,0,.4)"; fg.beginPath(); fg.ellipse(x,y,w*.38,Math.max(5,w*.1),0,0,7); fg.fill(); fg.imageSmoothingEnabled=false;
  fg.translate(x,y+2+(bob||0)); fg.rotate(tilt); fg.scale((flip?-1:1)*sx,sy); fg.drawImage(im,-w/2,-h,w,h); fg.restore(); return true; }
function fDrawProp(slug,x,y,h,alpha,g){ if(!g) h=(h||64)*__zs(y); g=g||fg; const im=fProp[slug]; if(!im||!im.width) return; const s=(h||64)/im.height, w=im.width*s; g.save(); g.globalAlpha=alpha??1; g.imageSmoothingEnabled=false; g.drawImage(im,Math.round(x-w/2),Math.round(y-h),Math.round(w),Math.round(h)); g.restore(); }
// Catalog item -> the prop that grows it. Food patches are a fairy ring of edible caps; a failed forage shows mould.
const PROPOF={"blind-cave-fish":"blind-cave-fish","albino-eel":"albino-eel","cave-crab":"cave-crab","cave-crayfish":"cave-crayfish","subterranean-puffer-fish":"subterranean-puffer-fish","cave-crickets":"cave-crickets","cave-snails":"cave-snails","shadow-worms":"shadow-worms","lizard-eggs":"lizard-eggs","trillimac":"fungi-trillimac","bluecap":"fungi-bluecap","barrelstalk":"fungi-barrelstalk","fire-lichen":"fungi-fire-lichen","nightlight-fungus":"fungi-nightlight","ormu-moss":"fungi-ormu","ripplebark":"fungi-ripplebark","timmask":"fungi-timmask","zurkhwood":"fungi-zurkhwood","waterorb":"fungi-waterorb","tongue-of-madness":"fungi-tongue-of-madness","edible-mushrooms":"fungi-ring","torchstalk":"fungi-torchstalk","nilhoggs-nose":"nilhoggs-nose"};
// Passive Perception from the live bestiary rows (senses line). Stub rows with no stats stay null — the DM rules.
const FPASSIVE={"Giant Bat":11,"Giant Spider":10,"Grick":12,"Giant Fire Beetle":8,"Giant Rat":10,"Chuul":14,"Orog":10,"Ochre Jelly":8,"Carrion Crawler":null,"Umber Hulk":null,"Piercer":null,"Grell":null};
const F=window.Field;
const fc=host.canvas, fg=host.ctx; const FW=host.W, FH=host.H;
let FLD=null; // the running mini-game
const fkeys=new Set();
const fd20=()=>1+Math.floor(Math.random()*20);
function fStealth(p){ const s=(p.skills||{}); const k=Object.keys(s).find(x=>x.toLowerCase()==="stealth"); const bonus=k?(s[k]==="expertise"?4:2):0; const face=fd20(); return {face,bonus,total:face+bonus}; }
function fPerception(p){ const s=(p.skills||{}); const k=Object.keys(s).find(x=>/perception|investigation/i.test(x)); const wis=Math.floor(((p.wis||10)-10)/2); const bonus=wis+(k?2:0); const face=fd20(); return {face,bonus,total:face+bonus}; }
const sgn=(n)=>n>=0?`+${n}`:`${n}`;
function fOpen(mode,title,sub){ { const f0=me(), c0=Field.canHeadOut({name:f0.name,hp:f0.hp,conditions:(RSHEET[PARTY[ME].slug]||{}).conditions}); if(!c0.ok){ speak(`<b>${f0.name.toUpperCase()}</b>\n${c0.reason}`); return; } } if($("flddev")) $("flddev").hidden=!dmView; $("fldatk").hidden=mode==="hunt"; $("fldtitle").textContent=title; $("fldsub").innerHTML=sub; $("fldres").hidden=true; $("fldres").innerHTML=""; $("fldsearch").hidden=mode!=="explore"; $("fldgo").hidden=mode==="explore"; $("fldgo").textContent=mode==="hunt"?"Give up the hunt":"Head back to camp"; $("fldback").hidden=mode!=="explore"; $("fld").hidden=false; }
function fClose(){ $("fld").hidden=true; FLD=null; const f=me(); if((f.hp??1)<=0){ fallenAtCamp(ME); refresh(); return; } leave(f); goTo(f,"quiet",STATIONS.quiet.spots[0],"south"); }
function fResult(html){ $("fldres").innerHTML=dmView?html:fPlayerSafe(html); $("fldres").hidden=false; }
function fPlayerSafe(h){ return String(h)
  .replace(/<p class="flags">[\s\S]*?<\/p>/g,"").replace(/<p class="dim">[\s\S]*?<\/p>/g,"")
  .replace(/Initiative:[^—]*—\s*/g,"").replace(/(?:Random Encounters|Ambushers)?\s*d20\s*<b>\d+<\/b>\s*—\s*/g,"")
  .replace(/(?:Stealth|Survival|Perception|Wisdom save|Constitution save)[^—]*?(?:vs[^—]*?)?—\s*/g,"")
  .replace(/\s*\((?:[^()]*\d[^()]*|OotA[^()]*|SRD[^()]*|PROPOSED[^()]*)\)/g,"").replace(/[^.]*\bPROPOSED\b[^.]*\.?/g,"")
  .replace(/Death saving throws are the DM's\.?/g,"").replace(/\d+ vs AC \d+ — /g,"").replace(/\s{2,}/g," "); }
function fSay(html){ speak(dmView?html:fPlayerSafe(html)); }
// The hero: the character's own sheet, walking in eight directions (same 128-px cells as the camp).
function fHero(x,y){ return {x,y,dir:0,frame:0,ft:0,moving:false}; }
// The hero is the character's own PixelLab sheet: idle, walk, and — in the field — attack and hurt (8 facings × 6 frames).
const fHeroAct={}; Object.entries(FA.heroes||{}).forEach(([k,v])=>fHeroAct[k]={attack:fImg(v.attack),hurt:fImg(v.hurt),cast:v.cast?fImg(v.cast):null,dead:v.dead?fImg(v.dead):null});
// The weapon on the sheet, drawn from the catalog's own pixel icon. Unarmed strikes show just the fists of the attack sheet.
const fWeaponIcon=()=>{ if(FLD&&FLD.hero&&FLD.hero.bow){ const b=fItem[FLD.hero.bow]; return b&&b.width?b:null; } if(FLD&&FLD.kit&&(FLD.kit.melee.unarmedOnly||!FLD.kit.melee.can)) return null; if(FLD&&FLD.kit&&FLD.kit.melee.weapon){ const w=fItem[FLD.kit.melee.weapon.slug]; if(w&&w.width) return w; } const n=(fHeroSheet().atk.name||"").toLowerCase().replace(/\s+/g,"-"); return fItem[n]&&fItem[n].width?fItem[n]:null; };
// PixelLab's death sheets keep the figure centred in the cell, so the fallen body hangs above its shadow;
// measure each frame's lowest pixel once and drop the body onto the ground.
const _drop={}; function fDeadDrop(slug,im,row,col){ let t=_drop[slug]; if(!t){ t=_drop[slug]=[]; try{ const c=document.createElement("canvas"); c.width=im.width; c.height=im.height; const g=c.getContext("2d"); g.drawImage(im,0,0); const d=g.getImageData(0,0,c.width,c.height).data;
    for(let r=0;r<8;r++){ t[r]=[]; for(let k=0;k<7;k++){ let b=0; for(let y=127;y>=0&&!b;y--) for(let x=0;x<128;x++){ if(d[((r*128+y)*c.width+k*128+x)*4+3]>40){ b=y; break; } } t[r][k]=Math.max(0,120-b); } } }catch(e){} }
  return (t[row]&&t[row][col])||0; }
function fDrawHero(h,scale){ const f=me(); const s=scale||0.9; const acts=fHeroAct[f.slug]; let im,col,drop=0;
  if(h.dead&&acts&&acts.dead&&acts.dead.width){ im=acts.dead; col=Math.min(6,Math.floor((h.deadT||0)*8)); drop=fDeadDrop(f.slug,im,h.dir,col)*s; }
  else if(h.act&&acts&&acts[h.act]&&acts[h.act].width){ im=acts[h.act]; col=h.act==="cast"?Math.min(8,Math.floor((h.actT||0)*20)):Math.min(5,Math.floor((h.actT||0)*15)); }
  else { im=h.moving?f.img.walk:f.img.idle; if(!im||!im.width) return; const n=Math.max(1,Math.round(im.width/128)); col=h.frame%n; }
  fg.save(); fg.fillStyle="rgba(0,0,0,.45)"; fg.beginPath(); fg.ellipse(h.x,h.y,20*s,7*s,0,0,7); fg.fill(); fg.restore();
  fg.imageSmoothingEnabled=false; fg.drawImage(im,col*128,h.dir*128,128,128,h.x-64*s,h.y-120*s+drop,128*s,128*s);
  // the blade leaves the hand on the thrust frames
  const wi=h.act==="attack"?fWeaponIcon():null;
  if(wi&&col>=1&&col<=4){ const [vx,vy]=DIRV[h.dir]||[0,1]; const rm=h.bow?1:((FLD&&FLD.kit&&FLD.kit.melee.reachMul)||1); const reach=(h.bow?16:(col===2||col===3?30:18)*rm)*s; const hx=h.x+vx*reach, hy=h.y-58*s+vy*reach*.6; const z=48*s*(h.bow?1.1:Math.sqrt(rm));
    fg.save(); fg.translate(hx,hy); fg.rotate(Math.atan2(vy,vx)-(h.bow?Math.PI/4:Math.PI*3/4)); fg.imageSmoothingEnabled=false; fg.drawImage(wi,-z/2,-z/2,z,z); fg.restore(); } }
function fStep(h,dt,tx,ty,speed){ const dx=tx-h.x, dy=ty-h.y, dist=Math.hypot(dx,dy); if(dist<3){ h.moving=false; return false; }
  const v=Math.min(dist,speed*dt); h.x+=dx/dist*v; h.y+=dy/dist*v; h.dir=dirFrom(dx,dy); h.moving=true; h.ft+=dt; if(h.ft>0.1){ h.ft=0; h.frame++; } return true; }
function fKeyDir(){ let x=0,y=0; if(fkeys.has("arrowleft")||fkeys.has("a")) x--; if(fkeys.has("arrowright")||fkeys.has("d")) x++; if(fkeys.has("arrowup")||fkeys.has("w")) y--; if(fkeys.has("arrowdown")||fkeys.has("s")) y++; return {x,y}; }
// Cave floor from the PixelLab Wang tileset (all-lower tiles at 2x), dressed with library props by biome.
const WILDSHROOM=["fungi-bluecap","fungi-trillimac","fungi-ring","fungi-violet","fungi-ripplebark","fungi-nightlight","fungi-timmask","fungi-bluecap","fungi-violet","mushroom-stump","fungi-zurkhwood"];
const TS=64, FDECOR={tunnels:["stalagmite-small","boulder","cracked-floor","rubble-pile","moss-carpet","cave-fern","footprints","stalagmite-cluster"],fungal:["mushroom-stump","fungi-violet","fungi-torchstalk","moss-carpet","pale-flowers","lichen-log","spores","cave-fern"],shore:["reeds","boulder","moss-carpet","cave-fern","crystal-violet-floor","lichen-log","reeds","stalagmite-small"]};
// The tileset came out cold blue; each biome grades it (stone grey in the tunnels, violet in the grove, sea-green on the shore).
const FGRADE={tunnels:"saturate(.35) brightness(.92) sepia(.25)",fungal:"saturate(.55) brightness(.92) hue-rotate(25deg)",shore:"saturate(.5) brightness(.92) hue-rotate(-25deg)"};
function fTile(g,key,x,y,r){ const opts=FA.tiles.lut[key]||FA.tiles.lut.LLLL; const [sx,sy]=opts[Math.floor((r?r():0)*opts.length)%opts.length]; g.imageSmoothingEnabled=false; g.save(); g.filter=FGRADE[biome]||FGRADE.tunnels; g.drawImage(fTiles,sx,sy,32,32,x,y,TS,TS); g.restore(); }
function fFloor(seed,tint,opts){ const c=document.createElement("canvas"); c.width=FW; c.height=FH; const g=c.getContext("2d"); const r=F.seededRng(seed);
  for(let y=-18;y<FH;y+=TS) for(let x=0;x<FW;x+=TS) fTile(g,"LLLL",x,y,r);
  const deco=FDECOR[biome]||FDECOR.tunnels, n=(opts&&opts.decor)??14;
  for(let i=0;i<n;i++){ let x,y,k=0; do{ x=40+r()*(FW-80); y=60+r()*(FH-80); k++; } while(k<20&&opts&&opts.clear&&opts.clear(x,y)); const s=deco[Math.floor(r()*deco.length)]; fDrawProp(s,x,y,/stalagmite|boulder|stump|log|reeds/.test(s)?54+r()*26:40+r()*20,1,g); }
  if(tint){ g.fillStyle=tint; g.fillRect(0,0,FW,FH); }
  const v=g.createRadialGradient(FW/2,FH/2,FH*.35,FW/2,FH/2,FW*.62); v.addColorStop(0,"rgba(0,0,0,0)"); v.addColorStop(1,"rgba(0,0,0,.7)"); g.fillStyle=v; g.fillRect(0,0,FW,FH); return c; }
function fPop(x,y,text,col){ FLD.pops.push({x,y,text,col:col||"#e3b95c",t:0}); }
function fDrawPops(dt){ for(let i=FLD.pops.length-1;i>=0;i--){ const p=FLD.pops[i]; p.t+=dt; if(p.t>1.4){ FLD.pops.splice(i,1); continue; } fg.globalAlpha=Math.max(0,1-p.t/1.4); fg.font="600 15px Cinzel"; fg.textAlign="center"; fg.fillStyle="#000"; fg.fillText(p.text,p.x+1,p.y-30*p.t+1); fg.fillStyle=p.col; fg.fillText(p.text,p.x,p.y-30*p.t); fg.globalAlpha=1; } }
function fHud(lines){ fg.save(); fg.font="600 14px Cinzel"; fg.textAlign="left"; let y=26; for(const l of lines){ const w=fg.measureText(l).width+18; fg.fillStyle="rgba(6,5,10,.8)"; fg.fillRect(12,y-17,w,24); fg.strokeStyle="#9c7a3a"; fg.strokeRect(12.5,y-16.5,w,24); fg.fillStyle="#e3b95c"; fg.fillText(l,21,y); y+=30; } fg.restore(); }
function fBar(x,y,w,frac,col){ fg.fillStyle="rgba(6,5,10,.85)"; fg.fillRect(x,y,w,10); fg.fillStyle=col; fg.fillRect(x+1,y+1,(w-2)*Math.max(0,Math.min(1,frac)),8); fg.strokeStyle="#9c7a3a"; fg.strokeRect(x+.5,y+.5,w,10); }
// Canvas input (Sam, 9/28): WASD / arrows walk; LEFT click strikes toward the cursor, RIGHT click fires the bow or the
// cantrip at it. On a touch screen a tap walks there and the buttons under the map attack.
function fPoint(e){ return host.toWorld(e); }
const fWorldPt=(p)=>({x:p.x+(FLD.ox?FLD.ox():0), y:p.y+(FLD.oy?FLD.oy():0)});
fc.addEventListener("contextmenu",(e)=>e.preventDefault()); fc.addEventListener("mousedown",(e)=>{ if(e.button===1) e.preventDefault(); }); fc.addEventListener("auxclick",(e)=>{ if(e.button===1) e.preventDefault(); });
fc.addEventListener("pointerdown",(e)=>{ if(!FLD||FLD.ended) return; const w=fWorldPt(fPoint(e));
  if(e.pointerType==="touch"){ FLD.drag=true; FLD.tx=w.x; FLD.ty=w.y; return; }
  e.preventDefault(); if(e.button===2) fAimStart(w); else if(e.button===0) fHoldStart(w); else if(e.button===1) fSpeak(); });
fc.addEventListener("pointerup",(e)=>{ if(e.button===2) fAimRelease(); if(e.button===0) fHoldEnd(); });
fc.addEventListener("pointermove",(e)=>{ if(!FLD) return; const w=fWorldPt(fPoint(e)); FLD.mouse=w; if(!FLD.drag) return; FLD.tx=w.x; FLD.ty=w.y; });
window.addEventListener("pointerup",(e)=>{ if(FLD){ FLD.drag=false; if(e.button===2&&FLD.bowDraw) fAimRelease(); if(e.button===0&&FLD.hold&&FLD.hold.at) fHoldEnd(); } });
window.addEventListener("keydown",(e)=>{ if(fTyping(e)) return; if(!FLD||$("fld").hidden||e.key!==" ") return; e.preventDefault(); e.stopPropagation(); const a=document.activeElement; if(a&&a!==document.body&&$("fld").contains(a)) a.blur(); if(!e.repeat) fForageStart(); },true);
window.addEventListener("keyup",(e)=>{ if(fTyping(e)) return; if(!FLD||$("fld").hidden||e.key!==" ") return; e.preventDefault(); e.stopPropagation(); fForageRelease(); },true);
window.addEventListener("keydown",(e)=>{ if(fTyping(e)) return; if(!FLD||$("fld").hidden) return; const k=e.key.toLowerCase(); if(k===" ") return; if(["arrowleft","arrowright","arrowup","arrowdown","w","a","s","d"].includes(k)){ fkeys.add(k); e.preventDefault(); } });
window.addEventListener("keyup",(e)=>{ fkeys.delete(e.key.toLowerCase()); });
function fMove(dt,speed,bounds){ const h=FLD.hero; const kd=fKeyDir(); const b=bounds||{x0:30,y0:90,x1:FW-30,y1:FH-20};
  if(kd.x||kd.y){ const n=Math.hypot(kd.x,kd.y); FLD.tx=h.x+kd.x/n*40; FLD.ty=h.y+kd.y/n*40; }
  FLD.tx=Math.max(b.x0,Math.min(b.x1,FLD.tx)); FLD.ty=Math.max(b.y0,Math.min(b.y1,FLD.ty));
  return fStep(h,dt,FLD.tx,FLD.ty,speed); }
let fLast=0;
function fLoop(dt){ if(FLD&&FLD.hero&&FLD.hero.dead){ FLD.hero.deadT=(FLD.hero.deadT||0)+dt; FLD.hurtFlash=Math.max(0,(FLD.hurtFlash||0)-dt); } if(FLD&&FLD.hero&&FLD.hero.act){ FLD.hero.actT=(FLD.hero.actT||0)+dt; if(FLD.hero.actT>(FLD.hero.act==="cast"?0.46:0.42)) FLD.hero.act=null; }
  if(FLD&&!$("fld").hidden){ FLD.t+=dt; FLD.swingCool=Math.max(0,(FLD.swingCool||0)-dt); FLD.tick(dt); } }


// ===== THE ZELDA LAYER (Sam, 9/28: "more challenging and fun like a zelda game") ======================================
// Hearts are the character's real hit points. Every bite and every swing is an SRD attack roll (Field.rollAttack):
// the creature's to-hit and damage from its live bestiary row, the hero's from sheet_attacks, AC from the sheet.
const fVfx={}; Object.entries(FA.vfx).forEach(([k,v])=>fVfx[k]=fImg(v));
// Live rows 2026-09-28: characters.ac + sheet_attacks.
const FSHEET={freia:{ac:13,atk:{name:"Dagger",hit:"+5",damage:"1d4+3 piercing"}},kenta:{ac:10,atk:{name:"Unarmed Strike",hit:"+3",damage:"2 bludgeoning"}},samson:{ac:10,atk:{name:"Unarmed Strike",hit:"+2",damage:"1 bludgeoning"}},scott:{ac:10,atk:{name:"Unarmed Strike",hit:"+1",damage:"1 bludgeoning"}}};
// Live bestiary rows (ac, hp, actions). Screen speed is scaled from their 5e speed; the hero walks at 200.
const FBEST={"giant-rat":{name:"Giant rat",ac:12,hp:7,speed:125,actions:[{desc:"Hit: 4 (1d4+2) piercing.",name:"Bite",to_hit:"+4"}]},"giant-fire-beetle":{name:"Giant fire beetle",ac:13,hp:4,speed:95,actions:[{desc:"Hit: 2 (1d6-1) slashing.",name:"Bite",to_hit:"+1"}]},"giant-bat":{name:"Giant bat",ac:13,hp:22,speed:165,actions:[{desc:"Hit: 5 (1d6+2) piercing.",name:"Bite",to_hit:"+4"}]}};
const fHeroSheet=()=>FSHEET[PARTY[ME].slug]||{ac:10,atk:{name:"Unarmed Strike",hit:"+0",damage:"1"}};
function fMakeFoes(slugs,seed,avoid){ const r=F.seededRng(seed); return slugs.filter(s=>FBEST[s]).map(s=>{ let x,y,k=0; do{ x=EXB.x0+40+r()*(EXB.x1-EXB.x0-80); y=EXB.y0+30+r()*(EXB.y1-EXB.y0-40); k++; } while(k<30&&avoid&&Math.hypot(x-avoid.x,y-avoid.y)<260);
  const b=FBEST[s]; return {slug:s,name:b.name,x,y,hp:b.hp,max:b.hp,ac:b.ac,speed:b.speed,str:F.strikerFromBestiary({name:b.name,actions:b.actions}),cool:1.2,flash:0,dead:false,fade:1,wx:0,wy:0,wt:0,kx:0,ky:0,face:false}; }); }
// Hearts: one heart = 2 HP, drawn as pixel sprites.
const HEART=["0110110","1111111","1111111","0111110","0011100","0001000"];
function fHearts(hp,max,x,y){ const n=Math.ceil(max/2); for(let i=0;i<n;i++){ const fill=Math.max(0,Math.min(2,hp-i*2)); for(let r=0;r<HEART.length;r++) for(let c=0;c<7;c++){ if(HEART[r][c]!=="1") continue; const lit=fill===2||(fill===1&&c<4); fg.fillStyle=lit?(r<2&&c>0&&c<3?"#ff8a8a":"#d8243a"):"#3a2a30"; fg.fillRect(x+i*26+c*3,y+r*3,3,3); } } }
function fHurt(L,dmg,from){ if(L.wolf&&dmg>0){ const r=F.wildShapeDamage(L.wolf.hp,dmg); L.wolf.hp=r.formHp; L.iframe=1.0; L.hurtFlash=.25; fBleed(L,L.hero.x,L.hero.y-30,0,0,6,"hero"); if(!r.reverted) return; fRevert(L,false); dmg=r.overflow; if(dmg<=0) return; } if(from!=="a bad mushroom"&&from!=="an eel's shock"){ const H=L.hero; let n=null,nd=1e9; for(const e of L.foes){ if(e.dead) continue; const d=Math.hypot(e.x-H.x,e.y-H.y); if(d<nd){ nd=d; n=e; } } fBleed(L,H.x,H.y-50,n?H.x-n.x:0,n?H.y-n.y:0,dmg>=8?14:8,"hero"); } L.hp=Math.max(0,L.hp-dmg); L.iframe=1.0; L.hurtFlash=.35; PARTY[ME].hp=L.hp; const f=me(); f.hp=L.hp;
  if(L.hp<=0&&!L.down){ L.down=true; L.busy=true; const p=PARTY[ME]; const H=L.hero; H.dead=true; H.deadT=0; sfx("creature_player_downed",{vol:.6}); H.act=null; H.moving=false; L.iframe=0; L.hurtFlash=.6;
    fRescueStart(L); const who=L.rescue.fig?L.rescue.fig.name:"the party";
    const line=`${p.name} drops to 0 hit points (${from}). Whatever was out there loses interest; ${who} comes out and drags ${p.name} back to the fire. Death saving throws are the DM's (SRD).`;
    if(dmView) speak(`<b>${L.mode.toUpperCase()} — DM</b>\n${line}`); flash(`${p.name.toUpperCase()} IS DOWN`,true);
    // the card waits for the rescue to leave the screen (with a backstop, in case a tab sleeps)
    const card=()=>{ if(FLD!==L||L.carded) return; L.carded=true; const mal=fMalSummary(L,true); speak(`<b>MALACHAR</b>\n${mal.text}`); fMalVoice("c_down"); fResult(`<h4>Down</h4>${MALBOX(mal.text)}${dmView?`<p class="dmx">${line}</p>`:""}<div class="caught">0 HP — DEATH SAVES</div><button class="obtn" id="fldok">Back to the fire</button>`); $("fldok").onclick=fClose; };
    L.onRescued=card; setTimeout(card,45000); } }
function fFoesTick(L,dt,bounds){ const H=L.hero; const b=bounds||EXB; const OX=L.ox?L.ox():0, OY=L.oy?L.oy():0, can=L.canStand?(x,y)=>L.canStand(x,y):()=>true;
  for(const e of L.foes){ if(e.dead){ e.fade=Math.max(0,e.fade-dt*1.5); continue; } e.cool-=dt; e.flash=Math.max(0,e.flash-dt);
    const dx=H.x-e.x, dy=H.y-e.y, dist=Math.hypot(dx,dy);
    let vx=0, vy=0;
    const idle=e.asleep>0||e.held>0||!!e.thrown||e.prone>0; const unseen=!!(L.sneak&&!e.spotsRogue); const spd=e.speed*(e.slowT>0?.55:1); if(e.slowT>0) e.slowT-=dt;
    if(idle){ vx=0; vy=0; e.kx=0; e.ky=0; }
    else if(e.fleeT>0){ e.fleeT-=dt; vx=-dx/Math.max(1,dist)*spd*1.3; vy=-dy/Math.max(1,dist)*spd*1.3;
      if(e.x<b.x0+8||e.x>b.x1-8||e.y<b.y0+8||e.y>b.y1-8){ e.gone=true; } }
    else if(e.kx||e.ky){ e.x+=e.kx*dt; e.y+=e.ky*dt; e.kx*=.86; e.ky*=.86; if(Math.hypot(e.kx,e.ky)<10){ e.kx=0; e.ky=0; } }
    else if(dist<(e.ambusher?900:270)&&!L.down&&!e.calm&&!unseen){ vx=dx/dist*spd; vy=dy/dist*spd; if(e.slug==="giant-bat"){ vx+=Math.sin(L.t*7+e.x)*90; vy+=Math.cos(L.t*6)*70; } }
    else { e.wt-=dt; if(e.wt<=0){ const a=Math.random()*7; e.wx=Math.cos(a)*e.speed*.35; e.wy=Math.sin(a)*e.speed*.35; e.wt=1+Math.random()*1.5; } vx=e.wx; vy=e.wy; }
    { const nx=Math.max(b.x0,Math.min(b.x1,e.x+vx*dt)), ny=Math.max(b.y0,Math.min(b.y1,e.y+vy*dt)); if(e.slug==="giant-bat"||e.fly||can(nx,ny)){ e.x=nx; e.y=ny; } else { e.wt=0; e.kx=0; e.ky=0; } } if(Math.abs(vx)>5) e.face=vx>0;
    if(e.strikes&&dist<(MONH[e.slug]>100?62:46)&&e.cool<=0&&!L.down&&!(L.iframe>0)&&!idle&&!(e.fleeT>0)&&!unseen){ if(fWolfSpared(L,e,2.2,OX,OY)) continue; e.lunge=.28; e.cool=2.2; const dmg=fRound(L,e,H,OX,OY); if(dmg>0){ fPop(H.x-OX,H.y-OY-100,`-${dmg}`,"#ff5a4a"); const kn=Math.max(1,dist); const kx=Math.max(b.x0,Math.min(b.x1,H.x+dx/kn*70)), ky=Math.max(b.y0,Math.min(b.y1,H.y+dy/kn*70)); if(can(kx,ky)){ H.x=kx; H.y=ky; } L.tx=H.x; L.ty=H.y; H.act="hurt"; H.actT=0; sfx("combat_melee_hit_flesh",{vol:.55,rate:.85}); sfx("creature_player_hurt",{vol:.4}); fHurt(L,dmg,`${e.name}`); } else if(L.kit&&L.kit.knockbackOnMiss){ const kn=Math.max(1,dist); e.kx=-dx/kn*420; e.ky=-dy/kn*420; fPop(e.x-OX,e.y-OY-80,"shoved!","#ffd36a"); } continue; }
    if(!e.strikes&&dist<36&&e.cool<=0&&!L.down&&!(L.iframe>0)&&!idle&&!e.calm&&!(e.fleeT>0)&&!unseen){ if(fWolfSpared(L,e,1.3,OX,OY)) continue; e.cool=1.3; e.lunge=.28; const sh=fHeroSheet(); const a=fFoeRoll(e,e.str,sh.ac); if(a.hit&&L.rage>0) a.damage=Math.max(1,Math.floor(a.damage/2));
      if(a.hit&&L.shield){ fBlock(L,e); } else if(a.hit){ fPop(H.x-OX,H.y-OY-100,`-${a.damage}${a.crit?"!":""}`,"#ff5a4a"); L.log&&L.log.push(a.note); const kn=Math.max(1,dist); const kx=Math.max(b.x0,Math.min(b.x1,H.x+dx/kn*60)), ky=Math.max(b.y0,Math.min(b.y1,H.y+dy/kn*60)); if(can(kx,ky)){ H.x=kx; H.y=ky; } L.tx=H.x; L.ty=H.y; H.act="hurt"; H.actT=0; sfx("combat_melee_hit_flesh",{vol:.4,rate:1.2}); sfx("creature_player_hurt",{vol:.35}); fHurt(L,a.damage,a.note); }
      else { fPop(H.x-OX,H.y-OY-100,"miss","#b9e0ff"); if(L.kit&&L.kit.knockbackOnMiss){ const kn=Math.max(1,dist); e.kx=-dx/kn*560; e.ky=-dy/kn*560; fPop(e.x-OX,e.y-OY-80,"shoved!","#ffd36a"); } } } }
  for(let i=L.foes.length-1;i>=0;i--){ const e=L.foes[i]; e.mv=Math.hypot(e.x-(e.px??e.x),e.y-(e.py??e.y))/Math.max(dt,1e-3); e.px=e.x; e.py=e.y; if(e.lunge>0) e.lunge-=dt;
    if(e.gone&&!e.dead){ L.foes.splice(i,1); L.fled=(L.fled||0)+1; L.log.push(`${e.name} escaped into the dark.`); } }
  L.iframe=Math.max(0,(L.iframe||0)-dt); L.hurtFlash=Math.max(0,(L.hurtFlash||0)-dt); }
function fFoesDraw(L){ for(const e of L.foes){ if(e.dead&&e.fade<=0) continue; const bob=e.slug==="giant-bat"?Math.sin(L.t*9+e.y)*5:Math.abs(Math.sin(L.t*10+e.x))*2*(e.dead?0:1);
    const H=L.hero; const ln=e.lunge>0?Math.sin((1-e.lunge/.28)*Math.PI)*16:0; const lx=ln*Math.sign((H.x-(L.ox?L.ox():0))-e.x||1), moving=(e.mv||0)>25&&!e.dead;
    const hop=moving&&!fMonAnim[e.slug]&&e.slug!=="giant-bat"?Math.abs(Math.sin(L.t*11+e.x*.01))*5:0;
    fDrawMon(e.slug,e.x+lx,e.y,e.fleeT>0?!(H.x-(L.ox?L.ox():0)>e.x):e.face,e.dead?e.fade:(e.flash>0&&Math.floor(e.flash*20)%2?.35:1),-bob-hop-(e.z||0),e.dead||e.asleep>0||e.held>0||e.prone>0,moving); if(!e.dead) fDrawArrowsOn(e.slug,e.arrows,e.x+lx,e.y-bob-hop,e.fleeT>0?!(H.x-(L.ox?L.ox():0)>e.x):e.face);
    if(e.fleeT>0&&!e.dead){ fg.font="700 14px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e3b95c"; fg.fillText("!!",e.x,e.y-(MONH[e.slug]||60)-14); }
    if(!e.dead&&e.hp<e.max){ fg.fillStyle="rgba(0,0,0,.7)"; fg.fillRect(e.x-18,e.y+6,36,5); fg.fillStyle="#d8243a"; fg.fillRect(e.x-17,e.y+7,34*e.hp/e.max,3); } }
  for(let i=L.fx.length-1;i>=0;i--){ const f=L.fx[i]; f.t+=1/60; const sh=fVfx[f.k]; const vm=FA.vmeta&&FA.vmeta[f.k]; const meta=f.k==="physicalImpact"?{cols:5,rows:4,frames:20,fw:192,fh:192,fps:40}:vm&&sh&&sh.width?{cols:vm.cols,rows:vm.rows,frames:vm.frames*(f.loops||1),fw:sh.width/vm.cols,fh:sh.height/vm.rows,fps:Math.max(vm.fps,24)}:{cols:6,rows:1,frames:6,fw:24,fh:24,fps:30}; const fr=Math.floor(f.t*meta.fps);
    if(fr>=meta.frames||!sh||!sh.width){ L.fx.splice(i,1); continue; } fg.save(); fg.translate(f.x,f.y); fg.rotate(f.rot||0); fg.imageSmoothingEnabled=false; const fi=fr%(meta.cols*meta.rows); fg.drawImage(sh,(fi%meta.cols)*meta.fw,Math.floor(fi/meta.cols)*meta.fh,meta.fw,meta.fh,-f.s/2,-f.s/2,f.s,f.s); fg.restore(); } }
// Swing (Space, or the ⚔ button): the weapon on the sheet, at whatever stands in front within reach.
const DIRV=[[0,1],[.7,.7],[1,0],[.7,-.7],[0,-1],[-.7,-.7],[-1,0],[-.7,.7]];
function fSwing(at){ const L=FLD; if(!L||!L.foes||L.busy||L.ended||L.down||(L.swingCool||0)>0||fNoAct(L)) return; if(L.wolf){ fWolfBite(L,at); return; } if(L.sneak){ fSneakAttack(L,at); return; } const K=L.kit; if(K&&!K.melee.can){ fFire(at); return; } if(at) L.hero.dir=dirFrom(at.x-L.hero.x,at.y-(L.hero.y-40)); L.swingCool=K?K.melee.cooldown:.45; L.still=0; const H=L.hero; const [vx,vy]=DIRV[H.dir]||[0,1]; const OX=L.ox?L.ox():0, OY=L.oy?L.oy():0;
  H.act="attack"; H.actT=0;
  const sh=fHeroSheet(); const S=FSPELL[PARTY[ME].slug]||{}; const dm=Math.floor(((S.dex||10)-10)/2); const W=K&&K.melee.weapon; const st=K&&K.melee.unarmedOnly?{name:"Unarmed Strike (Martial Arts)",toHit:(S.prof||2)+dm,damage:`1d4+${dm}`}:W?{name:W.name,toHit:W.toHit,damage:W.damage}:F.strikerFromSheet(sh.atk); const reach=92*((K&&K.melee.reachMul)||1); H.bow=null; const heavy=W&&(K.melee.reachMul||1)>1; sfx(heavy?"combat_melee_swing_heavy":"combat_melee_swing_light",{vol:heavy?.55:.45}); const hitSnd=K&&K.melee.unarmedOnly||/unarmed/i.test(st.name)?"combat_unarmed_hit":/dagger/i.test(st.name)?"combat_dagger_stab":"combat_melee_hit_flesh"; let any=false; const mul=(K?K.melee.mul:1)*(L.aura>0&&K&&K.special?K.special.mul:1);
  for(const e of L.foes){ if(e.dead) continue; const dx=e.x-H.x, dy=e.y-H.y, dist=Math.hypot(dx,dy); if(dist>reach) continue; if(dist>20&&(dx*vx+dy*vy)/dist<(reach>100?.1:.35)) continue; any=true;
    const a=fHeroRoll(L.rage>0?{...st,extra:"2"}:st,e.ac,e); fStrikeFoe(L,e,a,{mul,knock:420,dirx:dx/Math.max(1,dist),diry:dy/Math.max(1,dist),snd:hitSnd}); }
  if(!any) L.whiff=(L.whiff||0)+1; }
$("fldatk").onpointerdown=(e)=>{ e.preventDefault(); fHoldStart(null); }; $("fldatk").onpointerup=()=>fHoldEnd(); $("fldatk").onpointerleave=()=>fHoldEnd();
document.querySelectorAll("#fld button").forEach(b=>b.addEventListener("mousedown",(e)=>e.preventDefault()));
function fDark(L,r){ const H=L.hero; const g=fg.createRadialGradient(H.x,H.y-40,r*.35,H.x,H.y-40,r); g.addColorStop(0,"rgba(0,0,0,0)"); g.addColorStop(.7,"rgba(0,0,0,.55)"); g.addColorStop(1,"rgba(0,0,0,.93)"); fg.fillStyle=g; fg.fillRect(0,0,FW,FH); }
function fHurtFlash(L){ if(L.hurtFlash>0){ fg.fillStyle=`rgba(200,20,30,${L.hurtFlash*.6})`; fg.fillRect(0,0,FW,FH); } }
function fBlink(L){ return L.iframe>0&&Math.floor(L.iframe*14)%2===0; }

// ---------- FORAGE · HUNT · EXPLORE — all on one map (Sam, 9/28: "yes, all on the same map"). One big cave, Zelda screen by
// Zelda screen (Field.buildExploreWorld). The night remembers it: screens walked, places searched, patches picked and vermin
// killed stay that way for every outing until the party breaks camp. The tile you chose sets what you are out there to do.
// Rivers stop you except at the fords, the chasm except on its bridges; webs, muck and wading slow you. The lantern is the clock:
// every hour of the night brings the book's encounter roll, and a lantern that dies away from the fire costs a level of Exhaustion.
const EXB={x0:84,y0:132,x1:FW-84,y1:FH-66,my:270};
const TERRAIN_PROPS={"Boneyard":[["remains-bone-pile",4,50],["skull-pile",2,40]],"Cliff and ladder":[["limestone-shelf",3,70],["rock-spire",2,90]],"Crystal clusters":[["crystal-spire-large",3,90],["crystal-spire-small",4,50],["crystal-violet-floor",2,40]],
  "Fungus cavern":[["fungi-zurkhwood",2,100],["fungi-barrelstalk",2,64],["fungi-violet",2,60],["fungi-torchstalk",2,56],["mushroom-stump",2,56]],"Gas leak":[["trap-poison-gas-vent",2,48],["spores",4,44]],"Gorge":[["sinkhole",1,110],["rock-spire",2,90]],
  "High ledge":[["limestone-shelf",4,70]],"Horrid sounds":[["claw-gouges",3,44],["footprints",3,40]],"Lava swell":[["lava-swell",1,100],["scorch-mark",3,44]],"Muck pit":[["muck-pit",1,90],["slime-pool",1,44]],
  "Rockfall":[["rubble-pile",3,50],["cave-in-debris",2,70],["boulder",3,48]],"Rope bridge":[["rope-bridge",1,150]],"Ruins":[["collapsed-column",4,80]],"Shelter":[["limestone-shelf",2,70],["moss-carpet",3,40],["cave-fern",2,44]],
  "Sinkhole":[["sinkhole",1,120]],"Slime or mold":[["mold-patch",3,44],["slime-pool",2,44]],"Steam vent":[["steam-vent",3,70]],"Underground stream":[["reeds",4,56]],"Warning sign":[["trap-glyph-rune",1,70]],
  "Webs":[["web-curtain",2,80],["spider-nest",1,64]]};
const VPX=64, SCW=15, SCH=9, YOFF=-18; // one vertex = 64 px; a screen = 15×9 cells, cropped 18 px top and bottom
const fWTiles={water:new Image(),chasm:new Image()};
function fWTile(g,set,key,x,y,r){ const lut=set==="rock"?FA.tiles.lut:FA.wtiles[set].lut, img=set==="rock"?fTiles:fWTiles[set]; const opts=lut[key]||lut.LLLL; const [sx,sy]=opts[Math.floor((r?r():0)*opts.length)%opts.length];
  g.imageSmoothingEnabled=false; g.save(); g.filter=(FGRADE[biome]||FGRADE.tunnels)+(set==="water"?" saturate(1.6) brightness(1.15)":set==="chasm"?" brightness(.8)":""); g.drawImage(img,sx,sy,32,32,x,y,VPX,VPX); g.restore(); }
let NIGHT=null; // the map and everything done to it tonight
// ===== CLASS KITS (Sam, 9/28: "give some bonuses in the game based on abilities") =============================
// The kit is Field.fieldKit(sheet): the dice stay the SRD's (sheet to-hit, cantrip damage), Sam's multipliers ride on top.
// Live sheet rows 2026-09-28. Kenta's sheet knows Ray of Frost and Chill Touch, not Fire Bolt, so he fires Ray of Frost.

// ===== FIELD SOUND (Sam, 9/28: "attacking should make some sounds just like hits; arrows should sound different
// than melee; walking should make a subtle sound depending on the character"). Clips are Sam's own sound bank
// (vtt-assets/sfx, the same files the battle board plays), trimmed and re-encoded small. One AudioContext, decoded
// buffers, a fresh source per play, so overlapping hits cost nothing.
const FSFX=window.AOP_FSFX;
const fAu={ctx:null,buf:{},gain:null};
function fAudio(){ if(fAu.ctx) return fAu.ctx; try{ fAu.ctx=new (window.AudioContext||window.webkitAudioContext)(); fAu.gain=fAu.ctx.createGain(); fAu.gain.gain.value=.9; fAu.gain.connect(fAu.ctx.destination);
    for(const [k,uri] of Object.entries(FSFX)){ const bin=atob(uri.slice(uri.indexOf(",")+1)), u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i); fAu.ctx.decodeAudioData(u.buffer).then(b=>fAu.buf[k]=b).catch(()=>{ (fAu.bad||(fAu.bad={}))[k]=true; }); } }catch(e){ fAu.ctx=null; } return fAu.ctx; }
["pointerdown","keydown"].forEach(ev=>window.addEventListener(ev,()=>{ const c=fAudio(); if(c&&c.state==="suspended") c.resume(); },{passive:true}));
function sfx(name,{vol=.6,rate=1,jitter=.06}={}){ const c=fAu.ctx; if(!c) return; const names=Array.isArray(name)?name:[name]; const n=names[Math.floor(Math.random()*names.length)]; const b=fAu.buf[n]; if(!b) return;
  const s=c.createBufferSource(); s.buffer=b; s.playbackRate.value=rate*(1+(Math.random()*2-1)*jitter); const g=c.createGain(); g.gain.value=vol; s.connect(g); g.connect(fAu.gain); s.start(); }
const STEPS={gravel:[0,1,2,3].map(i=>"step_gravel_"+i),sneak:[0,1,2,3].map(i=>"step_sneak_"+i),water:[0,1,2,3].map(i=>"step_water_"+i)};
// each character's footfall: a rogue's soft-soled pad, a sorcerer's ordinary tread, the cleric's heavier boots, the bard in between
const GAIT={freia:{set:"sneak",stride:40,vol:.16,rate:1.12},kenta:{set:"gravel",stride:46,vol:.14,rate:1.06},samson:{set:"gravel",stride:50,vol:.22,rate:.84},scott:{set:"gravel",stride:44,vol:.17,rate:.97}};
function fFootstep(L,dist,tile){ const g=GAIT[PARTY[ME].slug]||GAIT.kenta; L.stepAcc=(L.stepAcc||0)+dist; if(L.stepAcc<g.stride) return; L.stepAcc=0;
  const wet=tile===F.T.FORD||tile===F.T.DEEP||tile===F.T.MUCK; sfx(STEPS[wet?"water":g.set],{vol:g.vol*(wet?1.3:1),rate:g.rate,jitter:.08}); }
const SPELLSND={fire:["magic_fire_release","magic_impact_fire"],frost:["magic_cold_release","magic_impact_cold"],necrotic:["magic_necrotic_release","magic_impact_necrotic"],force:["magic_eldritch_release","magic_impact_force"],radiant:["magic_holy_release","magic_impact_force"]};

// ===== SANDBOX TUNING (Sam, 9/29: "a sandbox for the camp so I can take my notes and edit in real time").
// Sam's house-rule numbers, live: the Sandbox drawer edits these and the game reads them at the moment of use.
// Defaults are the values in lib/camp-field.ts; anything changed here is a proposal until it goes back into the engine.
// keys typed into a text box (the Sandbox notes, a number field) are the typist's, not the game's
const fTyping=(e)=>{ const x=e.target; return !!(x&&(x.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(x.tagName||""))&&x.type!=="checkbox"); };
var TUNE_DEFAULTS={moveSpeedPct:100,attackSpeedPct:100,magicUses:3,wolfSpeedFt:40,deathSaveSec:10,powerUses:3,wildShapeUses:2,sneakUses:2,holdSec:.45,thunderChargeSec:1.8,powerCooldownPct:100,sneakRecheckSec:10,wolfIgnorePct:35,sorcererSlowPct:25};
var TUNE=Object.assign({},TUNE_DEFAULTS);
const FSPELL={freia:{class:"rogue",str:8,dex:17,prof:2},kenta:{class:"sorcerer",str:12,dex:10,cha:17,prof:2,spellAbility:"cha",cantrips:["Ray of Frost","Shocking Grasp","Minor Illusion","Chill Touch"]},samson:{class:"cleric",str:11,dex:15,wis:16,prof:2,spellAbility:"wis",prepared:["Healing Word"]},scott:{class:"bard",str:8,cha:15,dex:14,prof:2,spellAbility:"cha",prepared:["Sleep","Healing Word"]}};
let KITPICK="";
// Live sheet_skill_proficiencies 2026-09-28: none of the four player characters is proficient in Survival.
const FSURV={freia:{wis:12,prof:2,skills:{stealth:"expertise",athletics:"proficient",deception:"proficient",intimidation:"proficient",investigation:"proficient",sleight_of_hand:"expertise"}},kenta:{wis:8,prof:2,skills:{Insight:"proficient",Stealth:"proficient",Acrobatics:"proficient",Persuasion:"proficient","Animal Handling":"proficient"}},samson:{wis:16,prof:2,skills:{Insight:"proficient",Medicine:"proficient",Religion:"proficient"}},scott:{wis:12,prof:2,skills:{}}};
let SURVPICK="", SURVADV=false, GEARPICK=""; // mock only
const fSurv=()=>{ const s=FSURV[PARTY[ME].slug]||{wis:10,prof:2,skills:{}}; return {abilityMod:Math.floor((s.wis-10)/2),prof:s.prof,level:SURVPICK||F.skillLevel(s.skills),advantage:SURVADV}; };  // mock only: "try as" another class, on this character's own numbers
const fKit=()=>{ const s=FSPELL[PARTY[ME].slug]||{}; const armed=!/unarmed/i.test(fHeroSheet().atk.name||""); const k=F.fieldKit({...s,armed,class:KITPICK||s.class||""}); if(k.cls==="sorcerer"&&k.ranged) k.ranged={...k.ranged,cooldown:1.2*(1+TUNE.sorcererSlowPct/100)};
  // a borrowed caster class with no cantrip list gets the class's signature one, so the preview has something to fire
  if(KITPICK&&(KITPICK==="wizard"||KITPICK==="sorcerer")&&!k.ranged){ const m=Math.floor(((s.cha||s.int||10)-10)/2); k.ranged={name:"Fire Bolt",toHit:2+m,damage:"1d10",cooldown:KITPICK==="sorcerer"?1.2*F.SORCERER_SPELL_COOLDOWN:1.2,kind:"fire"}; k.notes.push("Preview: Fire Bolt borrowed for the try-out"); }
  const aS=100/Math.max(10,TUNE.attackSpeedPct); k.melee={...k.melee,cooldown:k.melee.cooldown*aS}; if(k.ranged) k.ranged={...k.ranged,cooldown:k.ranged.cooldown*aS,...(k.ranged.drawSeconds!=null?{drawSeconds:k.ranged.drawSeconds*aS}:{})};
  if(k.heal) k.heal={...k.heal,uses:TUNE.magicUses}; if(k.special&&k.special.uses!=null) k.special={...k.special,uses:TUNE.magicUses};
  return k; };
const BEASTS=new Set(["giant-rat","giant-bat","giant-fire-beetle","deep-rothe","giant-spider"]);
const SIMPLE=new Set(["giant-rat","giant-bat","giant-fire-beetle"]); // CR ≤ 1/4 — what the song can lull
const SHOT={fire:{fly:"pxFireball",hit:"fireImpact",speed:560,size:34},frost:{fly:"pxIce",hit:"frostImpact",speed:560,size:34},necrotic:{fly:"pxPsychic",hit:"necroImpact",speed:520,size:34},force:{fly:"pxMissile",hit:"eldImpact",speed:760,size:30},arrow:{fly:null,hit:"physicalImpact",speed:900,size:40},radiant:{fly:null,hit:"healingShimmer",speed:720,size:36}};
function fRoll(expr){ const p=F.parseDice(expr); if(!p) return 0; let t=p.mod; for(let i=0;i<p.n;i++) t+=1+Math.floor(rng()*p.d); return Math.max(0,t); }
function fKitStart(L){ L.kit=fKit(); L.ammo=L.kit.ranged&&L.kit.ranged.ammo!=null?L.kit.ranged.ammo:null; L.bowDraw=null; L.shots=[]; L.rangedCool=0; L.specCool=0; L.aura=0; L.still=0; L.healUses=L.kit.heal?L.kit.heal.uses:0; L.specUses=L.kit.special&&L.kit.special.uses?L.kit.special.uses:null; L.power=fPowerSpec(); L.powUses=L.power?L.power.uses:0; L.wolf=null; L.sneak=null; L.leap=null; L.leapZ=0; L.powCool=0; L.hold=null; L.shield=false; L.rage=0; L.pfx=[]; L.sparks=[]; L.quip=null; fKitButtons(L); }
function fKitButtons(L){ const k=L.kit; $("fldforage").hidden=L.mode!=="forage"; $("fldatk").hidden=(!k.melee.can&&!L.power)||L.mode==="hunt"; $("fldatk").innerHTML=L.wolf?`🐺 Bite <small style="opacity:.6">(left or right click / E · hold: change back)</small>`:`${k.melee.can?(k.melee.unarmedOnly?"👊 Strike":!k.melee.weapon&&/unarmed/i.test(fHeroSheet().atk.name||"")?"👊 Punch":"⚔ Attack"):"✦ Cast"} <small style="opacity:.6">(click / E${L.power?` · hold: ${L.power.name} ×${L.powUses}`:""})</small>`; if(L.wolf) $("fldatk").hidden=L.mode==="hunt";
  $("fldcast").hidden=!k.ranged; if(k.ranged) $("fldcast").innerHTML=`${k.ranged.kind==="arrow"?`➹ ${k.ranged.name} ×${L.ammo}`:`✦ ${k.ranged.name}`} <small style="opacity:.6">(${k.ranged.kind==="arrow"?"hold ":""}right click / F)</small>`; $("fldcast").disabled=!!(k.ranged&&k.ranged.kind==="arrow"&&L.ammo<=0);
  const sp=k.heal?`✚ ${k.heal.name} ×${L.healUses}`:k.special?`${k.special.kind==="music"?"♪":k.special.kind==="entangle"?"❦":"☀"} ${k.special.name}${L.specUses!=null?` ×${L.specUses}`:""}`:"";
  $("fldspec").hidden=!sp; $("fldspec").innerHTML=`${sp} <small style="opacity:.6">(${k.ranged?"Q":"right click / Q"})</small>`; $("fldspec").disabled=(k.heal&&L.healUses<=0)||(L.specUses!=null&&L.specUses<=0)||!!L.wolf; $("fldcast").disabled=$("fldcast").disabled||!!L.wolf; if(L.sneak) $("fldatk").innerHTML=`🗡🗡 Sneak attack <small style="opacity:.6">(click / E — leap from hiding)</small>`; }
// aim: the facing, bent toward the nearest foe inside a 35° cone (the kindness every Zelda gives you)
function fAim(L){ const H=L.hero; let [vx,vy]=DIRV[H.dir]||[0,1]; const n=Math.hypot(vx,vy); vx/=n; vy/=n; let best=null, bd=560;
  for(const e of L.foes){ if(e.dead) continue; const dx=e.x-H.x, dy=e.y-H.y+40, d=Math.hypot(dx,dy); if(d<bd&&(dx*vx+dy*vy)/d>.82){ bd=d; best=[dx/d,dy/d]; } } return best||[vx,vy]; }
function fFire(at){ const L=FLD; if(L&&L.wolf){ fWolfBite(L,at); return; } if(L&&L.sneak) fSneakEnd(L,"loosing an arrow gives her away"); if(!L||!L.kit||L.busy||L.ended||L.down) return; if(!L.kit.ranged){ if(at) fPop(at.x-L.ox(),at.y-L.oy(),"no bow or spell","#8a8078"); return; } if(L.rangedCool>0) return; const R=L.kit.ranged, H=L.hero; if(at) H.dir=dirFrom(at.x-H.x,at.y-(H.y-52));
  L.rangedCool=R.cooldown; H.act=R.kind==="arrow"?"attack":"cast"; H.actT=0; H.bow=R.kind==="arrow"?(R.name==="Longbow"?"longbow":"shortbow"):null; let [vx,vy]=fAim(L); if(at){ const ax=at.x-(H.x), ay=at.y-(H.y-52), an=Math.hypot(ax,ay)||1; vx=ax/an; vy=ay/an; } const sp=SHOT[R.kind].speed;
  sfx(R.kind==="arrow"?"combat_bow_release":SPELLSND[R.kind][0],{vol:R.kind==="arrow"?.6:.45,rate:R.kind==="force"?1.15:1}); L.shots.push({x:H.x+vx*26,y:H.y-52+vy*16,vx:vx*sp,vy:vy*sp,life:.95,R,kind:R.kind,t:0}); L.still=0; }

// ===== BLOOD, ARROWS, CARCASSES (Sam, 9/29): a hit knocks the target back a little and sprays blood that spatters on
// the ground — player or monster. Arrows that hit stay lodged. The slain fall and stay: fresh, then fly-blown, then
// bones (lib/camp-field carcassStage). Hold Space at a body to butcher it — a hard Survival-or-Nature roll
// (lib/camp-field butcher); what is left after is bones. Meat off a fly-blown body is likely spoiled and may poison.
const FINT={freia:12,kenta:9,samson:12,scott:10};  // sheets (characters.int_score)
const MONSIZE={"giant-toad":"Large","giant-rat":"Small","diseased-giant-rat":"Small","giant-fire-beetle":"Small","giant-bat":"Large","deep-rothe":"Medium","orog":"Medium","chuul":"Large","grick":"Medium","ochre-jelly":"Large","giant-spider":"Large","hook-horror":"Large","giant-lizard":"Large","male-steeder":"Medium","female-steeder":"Large","carrion-crawler":"Large","umber-hulk":"Large","grell":"Medium","piercer":"Medium"};
const MONTYPE={"orog":"humanoid (orc)","chuul":"aberration","grell":"aberration","grick":"monstrosity","hook-horror":"monstrosity","carrion-crawler":"monstrosity","umber-hulk":"monstrosity","piercer":"monstrosity","ochre-jelly":"ooze"};
const ICHOR=new Set(["giant-fire-beetle","giant-spider","male-steeder","female-steeder","chuul","carrion-crawler","hook-horror","umber-hulk"]);
const bloodCol=(slug)=>slug==="ochre-jelly"?[196,150,40]:ICHOR.has(slug)?[92,120,40]:[150,14,24];
function fBleed(L,wx,wy,dx,dy,n,slug){ const b=L.blood||(L.blood=[]); const a0=Math.atan2(dy||0,dx||(Math.random()-.5)), c=bloodCol(slug);
  for(let i=0;i<n;i++){ const a=a0+(Math.random()-.5)*1.4, sp=40+Math.random()*110; b.push({x:wx,y:wy,z:26+Math.random()*26,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp*.55,vz:30+Math.random()*90,s:1+Math.random()*2,c}); } }
function fBloodTick(L,dt){ const b=L.blood; if(!b||!b.length) return; const st=L.stains||(L.stains=[]);
  for(let i=b.length-1;i>=0;i--){ const p=b[i]; p.vz-=560*dt; p.z+=p.vz*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; if(p.z<=0){ st.push({x:p.x,y:p.y,r:Math.round(p.s*(1+Math.random()*1.4)),c:p.c,a:.8}); b.splice(i,1); } }
  if(st.length>320) st.splice(0,st.length-320); }
function fBloodDrawGround(L,ox,oy){ const st=L.stains; if(!st) return; fg.save(); for(const q of st){ const x=Math.round(q.x-ox), y=Math.round(q.y-oy); if(x<-10||x>FW+10||y<-10||y>FH+10) continue;
    fg.fillStyle=`rgba(${q.c[0]*.7|0},${q.c[1]*.7|0},${q.c[2]*.7|0},${q.a})`; fg.fillRect(x-q.r,y-Math.max(1,q.r>>1),q.r*2,Math.max(2,q.r)); } fg.restore(); }
function fBloodDrawAir(L,ox,oy){ const b=L.blood; if(!b||!b.length) return; fg.save(); for(const p of b){ fg.fillStyle=`rgb(${p.c[0]},${p.c[1]},${p.c[2]})`; const s=Math.max(2,Math.round(p.s*1.4)); fg.fillRect(Math.round(p.x-ox),Math.round(p.y-oy-p.z),s,s); } fg.restore(); }
// an arrow stuck in a body: shaft in the direction it flew, only the back half and the fletching showing
function fArrowStuck(x,y,a){ fg.save(); fg.translate(x,y); fg.rotate(a); fg.fillStyle="#1a120c"; fg.fillRect(-15,-1.5,16,3); fg.fillStyle="#8a5a32"; fg.fillRect(-14,-.5,15,1.5); fg.fillStyle="#e8e0cc"; fg.fillRect(-18,-3,5,2); fg.fillRect(-18,1,5,2); fg.restore(); }
function fLodge(e,s){ const a=e.arrows||(e.arrows=[]); if(a.length>=6) a.shift(); a.push({dx:(Math.random()-.5)*.5,h:.3+Math.random()*.4,a:Math.atan2(s.vy,s.vx)}); }
function fDrawArrowsOn(slug,arrows,x,y,faceRight){ if(!arrows||!arrows.length) return; const h=MONH[slug]||60; for(const q of arrows) fArrowStuck(x+q.dx*h*(faceRight?1:-1),y-q.h*h,q.a); }
function fCorpseFrom(L,e){ const c={slug:e.slug,name:e.name,x:e.x,y:e.y,face:e.face,arrows:(e.arrows||[]).slice(),born:L.t,fall:0,harvested:!!e.prey,size:MONSIZE[e.slug]||"Medium",type:MONTYPE[e.slug]||"beast",flies:[]};
  (L.corpses||(L.corpses=[])).push(c); e.fade=0; fBleed(L,e.x,e.y-20,0,0,10,e.slug); return c; }
const fCorpseStage=(L,c)=>F.carcassStage(L.t-c.born,c.harvested);
function fCorpsesDraw(L,ox,oy){ const cs=L.corpses; if(!cs) return; for(const c of cs){ const x=c.x-ox, y=c.y-oy; if(x<-120||x>FW+120||y<-120||y>FH+120) continue; c.fall=Math.min(1,c.fall+1/60/.35);
    const st=fCorpseStage(L,c);
    if(st==="bones"&&c.fall>=1){ fDrawProp("remains-bone-pile",x,y+4,MONSIZE[c.slug]==="Large"?46:34,.95); continue; }
    const h=MONH[c.slug]||60, ang=c.fall*1.45*(c.face?-1:1), cy=y-h/2+c.fall*(h/2-h*.2);
    // the pool it lies in
    const pc=bloodCol(c.slug), grow=Math.min(1,(L.t-c.born)/2.5); fg.save(); fg.fillStyle=`rgba(${pc[0]*.55|0},${pc[1]*.55|0},${pc[2]*.55|0},${.75*grow})`; fg.beginPath(); fg.ellipse(x,y-2,h*.55*grow,h*.18*grow,0,0,7); fg.fill(); fg.restore();
    fg.save(); fg.translate(x,cy); fg.rotate(ang); fg.filter=st==="flies"?"brightness(.5) saturate(.55) sepia(.25)":"brightness(.68) saturate(.8)";
    fDrawMon(c.slug,0,h/2,c.face,1,0,true,false); fg.filter="none"; fDrawArrowsOn(c.slug,c.arrows,0,h/2,c.face); fg.restore();
    if(st==="flies"){ const t=L.t; fg.save(); for(let i=0;i<12;i++){ const a=t*(2.6+i*.41)+i*2.1, r=8+((i*13)%24), fx=Math.round(x+Math.cos(a)*r*1.5), fy=Math.round(cy-14+Math.sin(a*1.3)*r*.7-Math.abs(Math.sin(t*7+i))*6);
      fg.fillStyle="#141712"; fg.fillRect(fx,fy,3,3); if(Math.floor(t*14+i)%2){ fg.fillStyle="rgba(215,225,200,.85)"; fg.fillRect(fx-1,fy-1,2,1); fg.fillRect(fx+2,fy-1,2,1); } } fg.restore(); } } }
function fCorpseNear(L){ const cs=L.corpses; if(!cs) return null; const H=L.hero; let best=null, bd=80; for(const c of cs){ const d=Math.hypot(c.x-H.x,c.y-H.y); if(d<bd){ bd=d; best=c; } } return best; }
function fButcher(L,c){ const p=PARTY[ME], sv=fSurv(), s=FSURV[p.slug]||{skills:{}}; const st=fCorpseStage(L,c), x=c.x-L.ox(), y=c.y-L.oy()-60;
  const nat=F.skillBonus({abilityMod:Math.floor(((FINT[p.slug]||10)-10)/2),prof:s.prof||2,level:F.skillLevel(s.skills,"nature")});
  const r=F.butcher({stage:st,size:c.size,creatureType:c.type,name:c.name,slug:c.slug,survival:F.skillBonus(sv),nature:nat,conMod:Math.floor(((p.con||10)-10)/2),advantage:sv.advantage},rng); L.log.push(r.note);
  if(st!=="bones") c.harvested=true;
  if(r.food>0){ supplies+=r.food; $("sup").textContent=supplies; if(r.meat) PACK[r.meat.slug]=(PACK[r.meat.slug]||0)+r.food; for(let i=0;i<r.food;i++) (L.gathered||(L.gathered=[])).push(r.meat?r.meat.name.toLowerCase():"a day of food"); sfx("ui_item_pickup",{vol:.4}); fBuzz([20,40,20]); fPop(x,y,`+${r.food} ${r.meat?r.meat.name:"day"+(r.food===1?"":"s")+" of meat"}`,"#e3b95c"); }
  if(r.parts&&r.parts.length){ r.parts.forEach(pp=>{ PACK[pp.slug]=(PACK[pp.slug]||0)+1; (L.gathered||(L.gathered=[])).push(pp.name.toLowerCase()); }); fPop(x,y-24,`cut free: ${r.parts.map(pp=>pp.name).join(", ")}`,"#c9a0ff"); }
  if(r.food>0){} else if(r.spoiled){ fPop(x,y,"spoiled — it reeks","#9adf6a"); if(r.poisoned) fStatus(L,"poisoned"); }
  else if(!(r.parts&&r.parts.length)) fPop(x,y,st==="bones"?"only bones":r.check?"nothing worth keeping":"nothing to eat here","#8a8078");
  fBleed(L,c.x,c.y-10,0,0,st==="bones"?0:6,c.slug); sfx(STEPS.gravel,{vol:.14,rate:.6}); }
function fStrikeFoe(L,e,a,{mul=1,halve=false,knock=0,hitFx="physicalImpact",dirx=0,diry=0,snd=null}={}){ const OX=L.ox(),OY=L.oy(); if(a.hit){ if(snd) sfx(a.crit?"combat_crit_hit":snd,{vol:.65}); if(Math.random()<.6) setTimeout(()=>sfx("creature_hurt_beast",{vol:.28,rate:BEASTS.has(e.slug)?1.25:.9}),90); }
  if(e.asleep){ e.asleep=0; fPop(e.x-OX,e.y-OY-110,"wakes!","#b9e0ff"); } e.calm=false;
  if(a.hit){ const dmg=F.kitDamage(a.damage,{mul,halve}); e.hp-=dmg; e.flash=.4; const Hh=L.hero, pdx=dirx||(e.x-Hh.x), pdy=diry||(e.y-Hh.y), pd=Math.hypot(pdx,pdy)||1; if(knock&&!e.held){ e.kx=dirx*knock; e.ky=diry*knock; } else if(!e.held){ e.kx=pdx/pd*170; e.ky=pdy/pd*170; } fBleed(L,e.x,e.y-(MONH[e.slug]||60)*.45,pdx/pd,pdy/pd,a.crit?16:8,e.slug); L.fx.push({k:hitFx,x:e.x-OX,y:e.y-OY-30,s:90,t:0}); fPop(e.x-OX,e.y-OY-60,`${dmg}${a.crit?"!":""}${mul>1?` ×${mul}`:""}`,mul>1?"#ffe28a":"#ffd36a");
    if(e.hp>0&&!(e.fleeT>0)){ const bl=e.hp<=e.max/2; const m=F.moraleBreaks({hp:e.hp,max:e.max,crit:a.crit,mindless:e.slug==="ochre-jelly",alreadyTested:e.moraleTested},rng); if(bl) e.moraleTested=true;
      if(m.flees){ e.fleeT=6; e.calm=false; fPop(e.x-OX,e.y-OY-110,"it flees!","#e3b95c"); L.log.push(`${e.name}: ${m.note}.`); sfx("creature_hurt_beast",{vol:.35,rate:1.4}); } }
    if(e.hp<=0){ e.dead=true; fCorpseFrom(L,e); if(e.prey) fPreyWon(L,e); (L.kills||(L.kills={}))[e.name]=((L.kills||{})[e.name]||0)+1; sfx("creature_death_beast",{vol:.4,rate:1.2}); fPop(e.x-OX,e.y-OY-90,`${e.name} slain`,"#e3b95c"); L.slain=(L.slain||0)+1; } }
  else fPop(e.x-OX,e.y-OY-60,"miss","#b9e0ff"); L.log&&L.log.push(a.note+(a.hit&&(mul!==1||halve)?` → ${F.kitDamage(a.damage,{mul,halve})} with the field kit (${halve?"halved":"×"+mul})`:"")); }
function fSpecial(at){ const L=FLD; if(L&&L.wolf){ fWolfNo(L); return; } if(!L||!L.kit||L.busy||L.ended||L.down) return; const k=L.kit, H=L.hero, p=PARTY[ME], OX=L.ox(), OY=L.oy();
  if(k.heal){ if(L.healUses<=0||L.hp>=L.hpMax){ if(L.hp>=L.hpMax) fPop(H.x-OX,H.y-OY-120,"already whole","#9adf9a"); return; }
    const amt=fRoll(k.heal.dice); L.healUses--; L.hp=Math.min(L.hpMax,L.hp+amt); PARTY[ME].hp=L.hp; me().hp=L.hp; H.act="cast"; H.actT=0;
    sfx("combat_heal",{vol:.55}); L.fx.push({k:"healingShimmer",x:H.x-OX,y:H.y-OY-50,s:150,t:0}); fPop(H.x-OX,H.y-OY-120,`+${amt} ${k.heal.name}`,"#8dffa0"); L.log.push(`${k.heal.name}: ${k.heal.dice} = ${amt} HP`); fKitButtons(L); return; }
  const s=k.special; if(!s) return;
  if(s.kind==="music"){ if(L.specUses<=0) return; L.specUses--; H.act="cast"; H.actT=0; let n=0;
    for(const e of L.foes){ if(e.dead||Math.hypot(e.x-H.x,e.y-H.y)>s.radius) continue; if(SIMPLE.has(e.slug)){ e.asleep=20; n++; } else fPop(e.x-OX,e.y-OY-100,"unmoved","#c9a0ff"); }
    sfx("spells_control-slumber-fall",{vol:.5}); L.fx.push({k:"pxSwirl",x:H.x-OX,y:H.y-OY-60,s:120,t:0,loops:3}); L.song=1.6; fPop(H.x-OX,H.y-OY-130,n?`♪ ${n} asleep`:"♪ nothing listening","#c9a0ff"); fKitButtons(L); return; }
  if(L.specCool>0) return;
  if(s.kind==="entangle"){ const from=at||H; let best=null,bd=at?160:420; for(const e of L.foes){ if(e.dead||Math.hypot(e.x-H.x,e.y-H.y)>480) continue; const d=Math.hypot(e.x-from.x,(e.y-(at?40:0))-from.y); if(d<bd){ bd=d; best=e; } }
    if(!best){ fPop(H.x-OX,H.y-OY-120,"no one in reach","#9adf9a"); return; } sfx("magic_nature_release",{vol:.5}); L.specCool=s.cooldown; best.held=s.seconds; best.kx=0; best.ky=0; H.act="cast"; H.actT=0; fPop(best.x-OX,best.y-OY-100,"entangled","#9adf9a"); L.log.push(`Entangle holds the ${best.name.toLowerCase()} for ${s.seconds}s`); return; }
  if(s.kind==="aura"){ sfx("magic_holy_release",{vol:.55}); L.specCool=s.cooldown; L.aura=s.seconds; H.act="cast"; H.actT=0; fPop(H.x-OX,H.y-OY-130,`☀ ${s.name} — ×${s.mul}`,"#ffe28a"); return; } }
// per-frame: cooldowns, the aura, the monk's stillness, calm beasts, and shots in flight
function fKitTick(L,dt){ const k=L.kit; if(!k) return; fHoldTick(L,dt); const H=L.hero, OX=L.ox(), OY=L.oy();
  L.rangedCool=Math.max(0,L.rangedCool-dt); L.specCool=Math.max(0,L.specCool-dt); L.aura=Math.max(0,L.aura-dt); L.song=Math.max(0,(L.song||0)-dt);
  if(k.regen){ if(H.moving||H.act){ L.still=0; } else { L.still+=dt; if(L.still>=k.regen.every&&L.hp<L.hpMax){ L.still=0; L.hp=Math.min(L.hpMax,L.hp+k.regen.hp); PARTY[ME].hp=L.hp; me().hp=L.hp; fPop(H.x-OX,H.y-OY-120,`+${k.regen.hp}`,"#8dffa0"); } } }
  for(const e of L.foes){ if(e.calmRolled===undefined){ e.calmRolled=true; e.calm=k.beastCalm>0&&BEASTS.has(e.slug)&&rng()<k.beastCalm; }
    if(e.asleep>0) e.asleep=Math.max(0,e.asleep-dt); if(e.held>0) e.held=Math.max(0,e.held-dt); }
  for(let i=L.shots.length-1;i>=0;i--){ const s=L.shots[i]; s.t+=dt; s.life-=dt; s.x+=s.vx*dt; s.y+=s.vy*dt; let done=s.life<=0;
    if(!done&&L.tileW(s.x,s.y+30)===F.T.WALL){ done=true; sfx(s.kind==="arrow"?"combat_arrow_hit_stone":SPELLSND[s.kind][1],{vol:.35}); L.fx.push({k:SHOT[s.kind].hit,x:s.x-OX,y:s.y-OY,s:60,t:0}); }
    if(!done) for(const e of L.foes){ if(e.dead) continue; if(Math.hypot(e.x-s.x,(e.y-40)-s.y)>(s.power?44:34)) continue; done=true;
      const a=fHeroRoll(s.R,e.ac,e); const sp=Math.hypot(s.vx,s.vy);
      fStrikeFoe(L,e,a,{halve:!!s.R.halve,knock:s.R.knockback?520:0,hitFx:SHOT[s.kind].hit,dirx:s.vx/sp,diry:s.vy/sp,snd:s.kind==="arrow"?"combat_arrow_hit_flesh":SPELLSND[s.kind][1]});
      if(s.power) fPowerShotHit(L,e,s,a); if(a.hit&&s.kind==="frost"){ e.slowT=6; } if(a.hit&&s.kind==="arrow") fLodge(e,s); break; }
    if(done) L.shots.splice(i,1); } }
// Entangle's vines: the web-wrap sheet, recoloured leaf-green once
let _vine=null; function fVine(){ if(_vine) return _vine; const w=fVfx.pxWebWrap; if(!w||!w.width) return null; const c=document.createElement("canvas"); c.width=w.width; c.height=w.height; const g=c.getContext("2d"); g.drawImage(w,0,0); g.globalCompositeOperation="source-atop"; g.fillStyle="rgba(70,160,60,.75)"; g.fillRect(0,0,c.width,c.height); return _vine=c; }
function fKitDraw(L,ox,oy,sh){ const k=L.kit; if(!k) return; const t=L.t;
  // paladin aura / bard song under and around the hero
  if(L.aura>0){ const g=fVfx.groundHallowed, m=FA.vmeta.groundHallowed; if(g&&g.width){ const fw=g.width/m.cols, fh=g.height/m.rows, fr=Math.floor(t*m.fps)%m.frames; fg.save(); fg.globalAlpha=Math.min(1,L.aura*2); fg.drawImage(g,(fr%m.cols)*fw,Math.floor(fr/m.cols)*fh,fw,fh,sh.x-90,sh.y-60,180,120); fg.restore(); }
    const gl=fg.createRadialGradient(sh.x,sh.y-50,8,sh.x,sh.y-50,120); gl.addColorStop(0,"rgba(255,226,138,.35)"); gl.addColorStop(1,"rgba(255,226,138,0)"); fg.fillStyle=gl; fg.fillRect(sh.x-120,sh.y-170,240,240); }
  if(L.song>0){ const lu=fItem.lute; fg.font="700 20px serif"; fg.textAlign="center"; for(let i=0;i<3;i++){ const a=t*2+i*2.1; fg.fillStyle=`rgba(201,160,255,${Math.min(1,L.song)})`; fg.fillText("♪",sh.x+Math.cos(a)*50,sh.y-80+Math.sin(a*1.3)*20-(1.6-L.song)*40); }
    if(lu&&lu.width){ fg.imageSmoothingEnabled=false; fg.drawImage(lu,sh.x+14,sh.y-78,34,34); } }
  if(k.regen&&L.still>.6&&L.hp<L.hpMax){ const q=Math.min(1,L.still/k.regen.every); fg.save(); fg.globalAlpha=.25+.35*q; const gl=fg.createRadialGradient(sh.x,sh.y-50,4,sh.x,sh.y-50,70); gl.addColorStop(0,"rgba(141,255,160,.6)"); gl.addColorStop(1,"rgba(141,255,160,0)"); fg.fillStyle=gl; fg.fillRect(sh.x-70,sh.y-120,140,140); fg.restore(); fg.font="600 12px Cinzel"; fg.textAlign="center"; fg.fillStyle="#8dffa0"; fg.fillText("meditating…",sh.x,sh.y+22); }
  // status over foes: asleep, held, calm
  for(const e of L.foes){ if(e.dead) continue; const x=e.x-ox, y=e.y-oy, ph=(MONH[e.slug]||60)+16;
    if(e.held>0){ const w=fVine(); if(w){ fg.save(); fg.globalAlpha=.95; fg.imageSmoothingEnabled=false; fg.drawImage(w,x-32,y-54,64,60); fg.restore(); } fg.font="600 12px Cinzel"; fg.textAlign="center"; fg.fillStyle="#9adf9a"; fg.fillText(`held ${Math.ceil(e.held)}`,x,y-ph); }
    else if(e.asleep>0){ fg.font="700 16px Cinzel"; fg.textAlign="center"; fg.fillStyle="#b9e0ff"; fg.fillText(["z","z z","z z z"][Math.floor(t*2)%3],x,y-ph-Math.sin(t*2)*4); }
    else if(e.calm){ fg.font="600 12px Cinzel"; fg.textAlign="center"; fg.fillStyle="#9adf9a"; fg.fillText("❦ calm",x,y-ph); } }
  // shots in flight
  for(const s of L.shots){ const x=s.x-ox, y=s.y-oy, ang=Math.atan2(s.vy,s.vx); fg.save(); fg.translate(x,y); fg.imageSmoothingEnabled=false;
    if(s.kind==="arrow"){ const a=fItem.arrows; fg.rotate(ang+Math.PI/4); if(a&&a.width) fg.drawImage(a,-20,-20,40,40); }
    else { const key=SHOT[s.kind].fly, im=fVfx[key], m=FA.vmeta[key]; fg.rotate(ang); if(s.kind==="force"){ fg.shadowColor="#c76bff"; fg.shadowBlur=14; } if(im&&im.width){ const fw=im.width/m.cols, fh=im.height/m.rows, fr=Math.floor(s.t*m.fps)%m.frames, z=SHOT[s.kind].size; fg.drawImage(im,(fr%m.cols)*fw,Math.floor(fr/m.cols)*fh,fw,fh,-z/2,-z/2,z,z); } }
    fg.restore(); fPowerShotDraw(s,x,y); } }
function fKitHud(L){ const k=L.kit; if(!k) return; const bits=[];
  if(!dmView){ if(k.ranged) bits.push(k.ranged.kind==="arrow"?`${k.ranged.name}: ${L.ammo} arrow${L.ammo===1?"":"s"}`:k.ranged.name);
    if(k.heal) bits.push(`${k.heal.name} ×${L.healUses}`); if(k.special) bits.push(k.special.uses!=null?`${k.special.name} ×${L.specUses}`:L.aura>0?`${k.special.name}!`:L.specCool>0?`${k.special.name} (resting)`:`${k.special.name} ready`);
    if(L.sneak) bits.unshift(`HIDDEN · Stealth +${L.sneak.bonus} · next roll ${Math.ceil(L.sneak.next)}s${L.foes.some(e=>!e.dead&&e.spotsRogue)?" · SEEN by "+L.foes.filter(e=>!e.dead&&e.spotsRogue).length:""}`); if(L.wolf) bits.unshift(`WOLF ${L.wolf.hp}/${L.wolf.max} HP`); if(L.power) bits.push(L.wolf?"hold to change back":`${L.power.name} ×${L.powUses}`+(L.powCool>0&&L.powUses>0?` (${Math.ceil(L.powCool)}s)`:"")+(L.rage>0?` · RAGING ${Math.ceil(L.rage)}s`:""));
    if(!bits.length) return; fg.font="600 12px Cinzel"; fg.textAlign="left"; fg.fillStyle="#cdb57a"; fg.fillText(bits.join(" · "),16,FH-14); return; }
  if(k.melee.weapon) bits.push(`${k.melee.weapon.name}${k.melee.reachMul>1?` · reach ×${k.melee.reachMul}`:""}`); if(k.moveMul>1) bits.push(`swift ×${k.moveMul}`); if(k.melee.mul>1) bits.push(`strikes ×${k.melee.mul}`); if(!k.melee.can) bits.push("no melee");
  if(k.ranged) bits.push(k.ranged.kind==="arrow"?`${k.ranged.name} · ${L.ammo} arrow${L.ammo===1?"":"s"} · draw ${k.ranged.drawSeconds}s`:(L.rangedCool>0?`${k.ranged.name} ${L.rangedCool.toFixed(1)}s`:`${k.ranged.name} ready`));
  if(k.heal) bits.push(`${k.heal.name} ×${L.healUses}`);
  if(k.special){ const s=k.special; bits.push(s.uses!=null?`${s.name} ×${L.specUses}`:L.aura>0?`AURA ${L.aura.toFixed(1)}s`:L.specCool>0?`${s.name} ${Math.ceil(L.specCool)}s`:`${s.name} ready`); }
  if(L.sneak) bits.unshift(`HIDDEN · Stealth +${L.sneak.bonus} · recheck ${L.sneak.next.toFixed(1)}s`); if(L.wolf) bits.unshift(`WOLF ${L.wolf.hp}/${L.wolf.max} HP · AC ${L.wolf.form.ac} · bite +${L.wolf.form.bite.toHit} ${L.wolf.form.bite.damage}`); if(L.power) bits.push(L.wolf?"hold → change back":`${L.power.name} ×${L.powUses}`+(L.powCool>0?` ${L.powCool.toFixed(1)}s`:"")); if(L.rage>0) bits.push(`RAGE ${L.rage.toFixed(1)}s`);
  if(k.regen) bits.push(L.hp<L.hpMax?`meditate ${Math.max(0,k.regen.every-L.still).toFixed(1)}s`:"centred");
  if(k.beastCalm) bits.push(`beasts calm ${Math.round(k.beastCalm*100)}%`); if(k.lightBonus) bits.push("radiant light"); if(k.knockbackOnMiss) bits.push("shoves on a miss");
  fg.font="600 12px Cinzel"; fg.textAlign="left"; fg.fillStyle="#cdb57a"; fg.fillText(`${(KITPICK||k.cls||"").toUpperCase()} · ${bits.join(" · ")}`,16,FH-14); }
// ===== POWER ATTACKS (Sam, 9/29): HOLD the attack — left mouse or E — and each class lets loose its signature move.
// A tap is still an ordinary strike. Dice, saves and DCs come from lib/camp-field fieldPower (SRD); monsters save with
// their own bestiary scores (FSTAT, pulled 2026-09-29 — +0 where the row has none).
const FSTAT={"chuul":{str:19,dex:10,con:16,wis:11},"female-steeder":{str:15,dex:16,con:14,wis:10},"giant-bat":{str:15,dex:16,con:11,wis:12},"giant-fire-beetle":{str:8,dex:10,con:12,wis:7},"giant-lizard":{str:15,dex:12,con:13,wis:10},"giant-rat":{str:7,dex:15,con:11,wis:10},"giant-spider":{str:14,dex:16,con:12,wis:11},"giant-toad":{str:15,dex:13,con:13,wis:10},"grick":{str:14,dex:14,con:11,wis:14},"hook-horror":{str:18,dex:10,con:15,wis:12},"male-steeder":{str:15,dex:12,con:14,wis:10},"ochre-jelly":{str:15,dex:6,con:14,wis:6},"orog":{str:18,dex:12,con:18,wis:11}};
const fStat=(e)=>FSTAT[e.slug]||{};
const PCOL={backstab:"#ff9a7a",smite:"#ffe28a",flurry:"#ffd36a",shock:"#9fd8ff",thunder:"#cfe6ff",vines:"#9adf9a","twin-blast":"#c76bff","guiding-bolt":"#fff2b0","ensnare-arrow":"#9adf9a","rage-throw":"#ff5a4a",shield:"#cfd8e8",mockery:"#c9a0ff"};
const fPowerSpec=()=>{ const p=PARTY[ME], s=FSPELL[p.slug]||{}; const P0=F.fieldPower({...s,class:KITPICK||s.class||"",wis:s.wis??(FSURV[p.slug]||{}).wis,int:s.int??FINT[p.slug],con:p.con}); if(!P0) return P0;
  const P={...P0}; P.uses=P.kind==="wild-shape"?TUNE.wildShapeUses:P.kind==="sneak"?TUNE.sneakUses:TUNE.powerUses; P.hold=P.chargeRelease?TUNE.thunderChargeSec:P.kind==="shield"?Math.min(P0.hold,TUNE.holdSec):P.kind==="ensnare-arrow"?P0.hold:TUNE.holdSec;
  P.cooldown=(P.kind==="shock"?3*(1+TUNE.sorcererSlowPct/100):P0.cooldown)*TUNE.powerCooldownPct/100; if(P.kind==="sneak") P.seconds=TUNE.sneakRecheckSec; if(P.form) P.form={...P.form,ignoredChance:TUNE.wolfIgnorePct/100}; return P; };
const fRangePx=(L,P)=>P.rangeFeet<=5?100*((L.kit&&L.kit.melee.reachMul)||1):Math.min(560,P.rangeFeet*8);
function fPowerTarget(L,px,at){ const H=L.hero; let best=null,bd=1e9; for(const e of L.foes){ if(e.dead||e.leaving||e.thrown) continue; const d=Math.hypot(e.x-H.x,e.y-H.y); if(d>px) continue; const s=at?Math.hypot(e.x-at.x,(e.y-40)-at.y):d; if(s<bd){ bd=s; best=e; } } return best; }
// advantage (the rogue's backstab), cancelled by the hero's own disadvantage (SRD)
function fAdvRoll(st,e){ const S=FLD&&FLD.status; if(S&&(S.poisoned>0||S.blinded>0)) return F.rollAttack(st,e.ac,rng); const a=F.rollAttack(st,e.ac,rng), b=F.rollAttack(st,e.ac,rng); const w=(b.crit&&!a.crit)||(b.hit&&!a.hit)||(b.hit===a.hit&&b.total>a.total)?b:a; if(e.marked>0) e.marked=0; w.note+=" (advantage)"; return w; }
// a monster's attack with disadvantage once it has been mocked
function fFoeRoll(e,s,ac){ if(FLD&&FLD.wolf) ac=FLD.wolf.form.ac; const a=F.rollAttack(s,ac,rng); if(!(e.rattled>0)) return a; e.rattled=0; const b=F.rollAttack(s,ac,rng); const w=b.total<a.total?b:a; w.note+=" (disadvantage — still smarting from the insult)"; return w; }

function fHoldStart(at){ const L=FLD; if(!L||!L.foes||L.busy||L.ended||L.down||fNoAct(L)) return; if(!L.power){ fSwing(at); return; } if(L.hold) return; L.hold={t:0,at,fired:false,full:false}; if(at) L.mouse=at; }
function fHoldEnd(){ const L=FLD; if(!L||!L.hold) return; const h=L.hold, P=L.power; L.hold=null; if(L.shield){ L.shield=false; return; } if(h.fired) return;
  const aim=h.at?(L.mouse||h.at):null;
  if(P.chargeRelease&&h.t>=P.hold){ fPower(L,aim); return; }
  if(h.t>=F.POWER_HOLD_SECONDS){ fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-130,"not fully charged","#8a8078"); return; }
  fSwing(h.at); }
function fHoldTick(L,dt){ fSneakTick(L,dt); fLeapTick(L,dt); L.powCool=Math.max(0,(L.powCool||0)-dt); L.rage=Math.max(0,(L.rage||0)-dt); L.flash=Math.max(0,(L.flash||0)-dt); if(L.quip){ L.quip.t-=dt; if(L.quip.t<=0) L.quip=null; }
  for(const e of L.foes){ if(e.marked>0) e.marked=Math.max(0,e.marked-dt); if(e.prone>0) e.prone=Math.max(0,e.prone-dt); if(e.thrown) fThrowTick(L,e,dt);
    if(e.bite>0){ e.bite-=dt; if(e.bite<=0&&!e.dead&&e.held>0){ const dmg=fRoll(e.biteDice||"1d6"); fStrikeFoe(L,e,{hit:true,crit:false,damage:dmg,note:`The vines bite the ${e.name.toLowerCase()}: ${dmg} piercing`},{knock:0,hitFx:"physicalImpact",snd:"combat_arrow_hit_flesh"}); } } }
  fPowFxTick(L,dt);
  const h=L.hold, P=L.power; if(!h||!P) return; if(L.down||L.busy){ L.hold=null; L.shield=false; return; } h.t+=dt; const H=L.hero; if(h.at&&L.mouse) H.dir=dirFrom(L.mouse.x-H.x,L.mouse.y-(H.y-52));
  if(P.kind==="shield"){ if(h.t>=P.hold&&!L.shield&&!h.fired&&L.powUses<=0){ h.fired=true; fPop(H.x-L.ox(),H.y-L.oy()-130,"no Shield wall left this outing","#8a8078"); } if(h.t>=P.hold&&!L.shield&&!h.fired){ L.shield=true; h.fired=true; fSpend(L); fSynth("clang",.45); fPop(H.x-L.ox(),H.y-L.oy()-130,"shield up","#cfd8e8"); } return; }
  if(P.chargeRelease){ if(h.t>.15){ H.act="cast"; H.actT=.1; } if(h.t>=P.hold&&!h.full){ h.full=true; fSynth("charge",.4); } return; }
  if(!h.fired&&h.t>=P.hold){ h.fired=true; if(L.sneak) fPop(H.x-L.ox(),H.y-L.oy()-130,"already hidden — strike to leap","#9ab8d8"); else if(L.wolf) fRevert(L,true); else fPower(L,h.at?(L.mouse||h.at):null); } }

function fPower(L,at){ const P=L.power, H=L.hero, OX=L.ox(), OY=L.oy(); if(!P) return;
  if(L.powUses<=0){ fPop(H.x-OX,H.y-OY-130,`no ${P.name} left this outing`,"#8a8078"); return; }
  if(L.powCool>0){ fPop(H.x-OX,H.y-OY-130,`${P.name} — ${Math.ceil(L.powCool)}s`,"#8a8078"); return; }
  if(P.kind==="wild-shape") return fWildShape(L,P);
  if(P.kind==="sneak") return fSneakStart(L,P);
  if(P.kind==="thunder") return fThunder(L,P,at);
  if(P.kind==="twin-blast"||P.kind==="guiding-bolt"||P.kind==="ensnare-arrow") return fPowerShot(L,P,at);
  if(P.kind==="rage-throw"){ L.rage=P.seconds; fSpend(L); H.act="attack"; H.actT=0; fSynth("roar",.75); fPop(H.x-OX,H.y-OY-140,"RAAAGH!","#ff5a4a"); fSparks(L,H.x,H.y-50,20,"#ff5a4a"); L.log.push(`Rage: +2 damage, half damage taken for ${P.seconds}s`); }
  const e=fPowerTarget(L,fRangePx(L,P),at);
  if(!e){ if(P.kind!=="rage-throw") fPop(H.x-OX,H.y-OY-130,"no one in reach","#8a8078"); return; }
  H.dir=dirFrom(e.x-H.x,e.y-(H.y-40)); L.still=0; const dd=Math.hypot(e.x-H.x,e.y-H.y)||1, dirx=(e.x-H.x)/dd, diry=(e.y-H.y)/dd; if(P.kind!=="rage-throw") fSpend(L);
  if(P.kind==="backstab"){ H.act="attack"; H.actT=0; fSynth("kick",.7); fPop(e.x-OX,e.y-OY-80,"kick!","#ffd36a"); if(!e.held){ e.kx=dirx*240; e.ky=diry*240; } e.cool=Math.max(e.cool,.9); fSparks(L,e.x,e.y-40,8,"#e8d8b0");
    setTimeout(()=>{ if(FLD!==L||e.dead) return; H.act="attack"; H.actT=0; sfx("combat_melee_swing_light",{vol:.45,rate:1.3}); const a=fAdvRoll(P.strike,e); fStrikeFoe(L,e,a,{knock:120,dirx,diry,snd:"combat_dagger_stab"}); if(a.hit){ fPop(e.x-L.ox(),e.y-L.oy()-118,"BACKSTAB","#ff9a7a"); fSparks(L,e.x,e.y-44,10,"#ff5a4a"); } },300); return; }
  if(P.kind==="smite"){ H.act="attack"; H.actT=0; sfx("combat_melee_swing_heavy",{vol:.55}); sfx("magic_holy_release",{vol:.6}); const a=fHeroRoll(P.strike,e.ac,e); fStrikeFoe(L,e,a,{knock:380,dirx,diry,hitFx:"fireImpact",snd:"combat_melee_hit_flesh"}); L.pfx.push({k:"smite",x:e.x,y:e.y,t:0,d:.8});
    if(a.hit){ fSparks(L,e.x,e.y-50,28,"#ffd36a"); fPop(e.x-OX,e.y-OY-120,"SMITE!","#ffe28a"); } return; }
  if(P.kind==="flurry"){ fPop(H.x-OX,H.y-OY-130,"FLURRY!","#ffd36a"); for(let i=0;i<(P.strikes||3);i++) setTimeout(()=>{ if(FLD!==L||e.dead) return; H.act="attack"; H.actT=0; sfx("combat_melee_swing_light",{vol:.4,rate:1.15+i*.12}); const a=fHeroRoll(P.strike,e.ac,e); fStrikeFoe(L,e,a,{knock:i===2?320:50,dirx,diry,snd:"combat_unarmed_hit"}); L.pfx.push({k:"blur",x:e.x,y:e.y-40,t:0,d:.22,a:i}); },i*150); return; }
  if(P.kind==="shock"){ H.act="cast"; H.actT=0; fSynth("crackle",.55); const a=fHeroRoll(P.strike,e.ac,e); L.pfx.push({k:"bolt",x1:H.x+dirx*18,y1:H.y-56,x2:e.x,y2:e.y-40,t:0,d:.4,col:"#9fd8ff"}); fStrikeFoe(L,e,a,{knock:200,dirx,diry,hitFx:"pxArc",snd:null});
    if(a.hit){ e.cool=Math.max(e.cool,1.6); fPop(e.x-OX,e.y-OY-118,"jolted","#9fd8ff"); fSparks(L,e.x,e.y-40,16,"#bfe8ff"); } return; }
  if(P.kind==="vines"){ H.act="cast"; H.actT=0; sfx("magic_nature_release",{vol:.6}); fSynth("creak",.4); const sv=F.monsterSave(fStat(e).str,P.save.dc,rng); L.pfx.push({k:"vines",x:e.x,y:e.y,t:0,d:1.1,e});
    L.log.push(`Vines: ${e.name} STR save ${sv.total} vs DC ${P.save.dc} — ${sv.saved?"tears free":"restrained"}`);
    if(sv.saved){ fPop(e.x-OX,e.y-OY-110,"tears free","#9adf9a"); } else { setTimeout(()=>{ if(e.dead) return; e.held=P.seconds; e.kx=0; e.ky=0; },350); fPop(e.x-OX,e.y-OY-110,"seized by vines","#9adf9a"); } return; }
  if(P.kind==="mockery"){ H.act="cast"; H.actT=0; const line=F.pickMockery(rng); L.quip={text:line,t:3.4}; sfx("magic_necrotic_release",{vol:.3,rate:1.5}); const sv=F.monsterSave(fStat(e).wis,P.save.dc,rng);
    L.log.push(`Vicious Mockery: “${line}” — ${e.name} WIS save ${sv.total} vs DC ${P.save.dc}`);
    if(sv.saved){ fPop(e.x-OX,e.y-OY-110,"shrugs it off","#c9a0ff"); } else { const dmg=fRoll(P.save.damage); fStrikeFoe(L,e,{hit:true,crit:false,damage:dmg,note:`Vicious Mockery: ${dmg} psychic`},{knock:0,hitFx:"psychicImpact",snd:null}); e.rattled=6; if(!e.dead) fPop(e.x-OX,e.y-OY-120,"rattled","#c9a0ff"); } return; }
  if(P.kind==="rage-throw"){ const size=MONSIZE[e.slug]||"Medium"; if(dd>120){ return; }
    if(!F.canGrapple("Medium",size)){ fPop(e.x-OX,e.y-OY-110,"too big to lift!","#ffb070"); return; }
    const sv=F.monsterSave(fStat(e).str,P.save.dc,rng); L.log.push(`Grab: ${e.name} STR save ${sv.total} vs DC ${P.save.dc} — ${sv.saved?"slips free":"lifted"}`);
    if(sv.saved){ fPop(e.x-OX,e.y-OY-110,"slips free","#ffb070"); return; }
    let [vx,vy]=fAim(L); if(at){ const ax=at.x-H.x, ay=at.y-(H.y-52), an=Math.hypot(ax,ay)||1; vx=ax/an; vy=ay/an; }
    e.thrown={t:0,phase:"lift",sx:e.x,sy:e.y,vx,vy}; e.held=0; e.asleep=0; e.kx=0; e.ky=0; e.cool=Math.max(e.cool,2.6); e.z=0; fPop(e.x-OX,e.y-OY-120,"GRABBED","#ff5a4a"); return; } }

// the barbarian's throw: lifted overhead, then hurled up to 30 ft — stopping short of a wall — and landing hard
function fThrowTick(L,e,dt){ const T=e.thrown, H=L.hero; T.t+=dt;
  if(T.phase==="lift"){ const u=Math.min(1,T.t/.35); e.x=T.sx+(H.x-T.sx)*u; e.y=T.sy+(H.y+2-T.sy)*u; e.z=u*96; if(u>=1){ T.phase="fly"; T.t=0; T.fx=H.x; T.fy=H.y+2; fSynth("whoosh",.55); H.act="attack"; H.actT=0;
      let x=T.fx, y=T.fy, n=0; const x0=L.ox()+30, x1=L.ox()+FW-30, y0=L.oy()+40, y1=L.oy()+FH-20; for(let s=12;s<=360;s+=12){ const nx=T.fx+T.vx*s, ny=T.fy+T.vy*s; if(nx<x0||nx>x1||ny<y0||ny>y1) break; if(!(e.fly||e.slug==="giant-bat")&&L.canStand&&!L.canStand(nx,ny)) break; x=nx; y=ny; n=s; } T.lx=x; T.ly=y; T.feet=Math.max(5,Math.round(n/12)); } return; }
  const u=Math.min(1,T.t/.55); e.x=T.fx+(T.lx-T.fx)*u; e.y=T.fy+(T.ly-T.fy)*u; e.z=96*(1-u)+Math.sin(u*Math.PI)*70;
  if(u>=1){ e.z=0; e.thrown=null; fSynth("thud",.8); fSparks(L,e.x,e.y-6,18,"#8a7a62"); const P=L.power; const dmg=fRoll(P.save.damage);
    fStrikeFoe(L,e,{hit:true,crit:false,damage:dmg,note:`Hurled ${T.feet} ft: ${dmg} bludgeoning (3d6 + 2 rage)`},{knock:140,dirx:T.vx,diry:T.vy,hitFx:"physicalImpact",snd:"combat_melee_hit_flesh"}); } }

function fThunder(L,P,at){ const H=L.hero, OX=L.ox(), OY=L.oy(); fSpend(L); H.act="cast"; H.actT=0; L.still=0; let [vx,vy]=fAim(L); if(at){ const ax=at.x-H.x, ay=at.y-(H.y-52), an=Math.hypot(ax,ay)||1; vx=ax/an; vy=ay/an; } H.dir=dirFrom(vx,vy);
  fSynth("thunder",.95); L.pfx.push({k:"wave",x:H.x+vx*24,y:H.y-40+vy*14,vx,vy,t:0,d:.6}); L.flash=.22; const dmg=fRoll(P.save.damage); let n=0;
  for(const e of L.foes){ if(e.dead||e.thrown) continue; const dx=e.x-H.x, dy=e.y-H.y, d=Math.hypot(dx,dy); if(d>220) continue; if(d>30&&(dx*vx+dy*vy)/d<-.1) continue; n++;
    const sv=F.monsterSave(fStat(e).con,P.save.dc,rng), got=F.saveDamage(dmg,sv.saved,true);
    const note=`Thunderwave: ${e.name} CON save ${sv.total} vs DC ${P.save.dc} — ${got} thunder${sv.saved?" (half)":", pushed 10 ft"}`;
    if(got>0) fStrikeFoe(L,e,{hit:true,crit:false,damage:got,note},{knock:sv.saved?0:640,dirx:dx/(d||1),diry:dy/(d||1),hitFx:"forceHit",snd:null}); else L.log.push(note); }
  if(!n) fPop(H.x-OX,H.y-OY-130,"the wave rolls out empty","#cfe6ff"); }

function fPowerShot(L,P,at){ const H=L.hero; if(P.kind==="ensnare-arrow"&&L.ammo!=null&&L.ammo<=0){ fPop(H.x-L.ox(),H.y-L.oy()-130,"quiver empty","#ff9a7a"); return; }
  fSpend(L); L.still=0; let [vx,vy]=fAim(L); if(at){ const ax=at.x-H.x, ay=at.y-(H.y-52), an=Math.hypot(ax,ay)||1; vx=ax/an; vy=ay/an; } H.dir=dirFrom(vx,vy);
  const kind=P.kind==="twin-blast"?"force":P.kind==="guiding-bolt"?"radiant":"arrow", sp=SHOT[kind].speed;
  const fire=(off)=>{ const px=-vy*off, py=vx*off; H.act=kind==="arrow"?"attack":"cast"; H.actT=0; L.shots.push({x:H.x+vx*26+px,y:H.y-52+vy*16+py,vx:vx*sp,vy:vy*sp,life:1.1,R:{...P.strike,knockback:!!P.pushFeet},kind,t:0,power:P}); };
  // the two beams fly side by side and land together, so the first one's shove can't carry the target out of the second's path
  if(P.kind==="twin-blast"){ fire(-7); fire(7); sfx("magic_eldritch_release",{vol:.5}); setTimeout(()=>sfx("magic_eldritch_release",{vol:.45,rate:1.12}),40); fSynth("crackle",.35); }
  else if(kind==="radiant"){ fire(0); sfx("magic_holy_release",{vol:.6}); }
  else { if(L.ammo!=null) L.ammo--; H.bow="longbow"; fire(0); sfx("combat_bow_release",{vol:.6}); sfx("magic_nature_release",{vol:.3,rate:1.3}); fKitButtons(L); } }
function fPowerShotHit(L,e,s,a){ const P=s.power, OX=L.ox(), OY=L.oy(); if(!a.hit||e.dead) return;
  if(P.kind==="guiding-bolt"){ e.marked=P.seconds; fPop(e.x-OX,e.y-OY-118,"lit up — advantage","#fff2b0"); fSparks(L,e.x,e.y-44,18,"#fff2b0"); }
  if(P.kind==="ensnare-arrow"){ const sv=F.monsterSave(fStat(e).str,P.save.dc,rng); L.log.push(`Ensnaring arrow: ${e.name} STR save ${sv.total} vs DC ${P.save.dc} — ${sv.saved?"tears the vines":"wrapped in vines"}`);
    if(sv.saved) fPop(e.x-OX,e.y-OY-118,"tears the vines","#9adf9a"); else { e.held=P.seconds; e.kx=0; e.ky=0; e.bite=.7; e.biteDice=P.save.damage; L.pfx.push({k:"vines",x:e.x,y:e.y,t:0,d:.9,e}); fPop(e.x-OX,e.y-OY-118,"wrapped in vines","#9adf9a"); } }
  if(P.kind==="twin-blast") fSparks(L,e.x,e.y-40,10,"#c76bff"); }
function fBlock(L,e){ const H=L.hero; fSynth("clang",.6); sfx("combat_melee_hit_flesh",{vol:.15,rate:1.6}); fSparks(L,H.x+(e.x>H.x?22:-22),H.y-54,12,"#fff4c8"); fPop(H.x-L.ox(),H.y-L.oy()-100,"BLOCKED","#cfd8e8"); L.log.push(`${e.name}: blocked by the shield`); }


// ===== WILD SHAPE (Sam, 9/29: "Druid can turn himself into a wolf"). The SRD wolf's own block (lib/camp-field WOLF):
// its HP soak the blows and at 0 the druid is back, the rest of the damage carrying over; click/E bites; no spells.
function fRetune(){ const L=FLD; if(!L||!L.kit) return; const keepUses=L.powUses, old=L.power, oldKit=L.kit; L.kit=fKit(); if(L.kit.heal&&(!oldKit.heal||oldKit.heal.uses!==L.kit.heal.uses)) L.healUses=L.kit.heal.uses; if(L.kit.special&&L.kit.special.uses!=null&&(!oldKit.special||oldKit.special.uses!==L.kit.special.uses)) L.specUses=L.kit.special.uses; L.power=fPowerSpec(); if(L.power&&old&&old.uses!==L.power.uses) L.powUses=L.power.uses; else L.powUses=keepUses; if(L.wolf&&L.power&&L.power.form) L.wolf.form=L.power.form; fKitButtons(L); }
// the Sandbox drawer lives outside the game's scope; this is the one door it gets
window.__sbx={TUNE,TUNE_DEFAULTS,retune:()=>fRetune(),
  where:()=>{ const f=FLD&&!$("fld").hidden?FLD:null, p=PARTY[ME], who=(p?p.name:"?")+(KITPICK?` (trying ${KITPICK})`:"");
    return f?{where:f.mode,char:who,detail:`${Math.max(0,Math.round(f.hp))}/${f.hpMax} HP${f.wolf?" · wolf":""}${f.sneak?" · hidden":""}`}:{where:"camp",char:who,detail:figures[ME]?`${figures[ME].hp}/${figures[ME].hpMax} HP`:""}; }};
function fSpend(L){ L.powCool=L.power.cooldown; L.powUses=Math.max(0,(L.powUses||0)-1); fKitButtons(L); }
function fWildShape(L,P){ const H=L.hero, F0=P.form; fSpend(L); L.wolf={hp:F0.hp,max:F0.hp,form:F0}; L.bowDraw=null; H.act=null; fSynth("howl",.6); fSparks(L,H.x,H.y-40,26,"#b8c4b0"); fSparks(L,H.x,H.y-20,14,"#6a8a5a");
  L.pfx.push({k:"shift",x:H.x,y:H.y,t:0,d:.6}); fPop(H.x-L.ox(),H.y-L.oy()-130,"becomes a wolf!","#b8c4b0"); L.log.push(`Wild Shape: ${F0.note}`); fKitButtons(L); }
function fRevert(L,voluntary){ const H=L.hero; L.wolf=null; fSparks(L,H.x,H.y-40,20,"#b8c4b0"); L.pfx.push({k:"shift",x:H.x,y:H.y,t:0,d:.6}); fSynth("whoosh",.4);
  fPop(H.x-L.ox(),H.y-L.oy()-130,voluntary?"changes back":"the wolf falls — the druid is back","#b8c4b0"); L.log.push(voluntary?"Wild Shape ends.":"Wild Shape: the wolf drops to 0 HP and the druid reverts."); fKitButtons(L); }
MONH.wolf=MONH.wolf||58; MONH["wolf-run"]=MONH.wolf; MONH["wolf-bite"]=MONH.wolf; PCOL["wild-shape"]="#b8c4b0";
function fWolfNo(L){ fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-130,"a wolf can't cast","#8a8078"); }
function fWolfBite(L,at){ if(!L||L.busy||L.ended||L.down||(L.swingCool||0)>0) return; const H=L.hero, OX=L.ox(), OY=L.oy(), B=L.wolf.form; if(at) H.dir=dirFrom(at.x-H.x,at.y-(H.y-30)); L.swingCool=.6*100/Math.max(10,TUNE.attackSpeedPct); L.still=0; H.act="attack"; H.actT=0; L.wolfLunge=.25; L.wolfBiteT=.42;
  const [vx,vy]=DIRV[H.dir]||[0,1]; let best=null, bd=1e9; for(const e of L.foes){ if(e.dead) continue; const dx=e.x-H.x, dy=e.y-H.y, d=Math.hypot(dx,dy); if(d>95) continue; if(d>20&&(dx*vx+dy*vy)/d<.2) continue; if(d<bd){ bd=d; best=e; } }
  fSynth("snarl",.45); if(!best){ L.whiff=(L.whiff||0)+1; return; } const e=best, dd=bd||1;
  const a=fHeroRoll(B.bite,e.ac,e); fStrikeFoe(L,e,a,{knock:200,dirx:(e.x-H.x)/dd,diry:(e.y-H.y)/dd,snd:"combat_dagger_stab"});
  if(a.hit&&!e.dead&&B.save){ const immune=e.slug==="ochre-jelly"; const sv=immune?null:F.monsterSave(fStat(e).str,B.save.dc,rng);
    L.log.push(immune?`${e.name} can't be knocked prone`:`${e.name} STR save ${sv.total} vs DC ${B.save.dc} — ${sv.saved?"keeps its feet":"knocked prone"}`);
    if(sv&&!sv.saved){ e.prone=1.8; e.kx=0; e.ky=0; fPop(e.x-OX,e.y-OY-118,"knocked prone","#b8c4b0"); } } }
// the druid, drawn as the wolf while shifted
function fHeroOrWolf(L,sh,draw){ if(L.sneak){ fg.save(); fg.globalAlpha=.28+.08*Math.sin(L.t*5); draw(); fg.restore(); return; } if(!L.wolf){ draw(); return; } const H=L.hero; const [dx]=DIRV[H.dir]||[0,1]; const right=dx>0||(dx===0&&L.wolfRight!==false); if(dx) L.wolfRight=dx>0;
  const lx=(L.wolfLunge>0?Math.sin((1-L.wolfLunge/.25)*Math.PI)*14:0)*(right?1:-1); L.wolfLunge=Math.max(0,(L.wolfLunge||0)-1/60);
  if(L.wolfBiteT>0){ L.wolfBiteT=Math.max(0,L.wolfBiteT-1/60); if(fDrawWolfFrame("wolf-bite",Math.min(5,Math.floor((1-L.wolfBiteT/.42)*6)),sh.x+lx,sh.y,right)) return; }
  if(H.moving){ if(fDrawMon("wolf-run",sh.x+lx,sh.y,right,1,0,false,true)) return; }
  if(!fDrawMon("wolf",sh.x+lx,sh.y,right,1,0,true,false)) draw(); }
// one chosen frame of a creature cycle (the bite plays once, start to finish)
function fDrawWolfFrame(key,idx,x,y,right){ const A=fMonAnim[key]; if(!A) return false; const fr=right||!A.w.length?A.e:A.w, im=fr[Math.max(0,Math.min(fr.length-1,idx))]; if(!im||!im.width) return false;
  const h=MONH.wolf||58, w=im.width*h/im.height, flip=!right&&!A.w.length; fg.save(); fg.fillStyle="rgba(0,0,0,.4)"; fg.beginPath(); fg.ellipse(x,y,w*.38,Math.max(5,w*.1),0,0,7); fg.fill(); fg.imageSmoothingEnabled=false; fg.translate(x,y+2); fg.scale(flip?-1:1,1); fg.drawImage(im,-w/2,-h,w,h); fg.restore(); return true; }
// Sam, 9/29: a creature has a 35% chance of leaving the wolf be (lib/camp-field WOLF.ignoredChance)
function fWolfSpared(L,e,cool,OX,OY){ if(!L.wolf||rng()>=L.wolf.form.ignoredChance) return false; e.cool=cool; e.lunge=0; if(!e.spareShown||L.t-e.spareShown>3){ e.spareShown=L.t; fPop(e.x-OX,e.y-OY-(MONH[e.slug]||60)-20,"leaves the wolf be","#b8c4b0"); } L.log.push(`${e.name} sniffs at the wolf and doesn't attack (35%).`); return true; }

// ===== SNEAK (Sam, 9/29): the rogue's hold slips her out of sight (2 uses). Every creature rolls against her Stealth when
// it first meets her and again every 10 s (lib/camp-field sneakCheck: passive Perception; blindsight sees through it).
// An unseen rogue is left alone. Strike from hiding and she leaps in with both daggers — advantage and Sneak Attack on
// the first, then the off-hand — and is seen again.
// Senses from the bestiary (2026-09-29): passive Perception, blindsight in feet.
const FSENSE={"chuul":[14,0],"female-steeder":[10,0],"giant-bat":[11,60],"giant-fire-beetle":[8,30],"giant-lizard":[10,0],"giant-rat":[10,0],"giant-spider":[10,10],"giant-toad":[10,0],"grick":[12,0],"hook-horror":[13,60],"male-steeder":[10,0],"ochre-jelly":[8,60],"orog":[10,0]};
const PX_PER_FT=8;
function fStealthBonus(){ const p=PARTY[ME], s=FSPELL[p.slug]||{}, v=FSURV[p.slug]||{skills:{}}; return F.skillBonus({abilityMod:Math.floor(((s.dex||10)-10)/2),prof:s.prof||2,level:F.skillLevel(v.skills,"stealth")}); }
function fSneakLook(L,e){ const H=L.hero, OX=L.ox(), OY=L.oy(), sn=FSENSE[e.slug]||[null,0];
  const r=F.sneakCheck({hider:PARTY[ME].name,stealth:L.sneak.bonus,creature:{name:e.name,passive:sn[0],blindsightFeet:sn[1]},distanceFeet:Math.hypot(e.x-H.x,e.y-H.y)/PX_PER_FT},rng);
  const was=e.spotsRogue; e.spotsRogue=!r.hidden; e.sneakChecked=true; L.log.push(r.note);
  if(!r.hidden&&!was){ fPop(e.x-OX,e.y-OY-(MONH[e.slug]||60)-24,"!! spots her","#ff9a7a"); sfx("creature_hurt_beast",{vol:.25,rate:1.5}); }
  else if(r.hidden&&was) fPop(e.x-OX,e.y-OY-(MONH[e.slug]||60)-24,"loses her","#9ab8d8"); }
function fSneakStart(L,P){ const H=L.hero; if(L.sneak){ fPop(H.x-L.ox(),H.y-L.oy()-130,"already hidden","#8a8078"); return; } fSpend(L);
  L.sneak={t:0,next:P.seconds||TUNE.sneakRecheckSec,bonus:fStealthBonus()}; fSynth("whoosh",.35); fSparks(L,H.x,H.y-40,16,"#6a7a9a"); L.pfx.push({k:"shift",x:H.x,y:H.y,t:0,d:.5});
  fPop(H.x-L.ox(),H.y-L.oy()-130,`slips out of sight (Stealth +${L.sneak.bonus})`,"#9ab8d8");
  for(const e of L.foes){ if(e.dead) continue; fSneakLook(L,e); } fKitButtons(L); }
function fSneakEnd(L,why){ if(!L.sneak) return; L.sneak=null; for(const e of L.foes){ e.spotsRogue=false; e.sneakChecked=false; } fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-130,why||"seen","#ff9a7a"); fKitButtons(L); }
function fSneakTick(L,dt){ const S=L.sneak; if(!S) return; S.t+=dt; S.next-=dt;
  for(const e of L.foes){ if(!e.dead&&!e.sneakChecked) fSneakLook(L,e); } // a new creature looks when it arrives
  if(S.next<=0){ S.next=TUNE.sneakRecheckSec; for(const e of L.foes){ if(!e.dead) fSneakLook(L,e); } } }
function fSneakAttack(L,at){ const H=L.hero, P=L.power, OX=L.ox(), OY=L.oy(); let best=null, bd=1e9;
  for(const e of L.foes){ if(e.dead) continue; const d=Math.hypot(e.x-H.x,e.y-H.y); if(d>190) continue; const s=at?Math.hypot(e.x-at.x,(e.y-40)-at.y):d; if(s<bd){ bd=s; best=e; } }
  if(!best){ fPop(H.x-OX,H.y-OY-130,"no one close enough to leap on","#8a8078"); return; }
  const e=best, d=Math.hypot(e.x-H.x,e.y-H.y)||1, ux=(e.x-H.x)/d, uy=(e.y-H.y)/d; L.swingCool=.9; L.busyLeap=true; L.tx=null; L.ty=null;
  // the leap: across the gap in a quarter second, landing at the creature's side
  const sx=H.x, sy=H.y, tx=e.x-ux*40, ty=e.y-uy*14; L.leap={t:0,sx,sy,tx,ty,e,ux,uy}; H.dir=dirFrom(ux,uy); H.act="attack"; H.actT=0; fSynth("whoosh",.5); fSneakEnd(L,"SNEAK ATTACK!");
  L.log.push("Sneak attack: she leaps from hiding with both daggers."); }
function fLeapTick(L,dt){ const J=L.leap; if(!J) return; const H=L.hero; J.t+=dt; const u=Math.min(1,J.t/.26); H.x=J.sx+(J.tx-J.sx)*u; H.y=J.sy+(J.ty-J.sy)*u; L.leapZ=Math.sin(u*Math.PI)*34;
  if(Math.random()<.6) fSparks(L,H.x,H.y-10,1,"#8a7a62");
  if(u>=1&&!J.hit){ J.hit=true; L.leapZ=0; L.tx=H.x; L.ty=H.y; const e=J.e, P=L.power;
    if(!e.dead){ H.act="attack"; H.actT=0; const a=fAdvRoll(P.strike,e); fStrikeFoe(L,e,a,{knock:60,dirx:J.ux,diry:J.uy,snd:"combat_dagger_stab"}); L.pfx.push({k:"xslash",x:e.x,y:e.y-44,t:0,d:.35});
      if(a.hit) fPop(e.x-L.ox(),e.y-L.oy()-128,"SNEAK ATTACK","#ff9a7a");
      setTimeout(()=>{ if(FLD!==L||e.dead) return; H.act="attack"; H.actT=0; const b=fHeroRoll(P.offhand,e.ac,e); fStrikeFoe(L,e,b,{knock:200,dirx:J.ux,diry:J.uy,snd:"combat_dagger_stab"}); L.pfx.push({k:"xslash",x:e.x,y:e.y-44,t:0,d:.3,flip:1}); },160); }
    setTimeout(()=>{ L.leap=null; L.busyLeap=false; },220); } }
// ---- effects: sparks, lightning, the wave, rising vines, the smite's pillar, flurry blurs ----
function fSparks(L,x,y,n,col){ const S=L.sparks||(L.sparks=[]); for(let i=0;i<n;i++){ const a=Math.random()*6.283, sp=60+Math.random()*180; S.push({x,y,z:0,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp*.5,vz:80+Math.random()*160,c:col,life:.5+Math.random()*.4}); } if(S.length>400) S.splice(0,S.length-400); }
function fPowFxTick(L,dt){ const S=L.sparks; if(S) for(let i=S.length-1;i>=0;i--){ const p=S[i]; p.life-=dt; p.vz-=420*dt; p.z=Math.max(0,p.z+p.vz*dt); p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=.96; p.vy*=.96; if(p.life<=0) S.splice(i,1); }
  const X=L.pfx||(L.pfx=[]); for(let i=X.length-1;i>=0;i--){ X[i].t+=dt; if(X[i].t>=X[i].d) X.splice(i,1); }
  if(L.rage>0&&Math.random()<.35) fSparks(L,L.hero.x+(Math.random()-.5)*40,L.hero.y-20,1,"#ff5a4a"); }
function fJag(x1,y1,x2,y2,seg,amp){ const pts=[[x1,y1]]; for(let i=1;i<seg;i++){ const u=i/seg, nx=-(y2-y1), ny=x2-x1, n=Math.hypot(nx,ny)||1, o=(Math.random()-.5)*2*amp; pts.push([x1+(x2-x1)*u+nx/n*o,y1+(y2-y1)*u+ny/n*o]); } pts.push([x2,y2]); return pts; }
function fStrokeJag(pts,col,w){ fg.strokeStyle=col; fg.lineWidth=w; fg.beginPath(); pts.forEach(([x,y],i)=>i?fg.lineTo(x,y):fg.moveTo(x,y)); fg.stroke(); }
function fPowerDraw(L,ox,oy,sh){ const H=L.hero, P=L.power, t=L.t; fg.save();
  // rage: a red heat around the barbarian
  if(L.rage>0){ fg.globalCompositeOperation="lighter"; const pu=.75+.25*Math.sin(t*10); const g=fg.createRadialGradient(sh.x,sh.y-50,6,sh.x,sh.y-50,90); g.addColorStop(0,`rgba(255,70,50,${.32*pu})`); g.addColorStop(1,"rgba(255,70,50,0)"); fg.fillStyle=g; fg.fillRect(sh.x-90,sh.y-140,180,180); fg.globalCompositeOperation="source-over"; }
  // the smite's pillar of fire, the wave, the vines, the bolts, the blurs
  for(const f of (L.pfx||[])){ const u=f.t/f.d, a=1-u;
    if(f.k==="smite"){ const x=f.x-ox, y=f.y-oy; fg.globalCompositeOperation="lighter"; const g=fg.createLinearGradient(x,y-200,x,y); g.addColorStop(0,"rgba(255,240,170,0)"); g.addColorStop(.5,`rgba(255,210,90,${.55*a})`); g.addColorStop(1,`rgba(255,150,40,${.8*a})`); fg.fillStyle=g; const w=30+50*Math.sin(Math.min(1,u*3)*Math.PI/2); fg.fillRect(x-w/2,y-200,w,200);
      fg.fillStyle=`rgba(255,250,220,${.8*a})`; fg.fillRect(x-3,y-150*(1-u*.5),6,150*(1-u*.5)); fg.fillRect(x-26*(1-u),y-100,52*(1-u),5); fg.globalCompositeOperation="source-over"; }
    if(f.k==="wave"){ const x=f.x-ox, y=f.y-oy, ang=Math.atan2(f.vy,f.vx); fg.globalCompositeOperation="lighter"; for(let r=0;r<3;r++){ const rad=24+(220-24)*Math.min(1,u*1.2)-r*22; if(rad<=0) continue; fg.strokeStyle=`rgba(200,225,255,${.7*a-r*.15})`; fg.lineWidth=7-r*2; fg.beginPath(); fg.ellipse(x,y,rad,rad*.55,0,ang-1.25,ang+1.25); fg.stroke(); } fg.globalCompositeOperation="source-over"; }
    if(f.k==="bolt"){ fg.globalCompositeOperation="lighter"; const pts=fJag(f.x1-ox,f.y1-oy,f.x2-ox,f.y2-oy,9,14); fStrokeJag(pts,`rgba(120,190,255,${.5*a})`,7); fStrokeJag(pts,`rgba(235,248,255,${a})`,2.5); fStrokeJag(fJag(f.x1-ox,f.y1-oy,f.x2-ox,f.y2-oy,7,20),`rgba(160,210,255,${.6*a})`,1.5); fg.globalCompositeOperation="source-over"; }
    if(f.k==="vines"){ const e=f.e, x=(e&&!e.dead?e.x:f.x)-ox, y=(e&&!e.dead?e.y:f.y)-oy, grow=Math.min(1,u*1.8); fg.lineCap="round";
      for(let i=0;i<7;i++){ const bx=x+(i-3)*9, h=(34+(i*17)%30)*grow, sw=Math.sin(t*3+i)*8; fg.strokeStyle=i%2?"#3f7a2e":"#5aa040"; fg.lineWidth=5-(i%3); fg.beginPath(); fg.moveTo(bx,y+4); fg.quadraticCurveTo(bx+sw+(i-3)*6,y-h*.5,bx-(i-3)*4,y-h); fg.stroke();
        if(grow>.6){ fg.fillStyle="#7cc85a"; fg.fillRect(bx-(i-3)*4-3,y-h-2,6,4); } }
      fg.fillStyle=`rgba(60,40,20,${.5*a})`; fg.beginPath(); fg.ellipse(x,y+4,36,9,0,0,7); fg.fill(); }
    if(f.k==="xslash"){ const x=f.x-ox, y=f.y-oy, s=34; fg.save(); fg.globalCompositeOperation="lighter"; fg.lineCap="round"; fg.strokeStyle=`rgba(235,240,255,${a})`; fg.lineWidth=3.5;
      const g=Math.min(1,u*2.4); fg.beginPath(); if(f.flip){ fg.moveTo(x+s,y-s); fg.lineTo(x+s-2*s*g,y-s+2*s*g); } else { fg.moveTo(x-s,y-s); fg.lineTo(x-s+2*s*g,y-s+2*s*g); } fg.stroke(); fg.strokeStyle=`rgba(255,120,110,${.6*a})`; fg.lineWidth=7; fg.stroke(); fg.restore(); }
    if(f.k==="shift"){ const x=f.x-ox, y=f.y-oy-40; fg.globalCompositeOperation="lighter"; const g=fg.createRadialGradient(x,y,4,x,y,80*(.4+u)); g.addColorStop(0,`rgba(200,220,190,${.6*a})`); g.addColorStop(1,"rgba(200,220,190,0)"); fg.fillStyle=g; fg.fillRect(x-90,y-90,180,180); fg.globalCompositeOperation="source-over"; }
    if(f.k==="blur"){ const x=f.x-ox, y=f.y-oy; fg.strokeStyle=`rgba(255,230,160,${.9*a})`; fg.lineWidth=3; for(let j=0;j<3;j++){ fg.beginPath(); fg.arc(x+(f.a-1)*10,y+(j-1)*10,18+j*6,-.6+f.a,.6+f.a); fg.stroke(); } } }
  // sparks
  if(L.sparks&&L.sparks.length){ fg.globalCompositeOperation="lighter"; for(const p of L.sparks){ fg.globalAlpha=Math.min(1,p.life*2); fg.fillStyle=p.c; fg.fillRect(Math.round(p.x-ox),Math.round(p.y-oy-p.z),3,3); } fg.globalAlpha=1; fg.globalCompositeOperation="source-over"; }
  // marked, rattled, lifted
  for(const e of L.foes){ if(e.dead) continue; const x=e.x-ox, y=e.y-oy, ph=(MONH[e.slug]||60);
    if(e.marked>0){ fg.globalCompositeOperation="lighter"; const g=fg.createRadialGradient(x,y-ph/2,4,x,y-ph/2,ph*.8); g.addColorStop(0,`rgba(255,240,170,${.35+.15*Math.sin(t*8)})`); g.addColorStop(1,"rgba(255,240,170,0)"); fg.fillStyle=g; fg.fillRect(x-ph,y-ph*1.5,ph*2,ph*2); fg.globalCompositeOperation="source-over"; }
    if(e.rattled>0){ fg.font="700 15px Cinzel"; fg.textAlign="center"; fg.fillStyle="#c9a0ff"; fg.fillText("?!",x+ph*.4,y-ph-6+Math.sin(t*6)*3); }
    if(e.thrown){ fg.fillStyle="rgba(0,0,0,.35)"; fg.beginPath(); fg.ellipse(x,y+4,ph*.35,ph*.1,0,0,7); fg.fill(); } }
  // the fighter's shield, held out in front
  if(L.shield){ const [dx]=DIRV[H.dir]||[0,1]; const s=fItem.shield, sx=sh.x+(dx>0?16:dx<0?-16:0)-26, sy=sh.y-86; fg.globalCompositeOperation="lighter"; fg.strokeStyle=`rgba(220,230,250,${.35+.2*Math.sin(t*9)})`; fg.lineWidth=3; fg.beginPath(); fg.arc(sh.x,sh.y-50,62,0,7); fg.stroke(); fg.globalCompositeOperation="source-over"; if(s&&s.width){ fg.imageSmoothingEnabled=false; fg.drawImage(s,sx,sy,52,52); } }
  // the hold: a ring filling in the power's colour
  if(L.wolf){ fBar(sh.x-28,sh.y-(MONH.wolf||58)-18,56,L.wolf.hp/L.wolf.max,"#b8c4b0"); }
  for(const e of L.foes){ if(e.dead||!(e.prone>0)) continue; fg.font="600 12px Cinzel"; fg.textAlign="center"; fg.fillStyle="#b8c4b0"; fg.fillText("prone",e.x-ox,e.y-oy-(MONH[e.slug]||60)-10); }
  if(L.hold&&P&&!L.hold.fired&&P.kind!=="shield"&&L.hold.t>.12&&(L.powUses>0||L.wolf)){ const k=Math.min(1,L.hold.t/P.hold), col=PCOL[P.kind]||"#ffe28a", full=k>=1; fg.lineWidth=4; fg.strokeStyle="rgba(0,0,0,.6)"; fg.beginPath(); fg.arc(sh.x,sh.y-60,64,0,6.283); fg.stroke(); fg.strokeStyle=col; fg.globalAlpha=full?.7+.3*Math.sin(t*14):.9; fg.beginPath(); fg.arc(sh.x,sh.y-60,64,-Math.PI/2,-Math.PI/2+6.283*k); fg.stroke(); fg.globalAlpha=1;
    fg.font="700 12px Cinzel"; fg.textAlign="center"; fg.fillStyle=col; fg.fillText(L.wolf?"CHANGE BACK":full&&P.chargeRelease?"RELEASE":P.name.toUpperCase(),sh.x,sh.y-132);
    if(P.kind==="thunder"&&k>.2){ fg.globalCompositeOperation="lighter"; for(let i=0;i<5;i++){ const a2=t*6+i*1.26, r=40*(1-k)+18; fg.fillStyle=`rgba(200,225,255,${.4*k})`; fg.fillRect(sh.x+Math.cos(a2)*r-2,sh.y-56+Math.sin(a2)*r*.6-2,4,4); } fg.globalCompositeOperation="source-over"; } }
  // the bard's insult, out loud
  if(L.quip){ const b=L.quip, al=Math.min(1,b.t*2); fg.globalAlpha=al; fg.font="italic 600 15px 'Crimson Text', serif"; const words=b.text.split(" "), lines=[""]; for(const w of words){ const tr=(lines[lines.length-1]+" "+w).trim(); if(fg.measureText(tr).width>250&&lines[lines.length-1]) lines.push(w); else lines[lines.length-1]=tr; }
    const bw=Math.max(...lines.map(l=>fg.measureText(l).width))+24, bh=lines.length*18+14, bx=Math.max(8,Math.min(FW-bw-8,sh.x-bw/2)), by=Math.max(8,sh.y-150-bh);
    fg.fillStyle="rgba(245,236,214,.95)"; fg.strokeStyle="#6b5530"; fg.lineWidth=2; fg.beginPath(); fg.roundRect(bx,by,bw,bh,10); fg.fill(); fg.stroke(); fg.beginPath(); fg.moveTo(sh.x-8,by+bh); fg.lineTo(sh.x,by+bh+12); fg.lineTo(sh.x+8,by+bh); fg.fill();
    fg.fillStyle="#3a2350"; fg.textAlign="center"; lines.forEach((l,i)=>fg.fillText(l,bx+bw/2,by+22+i*18)); fg.globalAlpha=1; }
  if(L.flash>0){ fg.fillStyle=`rgba(220,235,255,${L.flash*1.2})`; fg.fillRect(0,0,FW,FH); }
  fg.restore(); }
// shots with a power behind them: purple crackle round the blast, a white-gold bolt, green wisps on the arrow
function fPowerShotDraw(s,x,y){ const P=s.power; if(!P) return; fg.save(); fg.globalCompositeOperation="lighter";
  if(s.kind==="force"){ for(let i=0;i<2;i++) fStrokeJag(fJag(x-s.vx*.03,y-s.vy*.03,x+(Math.random()-.5)*26,y+(Math.random()-.5)*26,4,6),"rgba(210,140,255,.9)",1.5); }
  if(s.kind==="radiant"){ const g=fg.createRadialGradient(x,y,2,x,y,26); g.addColorStop(0,"rgba(255,255,240,1)"); g.addColorStop(.4,"rgba(255,226,138,.8)"); g.addColorStop(1,"rgba(255,226,138,0)"); fg.fillStyle=g; fg.fillRect(x-26,y-26,52,52); fg.strokeStyle="rgba(255,240,180,.5)"; fg.lineWidth=6; fg.beginPath(); fg.moveTo(x,y); fg.lineTo(x-s.vx*.06,y-s.vy*.06); fg.stroke(); }
  if(s.kind==="arrow"){ fg.fillStyle="rgba(120,220,100,.7)"; for(let i=0;i<4;i++) fg.fillRect(x-s.vx*.012*i+Math.sin(s.t*30+i)*4,y-s.vy*.012*i+Math.cos(s.t*30+i)*4,3,3); }
  fg.restore(); }

// ---- sounds the library lacks, made on the spot: thunder, crackle, clang, roar, kick, thud, whoosh, charge, creak ----
function fNoise(c,dur){ const b=c.createBuffer(1,Math.max(1,Math.floor(c.sampleRate*dur)),c.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; const s=c.createBufferSource(); s.buffer=b; return s; }
function fSynth(kind,vol=.5){ const c=fAudio(); if(!c||!fAu.gain) return; const t=c.currentTime, out=c.createGain(); out.gain.value=vol; out.connect(fAu.gain);
  const env=(node,a,dcy,peak=1)=>{ const g=c.createGain(); g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+a); g.gain.exponentialRampToValueAtTime(.0001,t+a+dcy); node.connect(g); g.connect(out); return g; };
  const filt=(src,type,f,q)=>{ const n=c.createBiquadFilter(); n.type=type; n.frequency.value=f; if(q) n.Q.value=q; src.connect(n); return n; };
  if(kind==="thunder"){ const n=fNoise(c,1.8), f=filt(n,"lowpass",900); f.frequency.setValueAtTime(1100,t); f.frequency.exponentialRampToValueAtTime(110,t+1.3); env(f,.01,1.6,1); n.start(t); const o=c.createOscillator(); o.frequency.setValueAtTime(95,t); o.frequency.exponentialRampToValueAtTime(32,t+.7); env(o,.005,.8,.9); o.start(t); o.stop(t+.9); }
  if(kind==="crackle"){ const n=fNoise(c,.5), f=filt(n,"highpass",1800), g=c.createGain(); f.connect(g); g.connect(out); for(let i=0;i<16;i++) g.gain.setValueAtTime(Math.random()<.55?1:.03,t+i*.028); g.gain.setValueAtTime(.0001,t+.46); n.start(t); }
  if(kind==="clang"){ [620,931,1244].forEach((fq,i)=>{ const o=c.createOscillator(); o.type="triangle"; o.frequency.value=fq; env(o,.003,.55-i*.12,.5/(i+1)); o.start(t); o.stop(t+.7); }); const n=fNoise(c,.1); env(filt(n,"bandpass",3200,2),.002,.08,.7); n.start(t); }
  if(kind==="roar"){ const o=c.createOscillator(); o.type="sawtooth"; o.frequency.setValueAtTime(105,t); o.frequency.linearRampToValueAtTime(150,t+.25); o.frequency.linearRampToValueAtTime(78,t+1); const l=c.createOscillator(), lg=c.createGain(); l.frequency.value=26; lg.gain.value=20; l.connect(lg); lg.connect(o.frequency); env(filt(o,"lowpass",720),.06,1,.85); o.start(t); l.start(t); o.stop(t+1.2); l.stop(t+1.2); const n=fNoise(c,1.1); env(filt(n,"bandpass",480,1),.05,.9,.4); n.start(t); }
  if(kind==="kick"||kind==="thud"){ const lo=kind==="thud"; const o=c.createOscillator(); o.frequency.setValueAtTime(lo?120:170,t); o.frequency.exponentialRampToValueAtTime(lo?38:50,t+.18); env(o,.002,lo?.3:.18,1); o.start(t); o.stop(t+.4); const n=fNoise(c,.2); env(filt(n,"lowpass",lo?600:1500),.002,lo?.22:.08,.6); n.start(t); }
  if(kind==="whoosh"){ const n=fNoise(c,.5), f=filt(n,"bandpass",400,3); f.frequency.setValueAtTime(350,t); f.frequency.exponentialRampToValueAtTime(2200,t+.4); env(f,.12,.35,.9); n.start(t); }
  if(kind==="charge"){ const o=c.createOscillator(); o.type="triangle"; o.frequency.setValueAtTime(300,t); o.frequency.exponentialRampToValueAtTime(1100,t+.25); env(o,.02,.3,.35); o.start(t); o.stop(t+.4); }
  if(kind==="howl"){ const o=c.createOscillator(); o.type="sine"; o.frequency.setValueAtTime(380,t); o.frequency.linearRampToValueAtTime(720,t+.5); o.frequency.linearRampToValueAtTime(620,t+1.3); o.frequency.linearRampToValueAtTime(420,t+1.7); const l=c.createOscillator(), lg=c.createGain(); l.frequency.value=5.5; lg.gain.value=9; l.connect(lg); lg.connect(o.frequency); const o2=c.createOscillator(); o2.type="triangle"; o2.frequency.setValueAtTime(760,t); o2.frequency.linearRampToValueAtTime(1440,t+.5); o2.frequency.linearRampToValueAtTime(840,t+1.7); env(o,.25,1.5,.8); env(o2,.25,1.4,.12); o.start(t); o2.start(t); l.start(t); o.stop(t+1.9); o2.stop(t+1.9); l.stop(t+1.9); }
  if(kind==="snarl"){ const o=c.createOscillator(); o.type="sawtooth"; o.frequency.setValueAtTime(140,t); o.frequency.linearRampToValueAtTime(110,t+.25); const l=c.createOscillator(), lg=c.createGain(); l.frequency.value=40; lg.gain.value=30; l.connect(lg); lg.connect(o.frequency); env(filt(o,"bandpass",600,2),.02,.25,.7); o.start(t); l.start(t); o.stop(t+.35); l.stop(t+.35); const n=fNoise(c,.3); env(filt(n,"bandpass",1200,1.5),.01,.2,.35); n.start(t); }
  if(kind==="creak"){ const o=c.createOscillator(); o.type="sawtooth"; o.frequency.setValueAtTime(70,t); o.frequency.linearRampToValueAtTime(55,t+.6); const l=c.createOscillator(), lg=c.createGain(); l.frequency.value=13; lg.gain.value=15; l.connect(lg); lg.connect(o.frequency); env(filt(o,"bandpass",400,4),.08,.6,.6); o.start(t); l.start(t); o.stop(t+.8); l.stop(t+.8); } }

window.addEventListener("keyup",(e)=>{ if(fTyping(e)) return; if(!FLD) return; const k=e.key.toLowerCase(); if(k==="f") fAimRelease(); if(k==="e") fHoldEnd(); });
window.addEventListener("keydown",(e)=>{ if(fTyping(e)) return; if(!FLD||$("fld").hidden) return; const k=e.key.toLowerCase(); if(k==="f"){ e.preventDefault(); if(!e.repeat) fAimStart(null); } if(k==="q"){ e.preventDefault(); fSpecial(); } if(k==="e"){ e.preventDefault(); if(!e.repeat) fHoldStart(null); } if(k==="shift"&&!e.repeat){ e.preventDefault(); fSpeak(); } });
$("fldforage").onpointerdown=(e)=>{ e.preventDefault(); fForageStart(); }; $("fldforage").onpointerup=()=>fForageRelease(); $("fldforage").onpointerleave=()=>fForageRelease();
$("fldcast").onpointerdown=(e)=>{ e.preventDefault(); fAimStart(null); }; $("fldcast").onpointerup=()=>fAimRelease(); $("fldcast").onpointerleave=()=>{ if(FLD&&FLD.bowDraw) fAimRelease(); }; $("fldspec").onclick=()=>fSpecial();
$("fldsurv").onchange=(ev)=>{ SURVPICK=ev.target.value; }; if($("fldgear")) $("fldgear").onchange=(ev)=>{ GEARPICK=ev.target.value; }; $("fldadv").onchange=(ev)=>{ SURVADV=ev.target.checked; };
$("fldcls").onchange=(ev)=>{ KITPICK=ev.target.value; if(FLD&&!FLD.ended) fKitStart(FLD); };
// ===== FIGHTS IN THE FIELD (Sam, 9/28: "fight it right there") ================================================
// A creature that catches you comes out onto the map and fights: its live bestiary row, read by Field.fieldFoe —
// AC, HP, speed, the attacks of its Multiattack, poison saves and acid riders. Rows without a stat block (grell,
// piercer, umber hulk, carrion crawler, the rocktopus) and the people-encounters (raiders, traders...) stay the DM's.
// Run for another screen to get away. Live rows 2026-09-28.
const FFIGHTROWS=[{"name": "Giant Spider", "ac": 14, "hp": 26, "speed": "30 ft., climb 30 ft.", "actions": [{"desc": "Hit: 7 (1d8+3) piercing, plus DC 11 Con save or 9 (2d8) poison (half on success); if reduced to 0 HP, stable but poisoned & paralyzed 1 hr.", "name": "Bite", "reach": "5 ft.", "to_hit": "+5"}, {"desc": "Range 30/60 ft. Target restrained by webbing (escape DC 12 Str; web AC 10, 5 HP, vuln fire, immune bludgeoning/poison/psychic).", "name": "Web (Recharge 5-6)", "to_hit": "+5"}], "xp": 200}, {"name": "Grick", "ac": 14, "hp": 27, "speed": "30 ft., climb 30 ft.", "actions": [{"desc": "One tentacles attack; if it hits, one beak attack against the same target.", "name": "Multiattack"}, {"desc": "Hit: 9 (2d6+2) slashing.", "name": "Tentacles", "reach": "5 ft.", "to_hit": "+4"}, {"desc": "Hit: 5 (1d6+2) piercing.", "name": "Beak", "reach": "5 ft.", "to_hit": "+4"}], "xp": 450}, {"name": "Giant Fire Beetle", "ac": 13, "hp": 4, "speed": "30 ft.", "actions": [{"desc": "Hit: 2 (1d6-1) slashing.", "name": "Bite", "reach": "5 ft.", "to_hit": "+1"}], "xp": 10}, {"name": "Orog", "ac": 18, "hp": 42, "speed": "30 ft.", "actions": [{"desc": "The orog makes two greataxe attacks.", "name": "Multiattack"}, {"desc": "Melee Weapon Attack, one target. Hit: 10 (1d12+4) slashing damage.", "name": "Greataxe", "reach": "5 ft.", "to_hit": "+6"}, {"desc": "Melee or Ranged Weapon Attack, one target. Hit: 7 (1d6+4) piercing damage.", "name": "Javelin", "reach": "5 ft. or range 30/120 ft.", "to_hit": "+6"}], "xp": 450}, {"name": "Ochre Jelly", "ac": 8, "hp": 45, "speed": "10 ft., climb 10 ft.", "actions": [{"desc": "Hit: 9 (2d6+2) bludgeoning plus 3 (1d6) acid.", "name": "Pseudopod", "reach": "5 ft.", "to_hit": "+4"}], "xp": 450}, {"name": "Chuul", "ac": 16, "hp": 93, "speed": "30 ft., swim 30 ft.", "actions": [{"desc": "Two pincer attacks; if grappling a creature, can also use Tentacles once.", "name": "Multiattack"}, {"desc": "Hit: 11 (2d6+4) bludgeoning. Large or smaller target grappled (escape DC 14) unless the chuul already has two creatures grappled.", "name": "Pincer", "reach": "10 ft.", "to_hit": "+6"}, {"desc": "One creature grappled by the chuul: DC 13 Constitution save or poisoned 1 minute; while poisoned this way, paralyzed. Repeat the save at the end of each of its turns.", "name": "Tentacles"}], "xp": 1100}, {"name": "Female Steeder", "ac": 14, "hp": 30, "speed": "30 ft., climb 30 ft.", "actions": [{"desc": "Hit: 7 (1d8+3) piercing, and target makes a DC 12 CON save, taking 9 (2d8) acid on a failure, half on a success.", "name": "Bite", "reach": "5 ft.", "to_hit": "+5"}, {"desc": "(Recharges when the steeder has no creatures grappled.) One Medium or smaller creature. Hit: target is stuck to the leg and grappled until it escapes (escape DC 12).", "name": "Sticky Leg", "reach": "5 ft.", "to_hit": "+5"}], "xp": 200}];
const FROWBY=Object.fromEntries(FFIGHTROWS.map(r=>[r.name,r]));
function fSaveBonus(ab){ const p=PARTY[ME]; const sc=ab==="CON"?p.con:ab==="WIS"?p.wis:10; return Math.floor(((sc||10)-10)/2); }
// Sam, 9/29: rare prey — a female steeder or a giant spider that sees you comes for you instead of running.
function fPreyTurns(L,P){ const row=Object.keys(MONKEY).find(n=>MONKEY[n]===P.slug); if(!row) return false; const n0=L.foes.length;
  const ok=fAmbush(L,{bestiary:row,count:1},{x:P.x,y:P.y},`The ${P.name.toLowerCase()} doesn't run. It comes for ${PARTY[ME].name}.`); if(ok===false||L.foes.length===n0) return false;
  P.gone=true; const e=L.foes[L.foes.length-1]; e.prey=P; L.kill={ok:false,fighting:true,line:`The ${P.name.toLowerCase()} turned and fought.`}; L.huntOver=null; return true; }
function fPreyWon(L,e){ const P=e.prey; const food=F.preyFood(P,1); L.kill={ok:true,food,byp:P.byproduct||null,line:`${PARTY[ME].name} killed the ${P.name.toLowerCase()}: ${food} day${food===1?"":"s"} of food${P.byproduct?` and ${(FCAT.find(c=>c.slug===P.byproduct)||{name:P.byproduct}).name}`:""}. Carry it home.`};
  fPop(e.x-L.ox(),e.y-L.oy()-120,`+${food} days`,"#e3b95c"); fSay(`<b>HUNT</b>\n${L.kill.line}`); }
function fAmbush(L,cr,where,headline){ const row=cr.bestiary?FROWBY[cr.bestiary]:null; const foe=row?F.fieldFoe(row):null; const slug=cr.bestiary?MONKEY[cr.bestiary]:null;
  if(!foe||!slug||!fMon[slug]){ return false; }
  const n=Math.max(1,Math.min(6,cr.count||1)); const H=L.hero; const spd=foe.speedFt*3.8;
  // initiative: the hero's d20 + DEX against the group's d20 (the rows carry no DEX — flagged)
  const ini=1+Math.floor(rng()*20)+Math.floor((((FSPELL[PARTY[ME].slug]||{}).dex||10)-10)/2), theirs=1+Math.floor(rng()*20);
  const first=ini>=theirs; const made=[];
  for(let i=0;i<n;i++){ let x=H.x, y=H.y; for(let k=0;k<60;k++){ const a=rng()*6.283, d=(where?60:230)+rng()*(where?120:110); const cx=(where?where.x:H.x)+Math.cos(a)*d, cy=(where?where.y:H.y)+Math.sin(a)*d*.7;
      if(L.canStand(cx,cy)&&Math.hypot(cx-H.x,cy-H.y)>150&&cx>L.ox()+30&&cx<L.ox()+FW-30&&cy>L.oy()+50&&cy<L.oy()+FH-20){ x=cx; y=cy; break; } }
    const e={slug,name:foe.name,x,y,hp:foe.hp,max:foe.hp,ac:foe.ac,speed:spd,str:foe.strikes[0],strikes:foe.strikes,chain:foe.chainIfHit,cool:first?1.8+i*.3:.5+i*.25,flash:0,dead:false,fade:1,wx:0,wy:0,wt:0,kx:0,ky:0,face:x<H.x,ambusher:true,calmRolled:true,calm:false,xp:row.xp||0,fly:foe.fly};
    L.foes.push(e); made.push(e); }
  L.fight={name:foe.name,foes:made,xp:(row.xp||0)*made.length}; L.flagsExtra=(L.flagsExtra||[]).concat(foe.flags);
  sfx("creature_death_beast",{vol:.35,rate:.7}); flash(`${foe.name.toUpperCase()}${n>1?` ×${n}`:""} — ROLL INITIATIVE`,true);
  const line=`${headline} Initiative: ${PARTY[ME].name} ${ini} vs ${theirs} — ${first?`${PARTY[ME].name} moves first`:"they move first"}. Fight, or run for another screen.`;
  L.log.push(line); fSay(`<b>${L.mode.toUpperCase()} — AMBUSH</b>\n${line}`); fPop(H.x-L.ox(),H.y-L.oy()-150,first?"you move first":"they strike first!",first?"#e3b95c":"#ff6a4a");
  return true; }
// the fight is over when every ambusher is down (or left behind on another screen)
// foes spread around the hero instead of stacking on one spot, and stop at arm's length
function fSpread(L,dt){ const F2=L.foes, H=L.hero; for(let i=0;i<F2.length;i++){ const a=F2[i]; if(a.dead) continue;
    const hx=a.x-H.x, hy=a.y-H.y, hd=Math.hypot(hx,hy)||1; const min=(MONH[a.slug]||60)>100?48:30; if(hd<min){ const nx=H.x+hx/hd*min, ny=H.y+hy/hd*min; if(a.fly||L.canStand(nx,ny)){ a.x=nx; a.y=ny; } }
    for(let j=i+1;j<F2.length;j++){ const b=F2[j]; if(b.dead) continue; const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||1, want=((MONH[a.slug]||60)+(MONH[b.slug]||60))*.42; if(d<want){ const push=(want-d)/2, ux=dx/d, uy=dy/d;
        if(a.fly||L.canStand(a.x-ux*push,a.y-uy*push)){ a.x-=ux*push; a.y-=uy*push; } if(b.fly||L.canStand(b.x+ux*push,b.y+uy*push)){ b.x+=ux*push; b.y+=uy*push; } } } } }
function fFightTick(L){ if(!L.fight) return; const live=L.fight.foes.filter(e=>!e.dead&&!e.gone); if(live.length) return;
  const f=L.fight; L.fight=null; const dead=f.foes.filter(e=>e.dead).length, fled=f.foes.length-dead; const line=`${dead?`${dead} ${f.name.toLowerCase()}${dead>1?"s":""} dead`:"None killed"}${fled?`, ${fled} fled`:""}. ${(f.xp/f.foes.length)*dead} XP between the party for the kills — the DM awards it${fled?" (and rules on the ones that ran)":""}.`;
  L.log.push(line); L.won=(L.won||[]).concat([f.name]); sfx("ui_item_pickup",{vol:.3,rate:.8}); flash("THE FIGHT IS WON",false); fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-150,`${f.name} slain`,"#e3b95c"); }
// one round of a stat block against the hero: every strike of the Multiattack, poison saves, acid riders
function fRound(L,e,H,OX,OY){ if(L.shield){ fBlock(L,e); return 0; } const sh=fHeroSheet(); let total=0, landed=false, notes=[];
  for(let i=0;i<e.strikes.length;i++){ const s=e.strikes[i]; if(e.chain&&i>0&&!landed) break; const a=fFoeRoll(e,s,sh.ac); notes.push(a.note);
    if(a.hit){ landed=true; total+=a.damage; if(s.rider){ const sv=1+Math.floor(rng()*20)+fSaveBonus(s.rider.ability); const rd=fRoll(s.rider.dice); const got=sv>=s.rider.dc?(s.rider.half?Math.floor(rd/2):0):rd; total+=got; notes.push(`${s.rider.ability} save ${sv} vs DC ${s.rider.dc} — ${got} ${s.rider.type}`); if(got) fPop(H.x-OX+20,H.y-OY-126,`${got} ${s.rider.type}`,"#9adf6a"); } }
    else fPop(H.x-OX+(i*26-10),H.y-OY-100-i*12,"miss","#b9e0ff"); }
  if(L.rage>0&&total>0){ total=Math.max(1,Math.floor(total/2)); notes.push(`halved by rage → ${total}`); } L.log.push(notes.join("; ")); return total; }
// ===== THE BOW (Sam, 9/28): hold to draw — a ranger is fully drawn in 1.4 s, anyone else 2.3 s — and let go to loose.
// Let go early and the arrow stays on the string. A quiver holds 12 arrows for the outing.
function fAimStart(at){ const L=FLD; if(L&&L.wolf){ fWolfBite(L,at); return; } if(!L||!L.kit||L.busy||L.ended||L.down||fNoAct(L)) return; if(!L.kit.ranged){ if(at&&(L.kit.special||L.kit.heal)) fSpecial(at); else if(at) fPop(at.x-L.ox(),at.y-L.oy(),"no bow or spell","#8a8078"); return; } const R=L.kit.ranged;
  if(R.kind!=="arrow"){ fFire(at); return; }
  if(L.ammo<=0){ fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-130,"quiver empty","#ff9a7a"); return; }
  if(!L.bowDraw) L.bowDraw={t:0}; if(at) L.mouse=at; }
function fAimRelease(){ const L=FLD; if(!L||!L.bowDraw) return; const R=L.kit&&L.kit.ranged; const d=L.bowDraw; L.bowDraw=null; if(!R) return;
  if(d.t<R.drawSeconds){ fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-130,"not fully drawn","#8a8078"); return; }
  L.rangedCool=0; L.ammo--; fFire(L.mouse||null,true); fKitButtons(L); }
function fBowTick(L,dt){ if(!L.bowDraw) return; const H=L.hero; L.bowDraw.t+=dt; H.act="attack"; H.actT=.14; H.bow=L.kit.ranged.name==="Longbow"?"longbow":"shortbow";
  if(L.mouse) H.dir=dirFrom(L.mouse.x-H.x,L.mouse.y-(H.y-52)); if(L.bowDraw.t>=L.kit.ranged.drawSeconds&&!L.bowDraw.full){ L.bowDraw.full=true; sfx("combat_melee_swing_light",{vol:.12,rate:1.8}); } }
function fBowDraw(L,sh){ if(!L.bowDraw||!L.kit||!L.kit.ranged) return; const k=Math.min(1,L.bowDraw.t/L.kit.ranged.drawSeconds); const full=k>=1;
  fg.save(); fg.lineWidth=4; fg.strokeStyle="rgba(0,0,0,.6)"; fg.beginPath(); fg.arc(sh.x,sh.y-60,58,0,6.283); fg.stroke();
  fg.strokeStyle=full?`rgba(255,226,138,${.7+.3*Math.sin(L.t*14)})`:"#b9a36a"; fg.beginPath(); fg.arc(sh.x,sh.y-60,58,-Math.PI/2,-Math.PI/2+6.283*k); fg.stroke();
  if(full){ fg.font="700 12px Cinzel"; fg.textAlign="center"; fg.fillStyle="#ffe28a"; fg.fillText("LOOSE",sh.x,sh.y-126); }
  if(L.mouse){ const mx=L.mouse.x-L.ox(), my=L.mouse.y-L.oy(); fg.strokeStyle=full?"rgba(255,226,138,.5)":"rgba(185,163,106,.25)"; fg.setLineDash([4,6]); fg.lineWidth=1.5; fg.beginPath(); fg.moveTo(sh.x,sh.y-52); fg.lineTo(mx,my); fg.stroke(); fg.setLineDash([]); }
  fg.restore(); }
// ===== DOWN AND DRAGGED HOME (Sam, 9/28: "show all the monsters leave and one of the party members dragging the dead
// character off the screen"). The fall plays, whatever was fighting loses interest and leaves the screen, then a
// companion comes in from the camp side, takes the fallen one under the arms and drags them back out the way they came.
function fPickRescuer(){ const pool=figures.filter(f=>f.i!==ME&&PARTY[f.i]&&(PARTY[f.i].hp??1)>0); const pcs=pool.filter(f=>PARTY[f.i].pc);
  const pick=(pcs.length?pcs:pool); return pick.length?pick[Math.floor(Math.random()*pick.length)]:null; }
function fRescueStart(L){ L.rescue={phase:"fall",t:0,fig:fPickRescuer(),stepAcc:0}; }
function fScreenExit(L,from,toward){ // where a straight line from `from` toward `toward` leaves this screen (plus a margin)
  const x0=L.ox()-70, y0=L.oy()-40, x1=L.ox()+FW+70, y1=L.oy()+FH+90; let dx=toward.x-from.x, dy=toward.y-from.y; const n=Math.hypot(dx,dy)||1; dx/=n; dy/=n; if(!dx&&!dy) dy=1;
  let t=1e9; if(dx>0) t=Math.min(t,(x1-from.x)/dx); if(dx<0) t=Math.min(t,(x0-from.x)/dx); if(dy>0) t=Math.min(t,(y1-from.y)/dy); if(dy<0) t=Math.min(t,(y0-from.y)/dy);
  return {x:from.x+dx*t,y:from.y+dy*t}; }
// a walkable route inside this screen, from the body to the screen edge nearest `goal` (tile grid, 8-way BFS)
function fRoute(L,from,goal){ const W=L.W, x0=L.sc.x*SCW, y0=L.sc.y*SCH, x1=x0+SCW, y1=y0+SCH; const ok=(x,y)=>x>=x0&&x<=x1&&y>=y0&&y<=y1&&F.passable(F.tileAt(W,x,y));
  const s={x:Math.round(from.x/VPX),y:Math.round(from.y/VPX)}; if(!ok(s.x,s.y)) return null; const key=(x,y)=>x+","+y; const prev=new Map([[key(s.x,s.y),null]]); const q=[s]; let best=null, bd=1e9;
  while(q.length){ const c=q.shift(); if(c.x===x0||c.x===x1||c.y===y0||c.y===y1){ const d=Math.hypot(c.x*VPX-goal.x,c.y*VPX-goal.y); if(d<bd){ bd=d; best=c; } }
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){ const n={x:c.x+dx,y:c.y+dy}; if(!ok(n.x,n.y)||prev.has(key(n.x,n.y))) continue; if(dx&&dy&&(!ok(c.x+dx,c.y)||!ok(c.x,c.y+dy))) continue; prev.set(key(n.x,n.y),c); q.push(n); } }
  if(!best) return null; const path=[]; for(let c=best;c;c=prev.get(key(c.x,c.y))) path.push({x:c.x*VPX,y:c.y*VPX}); path.reverse();
  // step off the edge of the screen
  const e=path[path.length-1]; path.push({x:e.x+(best.x===x0?-120:best.x===x1?120:0),y:e.y+(best.y===y0?-120:best.y===y1?140:0)}); return path; }
function fRescueTick(L,dt){ const R=L.rescue; if(!R) return; R.t+=dt; const H=L.hero;
  if(R.phase==="fall"&&R.t>1.1){ R.phase="leave"; R.t=0;
    for(const e of L.foes){ if(e.dead) continue; e.leaving=fScreenExit(L,e,{x:e.x+(e.x-H.x),y:e.y+(e.y-H.y)}); e.asleep=0; e.held=0; }
    if(L.foes.some(e=>e.leaving)) fPop(H.x-L.ox(),H.y-L.oy()-150,"they lose interest…","#b9a36a"); }
  if(R.phase==="leave"){ let out=true;
    for(const e of L.foes){ if(!e.leaving) continue; const dx=e.leaving.x-e.x, dy=e.leaving.y-e.y, d=Math.hypot(dx,dy); const v=Math.max(e.speed||120,150)*1.6*dt;
      if(d>v){ e.x+=dx/d*v; e.y+=dy/d*v; e.face=dx>0; out=false; } else e.gone=true; }
    if(out||R.t>2.8){ for(let i=L.foes.length-1;i>=0;i--) if(L.foes[i].leaving) L.foes.splice(i,1); L.fight=null; R.phase="come"; R.t=0;
      if(!R.fig){ R.phase="done"; return; }
      const camp={x:L.W.camp.x*VPX,y:L.W.camp.y*VPX}; const onScreen=camp.x>L.ox()&&camp.x<L.ox()+FW&&camp.y>L.oy()&&camp.y<L.oy()+FH;
      R.atFire=onScreen; R.home=onScreen?{x:camp.x+40,y:camp.y+70}:fScreenExit(L,H,camp);
      R.route=onScreen?null:fRoute(L,H,R.home); if(R.route){ R.home=R.route[R.route.length-1]; R.wp=R.route.slice(0,-1).reverse(); } else R.wp=[];
      R.x=R.home.x; R.y=R.home.y; R.dir=0; R.frame=0; R.ft=0;
      fPop(H.x-L.ox(),H.y-L.oy()-200,`${R.fig.name} comes for ${PARTY[ME].name}`,"#e3b95c"); } }
  if(R.phase==="come"||R.phase==="drag"){ const drag=R.phase==="drag"; if(!R.wpi) R.wpi=0; const wps=drag?(R.route||[]):R.wp; while(R.wpi<wps.length&&Math.hypot(wps[R.wpi].x-R.x,wps[R.wpi].y-R.y)<(drag?20:14)) R.wpi++;
    const last=drag?R.wpi>=wps.length:R.wpi>=wps.length; const tx=drag?(last?R.home.x:wps[R.wpi].x):(last?H.x+(R.x<H.x?-30:30):wps[R.wpi].x), ty=drag?(last?R.home.y:wps[R.wpi].y):(last?H.y-6:wps[R.wpi].y); const dx=tx-R.x, dy=ty-R.y, d=Math.hypot(dx,dy); const v=(drag?115:190)*dt;
    if(d>v){ R.x+=dx/d*v; R.y+=dy/d*v; R.ft+=dt*(drag?.7:1); if(R.ft>.1){ R.ft=0; R.frame++; }
      // walking in, the rescuer faces where they go; dragging, they back away facing the body
      R.dir=drag?dirFrom(H.x-R.x,H.y-R.y):dirFrom(dx,dy);
      const g=GAIT[R.fig.slug]||GAIT.kenta; R.stepAcc+=v; if(R.stepAcc>(drag?30:g.stride)){ R.stepAcc=0; sfx(STEPS[drag?"sneak":g.set],{vol:g.vol*(drag?.9:.8),rate:g.rate*(drag?.8:1)}); }
      if(drag){ const bx=R.x+(H.x-R.x)/Math.max(1,Math.hypot(H.x-R.x,H.y-R.y))*42, by=R.y+(H.y-R.y)/Math.max(1,Math.hypot(H.x-R.x,H.y-R.y))*14+8; H.x=bx; H.y=by; } }
    else if(!drag){ R.phase="grab"; R.t=0; R.wpi=0; R.dir=dirFrom(H.x-R.x,H.y-R.y); fPop(R.x-L.ox(),R.y-L.oy()-130,`${R.fig.name} takes ${PARTY[ME].name} under the arms`,"#e3b95c"); }
    else { R.phase="done"; if(R.atFire){ R.dir=dirFrom(H.x-R.x,H.y-R.y); fPop(R.x-L.ox(),R.y-L.oy()-130,`${PARTY[ME].name} is laid by the fire`,"#ffb070"); } } }
  if(R.phase==="grab"&&R.t>.9){ R.phase="drag"; R.t=0; }
  if(R.phase==="done"&&!R.carded){ R.carded=true; L.onRescued&&L.onRescued(); } }
// the rescuer carries a light of their own, so you can watch them come
function fCrystalGlow(L){ const cr=(L.crystals||{})[`${L.sc.x},${L.sc.y}`]; if(!cr||!cr.length) return; fg.save(); fg.globalCompositeOperation="lighter";
  for(const c of cr){ const p=.75+.25*Math.sin(L.t*1.6+c.x*.05), r=c.h*1.6; const g=fg.createRadialGradient(c.x,c.y,2,c.x,c.y,r); g.addColorStop(0,c.hue?`rgba(170,110,255,${.22*p})`:`rgba(90,170,255,${.22*p})`); g.addColorStop(1,"rgba(0,0,0,0)"); fg.fillStyle=g; fg.fillRect(c.x-r,c.y-r,r*2,r*2); }
  fg.restore(); }
function fRescueLight(L,ox,oy){ const R=L.rescue; if(!R||!R.fig||!(R.phase==="come"||R.phase==="grab"||R.phase==="drag"||(R.phase==="done"&&R.atFire))) return; const x=R.x-ox, y=R.y-oy-50;
  fg.save(); fg.globalCompositeOperation="lighter"; const g=fg.createRadialGradient(x,y,6,x,y,150); g.addColorStop(0,"rgba(255,190,110,.32)"); g.addColorStop(1,"rgba(255,190,110,0)"); fg.fillStyle=g; fg.fillRect(x-150,y-150,300,300); fg.restore(); }
// Sam, 9/29: the fallen go home on a stretcher. The rescuer sets it down on the grab beat; the body lies on it and it
// slides along behind them, its long axis turned toward whoever is pulling (kept within ~30° so the pixels stay crisp).
// a 2-px dark rim so the stretcher reads on top of mushrooms and rock of similar colour
let _gurneyO=null; function fGurneyImg(){ const g=fItem.gurney; if(!g||!g.width) return null; if(_gurneyO) return _gurneyO; const c=document.createElement("canvas"); c.width=g.width+4; c.height=g.height+4; const x=c.getContext("2d");
  for(const [dx,dy] of [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,-1],[-1,1],[1,1]]) x.drawImage(g,2+dx,2+dy); x.globalCompositeOperation="source-in"; x.fillStyle="#0c0908"; x.fillRect(0,0,c.width,c.height); x.globalCompositeOperation="source-over"; x.drawImage(g,2,2); _gurneyO=c; return c; }
function fGurneyDraw(L,sh){ const R=L.rescue, g=fGurneyImg(); if(!L.down||!R||!R.fig||!g||!g.width) return; if(!(R.phase==="grab"||R.phase==="drag"||R.phase==="done")) return;
  let a=Math.atan2(R.y-L.hero.y,R.x-L.hero.x); if(a>Math.PI/2) a-=Math.PI; if(a<-Math.PI/2) a+=Math.PI; a=Math.max(-.5,Math.min(.5,a));
  const k=R.phase==="grab"?Math.min(1,R.t/.45):1, s=.95;
  fg.save(); fg.translate(sh.x,sh.y+GURNEY_DY); fg.rotate(a); fg.globalAlpha=k;
  fg.fillStyle="rgba(0,0,0,.6)"; fg.beginPath(); fg.ellipse(0,g.height*s*.38,g.width*s*.52,g.height*s*.34,0,0,7); fg.fill();
  fg.imageSmoothingEnabled=false; fg.drawImage(g,-g.width*s/2,-g.height*s/2-(R.phase==="grab"?(1-k)*10:0),g.width*s,g.height*s); fg.restore(); }
let GURNEY_DY=-14;
function fRescueDraw(L,ox,oy){ const R=L.rescue; if(!R||!R.fig||!(R.phase==="come"||R.phase==="grab"||R.phase==="drag"||(R.phase==="done"&&R.atFire))) return; const f=R.fig;
  const im=R.phase==="grab"||R.phase==="done"?f.img.idle:f.img.walk; if(!im||!im.width) return; const n=Math.max(1,Math.round(im.width/128)), col=R.frame%n, s=.85; const x=R.x-ox, y=R.y-oy;
  fg.save(); fg.fillStyle="rgba(0,0,0,.45)"; fg.beginPath(); fg.ellipse(x,y,20*s,7*s,0,0,7); fg.fill(); fg.imageSmoothingEnabled=false; fg.drawImage(im,col*128,R.dir*128,128,128,x-64*s,y-120*s,128*s,128*s); fg.restore(); }
// ===== FORAGING BY HAND (Sam, 9/28): stand at a patch and HOLD SPACE; a bar fills — slower for harder things to get
// out of the rock — and when it's full you learn whether there was anything worth taking. Only what you can identify
// is highlighted. Brushing past fern, fungus and scrub gives a small haptic tick (phones that support vibration).
// "I think I found something." — in the character's own ElevenLabs voice (voice_id from their sheet). Scott's sheet
// has no voice yet, so he gets the words without the voice.
function fFound(L,pt){ if(pt.announced) return; pt.announced=true; if(L.t-(L.lastVoice??-99)<3.5) return; L.lastVoice=L.t;
  const k="voice_found_"+PARTY[ME].slug; if(fAu.buf[k]) sfx(k,{vol:.9,jitter:0}); L.bubble={text:"I think I found something.",t:2.4}; fBuzz(15); }
// ===== WILD CAPS AND SCRUB (Sam, 9/29): 1 in 20 finds something; otherwise a Con save, and on a failure 1d4 —
// 1 laughing and confused 4 s · 2 lose a heart, vomit, poisoned (green) a minute · 3 run in blind fear 5 s · 4 blind 4 s
function fWildForage(L,plant,hx,hy){ const p=PARTY[ME]; const conMod=Math.floor(((p.con||10)-10)/2); const r=F.wildForage({conMod,biome,catalog:new Set(Object.keys(PROPOF))},rng); L.log.push(r.note);
  if(r.found){ sfx("ui_item_pickup",{vol:.4}); fBuzz([20,40,20]);
    if(r.found.kind==="food"){ supplies+=1; $("sup").textContent=supplies; } else { PACK[r.found.slug]=(PACK[r.found.slug]||0)+1; }
    (L.wildFound||(L.wildFound=[])).push(r.found.name); fPop(hx,hy-150,`among the scrub: ${r.found.name}!`,"#ffe28a");
    (L.vanish||(L.vanish=[])).push({wx:plant.x+L.ox(),wy:plant.y+L.oy()+4,prop:r.found.kind==="food"?"fungi-ring":(PROPOF[r.found.slug]||"fungi-ring"),h:34,t:0}); return; }
  if(!r.effect){ fPop(hx,hy-150,"nothing worth taking","#8a8078"); sfx(STEPS.gravel,{vol:.12,rate:.7}); return; }
  fStatus(L,r.effect); }
function fStatus(L,kind){ const H=L.hero, OX=L.ox(), OY=L.oy(), S=L.status||(L.status={}); fBuzz([60,40,60]);
  L.gotSick=true;
  if(kind==="confused"){ S.confused=4; S.scramble=0; const k="laugh_"+PARTY[ME].slug; if(fAu.buf[k]) sfx(k,{vol:.9,jitter:0}); fPop(H.x-OX,H.y-OY-150,"ha… ha ha… what?","#c9a0ff"); }
  if(kind==="poisoned"){ S.poisoned=60; sfx("wild_vomit",{vol:.8,jitter:0}); fPop(H.x-OX,H.y-OY-150,"poisoned!","#8fdc5a"); fHurt(L,2,"a bad mushroom"); }
  if(kind==="frightened"){ S.frightened=5; const a=Math.random()*6.283; S.fx=Math.cos(a); S.fy=Math.sin(a); L.foraging=null; L.bowDraw=null; fPop(H.x-OX,H.y-OY-150,"terror! RUN!","#ff9a7a"); sfx("creature_player_hurt",{vol:.3,rate:1.3}); }
  if(kind==="blinded"){ S.blinded=4; fPop(H.x-OX,H.y-OY-150,"blinded!","#dcdcdc"); } }
function fNoAct(L){ const S=L&&L.status; return !!S&&(S.confused>0||S.frightened>0); }
function fHeroRoll(st,ac,e){ const S=FLD&&FLD.status; const dis=!!(S&&(S.poisoned>0||S.blinded>0)), adv=!!(e&&e.marked>0); if(adv) e.marked=0; const a=F.rollAttack(st,ac,rng); if(dis===adv) return a; const b=F.rollAttack(st,ac,rng);
  if(dis){ const w=(b.total<a.total)?b:a; w.note+=" (disadvantage)"; return w; } const w=(b.crit&&!a.crit)||(b.hit&&!a.hit)||(b.hit===a.hit&&b.total>a.total)?b:a; w.note+=" (advantage — lit by the Guiding Bolt)"; return w; }
function fStatusMove(L,kd,dt){ const S=L.status; if(!S) return kd;
  if(S.frightened>0){ const H=L.hero; const nx=H.x+S.fx*40, ny=H.y+S.fy*40; if(!L.canStand(nx,ny)){ const a=Math.random()*6.283; S.fx=Math.cos(a); S.fy=Math.sin(a); } return {x:S.fx,y:S.fy}; }
  if(S.confused>0){ S.scramble-=dt; if(S.scramble<=0){ S.scramble=.45; S.rot=(Math.random()-.5)*Math.PI*1.6; S.drift=Math.random()<.5; }
    const d=S.drift&&!kd.x&&!kd.y?{x:Math.cos(L.t*3),y:Math.sin(L.t*2.3)}:kd; const c=Math.cos(S.rot), s=Math.sin(S.rot); return {x:d.x*c-d.y*s,y:d.x*s+d.y*c}; }
  return kd; }
function fStatusTick(L,dt){ const S=L.status; if(!S) return; for(const k of ["confused","poisoned","frightened","blinded"]) if(S[k]>0){ S[k]=Math.max(0,S[k]-dt); if(!S[k]) fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-150,{confused:"clear-headed again",poisoned:"the sickness passes",frightened:"the terror fades",blinded:"sight returns"}[k],"#b9e0ff"); }
  if(S.confused>0&&Math.random()<dt*2) L.pops.push({x:L.hero.x-L.ox()+(Math.random()-.5)*40,y:L.hero.y-L.oy()-120,text:Math.random()<.5?"ha":"?",col:"#c9a0ff",t:0}); }
function fStatusDraw(L,sh){ const S=L.status; if(!S) return;
  if(S.blinded>0){ const a=Math.min(1,S.blinded)*.96; fg.save(); fg.fillStyle=`rgba(0,0,0,${a})`; fg.fillRect(0,0,FW,FH); const g=fg.createRadialGradient(sh.x,sh.y-50,4,sh.x,sh.y-50,70); g.addColorStop(0,`rgba(40,40,40,${a*.6})`); g.addColorStop(1,"rgba(0,0,0,0)"); fg.fillStyle=g; fg.fillRect(sh.x-70,sh.y-120,140,140); fg.font="700 18px Cinzel"; fg.textAlign="center"; fg.fillStyle="#b0b0b0"; fg.fillText(`BLIND ${Math.ceil(S.blinded)}`,FW/2,FH/2); fg.restore(); }
  const tags=[]; if(S.poisoned>0) tags.push(["POISONED "+Math.ceil(S.poisoned)+"s","#8fdc5a"]); if(S.confused>0) tags.push(["CONFUSED","#c9a0ff"]); if(S.frightened>0) tags.push(["FRIGHTENED","#ff9a7a"]);
  tags.forEach(([t,c],i)=>{ fg.font="700 12px Cinzel"; fg.textAlign="left"; fg.fillStyle=c; fg.fillText(t,16,122+i*16); });
  if(S.poisoned>0&&Math.random()<.04) L.pops.push({x:sh.x+(Math.random()-.5)*30,y:sh.y-110,text:"~",col:"#8fdc5a",t:0}); }
function fForageTime(pt){ if(pt.kind==="food"||!pt.slug) return 1.6; const dc=F.herbSpotDC(pt.slug); return dc>=16?4.5:dc>=13?3.2:2.2; } // seconds — PROPOSED

// ===== FISHING GEAR, REGROWTH, ROTHÉ, PARTS (Sam, 9/29) =====
// Fish, eels, crabs, crayfish and puffers need a spear, a net or a fishing rod in the pack (lib/camp-field
// fishingGear); without one the forage doesn't start. With one, a rod casts a line to a bobber, a net is thrown,
// a spear thrusts. Common mushrooms grow back somewhere else after a while; rare fungi don't, all night.
const fGear=()=>F.fishingGear({...PACK,...(GEARPICK?{[GEARPICK]:1}:{})});
const fSpeaker=()=>{ const s=FSPELL[PARTY[ME].slug]||{}; return F.canSpeakWithAnimals({cls:KITPICK||s.class||"",spells:[...(s.prepared||[]),...(s.cantrips||[])]}); };
function fFishDraw(L,sh){ const f=L.foraging; if(!f||!f.gear||!f.pt) return; const k=Math.min(1,f.t/f.need), x=f.pt.wx-L.ox(), y=f.pt.wy-L.oy(), hx=sh.x+(x>sh.x?16:-16), hy=sh.y-58, t=L.t;
  fg.save(); fg.imageSmoothingEnabled=false;
  if(f.gear.method==="rod"){ const tipx=hx+(x-hx)*.35, tipy=hy-34; fg.strokeStyle="#6b4a2a"; fg.lineWidth=3; fg.beginPath(); fg.moveTo(hx,hy); fg.lineTo(tipx,tipy); fg.stroke();
    const bx=x, by=y-4+Math.sin(t*5)*2+(k>.85?Math.sin(t*30)*3:0); fg.strokeStyle="rgba(230,230,210,.75)"; fg.lineWidth=1; fg.beginPath(); fg.moveTo(tipx,tipy); fg.quadraticCurveTo((tipx+bx)/2,Math.max(tipy,by)+18,bx,by); fg.stroke();
    fg.fillStyle="#d43a2a"; fg.fillRect(bx-3,by-6,6,4); fg.fillStyle="#f0ece0"; fg.fillRect(bx-3,by-2,6,3);
    fg.strokeStyle=`rgba(170,210,255,${.5*(1-(t*1.2%1))})`; fg.beginPath(); fg.ellipse(bx,by+2,6+(t*1.2%1)*14,2+(t*1.2%1)*4,0,0,7); fg.stroke(); }
  else if(f.gear.method==="net"){ const throwK=Math.min(1,Math.max(0,(k-.15)/.45)); const nx=hx+(x-hx)*throwK, ny=hy+(y-hy)*throwK-Math.sin(throwK*Math.PI)*60, r=8+throwK*26;
    fg.strokeStyle="rgba(210,190,140,.9)"; fg.lineWidth=1; for(let i=-2;i<=2;i++){ fg.beginPath(); fg.moveTo(nx-r,ny+i*r/3); fg.lineTo(nx+r,ny+i*r/3); fg.stroke(); fg.beginPath(); fg.moveTo(nx+i*r/3,ny-r*.6); fg.lineTo(nx+i*r/3,ny+r*.6); fg.stroke(); }
    if(throwK>=1){ fg.strokeStyle=`rgba(170,210,255,${.6*(1-(t*1.5%1))})`; fg.beginPath(); fg.ellipse(x,y,20+(t*1.5%1)*18,6+(t*1.5%1)*5,0,0,7); fg.stroke(); } }
  else { const ph=(t*1.6)%1, jab=ph<.25?ph/.25:ph<.5?1-(ph-.25)/.25:0; const sx=hx+(x-hx)*(.25+.55*jab), sy=hy+(y-hy)*(.25+.55*jab), a=Math.atan2(y-hy,x-hx);
    const sp=fItem.spear; if(sp&&sp.width){ fg.translate(sx,sy); fg.rotate(a+Math.PI/4); fg.drawImage(sp,-24,-24,48,48); fg.setTransform(1,0,0,1,0,0); }
    if(jab>.9) for(let i=0;i<3;i++) L.pops.push({x:x+(Math.random()-.5)*20,y:y-6,text:"·",col:"#aad8ff",t:.3}); }
  fg.restore(); }
// Sam, 9/29: speaking with animals is the middle mouse button (Shift on the keyboard) — for a druid, anyone with
// Speak with Animals, or anyone who has consumed something that grants it. Still a roll whether there's milk.
function fSpeak(){ const L=FLD; if(!L||L.busy||L.ended||L.down||L.foraging||fNoAct(L)) return; const H=L.hero, OX=L.ox(), OY=L.oy();
  if(!fSpeaker()){ fPop(H.x-OX,H.y-OY-150,"you can't speak with animals","#8a8078"); return; }
  const P=L.mode==="hunt"&&L.prey&&!L.prey.gone?L.prey:null;
  if(!P||Math.hypot(P.x-H.x,P.y-H.y)>240){ fPop(H.x-OX,H.y-OY-150,"no animal close enough to hear you","#8a8078"); return; }
  if(P.spoken){ fPop(P.x-OX,P.y-OY-90,"it has nothing more to say","#8a8078"); return; }
  if(P.slug!=="deep-rothe"){ P.spoken=true; P.look=0; P.warn=0; fPop(P.x-OX,P.y-OY-90,"it listens — and has nothing to give","#e8e0c8"); return; }
  L.foraging={speak:true,pt:null,i:-1,t:0,need:1.8,x:H.x,y:H.y}; L.tx=null; P.look=0; P.warn=0; fBuzz(12); }
function fRegrowTick(L){ const q=L.regrow; if(!q||!q.length||L.mode!=="forage") return; for(let i=q.length-1;i>=0;i--){ if(L.t<q[i].at) continue; const g=q.splice(i,1)[0];
    const sp=F.placeOnWorld(L.W,1,rng,{near:5,far:70,spacing:4})[0]; if(!sp) continue; L.field.patches.push({x:0,y:0,kind:g.kind,slug:g.slug,name:g.name,wx:sp.x*VPX,wy:sp.y*VPX}); } }
function fForageTarget(L){ if(!L||L.mode!=="forage"||!L.field) return null; const H=L.hero; let best=null, bd=62;
  L.field.patches.forEach((pt,i)=>{ if(L.picked.has(i)||pt.tried) return; const d=Math.hypot(pt.wx-H.x,pt.wy-H.y); if(d<bd){ bd=d; best={pt,i}; } }); return best; }
function fForageStart(){ const L=FLD; if(!L||L.busy||L.ended||L.down||L.foraging||fNoAct(L)) return !!(L&&L.foraging);
  const cc=fCorpseNear(L); if(cc){ const big={Small:2.2,Medium:3,Large:3.8,Huge:4.6}[cc.size]||3; L.foraging={corpse:cc,pt:null,i:-1,t:0,need:fCorpseStage(L,cc)==="bones"?.8:big,x:L.hero.x,y:L.hero.y}; L.tx=null; fBuzz(12); return true; }
  if(L.mode==="explore"&&L.poi&&!L.searched.has(`${L.poi.x},${L.poi.y}`)){ L.foraging={pt:null,search:true,i:-1,t:0,need:2.5,x:L.hero.x,y:L.hero.y}; L.tx=null; fBuzz(12); return true; }
  // the rothé, for someone who can talk to it
  const t=fForageTarget(L);
  if(t&&F.isWaterCatch(t.pt.slug)){ const g=fGear(); if(!g){ fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-150,"you need a spear, a net or a fishing rod","#9fd8ff"); sfx(STEPS.gravel,{vol:.1,rate:.7}); fBuzz(30); return false; }
    L.foraging={...t,gear:g,t:0,need:g.seconds,x:L.hero.x,y:L.hero.y}; L.tx=null; fBuzz(12); L.hero.act=g.method==="spear"?"attack":"cast"; L.hero.actT=0; return true; }
  L.foraging=t?{...t,t:0,need:fForageTime(t.pt),x:L.hero.x,y:L.hero.y}:{pt:null,i:-1,t:0,need:1.6,x:L.hero.x,y:L.hero.y}; L.tx=null; fBuzz(12); return true; }
function fForageRelease(){ const L=FLD; if(!L||!L.foraging) return; if(L.foraging.t<L.foraging.need){ fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-130,"you stop","#8a8078"); } L.foraging=null; }
function fForageTick(L,dt){ const f=L.foraging; if(!f) return; const H=L.hero;
  if(Math.hypot(H.x-f.x,H.y-f.y)>30||L.iframe>0.9){ L.foraging=null; fPop(H.x-L.ox(),H.y-L.oy()-130,"interrupted","#ff9a7a"); return; }
  f.t+=dt; if(f.pt) H.dir=dirFrom(f.pt.wx-H.x,f.pt.wy-H.y); if(f.corpse) H.dir=dirFrom(f.corpse.x-H.x,f.corpse.y-H.y); if(Math.floor(f.t*3)!==Math.floor((f.t-dt)*3)) sfx(STEPS.sneak,{vol:.07,rate:1.6});
  if(f.t<f.need) return; L.foraging=null;
  if(f.search){ $("fldsearch").disabled=false; $("fldsearch").onclick(); return; }
  if(f.corpse){ fButcher(L,f.corpse); return; }
  if(f.speak){ const P=L.prey; if(!P||P.gone) return; const g=F.rotheGift(rng); P.spoken=true; L.log.push(`${PARTY[ME].name} speaks with the rothé (d20 ${g.roll} vs ${F.ROTHE_MILK_DC}). ${g.note}`);
    // Sam, 9/29: "Malachar laughs and says you just milked a male Rothe. It says thank you!"
    if(!g.hasMilk){ fPop(P.x-L.ox(),P.y-L.oy()-90,"…that's not an udder","#e8e0c8"); speak(`<b>MALACHAR</b>\n<i>“Ha! Ha ha ha! You just milked a male rothé. …It says thank you!”</i>`); fMalVoice("rothe_male"); L.gotMilkedMale=true; return; }
    P.gone=true; g.items.forEach(it=>PACK[it.slug]=(PACK[it.slug]||0)+it.quantity);
    L.kill={ok:true,food:0,byp:null,gift:g.items,line:g.note}; sfx("ui_item_pickup",{vol:.4}); fBuzz([20,40,20]);
    fPop(P.x-L.ox(),P.y-L.oy()-90,g.items.map(i=>i.name).join(" + "),"#e8e0c8"); fSay(`<b>HUNT</b>\n${PARTY[ME].name} speaks with the rothé. ${g.note}`); L.huntOver=3; return; }
  if(!f.pt){ const key=`${L.sc.x},${L.sc.y}`, hx=H.x-L.ox(), hy=H.y-L.oy(); const plant=((L.plants||{})[key]||[]).filter(p=>!p.tried).sort((a,b)=>Math.hypot(a.x-hx,a.y-hy)-Math.hypot(b.x-hx,b.y-hy))[0];
    if(!plant||Math.hypot(plant.x-hx,plant.y-hy)>70){ fPop(hx,hy-150,"nothing to forage here","#8a8078"); sfx(STEPS.gravel,{vol:.12,rate:.7}); fBuzz(30); return; }
    plant.tried=true; fWildForage(L,plant,hx,hy); return; }
  const pt=f.pt, x=pt.wx-L.ox(), y=pt.wy-L.oy()-40;
  if(pt.kind==="reagent"&&pt.spot!=="seen"){ pt.tried=true; fPop(x,y,"just mold — nothing worth taking","#8a8078"); sfx(STEPS.gravel,{vol:.12,rate:.7}); fBuzz(30); L.log.push(`Picked through a patch of what looked like mold — nothing.`); return; }
  L.picked.add(f.i); fBuzz([20,40,20]);
  if(F.isRareFungus(pt.slug)&&NIGHT) NIGHT.rareTaken.add(pt.slug);
  if(F.regrows(pt.slug)) (L.regrow||(L.regrow=[])).push({at:L.t+F.COMMON_REGROW_SECONDS,slug:pt.slug,name:pt.name,kind:pt.kind});
  if(!pt.slug){ fPop(x,y,"scrub — nothing edible","#8a8078"); sfx(STEPS.gravel,{vol:.12,rate:.7}); return; }
  const named=pt.kind==="food"&&pt.slug&&pt.slug!=="edible-mushrooms"; if(named) PACK[pt.slug]=(PACK[pt.slug]||0)+1;
  (L.gathered||(L.gathered=[])).push(pt.kind==="food"&&!named?"a day of food":pt.name.toLowerCase());
  if(named){ const hz=F.catchHazard(pt.slug,{dexMod:Math.floor((((FSPELL[PARTY[ME].slug]||{}).dex||10)-10)/2)},rng); if(hz.note) L.log.push(hz.note);
    if(hz.hurt>0){ fPop(x,y-30,"ZAP — the eel shocks you","#9fd8ff"); sfx("combat_melee_hit_flesh",{vol:.4,rate:1.6}); fHurt(L,hz.hurt,"an eel's shock"); } else if(pt.slug==="subterranean-puffer-fish") fPop(x,y-30,"careful — poisonous if prepared wrong","#c9a0ff"); }
  sfx("ui_item_pickup",{vol:.4}); fPop(x,y,pt.kind==="food"&&!named?"foraged: a day of food":`foraged: ${pt.name}`,pt.kind==="food"?"#e3b95c":"#b9e0ff");
  (L.vanish||(L.vanish=[])).push({wx:pt.wx,wy:pt.wy,prop:PROPOF[pt.slug]||"fungi-ring",h:pt.kind==="food"?50:58,t:0}); }
function fForageDraw(L,sh){
  // what was picked shrinks into the hand and is gone
  if(L.vanish) for(let i=L.vanish.length-1;i>=0;i--){ const v=L.vanish[i]; v.t+=1/60; if(v.t>.7){ L.vanish.splice(i,1); continue; } const k=v.t/.7, x=v.wx-L.ox(), y=v.wy-L.oy();
    fDrawProp(v.prop,x+(sh.x-x)*k*.6,y+6+(sh.y-50-y)*k*.6,v.h*(1-k),1-k); if(Math.random()<.4) L.pops.push({x:x+(Math.random()-.5)*30,y:y-10,text:"✦",col:"#ffe28a",t:.6}); }
  if(L.bubble){ L.bubble.t-=1/60; if(L.bubble.t<=0) L.bubble=null; else { const a=Math.min(1,L.bubble.t*2); fg.save(); fg.globalAlpha=a; fg.font="italic 600 14px Cinzel"; const w=fg.measureText(L.bubble.text).width+22, bx=sh.x-w/2, by=sh.y-176;
      fg.fillStyle="rgba(250,242,220,.95)"; fg.beginPath(); fg.roundRect?fg.roundRect(bx,by,w,28,10):fg.rect(bx,by,w,28); fg.fill(); fg.beginPath(); fg.moveTo(sh.x-6,by+28); fg.lineTo(sh.x+6,by+28); fg.lineTo(sh.x,by+38); fg.fill();
      fg.fillStyle="#2a1f14"; fg.textAlign="center"; fg.fillText(L.bubble.text,sh.x,by+19); fg.restore(); } } if(!L.foraging&&!L.down){ const t=L.mode==="forage"?fForageTarget(L):(L.mode==="explore"&&L.poi&&!L.searched.has(`${L.poi.x},${L.poi.y}`)); if(t){ fg.font="600 13px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e3b95c"; fg.fillText(L.mode==="explore"?"hold SPACE to search":"hold SPACE to forage",sh.x,sh.y+24); } }
  const f=L.foraging; if(!f) return; const k=Math.min(1,f.t/f.need), w=110, x=sh.x-w/2, y=sh.y-140;
  fg.save(); fg.fillStyle="rgba(6,5,10,.85)"; fg.fillRect(x-2,y-2,w+4,14); fg.fillStyle=k>=1?"#ffe28a":"#8fbf5a"; fg.fillRect(x,y,w*k,10); fg.strokeStyle="#9c7a3a"; fg.strokeRect(x-1.5,y-1.5,w+3,13);
  fg.font="600 12px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e8d9b0"; fg.fillText(f.search?"searching this spot…":!f.pt?"searching the ground…":f.pt.kind==="reagent"&&f.pt.spot!=="seen"?"picking through the mold…":f.pt.kind==="food"?"gathering…":f.pt.slug?`working ${f.pt.name.toLowerCase()} free…`:"picking through the scrub…",sh.x,y-6); fg.restore(); }
// haptics: navigator.vibrate works on Android browsers; iPhones' Safari has no vibration API, so there it is silent
function fBuzz(p){ try{ if(navigator.vibrate) navigator.vibrate(p); }catch(e){} }
function fBrushTick(L){ const H=L.hero; if(!H.moving) return; const key=`${L.sc.x},${L.sc.y}`; const P=(L.plants||{})[key]; if(!P) return; const hx=H.x-L.ox(), hy=H.y-L.oy(); const now=L.t;
  for(const p of P){ if(Math.abs(p.x-hx)>30||Math.abs(p.y-hy)>22) continue; if(p.last&&now-p.last<1.5) continue; p.last=now; fBuzz(9); sfx(STEPS.sneak,{vol:.06,rate:1.9,jitter:.15});
    for(let k=0;k<3;k++) L.pops.push({x:p.x+(Math.random()-.5)*20,y:p.y-8,text:"·",col:/fungi|spores/.test(p.k)?"#9ad8ff":"#8fbf5a",t:0}); break; } }
// ===== MALACHAR (Sam, 9/29): he tells you what to do going in, and at the fire he sums up — what you killed, what you
// foraged — and then has his say. His voice is the app's lich voice (ElevenLabs "The Lich"); the lines are pre-recorded.
const MAL_INTRO={forage:"Out you go, then. Find something edible before your lantern dies — and do try not to eat anything that laughs back.",
  hunt:"A hunt. How ambitious. Creep up on it, freeze when it looks at you, and bring back meat — preferably not your own.",
  prey:{"giant-rat":"A hunt. How ambitious. Tonight it's a giant rat. Creep up on it, freeze when it looks at you, and bring back meat — preferably not your own.","giant-fire-beetle":"A hunt. Tonight it's a giant fire beetle. Follow the glow, freeze when it turns, and bring back meat. Do try not to catch fire.","giant-bat":"A hunt. Tonight it's a giant bat. It hears you long before it sees you, so freeze when it listens. Bring back meat — not bites.","deep-rothe":"A hunt. Tonight it's a deep rothé. Big, stupid, and it will gore you if it notices. Creep close, freeze when it looks, and bring back meat and hide.","giant-lizard":"Oh, look at you. A giant lizard tonight — slow, fat, and delicious. Creep close, freeze when it looks, and don't let that tail knock your teeth out.","male-steeder":"A steeder. The duergar ride these. It jumps sixty feet when it's frightened — so don't frighten it. Freeze when it looks, and bring me back its spinneret.","female-steeder":"Oh, this is a treat. A female steeder. Twice his size, twice his temper. If she sees you, she doesn't run. She comes for you. Good luck, little morsel.","giant-toad":"A giant toad tonight. Fat, slow, and it swallows things whole — so don't be a thing. Freeze when it looks, and bring back the legs.","chuul":"A chuul. The drow pay a fortune for chuul, roasted over mushrooms. It has pincers that could halve you, and it will not run. Enjoy.","giant-spider":"Well, well. A giant spider. You don't hunt these. They let you think you are. Webs, venom, and a very long memory. If it spots you — fight, or die tangled. I'll be watching."},
  explore:"Explore, little lamp-bearer. Search what glitters, ignore what whispers, and be back at the fire before the dark notices you."};
const MAL_COMMENT={empty:"Nothing. You went all that way for nothing. I'm almost proud.",kills:"Blood on your boots and something dead behind you. Now we're talking.",
  haul:"Look at you. A regular little gardener of the deep. The party eats tonight… pity.",both:"Fed and bloodied. The Underdark will remember you… briefly.",
  sick:"And you ate the wrong mushroom. Of course you did.",down:"Dragged home like a sack of turnips. Delightful."};
// Malachar speaks through the decoded buffer when it is ready; if this browser will not decode it (or is slow to),
// the same clip plays through an ordinary <audio> player instead, so he is never silently skipped (Sam, 9/29: "I don't hear him").
const fMalEl={};
function fMalVoice(key,tries=0){ const k="mal_"+key; if(fAu.ctx&&fAu.ctx.state==="suspended") fAu.ctx.resume();
  if(fAu.buf[k]&&fAu.ctx&&fAu.ctx.state==="running"){ sfx(k,{vol:1,jitter:0}); return; }
  if(tries===0) fAudio();
  if((fAu.bad&&fAu.bad[k])||tries>=14){ if(!FSFX[k]) return; const a=fMalEl[k]||(fMalEl[k]=new Audio(FSFX[k])); a.volume=1; a.currentTime=0; a.play().catch(()=>{}); return; }
  setTimeout(()=>fMalVoice(key,tries+1),150); }
const MALBOX=(t)=>`<div class="malbox"><b>MALACHAR</b><i>“${t}”</i></div>`;
function fListNames(arr){ const c={}; arr.forEach(n=>c[n]=(c[n]||0)+1); const w=["","one","two","three","four","five","six"]; const parts=Object.entries(c).map(([n,k])=>k>1?`${w[k]||k} ${n.replace(/^a day of food$/,"days of food").replace(/(?<!s)$/,k>1&&!/food/.test(n)?"s":"")}`:(/^(a|an) /.test(n)?n:`${/^[aeiou]/i.test(n)?"an":"a"} ${n}`));
  return parts.length<2?parts.join(""):parts.slice(0,-1).join(", ")+" and "+parts[parts.length-1]; }
function fMalSummary(L,down){ const p=PARTY[ME]; const killed=[]; Object.entries(L.kills||{}).forEach(([n,k])=>{ for(let i=0;i<k;i++) killed.push(n.toLowerCase()); });
  const got=[...(L.gathered||[]),...(L.wildFound||[]).map(x=>x.toLowerCase()),...(L.mode==="hunt"&&L.kill&&L.kill.gift?L.kill.gift.map(g=>g.name.toLowerCase()):[]),...(L.mode==="hunt"&&L.kill&&L.kill.ok?Array(L.kill.food).fill(((L.prey&&F.meatFor(L.prey.slug))||{name:"a day of food"}).name.toLowerCase()).concat(L.kill.byp?[((FCAT.find(c=>c.slug===L.kill.byp)||{name:L.kill.byp}).name).toLowerCase()]:[]):[]),...(L.finds||[]).filter(f=>!/^DM/.test(f)).map(f=>f.replace(/^\d+×\s*/,"").toLowerCase())];
  const bits=[]; if(L.mode==="hunt"&&L.kill&&!L.kill.ok) bits.push(`The prey got away.`); if(killed.length) bits.push(`${p.name} killed ${fListNames(killed)}.`); if(got.length) bits.push(`${L.mode==="forage"?"Foraged":"Brought back"} ${fListNames(got)}.`);
  const key=down?"down":L.gotSick&&!killed.length&&!got.length?"sick":killed.length&&got.length?"both":killed.length?"kills":got.length?"haul":L.gotSick?"sick":"empty";
  return {text:`${down?`${p.name} comes back to the fire the hard way.`:`${p.name} comes back to the fire.`} ${bits.join(" ")||"Empty-handed."} ${MAL_COMMENT[key]}`,key}; }
function theNight(){ const seed="mock-"+biome; if(!NIGHT||NIGHT.seed!==seed) NIGHT={seed,W:F.buildExploreWorld(seed,FROWS),seen:new Set(),searched:new Map(),screenFoes:{},outings:0,rareTaken:new Set()}; if(!NIGHT.rareTaken) NIGHT.rareTaken=new Set(); return NIGHT; }
function startForage(){ const ok=startWorld("forage"); if(!ok){ budget[ME]++; refresh(); } return ok; }
function startHunt(){ const ok=startWorld("hunt"); if(!ok){ budget[ME]++; refresh(); } return ok; }
function startExplore(){ return startWorld("explore"); }
const LOS=(L,ax,ay,bx,by)=>{ const n=Math.ceil(Math.hypot(bx-ax,by-ay)/28); for(let i=1;i<n;i++){ const t=i/n; if(L.tileW(ax+(bx-ax)*t,ay+(by-ay)*t-20)===F.T.WALL) return false; } return true; };
function startWorld(mode){ const p=PARTY[ME], f=me();
  const node={node_type:"waypoint",name:BIOMES[biome].name,metadata:{seed:"mock-"+biome}}; const perm=F.explorePermit(node);
  if(!perm.ok){ fSay(`<b>${mode.toUpperCase()}</b>\n${perm.reason}`); return false; }
  // Sam, 9/29: nobody goes out without oil or a light source somewhere in the party
  const light=F.lightFor([PACK,...Object.entries(PACKS).filter(([i])=>+i!==ME).map(([,v])=>v)]);
  if(!light.ok){ fSay(`<b>${mode.toUpperCase()}</b>\n${light.note} ${p.name} stays by the fire.`); flash("NO LIGHT — NO ONE GOES OUT",true); return false; }
  const N=theNight(), W=N.W; N.outings++;
  let sub="", extra={};
  if(mode==="forage"){ const out=C.forage(sheetOf(f),rng,{dc:F.FORAGE_DC.underdark}); const field=F.forageField({success:out.check.success,supplies:out.supplies,biome,rng,catalog:new Set(Object.keys(PROPOF)),water:true,taken:NIGHT&&NIGHT.rareTaken});
    const wet=field.patches.filter(q=>q.water), dry=field.patches.filter(q=>!q.water); const spots=F.placeOnWorld(W,dry.length,rng,{near:5,far:70,spacing:4}), shore=wet.length?F.placeOnWorld(W,wet.length,rng,{near:4,far:90,spacing:3,shore:true}):[];
    dry.forEach((pt,i)=>{ const s=spots[i]||spots[0]||W.camp; pt.wx=s.x*VPX; pt.wy=s.y*VPX; }); wet.forEach((pt,i)=>{ const s=shore[i]||spots[i%Math.max(1,spots.length)]||W.camp; pt.wx=s.x*VPX; pt.wy=s.y*VPX; });
    extra={field,picked:new Set(),roll:out};
    sub=`Survival <b>${out.check.total}</b> vs DC ${F.FORAGE_DC.underdark} — ${out.check.success?`<b>there is food out there</b>: ${out.supplies} day${out.supplies===1?"":"s"}' worth, and fungi, scattered through the caves`:"<b>the caves near camp are bare</b> — anything that grows here is scrub"}. Stand at a patch and <b>hold Space</b> to forage it — only what you can identify is highlighted. Carry it back to the fire.`; }
  else if(mode==="hunt"){ const pc=window.__forcePrey?{prey:F.PREY.find(q=>q.slug===window.__forcePrey),flags:[]}:F.choosePrey(biome,rng,new Set(F.PREY.map(q=>q.slug).filter(k=>fMon[k]))); const at=F.placeOnWorld(W,1,rng,{near:18,far:60})[0]||W.camp;
    extra={prey:{...pc.prey,home:{x:at.x*VPX,y:at.y*VPX},x:at.x*VPX,y:at.y*VPX,look:0,lookT:3,warn:0,gone:false},noise:0,huntFlags:pc.flags,tracks:{x:at.x+Math.round((rng()-.5)*10),y:at.y+Math.round((rng()-.5)*6)},kill:null};
    sub=`${p.name} goes after a <b>${pc.prey.name.toLowerCase()}</b>. Its tracks point somewhere on the map (the paw on your map is only roughly right). Creep up on it — <b>freeze when it looks up</b>; rock between you hides you. Every time it sees you move, the noise rises, and noise brings other things.`; }
  else sub=`${perm.reason} <b>Search</b> the few places that glint — most of the dark holds nothing.`;
  const preySlug=mode==="hunt"&&extra.prey&&MAL_INTRO.prey[extra.prey.slug]?extra.prey.slug:null; fOpen(mode,mode.toUpperCase(),MALBOX(preySlug?MAL_INTRO.prey[preySlug]:MAL_INTRO[mode])+(dmView?`<span class="dmx">${sub} Rivers cross only at fords, the chasm only on its bridges. <b>Get back to the fire before the lantern dies.</b></span>`:"")); setTimeout(()=>fMalVoice(preySlug?"hunt_"+preySlug:"intro_"+mode),250);
  const camp={x:W.camp.x*VPX,y:W.camp.y*VPX};
  const occ=F.lairOccupant(FROWS,rng);
  FLD={mode,...extra,t:0,pops:[],fx:[],foes:[],screenFoes:N.screenFoes,hp:p.hp,hpMax:p.hpMax,oil:F.LANTERN_WORLD_SECONDS,hour:0,hourT:F.HOUR_SECONDS,W,occ,lairState:null,
    sc:{x:Math.floor(W.camp.x/SCW),y:Math.floor(W.camp.y/SCH)},seen:N.seen,searched:N.searched,hero:fHero(camp.x,camp.y+120),finds:[],ended:false,log:[],busy:false,scroll:null,screens:{},
    // world <-> screen
    ox(){ return this.sc.x*SCW*VPX; }, oy(){ return this.sc.y*SCH*VPX+YOFF; },
    tileW(wx,wy){ return F.tileAt(this.W,Math.round(wx/VPX),Math.round(wy/VPX)); },
    canStand(wx,wy){ return F.passable(this.tileW(wx,wy))&&F.passable(this.tileW(wx-14,wy))&&F.passable(this.tileW(wx+14,wy)); },
    tick(dt){ const H=this.hero; if(this.huntOver!=null&&!this.ended&&!this.down){ this.huntOver-=dt; if(this.huntOver<=0){ this.huntOver=null; endWorld(false,""); return; } }
      if(!this.busy&&!this.down&&!this.scroll){ this.oil=Math.max(0,this.oil-dt); this.hourT-=dt; if(this.hourT<=0){ this.hourT=F.HOUR_SECONDS; this.hour++; exploreDanger(); } if(this.oil<=0) lanternOut(); }
      if(!this.busy&&!this.down&&!this.scroll){ this.walk(dt); fFoesTick(this,dt,{x0:this.ox()+30,y0:this.oy()+40,x1:this.ox()+FW-30,y1:this.oy()+FH-20}); fKitTick(this,dt); fStatusTick(this,dt); fBloodTick(this,dt); fRegrowTick(this); fBowTick(this,dt); fSpread(this,dt); fFightTick(this); fForageTick(this,dt); fBrushTick(this); this.edge(); this.near(); if(this.mode==="forage") this.gather(); if(this.mode==="hunt") this.stalk(dt); }
      if(this.down&&this.rescue) fRescueTick(this,dt);
      this.draw(dt); },
    walk(dt){ const H=this.hero; const kd=fStatusMove(this,fKeyDir(),dt); if(kd.x||kd.y){ const n=Math.hypot(kd.x,kd.y); this.tx=H.x+kd.x/n*40; this.ty=H.y+kd.y/n*40; }
      if(this.tx==null) { H.moving=false; return; }
      const dx=this.tx-H.x, dy=this.ty-H.y, dist=Math.hypot(dx,dy); if(dist<3){ H.moving=false; return; }
      const slow=F.slowFactor(this.tileW(H.x,H.y)); const v=Math.min(dist,200*(this.wolf?TUNE.wolfSpeedFt/30:TUNE.moveSpeedPct/100*(this.kit?this.kit.moveMul:1))*(this.bowDraw||this.shield?.5:1)*slow*dt); const nx=H.x+dx/dist*v, ny=H.y+dy/dist*v;
      // slide along walls and water rather than stopping dead
      if(this.canStand(nx,ny)){ H.x=nx; H.y=ny; } else if(this.canStand(nx,H.y)){ H.x=nx; } else if(this.canStand(H.x,ny)){ H.y=ny; } else { H.moving=false; this.tx=H.x; this.ty=H.y; return; }
      fFootstep(this,Math.hypot(H.x-(this._px??H.x),H.y-(this._py??H.y)),this.tileW(H.x,H.y)); this._px=H.x; this._py=H.y; H.dir=dirFrom(dx,dy); H.moving=true; H.ft+=dt*(slow<1?.5:1); if(H.ft>0.1){ H.ft=0; H.frame++; }
      if(slow<1&&Math.random()<dt*3) fPop(H.x-this.ox(),H.y-this.oy()-10,slow<.4?"· stuck ·":"~",slow<.4?"#cfd8ea":"#8ad8ff"); },
    // Walking off the edge of the screen scrolls to the next one, Zelda-style.
    edge(){ const H=this.hero; const nx=Math.max(0,Math.min(this.W.screens.nx-1,Math.floor(H.x/(SCW*VPX)))), ny=Math.max(0,Math.min(this.W.screens.ny-1,Math.floor(H.y/(SCH*VPX))));
      if(nx===this.sc.x&&ny===this.sc.y) return; const dx=nx-this.sc.x, dy=ny-this.sc.y;
      this.scroll={from:{...this.sc},dx,dy,t:0}; this.sc={x:nx,y:ny}; this.enterScreen(); },
    enterScreen(){ const key=`${this.sc.x},${this.sc.y}`; if(!this.seen.has(key)){ this.seen.add(key); }
      this.foes=this.screenFoes[key]||(this.screenFoes[key]=this.spawnFoes(key)); },
    spawnFoes(key){ const r=F.seededRng(key+"foes"); const slugs=F.roomRoamers(key+"w",biome,false).slice(0,2); const out=[];
      for(const s of slugs){ for(let k=0;k<40;k++){ const wx=this.ox()+60+r()*(FW-120), wy=this.oy()+60+r()*(FH-120); if(this.canStand(wx,wy)&&Math.hypot(wx-this.hero.x,wy-this.hero.y)>280&&Math.hypot(wx-this.W.camp.x*VPX,wy-this.W.camp.y*VPX)>300){ const f=fMakeFoes([s],key+k,null)[0]; f.x=wx; f.y=wy; out.push(f); break; } } }
      return out; },
    gather(){ const H=this.hero; this.field.patches.forEach((pt,i)=>{ if(this.picked.has(i)) return; const dd=Math.hypot(pt.wx-H.x,pt.wy-H.y);
      // a reagent patch has to be spotted first: one Wisdom (Survival) roll as you come near it
      if(pt.kind==="reagent"&&!pt.spot&&dd<150){ const s=fSurv(); const r=F.spotHerb({...s,dc:F.herbSpotDC(pt.slug),name:pt.name},rng); pt.spot=r.success?"seen":"missed"; this.log.push(r.note);
        if(r.success){ this.spotted=(this.spotted||0)+1; fFound(this,pt); } else { this.missed=(this.missed||0)+1; fPop(pt.wx-this.ox(),pt.wy-this.oy()-70,"just mold…","#6a6070"); } }
      if(pt.kind==="food"&&pt.slug&&dd<150) fFound(this,pt);
    }); },
    stalk(dt){ const P=this.prey, H=this.hero; if(!P||P.gone) return;
      // it grazes near home; it looks up now and then
      P.x=P.home.x+Math.sin(this.t*.4)*80; P.y=P.home.y+Math.sin(this.t*.27)*50;
      P.lookT-=dt; if(P.look>0){ P.look-=dt; if(P.look<=0){ P.lookT=1.6+Math.random()*2.4; P.spotted=false; } } else if(P.lookT<=.5&&P.warn<=0) P.warn=.5; if(P.warn>0){ P.warn-=dt; if(P.warn<=0) P.look=1.1+Math.random()*.6; }
      const d=Math.hypot(H.x-P.x,H.y-P.y);
      if(P.look>0&&H.moving&&!P.spotted&&d<460&&LOS(this,P.x,P.y,H.x,H.y)){ P.spotted=true; this.noise++; fPop(P.x-this.ox(),P.y-this.oy()-80,"!","#ff6a4a");
        if(this.noise>=F.MAX_NOISE-1&&P.fightsBack&&fPreyTurns(this,P)) return; if(this.noise>=F.MAX_NOISE-1){ P.gone=true; this.kill={ok:false,line:`Too loud — the ${P.name.toLowerCase()} bolts into the dark.`}; fPop(P.x-this.ox(),P.y-this.oy()-110,"it bolts","#ff9a7a"); fSay(`<b>HUNT</b>\n${this.kill.line}`); if(!this.kill.ok) this.huntOver=2.4; } }
      if(d<70){ const r=C.hunt(sheetOf(me()),rng,{dc:F.FORAGE_DC.underdark}); P.gone=true;
        if(r.check.success){ r.supplies=F.preyFood(P,r.supplies); this.kill={ok:true,food:r.supplies,byp:P.byproduct||null,line:`Survival ${r.check.total} vs DC 15 — the kill is clean: ${r.supplies} day${r.supplies===1?"":"s"} of food${P.byproduct?` and ${(FCAT.find(c=>c.slug===P.byproduct)||{name:P.byproduct}).name}`:""}. Carry it home.`}; fPop(P.x-this.ox(),P.y-this.oy()-60,`+${r.supplies} day${r.supplies===1?"":"s"}`,"#e3b95c"); }
        else if(P.fightsBack&&fPreyTurns(this,P)) return;
        else { this.kill={ok:false,line:`Survival ${r.check.total} vs DC 15 — the ${P.name.toLowerCase()} twists free and is gone into a crack.`}; fPop(P.x-this.ox(),P.y-this.oy()-60,"it gets away","#ff9a7a"); }
        fSay(`<b>HUNT</b>\n${this.kill.line}`); if(!this.kill.ok) this.huntOver=2.4; } },
    // Search and camp are things you do standing somewhere, not buttons that work from anywhere.
    near(){ const H=this.hero; this.poi=null; for(const p of this.W.pois){ if(Math.hypot(p.x*VPX-H.x,p.y*VPX-H.y)<90){ this.poi=p; break; } }
      $("fldsearch").disabled=this.mode!=="explore"||!this.poi||this.searched.has(`${this.poi.x},${this.poi.y}`);
      this.atCamp=Math.hypot(this.W.camp.x*VPX-H.x,this.W.camp.y*VPX-H.y)<150; $("fldback").disabled=!this.atCamp;
      const lair=this.W.lair; if(!this.lairState&&Math.hypot(lair.x*VPX-H.x,lair.y*VPX-H.y)<260) lairEnter(); },
    screenCanvas(sx,sy){ const key=`${sx},${sy}`; if(this.screens[key]) return this.screens[key]; if(!fTiles.complete||!fWTiles.water.complete||!fWTiles.chasm.complete) return null;
      const c=document.createElement("canvas"); c.width=FW; c.height=FH; const g=c.getContext("2d"); const r=F.seededRng(key+"tiles"); const W=this.W;
      const T=F.T, isW=(t)=>t===T.WALL, isWet=(t)=>t===T.DEEP||t===T.FORD, isGap=(t)=>t===T.CHASM||t===T.BRIDGE;
      for(let j=0;j<SCH;j++) for(let i=0;i<SCW;i++){ const vx=sx*SCW+i, vy=sy*SCH+j; const cs=[F.tileAt(W,vx,vy),F.tileAt(W,vx+1,vy),F.tileAt(W,vx,vy+1),F.tileAt(W,vx+1,vy+1)];
        const x=i*VPX, y=j*VPX+YOFF; let set="rock", up=isW;
        if(cs.some(isW)) { set="rock"; up=isW; } else if(cs.some(isWet)) { set="water"; up=(t)=>isWet(t)||isGap(t); } else if(cs.some(isGap)) { set="chasm"; up=isGap; } else { set="rock"; up=()=>false; }
        fWTile(g,set,cs.map(t=>up(t)?"U":"L").join(""),x,y,r); }
      // ground cover and what stands on it
      const deco=FDECOR[biome]||FDECOR.tunnels; const plants=(this.plants||(this.plants={}))[key]=[]; const PLANTY=/fern|moss|flowers|reeds|stump|fungi|lichen|spores|log/;
      for(let j=0;j<=SCH;j++) for(let i=0;i<=SCW;i++){ const vx=sx*SCW+i, vy=sy*SCH+j, t=F.tileAt(W,vx,vy), x=i*VPX, y=j*VPX+YOFF;
        if(t===T.FORD&&(i+j)%1===0) fDrawProp("boulder",x+ (r()-.5)*14,y+10,22,1,g);
        else if(t===T.BRIDGE) fDrawProp("rope-bridge",x,y+34,72,1,g);
        else if(t===T.WEB&&r()<.6) fDrawProp("web-floor-sheet",x,y+20,50,1,g);
        else if(t===T.MUCK&&r()<.6) fDrawProp("slime-pool",x,y+16,40,1,g);
        else if(t===T.FLOOR&&r()<.05&&i>0&&j>0){ const s=deco[Math.floor(r()*deco.length)]; fDrawProp(s,x,y+20,/stalagmite|boulder|stump|log|reeds/.test(s)?54:40,1,g); if(PLANTY.test(s)) plants.push({x,y:y+14,k:s}); }
        // wild mushrooms (Sam, 9/28: "add some mushrooms"): scenery only, nothing to gather — they crowd the cave walls
        if(t===T.FLOOR&&i>0&&j>0){ const byWall=[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>F.tileAt(W,vx+a,vy+b)===T.WALL); const p=(byWall?.5:.1)*(biome==="fungal"?1.8:biome==="shore"?.7:1);
          if(r()<p){ const n=1+Math.floor(r()*3); for(let k=0;k<n;k++){ const m=WILDSHROOM[Math.floor(r()*WILDSHROOM.length)]; const big=m==="fungi-zurkhwood"||m==="mushroom-stump"; const mx=x+(r()-.5)*44, my=y+18+(r()-.5)*20, mh=big?50+r()*24:24+r()*22; fDrawProp(m,mx,my,mh,.95,g); plants.push({x:mx,y:my-4,k:m});
              if(m==="fungi-nightlight"||m==="fungi-bluecap"){ const gl=g.createRadialGradient(x,y+6,2,x,y+6,40); gl.addColorStop(0,m==="fungi-nightlight"?"rgba(120,220,255,.22)":"rgba(90,140,255,.16)"); gl.addColorStop(1,"rgba(0,0,0,0)"); g.fillStyle=gl; g.fillRect(x-40,y-34,80,80); } } } } }
      { const rc=F.seededRng(key+"crystals"); const cr=(this.crystals||(this.crystals={}))[key]=[];
        for(let j=1;j<SCH;j++) for(let i=1;i<SCW;i++){ const vx=sx*SCW+i, vy=sy*SCH+j; if(F.tileAt(W,vx,vy)!==T.FLOOR) continue; const byWall=[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>F.tileAt(W,vx+a,vy+b)===T.WALL);
          if(rc()<(byWall?.06:.018)){ const x=i*VPX+(rc()-.5)*40, y=j*VPX+YOFF+22+(rc()-.5)*16, h=30+rc()*(byWall?60:34), flip=rc()<.5, hue=rc()<.35?35:0;
            g.save(); g.translate(x,0); if(flip) g.scale(-1,1); if(hue) g.filter=`hue-rotate(${hue}deg)`; fDrawProp("crystal-cluster",0,y,h,1,g); g.restore(); cr.push({x,y:y-h*.45,h,hue}); } } }
      for(const f of W.features){ const fx=f.x*VPX-sx*SCW*VPX, fy=f.y*VPX-sy*SCH*VPX-YOFF*-1; if(fx<-60||fy<-60||fx>FW+60||fy>FH+60) continue; const L=TERRAIN_PROPS[f.terrain]; if(!L) continue; const rr=F.seededRng(`${f.x},${f.y}`);
        for(const [slug,n,h] of L) for(let k=0;k<n;k++){ const px=f.x+(rr()-.5)*6, py=f.y+(rr()-.5)*4; if(!F.passable(F.tileAt(W,Math.round(px),Math.round(py)))) continue; fDrawProp(slug,px*VPX-sx*SCW*VPX,py*VPX-sy*SCH*VPX+YOFF+24,h,1,g); } }
      // camp
      const cx=W.camp.x*VPX-sx*SCW*VPX, cy=W.camp.y*VPX-sy*SCH*VPX+YOFF; if(cx>-200&&cx<FW+200&&cy>-200&&cy<FH+200){ fDrawProp("hide-tent",cx-150,cy+20,120,1,g); fDrawProp("sack-pile",cx+130,cy+40,52,1,g); fDrawProp("campfire-small",cx,cy+30,56,1,g); }
      this.screens[key]=c; return c; },
    drawScreen(sx,sy,offx,offy){ const c=this.screenCanvas(sx,sy); if(c) fg.drawImage(c,offx,offy); else { fg.fillStyle="#07060a"; fg.fillRect(offx,offy,FW,FH); } },
    draw(dt){ const H=this.hero;
      if(this.scroll){ const s=this.scroll; s.t+=dt*2.4; const k=Math.min(1,s.t), e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
        this.drawScreen(s.from.x,s.from.y,-s.dx*FW*e,-s.dy*FH*e); this.drawScreen(this.sc.x,this.sc.y,s.dx*FW*(1-e),s.dy*FH*(1-e)); if(k>=1) this.scroll=null; fDark(this.dummyHero(),170+330*(this.oil/F.LANTERN_WORLD_SECONDS)+(this.kit?this.kit.lightBonus:0)); this.hud(); return; }
      this.drawScreen(this.sc.x,this.sc.y,0,0);
      const ox=this.ox(), oy=this.oy();
      // places worth a look glint; searched ones do not
      for(const p of this.W.pois){ const x=p.x*VPX-ox, y=p.y*VPX-oy; if(x<-80||y<-80||x>FW+80||y>FH+80) continue; const done=this.searched.get(`${p.x},${p.y}`);
        fDrawProp(p.look,x,y+18,p.kind==="lair"?54:46,done?.55:1);
        if(!done&&Math.sin(this.t*4+p.x)>.6){ fg.fillStyle="#fff"; fg.fillRect(x-8+(p.y%3)*6,y-26,3,3); fg.fillRect(x+10,y-12,2,2); }
        const it=done&&done.items&&done.items[0]; const ic=it&&fItem[it.slug]; if(ic&&ic.width){ fg.imageSmoothingEnabled=false; fg.drawImage(ic,x+24,y-54+Math.sin(this.t*3)*3,40,40); } }
      if(this.mode==="forage") this.field.patches.forEach((pt,i)=>{ if(this.picked.has(i)) return; const x=pt.wx-ox, y=pt.wy-oy; if(x<-60||y<-60||x>FW+60||y>FH+60) return;
        const hid=pt.kind==="reagent"&&pt.spot!=="seen"; if(hid){ fDrawProp("mold-patch",x,y+6,40); return; }
        const near=Math.hypot(pt.wx-this.hero.x,pt.wy-this.hero.y)<170;
        if(pt.slug&&near){ const pu=.5+.5*Math.sin(this.t*3+i); fg.save(); fg.strokeStyle=`rgba(255,226,138,${.35+.35*pu})`; fg.lineWidth=2; fg.beginPath(); fg.ellipse(x,y+4,30+pu*3,11+pu,0,0,7); fg.stroke(); fg.restore(); }
        if(pt.slug&&near){ const gl=fg.createRadialGradient(x,y-18,2,x,y-18,44); gl.addColorStop(0,"rgba(255,236,170,.25)"); gl.addColorStop(1,"rgba(255,236,170,0)"); fg.fillStyle=gl; fg.fillRect(x-44,y-62,88,88); }
        fDrawProp(pt.slug?(PROPOF[pt.slug]||"fungi-ring"):"mold-patch",x,y+6,pt.slug?(pt.kind==="food"?50:58):40); });
      if(this.mode==="hunt"&&this.prey&&!this.prey.gone){ const P=this.prey, x=P.x-ox, y=P.y-oy; if(x>-100&&x<FW+100&&y>-100&&y<FH+100){ fDrawMon(P.slug,x,y,this.hero.x>P.x,1,P.slug==="giant-bat"?Math.sin(this.t*6)*4:0); const ph=(MONH[P.slug]||60)+12;
        if(P.slug==="deep-rothe"&&fSpeaker()&&Math.hypot(P.x-this.hero.x,P.y-this.hero.y)<260){ fg.font="600 13px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e8e0c8"; fg.fillText(P.spoken?"":"middle-click or Shift to speak with it",x,y+22); }
        if(P.warn>0){ fg.font="700 22px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e3b95c"; fg.fillText("?",x,y-ph); }
        if(P.look>0){ fg.save(); fg.globalAlpha=.13; fg.fillStyle="#ff6a4a"; fg.beginPath(); fg.arc(x,y-30,460,0,7); fg.fill(); fg.restore(); fg.font="700 22px Cinzel"; fg.textAlign="center"; fg.fillStyle="#ff6a4a"; fg.fillText("👁",x,y-ph); } } }
      if(this.lairState&&this.lairState!=="cleared"&&this.lairState!=="woken") this.drawLair(ox,oy);
      // shift the hero and the foes into screen space for the shared drawing code
      const sh={...H,x:H.x-ox,y:H.y-oy}; const foesSaved=this.foes.map(f=>[f.x,f.y]); this.foes.forEach(f=>{ f.x-=ox; f.y-=oy; }); const fxSaved=this.fx;
      fBloodDrawGround(this,ox,oy); fCorpsesDraw(this,ox,oy); fFoesDraw(this); this.foes.forEach((f,i)=>{ f.x=foesSaved[i][0]; f.y=foesSaved[i][1]; }); fBloodDrawAir(this,ox,oy); fKitDraw(this,ox,oy,sh); fBowDraw(this,sh); fForageDraw(this,sh); fFishDraw(this,sh);
      const rb=this.rescue&&this.rescue.fig&&this.rescue.y<this.hero.y; if(rb) fRescueDraw(this,ox,oy); fGurneyDraw(this,sh); if(!fBlink(this)){ if(this.status&&this.status.poisoned>0){ fg.save(); fg.filter="sepia(.6) hue-rotate(55deg) saturate(2.4) brightness(.95)"; fHeroOrWolf(this,sh,()=>fDrawHero({...sh,y:sh.y-(this.leapZ||0)},.85)); fg.restore(); } else fHeroOrWolf(this,sh,()=>fDrawHero({...sh,y:sh.y-(this.leapZ||0)},.85)); } if(!rb) fRescueDraw(this,ox,oy);
      fDark({hero:sh},170+330*(this.oil/F.LANTERN_WORLD_SECONDS)+(this.kit?this.kit.lightBonus:0)); fRescueLight(this,ox,oy); fCrystalGlow(this); fPowerDraw(this,ox,oy,sh); fStatusDraw(this,sh); fHurtFlash(this); fDrawPops(dt); this.hud();
      if(this.mode==="explore"&&this.poi&&!this.searched.has(`${this.poi.x},${this.poi.y}`)){ fg.font="600 14px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e3b95c"; fg.fillText("⌕ Search here",sh.x,sh.y-118); }
      if(this.atCamp&&this.t>3&&!this.down){ fg.font="600 14px Cinzel"; fg.textAlign="center"; fg.fillStyle="#ffb070"; fg.fillText("The fire — you can turn in here",sh.x,sh.y+26); } },
    dummyHero(){ return {hero:{x:this.hero.x-this.ox(),y:this.hero.y-this.oy()}}; },
    drawLair(ox,oy){ const o=this.occ; if(!o) return; const key=o.bestiary?MONKEY[o.bestiary]:null; const n=Math.min(3,o.count||1), L=this.W.lair;
      for(let i=0;i<n;i++){ const x=L.x*VPX-ox+(i-(n-1)/2)*100, y=L.y*VPX-oy-40+(i%2)*20; if(x<-100||x>FW+100||y<-100||y>FH+100) continue; fDrawMon(key,x,y,i%2===0,1,Math.sin(this.t*2+i)*2); }
      if(this.lairState==="unseen"){ fg.font="700 18px Cinzel"; fg.textAlign="center"; fg.fillStyle="#b9e0ff"; fg.fillText("z z z",L.x*VPX-ox,L.y*VPX-oy-150); } },
    hud(){ fHearts(this.hp,this.hpMax,16,36); const li=fItem["hooded-lantern"]; if(li&&li.width){ fg.imageSmoothingEnabled=false; fg.drawImage(li,16,62,28,28); }
      fBar(50,74,150,this.oil/F.LANTERN_WORLD_SECONDS,this.oil<60?"#c0501a":"#e3b95c"); if(this.light){ fg.font="600 11px Cinzel"; fg.textAlign="left"; fg.fillStyle="#a89a7a"; fg.fillText(this.light.name,50,100); }
      fg.font="600 13px Cinzel"; fg.textAlign="left"; fg.fillStyle="#e3b95c"; fg.fillText(`Hour ${this.hour+1} · the dark stirs in ${Math.ceil(this.hourT)}s`,212,84);
      const goal=this.mode==="forage"?`Gathered ${[...this.picked].filter(i=>this.field.patches[i].slug).length}/${this.field.patches.filter(q=>q.slug).length}`:this.mode==="hunt"?(this.kill?(this.kill.ok?"Carry the kill home":"The quarry is gone"):`Stalking · noise ${"●".repeat(this.noise)}${"○".repeat(Math.max(0,F.MAX_NOISE-1-this.noise))}`):`${this.searched.size} searched · ${this.finds.filter(f=>!/^DM/.test(f)).length} found`;
      fg.fillText(`${goal}${this.slain?` · ${this.slain} slain`:""}`,212,102);
      if(this.mode==="forage"&&dmView){ const s=fSurv(), b=F.skillBonus(s); fg.font="600 12px Cinzel"; fg.textAlign="left"; fg.fillStyle="#b9e0ff"; fg.fillText(`Survival ${b>=0?"+":""}${b}${s.level!=="none"?` (${s.level})`:""}${s.advantage?" · advantage":""} · spot a small herb ${Math.round(F.spotChance({...s,dc:13})*100)}% · the rare one ${Math.round(F.spotChance({...s,dc:16})*100)}%`,16,FH-32); }
      fKitHud(this); if(this.t<8&&!this.down){ fg.save(); fg.globalAlpha=Math.min(1,(8-this.t)/2); fg.font="600 13px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e3b95c"; const K=this.kit||{melee:{can:true}}; fg.fillText(["WASD to walk","hold SPACE to "+(this.mode==="explore"?"search":"forage"),K.melee.can||this.power?(K.melee.can?"click or E to strike":"click or E to cast")+(this.power?` — hold for ${this.power.name}`:""):null,K.ranged?`right click: ${K.ranged.name}`:(K.heal||K.special?`right click: ${(K.heal||K.special).name}`:null),K.ranged&&(K.heal||K.special)?`Q: ${(K.heal||K.special).name}`:null].filter(Boolean).join(" · "),FW/2,FH-40); fg.restore(); } this.mini(); },
    // The map: 8×6 screens, only the ones you have walked shown; camp, the lair and you.
    mini(){ const W=this.W, s=3, mw=W.cols*s/2, mh=W.rows*s/2, ox=FW-mw-16, oy=12;
      fg.fillStyle="rgba(6,5,10,.85)"; fg.fillRect(ox-5,oy-4,mw+10,mh+8); fg.strokeStyle="#9c7a3a"; fg.strokeRect(ox-4.5,oy-3.5,mw+9,mh+7);
      if(!this._mini||this._miniSeen!==this.seen.size){ const c=document.createElement("canvas"); c.width=mw; c.height=mh; const g=c.getContext("2d"); const T=F.T;
        for(const k of this.seen){ const [sx,sy]=k.split(",").map(Number); for(let j=0;j<=SCH;j+=2) for(let i=0;i<=SCW;i+=2){ const t=F.tileAt(W,sx*SCW+i,sy*SCH+j); g.fillStyle=t===T.WALL?"#1c1822":t===T.DEEP?"#2a5aa8":t===T.FORD?"#6aa8d8":t===T.CHASM?"#000":t===T.BRIDGE?"#9a6a3a":"#6a6078"; g.fillRect((sx*SCW+i)*s/2,(sy*SCH+j)*s/2,s,s); } }
        this._mini=c; this._miniSeen=this.seen.size; }
      fg.drawImage(this._mini,ox,oy);
      fg.fillStyle="#ff9a3a"; fg.fillRect(ox+W.camp.x*s/2-2,oy+W.camp.y*s/2-2,5,5);
      fg.fillStyle=this.lairState==="cleared"?"#5a5068":"#ff3a4a"; fg.font="700 11px sans-serif"; fg.textAlign="center"; fg.fillText("☠",ox+W.lair.x*s/2,oy+W.lair.y*s/2+4);
      if(this.mode==="hunt"&&this.prey&&!this.prey.gone){ fg.fillStyle="#e3b95c"; fg.font="700 11px sans-serif"; fg.textAlign="center"; fg.fillText("🐾",ox+this.tracks.x*s/2,oy+this.tracks.y*s/2+4); }
      fg.fillStyle="#fff"; fg.beginPath(); fg.arc(ox+this.hero.x/VPX*s/2,oy+this.hero.y/VPX*s/2,2+Math.sin(this.t*6)*.8,0,7); fg.fill(); }
  };
  FLD.enterScreen(); FLD.tx=null; fKitStart(FLD); FLD.light=light;
  if(light.source==="torchstalk"){ const ts=F.lightTorchstalk(rng); FLD.log.push(ts.note); if(ts.exploded){ setTimeout(()=>{ if(FLD&&!FLD.ended){ fPop(FLD.hero.x-FLD.ox(),FLD.hero.y-FLD.oy()-140,`the torchstalk goes off! −${ts.damage}`,"#ff7a3a"); sfx("magic_impact_fire",{vol:.5}); fHurt(FLD,ts.damage,"an exploding torchstalk"); } },600); } }
  $("fldsearch").hidden=mode!=="explore"; $("fldsearch").disabled=true; $("fldback").hidden=false; $("fldback").disabled=false; $("fldback").textContent="Turn in at the fire"; $("fldgo").hidden=true; return true;
}
if(window.__camp){ Object.defineProperty(window.__camp,"FLD",{get(){return FLD;}}); window.__camp.budget=budget; window.__camp.setDm=(on)=>setDm(on); window.__camp.preyTurns=()=>fPreyTurns(FLD,FLD.prey); window.__camp.au=fAu; window.__camp.setGear=(g)=>{GEARPICK=g;}; window.__camp.setKit=(c)=>{KITPICK=c;}; window.__camp.speak=()=>fSpeak(); window.__camp.butcher=(c)=>fButcher(FLD,c); window.__camp.corpseFrom=(e)=>fCorpseFrom(FLD,e); window.__camp.malEl=fMalEl; window.__camp.fDrawMon=fDrawMon; window.__camp.refresh=()=>refresh(); window.__camp.switchTo=(i)=>switchTo(i); window.__camp.status=(k)=>fStatus(FLD,k); window.__camp.wild=()=>{ const L=FLD; const key=`${L.sc.x},${L.sc.y}`; const P=(L.plants||{})[key]||[]; const p=P.find(q=>!q.tried); if(!p) return null; p.tried=true; fWildForage(L,p,p.x,p.y); return L.log[L.log.length-1]; }; window.__camp.pack=PACK; window.__camp.packs=PACKS; window.__camp.budgetOf=()=>budget[ME]; window.__camp.ambush=(b,n)=>fAmbush(FLD,{result:b,bestiary:b,count:n},null,"test"); }
function lanternOut(){ const L=FLD; if(!L||L.busy) return; L.busy=true; const p=PARTY[ME];
  if(L.atCamp){ endExplore(false,`The lantern gutters out just as ${p.name} reaches the fire.`); return; }
  const lost=F.lostInTheDark(p.name); p.exhaustion=(p.exhaustion||0)+lost.exhaustion; fPop(FW/2,FH/2,"the light dies","#8a8078");
  L.flagsExtra=[lost.flag]; setTimeout(()=>endExplore(false,lost.note),900); }
function lairEnter(){ const L=FLD, p=PARTY[ME], o=L.occ; if(!o){ L.lairState="cleared"; return; }
  const name=o.bestiary||o.result; const st=fStealth(p); const pass=o.bestiary?FPASSIVE[o.bestiary]:null; const sl=F.slipAway(p.name,st.total,{name,passive:pass??null});
  L.busy=true; L.tx=null; const head=`<h4>The lair</h4><p>Ambushers d20 <b>${o.face}</b> — <b>${o.result}</b> (OotA p.32).</p><p>Stealth d20 ${st.face} ${sgn(st.bonus)} = <b>${st.total}</b>${pass!=null?` vs passive Perception ${pass}`:""} — ${sl.note}</p>`;
  fSay(`<b>EXPLORE — THE LAIR</b>\n${o.result}. ${sl.note}`);
  if(sl.caught===true&&fAmbush(L,{result:o.result,bestiary:o.bestiary,count:o.count},{x:L.W.lair.x*VPX,y:L.W.lair.y*VPX},`The lair: ${o.result}. Stealth ${st.total}${pass!=null?` vs passive Perception ${pass}`:""} — they wake.`)){ L.lairState="woken"; L.busy=false; return; }
  if(sl.caught===true){ L.lairState="woken"; flash(`${name.toUpperCase()} — ROLL INITIATIVE`,true); fResult(head+`<div class="caught dm">CAUGHT — THE DM RUNS THIS ONE</div><p class="dim">${name} has no stat block in the bestiary yet, so it can't be fought on this map. Noted for the table.</p><button class="obtn" id="fldok">Back away</button>`); L.log.push(`FOR THE DM — the lair: ${o.result} woke to ${p.name}.`); $("fldok").onclick=()=>{ $("fldres").hidden=true; L.busy=false; }; }
  else { L.lairState="unseen"; fResult(head+(sl.caught===null?`<div class="caught dm">THE DM RULES</div>`:"")+`<p>They haven't noticed ${p.name}. The skull pile is their hoard — <b>search it</b> (the discovery roll has advantage) and get out.</p><button class="obtn" id="fldok">Creep in</button>`); $("fldok").onclick=()=>{ $("fldres").hidden=true; L.busy=false; }; } }
function exploreDanger(){ const L=FLD, p=PARTY[ME]; const dz=F.huntDanger(FROWS,L.noise||0,rng);
  if(!dz.creature){ fPop(FW/2,FH/2-40,`hour ${L.hour} — only the dark${L.noise?` (d20 ${dz.roll} + noise ${L.noise})`:""}`,"#8a8078"); L.log.push(`Hour ${L.hour}: d20 ${dz.roll} — nothing comes.`); return; }
  const cr=dz.creature, name=cr.bestiary||cr.result; const st=fStealth(p); const pass=cr.bestiary?FPASSIVE[cr.bestiary]:null; const sl=F.slipAway(p.name,st.total,{name,passive:pass??null});
  L.busy=true; L.tx=null; const msg=`${cr.result}. Stealth ${st.total}${pass!=null?` vs passive Perception ${pass}`:""} — ${sl.note}`; fSay(`<b>EXPLORE — HOUR ${L.hour}</b>\n${msg}`);
  if(sl.caught===true&&fAmbush(L,cr,null,`Hour ${L.hour}: ${cr.result}. Stealth ${st.total}${pass!=null?` vs passive Perception ${pass}`:""} — caught.`)){ L.busy=false; return; }
  if(sl.caught===true){ flash(`${name.toUpperCase()} — ${p.name.toUpperCase()} IS CAUGHT`,true); fResult(`<h4>Hour ${L.hour}: something in the dark</h4><p>Random Encounters d20 <b>${dz.roll}</b> — <b>${cr.result}</b>.</p><p>${sl.note}</p><div class="caught dm">CAUGHT — THE DM RUNS THIS ONE</div><p class="dim">${cr.bestiary?`${cr.bestiary} has no stat block in the bestiary yet, so it can't be fought on this map.`:`"${cr.result}" is people or a scene, not a stat block — the DM plays it.`} It's noted in the log for the table.</p><p class="flags">${dz.flags.map(x=>`<span>${x}</span>`).join("")}</p><button class="obtn" id="fldok">Keep going</button><button class="obtn" id="fldhome">Head for the fire</button>`); L.log.push(`FOR THE DM — hour ${L.hour}: ${cr.result} caught ${p.name}.`); $("fldok").onclick=()=>{ $("fldres").hidden=true; L.busy=false; }; $("fldhome").onclick=()=>{ $("fldres").hidden=true; L.busy=false; }; }
  else { fResult(`<h4>Hour ${L.hour}: something in the dark</h4><p>Random Encounters d20 <b>${dz.roll}</b> — <b>${cr.result}</b>.</p><p>${sl.note}</p>${sl.caught===null?`<div class="caught dm">THE DM RULES</div>`:""}<button class="obtn" id="fldok">Keep going</button>`); $("fldok").onclick=()=>{ $("fldres").hidden=true; L.busy=false; }; } }
$("fldsearch").onclick=()=>{ const L=FLD; if(!L||L.mode!=="explore"||L.busy||!L.poi) return; const key=`${L.poi.x},${L.poi.y}`; if(L.searched.has(key)) return; const p=PARTY[ME];
  const inLair=L.poi.kind==="lair"; const pr=fPerception(p); const r=F.searchRoom({who:p.name,total:pr.total,catalog:FCAT,discoveryRows:FROWS,rng,advantage:inLair}); L.searched.set(key,r); if(inLair) L.lairState="cleared"; $("fldsearch").disabled=true;
  // searching takes time: a few minutes of the lantern (PROPOSED)
  L.oil=Math.max(0,L.oil-8); fPop(24+75,86,"-8s","#c0501a");
  r.items.forEach(it=>{ PACK[it.slug]=(PACK[it.slug]||0)+it.quantity; if(!CATALOG[it.slug]) CATALOG[it.slug]={n:it.name}; L.finds.push(`${it.quantity}× ${it.name}`); });
  if(r.dmPicks) L.finds.push(`DM: ${r.dmPicks}`);
  const line=`Perception d20 ${pr.face} ${sgn(pr.bonus)} = ${pr.total} vs DC ${r.dc}${r.face?` · discovery d20 ${r.face}`:""} — ${r.note}`;
  L.log.push(line); fPop(L.hero.x-L.ox(),L.hero.y-L.oy()-110,r.deadEnd?"nothing":(r.items[0]?.name||"the DM decides"),r.deadEnd?"#8a8078":"#e3b95c");
  fSay(`<b>EXPLORE — SEARCH</b>\n${line}`); };
function endExplore(caught,lead){ return endWorld(caught,lead); }
function endWorld(caught,lead){ const L=FLD; if(!L||L.ended) return; L.ended=true; playFilm("exit",()=>{}); /* Sam, 9/29: every outing ends on the walk-home film; the result waits underneath */ const p=PARTY[ME]; const screens=L.W.screens.nx*L.W.screens.ny; const lines=[];
  if(L.mode==="forage"){ const haul=F.forageHaul(L.field,[...L.picked]); supplies+=haul.supplies; $("sup").textContent=supplies; haul.items.forEach(it=>PACK[it.slug]=(PACK[it.slug]||0)+it.quantity); lines.push(`Forage: ${haul.note}${haul.supplies?` Rations → ${supplies}.`:""}${L.missed?` Walked past ${L.missed} patch${L.missed===1?"":"es"} that looked like mold.`:""}`); }
  if(L.mode==="hunt"){ const k=L.kill; if(k&&k.ok&&k.gift){ lines.push(`Hunt: ${k.line} ${k.gift.map(g=>g.name).join(", ")}.`); } else if(k&&k.ok){ supplies+=k.food; $("sup").textContent=supplies; if(k.byp) PACK[k.byp]=(PACK[k.byp]||0)+1; const mt=L.prey&&F.meatFor(L.prey.slug); if(mt) PACK[mt.slug]=(PACK[mt.slug]||0)+k.food; lines.push(`Hunt: ${k.food} day${k.food===1?"":"s"} of food brought home${k.byp?`, and ${(FCAT.find(c=>c.slug===k.byp)||{name:k.byp}).name}`:""}. Rations → ${supplies}.`); } else lines.push(`Hunt: ${k?k.line:`${p.name} never got close.`}`); }
  if(L.mode==="explore") lines.push(L.finds.length?`Found: ${L.finds.join("; ")}.`:"Nothing worth carrying.");
  if(L.wildFound&&L.wildFound.length) lines.push(`Picked out of the scrub: ${L.wildFound.join(", ")}.`);
  if(L.won&&L.won.length) lines.push(`Won ${L.won.length} fight${L.won.length===1?"":"s"} (${L.won.join(", ")}) — XP is the DM's to award.`);
  const dm=L.log.filter(x=>/^FOR THE DM/.test(x)); if(dm.length) lines.push(dm.join(" "));
  const sum=`${lead?lead+" ":""}${p.name} walked ${L.seen.size} of ${screens} screens over ${L.hour+1} hour${L.hour?"s":""}${L.slain?`, killing ${L.slain} vermin`:""}. ${lines.join(" ")}${p.exhaustion?` Exhaustion: ${p.exhaustion}.`:""}`;
  const mal=fMalSummary(L,false); speak(`<b>MALACHAR</b>\n${mal.text}`); if(dmView) speak(`<b>${L.mode.toUpperCase()} — DM</b>\n${sum}`); fMalVoice("c_"+mal.key); if(caught){ fClose(); return; }
  const fl=L.W.flags.concat(L.flagsExtra||[]).concat(L.field?L.field.flags:[]).concat(L.huntFlags||[]);
  fResult(`<h4>Back at the fire</h4>${MALBOX(mal.text)}${dmView?`<p class="dmx">${sum}</p><p class="flags">${fl.map(x=>`<span>${x}</span>`).join("")}</p>`:""}<button class="obtn" id="fldok">Done</button>`); $("fldok").onclick=fClose; L.busy=true; }
$("fldback").onclick=()=>{ if(FLD&&FLD.atCamp&&!FLD.busy) endWorld(false,""); };
$("fldgo").onclick=()=>{};
$("fldx").onclick=()=>{ if(!FLD){ $("fld").hidden=true; return; } if(FLD.ended||FLD.down) { fClose(); return; } if(!FLD.busy) endWorld(false,FLD.atCamp?"":"(Closed early — in the game you would still have to walk back.)"); else fClose(); };

// ======================================================================================================================
// THE PAINTED-SCENE WORLD LAYER (Underdark Scenes, 2026-10-08). Sam: "keep the functionality that is present in the
// forage and hunt game. Don't invent something here." Everything above is the camp's own game. What changes here is
// only WHERE it happens: one painted scene instead of the camp's 8×6-screen tile map. So —
//   • the floor is the painting's walk area (its rocks, pillars and mushrooms are solid; chasms are not floor),
//   • there is no camp fire on a painting: the ✕ ends the outing as the camp's ✕ does — "closed early", the haul counts
//     (Sam's call, 2026-10-08),
//   • fights happen live in the scene, as in the camp game (Sam's call, 2026-10-08),
//   • the Crystal Chamber, the Wastes and the Lair use the tunnels' tables (Sam's call, 2026-10-08),
//   • no screens to scroll to, no minimap, no lair room and no films.
// The functions below that share a name with the camp's replace them; their bodies are the camp's wherever the
// tile map is not involved.
// ======================================================================================================================
function fOpen(mode,title,sub){ { const f0=me(), c0=Field.canHeadOut({name:f0.name,hp:f0.hp,conditions:[]}); if(!c0.ok){ speak(`<b>${f0.name.toUpperCase()}</b>\n${c0.reason}`); return false; } } if($("flddev")) $("flddev").hidden=!dmView; $("fldatk").hidden=mode==="hunt"; $("fldtitle").textContent=title; $("fldsub").innerHTML=sub; $("fldres").hidden=true; $("fldres").innerHTML=""; $("fldsearch").hidden=true; $("fldgo").hidden=true; $("fldback").hidden=true; $("fld").hidden=false; host.opened(mode); return true; }
function fClose(){ $("fld").hidden=true; $("fldres").hidden=true; const H=FLD&&FLD.hero; FLD=null; host.closed(H?{x:H.x,y:H.y}:null,(PARTY[ME].hp??1)<=0); }
function theNight(){ const seed="painted-"+host.sceneId(); if(!NIGHT||NIGHT.seed!==seed) NIGHT={seed,seen:new Set(),searched:new Map(),screenFoes:{},outings:0,rareTaken:new Set()}; return NIGHT; }
function startForage(){ return startWorld("forage"); }
function startHunt(){ return startWorld("hunt"); }
// placing things on the painted floor (the camp places them by walking distance from the fire on its tile map)
function placeOn(n,o){ const out=[], from=o.from; for(let i=0;i<n;i++){ let best=null;
    for(let k=0;k<160&&!best;k++){ const p=o.shore?host.shorePoint(rng):host.floorPoint(rng); if(!p) continue; if(Math.hypot(p.x-from.x,p.y-from.y)<o.min) continue; if(out.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<o.spacing)) continue; if(o.ok&&!o.ok(p)) continue; best=p; }
    if(best) out.push(best); } return out; }
function fRegrowTick(L){ const q=L.regrow; if(!q||!q.length||L.mode!=="forage") return; for(let i=q.length-1;i>=0;i--){ if(L.t<q[i].at) continue; const g=q.splice(i,1)[0];
    const sp=placeOn(1,{from:L.hero,min:200,spacing:90})[0]; if(!sp) continue; L.field.patches.push({x:0,y:0,kind:g.kind,slug:g.slug,name:g.name,wx:sp.x,wy:sp.y}); } }
function startWorld(mode){ const p=PARTY[ME], f=me();
  const node={node_type:"waypoint",name:host.sceneName(),metadata:{seed:"painted-"+host.sceneId()}}; const perm=F.explorePermit(node);
  if(!perm.ok){ fSay(`<b>${mode.toUpperCase()}</b>\n${perm.reason}`); return false; }
  // Sam, 9/29: nobody goes out without oil or a light source somewhere in the party
  const light=F.lightFor([PACK,...Object.entries(PACKS).filter(([i])=>+i!==ME).map(([,v])=>v)]);
  if(!light.ok){ fSay(`<b>${mode.toUpperCase()}</b>\n${light.note} ${p.name} stays by the fire.`); flash("NO LIGHT — NO ONE GOES OUT",true); return false; }
  biome=host.biome(); const N=theNight(); N.outings++; const start=host.heroStart();
  let sub="", extra={};
  if(mode==="forage"){ const out=C.forage(sheetOf(f),rng,{dc:F.FORAGE_DC.underdark}); const field=F.forageField({success:out.check.success,supplies:out.supplies,biome,rng,catalog:new Set(Object.keys(PROPOF)),water:host.hasWater(),taken:NIGHT&&NIGHT.rareTaken});
    const wet=field.patches.filter(q=>q.water), dry=field.patches.filter(q=>!q.water); const spots=placeOn(dry.length,{from:start,min:200,spacing:90}), shore=wet.length?placeOn(wet.length,{from:start,min:120,spacing:70,shore:true}):[];
    dry.forEach((pt,i)=>{ const s=spots[i]||spots[0]||start; pt.wx=s.x; pt.wy=s.y; }); wet.forEach((pt,i)=>{ const s=shore[i]||spots[i%Math.max(1,spots.length)]||start; pt.wx=s.x; pt.wy=s.y; });
    extra={field,picked:new Set(),roll:out};
    sub=`Survival <b>${out.check.total}</b> vs DC ${F.FORAGE_DC.underdark} — ${out.check.success?`<b>there is food out there</b>: ${out.supplies} day${out.supplies===1?"":"s"}' worth, and fungi, scattered through the caves`:"<b>the caves near camp are bare</b> — anything that grows here is scrub"}. Stand at a patch and <b>hold Space</b> to forage it — only what you can identify is highlighted.`; }
  else if(mode==="hunt"){ const pc=window.__forcePrey?{prey:F.PREY.find(q=>q.slug===window.__forcePrey),flags:[]}:F.choosePrey(biome,rng,new Set(F.PREY.map(q=>q.slug).filter(k=>fMon[k])));
    // it grazes about its home (the camp's sway: ±80 px across, ±50 px deep), so home is somewhere all of that is floor
    const grazes=(q)=>[0,1,2,3,4,5,6,7].every(i=>host.inside(q.x+Math.cos(i*.785)*84,q.y+Math.sin(i*.785)*54));
    const at=placeOn(1,{from:start,min:420,spacing:0,ok:grazes})[0]||placeOn(1,{from:start,min:260,spacing:0,ok:grazes})[0]||placeOn(1,{from:start,min:200,spacing:0})[0]||start;
    extra={prey:{...pc.prey,home:{x:at.x,y:at.y},x:at.x,y:at.y,look:0,lookT:3,warn:0,gone:false},noise:0,huntFlags:pc.flags,kill:null};
    sub=`${p.name} goes after a <b>${pc.prey.name.toLowerCase()}</b>. Creep up on it — <b>freeze when it looks up</b>; rock between you hides you. Every time it sees you move, the noise rises, and noise brings other things.`; }
  const preySlug=mode==="hunt"&&extra.prey&&MAL_INTRO.prey[extra.prey.slug]?extra.prey.slug:null;
  if(fOpen(mode,mode.toUpperCase(),MALBOX(preySlug?MAL_INTRO.prey[preySlug]:MAL_INTRO[mode])+(dmView?`<span class="dmx">${sub}</span>`:""))===false) return false;
  setTimeout(()=>fMalVoice(preySlug?"hunt_"+preySlug:"intro_"+mode),250);
  FLD={mode,...extra,t:0,pops:[],fx:[],foes:[],screenFoes:N.screenFoes,hp:p.hp,hpMax:p.hpMax,oil:F.LANTERN_WORLD_SECONDS,hour:0,hourT:F.HOUR_SECONDS,
    W:{screens:{nx:1,ny:1},flags:[],camp:{x:start.x/VPX,y:start.y/VPX},pois:[]},occ:null,lairState:"cleared",key:host.sceneId(),
    sc:{x:0,y:0},seen:N.seen,searched:N.searched,hero:fHero(start.x,start.y),finds:[],ended:false,log:[],busy:false,scroll:null,screens:{},atCamp:false,
    ox(){ return 0; }, oy(){ return 0; },
    tileW(wx,wy){ return host.tileAt(wx,wy,F.T); },
    canStand(wx,wy){ return host.inside(wx,wy); },
    tick(dt){ const H=this.hero; if(this.huntOver!=null&&!this.ended&&!this.down){ this.huntOver-=dt; if(this.huntOver<=0){ this.huntOver=null; endWorld(false,""); return; } }
      if(!this.busy&&!this.down){ this.oil=Math.max(0,this.oil-dt); this.hourT-=dt; if(this.hourT<=0){ this.hourT=F.HOUR_SECONDS; this.hour++; exploreDanger(); } if(this.oil<=0) lanternOut(); }
      if(!this.busy&&!this.down){ this.walk(dt); fFoesTick(this,dt,{x0:30,y0:host.back(),x1:FW-30,y1:FH-20}); fKitTick(this,dt); fStatusTick(this,dt); fBloodTick(this,dt); fRegrowTick(this); fBowTick(this,dt); fSpread(this,dt); fFightTick(this); fForageTick(this,dt); fBrushTick(this); this.near(); if(this.mode==="forage") this.gather(); if(this.mode==="hunt") this.stalk(dt); }
      if(this.down&&this.rescue) fRescueTick(this,dt); },
    walk(dt){ const H=this.hero; const kd=fStatusMove(this,fKeyDir(),dt); if(kd.x||kd.y){ const n=Math.hypot(kd.x,kd.y); this.tx=H.x+kd.x/n*40; this.ty=H.y+kd.y/n*40; }
      if(this.tx==null) { H.moving=false; return; }
      const dx=this.tx-H.x, dy=this.ty-H.y, dist=Math.hypot(dx,dy); if(dist<3){ H.moving=false; return; }
      const slow=F.slowFactor(this.tileW(H.x,H.y)); const v=Math.min(dist,200*(this.wolf?TUNE.wolfSpeedFt/30:TUNE.moveSpeedPct/100*(this.kit?this.kit.moveMul:1))*(this.bowDraw||this.shield?.5:1)*slow*dt); const nx=H.x+dx/dist*v, ny=H.y+dy/dist*v;
      // slide along walls and water rather than stopping dead
      if(this.canStand(nx,ny)){ H.x=nx; H.y=ny; } else if(this.canStand(nx,H.y)){ H.x=nx; } else if(this.canStand(H.x,ny)){ H.y=ny; } else { H.moving=false; this.tx=H.x; this.ty=H.y; return; }
      fFootstep(this,Math.hypot(H.x-(this._px??H.x),H.y-(this._py??H.y)),this.tileW(H.x,H.y)); this._px=H.x; this._py=H.y; H.dir=dirFrom(dx,dy); H.moving=true; H.ft+=dt*(slow<1?.5:1); if(H.ft>0.1){ H.ft=0; H.frame++; } },
    enterScreen(){ const key=this.key; if(!this.seen.has(key)){ this.seen.add(key); }
      this.foes=this.screenFoes[key]||(this.screenFoes[key]=this.spawnFoes(key)); },
    spawnFoes(key){ const r=F.seededRng(key+"foes"); const slugs=F.roomRoamers(key+"w",biome,false).slice(0,2); const out=[];
      for(const s of slugs){ for(let k=0;k<40;k++){ const wx=60+r()*(FW-120), wy=host.back()+20+r()*(FH-host.back()-40); if(this.canStand(wx,wy)&&Math.hypot(wx-this.hero.x,wy-this.hero.y)>280){ const f=fMakeFoes([s],key+k,null)[0]; f.x=wx; f.y=wy; out.push(f); break; } } }
      return out; },
    gather(){ const H=this.hero; this.field.patches.forEach((pt,i)=>{ if(this.picked.has(i)) return; const dd=Math.hypot(pt.wx-H.x,pt.wy-H.y);
      // a reagent patch has to be spotted first: one Wisdom (Survival) roll as you come near it
      if(pt.kind==="reagent"&&!pt.spot&&dd<150){ const s=fSurv(); const r=F.spotHerb({...s,dc:F.herbSpotDC(pt.slug),name:pt.name},rng); pt.spot=r.success?"seen":"missed"; this.log.push(r.note);
        if(r.success){ this.spotted=(this.spotted||0)+1; fFound(this,pt); } else { this.missed=(this.missed||0)+1; fPop(pt.wx-this.ox(),pt.wy-this.oy()-70,"just mold…","#6a6070"); } }
      if(pt.kind==="food"&&pt.slug&&dd<150) fFound(this,pt);
    }); },
    stalk(dt){ const P=this.prey, H=this.hero; if(!P||P.gone) return;
      // it grazes near home; it looks up now and then
      P.x=P.home.x+Math.sin(this.t*.4)*80; P.y=P.home.y+Math.sin(this.t*.27)*50;
      P.lookT-=dt; if(P.look>0){ P.look-=dt; if(P.look<=0){ P.lookT=1.6+Math.random()*2.4; P.spotted=false; } } else if(P.lookT<=.5&&P.warn<=0) P.warn=.5; if(P.warn>0){ P.warn-=dt; if(P.warn<=0) P.look=1.1+Math.random()*.6; }
      const d=Math.hypot(H.x-P.x,H.y-P.y);
      if(P.look>0&&H.moving&&!P.spotted&&d<460&&LOS(this,P.x,P.y,H.x,H.y)){ P.spotted=true; this.noise++; fPop(P.x-this.ox(),P.y-this.oy()-80,"!","#ff6a4a");
        if(this.noise>=F.MAX_NOISE-1&&P.fightsBack&&fPreyTurns(this,P)) return; if(this.noise>=F.MAX_NOISE-1){ P.gone=true; this.kill={ok:false,line:`Too loud — the ${P.name.toLowerCase()} bolts into the dark.`}; fPop(P.x-this.ox(),P.y-this.oy()-110,"it bolts","#ff9a7a"); fSay(`<b>HUNT</b>\n${this.kill.line}`); if(!this.kill.ok) this.huntOver=2.4; } }
      if(d<70){ const r=C.hunt(sheetOf(me()),rng,{dc:F.FORAGE_DC.underdark}); P.gone=true;
        if(r.check.success){ r.supplies=F.preyFood(P,r.supplies); this.kill={ok:true,food:r.supplies,byp:P.byproduct||null,line:`Survival ${r.check.total} vs DC 15 — the kill is clean: ${r.supplies} day${r.supplies===1?"":"s"} of food${P.byproduct?` and ${(FCAT.find(c=>c.slug===P.byproduct)||{name:P.byproduct}).name}`:""}. Carry it home.`}; fPop(P.x-this.ox(),P.y-this.oy()-60,`+${r.supplies} day${r.supplies===1?"":"s"}`,"#e3b95c"); }
        else if(P.fightsBack&&fPreyTurns(this,P)) return;
        else { this.kill={ok:false,line:`Survival ${r.check.total} vs DC 15 — the ${P.name.toLowerCase()} twists free and is gone into a crack.`}; fPop(P.x-this.ox(),P.y-this.oy()-60,"it gets away","#ff9a7a"); }
        fSay(`<b>HUNT</b>\n${this.kill.line}`); if(!this.kill.ok) this.huntOver=2.4; } },
    near(){ this.poi=null; this.atCamp=false; },
    // ---- drawing, split three ways so the painting's rocks and mushrooms can stand in front of what is behind them
    drawFloor(dt){ const ox=0, oy=0; fBloodDrawGround(this,ox,oy);
      if(this.mode==="forage") this.field.patches.forEach((pt,i)=>{ if(this.picked.has(i)) return; const x=pt.wx-ox, y=pt.wy-oy;
        const hid=pt.kind==="reagent"&&pt.spot!=="seen"; if(hid){ fDrawProp("mold-patch",x,y+6,40); return; }
        const near=Math.hypot(pt.wx-this.hero.x,pt.wy-this.hero.y)<170;
        if(pt.slug&&near){ const pu=.5+.5*Math.sin(this.t*3+i); fg.save(); fg.strokeStyle=`rgba(255,226,138,${.35+.35*pu})`; fg.lineWidth=2; fg.beginPath(); fg.ellipse(x,y+4,(30+pu*3)*__zs(y),(11+pu)*__zs(y),0,0,7); fg.stroke(); fg.restore(); }
        if(pt.slug&&near){ const gl=fg.createRadialGradient(x,y-18,2,x,y-18,44); gl.addColorStop(0,"rgba(255,236,170,.25)"); gl.addColorStop(1,"rgba(255,236,170,0)"); fg.fillStyle=gl; fg.fillRect(x-44,y-62,88,88); }
        fDrawProp(pt.slug?(PROPOF[pt.slug]||"fungi-ring"):"mold-patch",x,y+6,pt.slug?(pt.kind==="food"?50:58):40); });
      for(const c of (this.corpses||[])){ __ZS=__zs(c.y); const keep=this.corpses; this.corpses=[c]; fCorpsesDraw(this,ox,oy); this.corpses=keep; __ZS=null; } },
    sortables(){ const out=[], L=this, H=this.hero;
      if(this.mode==="hunt"&&this.prey&&!this.prey.gone){ const P=this.prey; out.push({y:P.y,draw:()=>fDrawMon(P.slug,P.x,P.y,H.x>P.x,1,P.slug==="giant-bat"?Math.sin(this.t*6)*4:0)}); }
      for(const e of this.foes){ if(e.dead&&e.fade<=0) continue; out.push({y:e.y,draw:()=>{ const keep=L.foes, fx=L.fx; L.foes=[e]; L.fx=[]; fFoesDraw(L); L.foes=keep; L.fx=fx; }}); }
      out.push({y:H.y,draw:()=>{ const sh={...H,x:H.x,y:H.y}; if(!fBlink(this)){ const s=.85*__zs(H.y); if(this.status&&this.status.poisoned>0){ fg.save(); fg.filter="sepia(.6) hue-rotate(55deg) saturate(2.4) brightness(.95)"; fHeroOrWolf(this,sh,()=>fDrawHero({...sh,y:sh.y-(this.leapZ||0)},s)); fg.restore(); } else fHeroOrWolf(this,sh,()=>fDrawHero({...sh,y:sh.y-(this.leapZ||0)},s)); } }});
      return out; },
    drawOver(dt){ const H=this.hero, ox=0, oy=0; const sh={...H,x:H.x,y:H.y};
      { const keep=this.foes; this.foes=[]; fFoesDraw(this); this.foes=keep; }   // the hit sparks and spell bursts
      fBloodDrawAir(this,ox,oy); fKitDraw(this,ox,oy,sh); fBowDraw(this,sh); fForageDraw(this,sh); fFishDraw(this,sh);
      if(this.mode==="hunt"&&this.prey&&!this.prey.gone){ const P=this.prey, x=P.x-ox, y=P.y-oy, ph=(MONH[P.slug]||60)*__zs(P.y)+12;
        if(P.slug==="deep-rothe"&&fSpeaker()&&Math.hypot(P.x-this.hero.x,P.y-this.hero.y)<260){ fg.font="600 13px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e8e0c8"; fg.fillText(P.spoken?"":"middle-click or Shift to speak with it",x,y+22); }
        if(P.warn>0){ fg.font="700 22px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e3b95c"; fg.fillText("?",x,y-ph); }
        if(P.look>0){ fg.save(); fg.globalAlpha=.13; fg.fillStyle="#ff6a4a"; fg.beginPath(); fg.arc(x,y-30,460,0,7); fg.fill(); fg.restore(); fg.font="700 22px Cinzel"; fg.textAlign="center"; fg.fillStyle="#ff6a4a"; fg.fillText("👁",x,y-ph); } }
      fDark({hero:sh},170+330*(this.oil/F.LANTERN_WORLD_SECONDS)+(this.kit?this.kit.lightBonus:0)); fPowerDraw(this,ox,oy,sh); fStatusDraw(this,sh); fHurtFlash(this); fDrawPops(dt); },
    hud(){ fHearts(this.hp,this.hpMax,16,36); const li=fItem["hooded-lantern"]; if(li&&li.width){ fg.imageSmoothingEnabled=false; fg.drawImage(li,16,62,28,28); }
      fBar(50,74,150,this.oil/F.LANTERN_WORLD_SECONDS,this.oil<60?"#c0501a":"#e3b95c"); if(this.light){ fg.font="600 11px Cinzel"; fg.textAlign="left"; fg.fillStyle="#a89a7a"; fg.fillText(this.light.name,50,100); }
      fg.font="600 13px Cinzel"; fg.textAlign="left"; fg.fillStyle="#e3b95c"; fg.fillText(`Hour ${this.hour+1} · the dark stirs in ${Math.ceil(this.hourT)}s`,212,84);
      const goal=this.mode==="forage"?`Gathered ${[...this.picked].filter(i=>this.field.patches[i].slug).length}/${this.field.patches.filter(q=>q.slug).length}`:(this.kill?(this.kill.ok?"Carry the kill home":"The quarry is gone"):`Stalking · noise ${"●".repeat(this.noise)}${"○".repeat(Math.max(0,F.MAX_NOISE-1-this.noise))}`);
      fg.fillText(`${goal}${this.slain?` · ${this.slain} slain`:""}`,212,102);
      if(this.mode==="forage"&&dmView){ const s=fSurv(), b=F.skillBonus(s); fg.font="600 12px Cinzel"; fg.textAlign="left"; fg.fillStyle="#b9e0ff"; fg.fillText(`Survival ${b>=0?"+":""}${b}${s.level!=="none"?` (${s.level})`:""}${s.advantage?" · advantage":""} · spot a small herb ${Math.round(F.spotChance({...s,dc:13})*100)}% · the rare one ${Math.round(F.spotChance({...s,dc:16})*100)}%`,16,FH-32); }
      fKitHud(this); if(this.t<8&&!this.down){ fg.save(); fg.globalAlpha=Math.min(1,(8-this.t)/2); fg.font="600 13px Cinzel"; fg.textAlign="center"; fg.fillStyle="#e3b95c"; const K=this.kit||{melee:{can:true}}; fg.fillText(["WASD to walk","hold SPACE to forage",K.melee.can||this.power?(K.melee.can?"click or E to strike":"click or E to cast")+(this.power?` — hold for ${this.power.name}`:""):null,K.ranged?`right click: ${K.ranged.name}`:(K.heal||K.special?`right click: ${(K.heal||K.special).name}`:null),K.ranged&&(K.heal||K.special)?`Q: ${(K.heal||K.special).name}`:null].filter(Boolean).join(" · "),FW/2,FH-40); fg.restore(); } }
  };
  FLD.plants={"0,0":host.plants()};
  FLD.enterScreen(); FLD.tx=null; fKitStart(FLD); FLD.light=light;
  if(light.source==="torchstalk"){ const ts=F.lightTorchstalk(rng); FLD.log.push(ts.note); if(ts.exploded){ setTimeout(()=>{ if(FLD&&!FLD.ended){ fPop(FLD.hero.x-FLD.ox(),FLD.hero.y-FLD.oy()-140,`the torchstalk goes off! −${ts.damage}`,"#ff7a3a"); sfx("magic_impact_fire",{vol:.5}); fHurt(FLD,ts.damage,"an exploding torchstalk"); } },600); } }
  return true;
}
// ---- what the page drives
const api={
  start(mode){ if(FLD) return false; return mode==="hunt"?startHunt():startForage(); },
  active(){ return !!FLD&&!$("fld").hidden; },
  tick(dt){ fLoop(dt); },
  hero(){ return FLD&&FLD.hero; },
  drawFloor(dt){ if(api.active()) FLD.drawFloor(dt); },
  sortables(){ return api.active()?FLD.sortables():[]; },
  drawOver(dt){ if(api.active()) FLD.drawOver(dt); },
  hud(){ if(api.active()) FLD.hud(); },
  setDm(on){ dmView=!!on; if($("flddev")) $("flddev").hidden=!dmView||!FLD; },
  pack(){ return PACK; }, supplies(){ return supplies; }, party(){ return PARTY[ME]; },
  // for the page's room chains: the camp's encounter rows, its terrain props and biome ground cover, and its prop sprites
  rows(){ return FROWS; }, terrainProps(){ return TERRAIN_PROPS; }, decor(b){ return FDECOR[b]||FDECOR.tunnels; },
  drawProp(slug,x,y,h,a){ fDrawProp(slug,x,y,h,a); }, propWidth(slug,h){ const im=fProp[slug]; return im&&im.width?im.width*h/im.height:h*.8; },
  get FLD(){ return FLD; }
};
return api;

};
