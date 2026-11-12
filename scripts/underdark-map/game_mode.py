"""GAME MODE for the Map Module page: the list of text patches import_artifact.py applies.

Each entry is (old, new) or (old, new, count); count 0 means "every occurrence". The artifact's own
code is left as it is wherever possible; game mode is switched on by ?game=1 inside the game's page
and is driven by components/map/underdark-map-module.tsx over postMessage:

  page -> game   aop:map-ready                     the page is waiting for its first state
                 aop:map-pick   {k}                the leader clicked a stop (the game asks, confirms, moves)
                 aop:map-hover  {k|null}           the pointer is over a stop
                 aop:map-reached{k}                the token finished walking a leg
                 aop:map-enter  {k}                "Enter" at a painted entrance
  game -> page   aop:map-state  {nodes,edges,party,dm,lead,boat,hero,followers,lairs}
                 aop:map-leg    {a,b,last}         walk one leg now
                 aop:map-place  {k}                the party is simply there (no road walked)
"""

GAME_BLOCK = r'''
/* ---------- GAME MODE (scripts/underdark-map/game_mode.py) ----------
   Inside the game the page decides nothing: what exists, what is known, who leads, whose sprite walks
   and every move come from the game. Fog of war is the default for everyone, the DM included. */
const GAME=new URLSearchParams(location.search).get("game")==="1"&&window.parent!==window;
const post=m=>{ if(GAME) parent.postMessage(m,location.origin); };
const LAYOUT_N=new Map(G.nodes.map(n=>[n.k,n])), LAYOUT_E=new Map(G.edges.map(e=>[e.a<e.b?e.a+"|"+e.b:e.b+"|"+e.a,e]));
let GS=null, gameDM=false, gameLead=false, gameLegP=null, gameLast=true;
const placed=n=>Number.isFinite(n.x)&&Number.isFinite(n.y);
function gameNode(n){ const l=LAYOUT_N.get(n.k)||{}; const o={k:n.k,n:n.n||null,t:n.t==="location"?"location":"waypoint",x:n.x,y:n.y,d:!!n.d,nk:!!n.nk};
  if(l.poi) o.poi=l.poi; if(l.sub) o.sub=l.sub; if(l.lesser) o.lesser=true; return o; }
// The bend of each road is the artifact's (it follows the painting); a road the artifact never drew runs straight.
function gameEdge(e){ const l=LAYOUT_E.get(e.a<e.b?e.a+"|"+e.b:e.b+"|"+e.a);
  return {a:e.a,b:e.b,m:e.m==="sail"||e.m==="dive"?e.m:"walk",o:l?(l.a===e.a?l.o:-l.o):0,mi:Number(e.mi)||1,d:!!e.d}; }
if(GAME){
  GS=await new Promise(res=>{ const h=ev=>{ if(ev.origin!==location.origin||!ev.data||ev.data.type!=="aop:map-state") return; removeEventListener("message",h); res(ev.data); };
    addEventListener("message",h); post({type:"aop:map-ready"}); });
  const nodes=GS.nodes.filter(placed).map(gameNode), has=new Set(nodes.map(n=>n.k));
  const edges=GS.edges.filter(e=>e.road===true&&has.has(e.a)&&has.has(e.b)).map(gameEdge);
  // a party standing somewhere the painting has no spot for (inside a place, say) is shown at the outpost gate
  G={nodes,edges,party:has.has(GS.party)?GS.party:has.has(G.party)?G.party:nodes[0].k};
}
'''

GAME_TAIL = r'''
/* ---------- GAME MODE: live state, legs and the leader's sprite ---------- */
let heroSrc="";   // heroFoot: how far up its cell the figure's feet stand (the sprite's pivot), so nobody floats above the road
function setHero(h){ if(!h||!h.walk||!h.idle) return; const key=h.walk.src+"|"+h.idle.src; if(key===heroSrc) return; heroSrc=key;
  let n=0; const got={};
  for(const kind of ["walk","idle"]) loader.load(h[kind].src,t=>{ t.colorSpace=THREE.SRGBColorSpace; t.magFilter=t.minFilter=THREE.NearestFilter; t.wrapS=t.wrapT=THREE.RepeatWrapping; got[kind]=t;
    if(++n<2||heroSrc!==key) return;   // swap both sheets together, never a half-dressed figure
    for(const kk of ["walk","idle"]){ sheets[kk]=got[kk]; sheetMeta[kk]={frames:h[kk].frames,fps:h[kk].fps}; }
    heroK=Number.isFinite(h.scale)?h.scale:(h.cell||128)/128; heroFoot=Number.isFinite(h.foot)?h.foot:.02; hero.center.set(.5,heroFoot); heroT=0; heroMat.map=sheets[heroAnim]; heroMat.needsUpdate=true; idleImg.src=h.idle.src; entIdleFrames=h.idle.frames; });
}
/* ---------- GAME MODE: the marching line and the rim light (Sam, 2026-11-12) ----------
   "The marching line with real walk cycles": the leader walks in front and every other seated hero follows
   in file, each on its own sheets, at its own size. Followers walk the leader's own footsteps (a trail of
   crumbs), so they take the bends of the road the way the leader did. They decide nothing and send nothing.
   Rim light: a thin warm edge drawn around each figure inside its sprite shader, so it reads on the dark map. */
function rimLight(mat){ const px={value:new THREE.Vector2(1/768,1/1024)}; mat.userData.rimPx=px;
  mat.onBeforeCompile=s=>{ s.uniforms.rimPx=px;
    s.fragmentShader=s.fragmentShader.replace("uniform float opacity;","uniform float opacity;\nuniform vec2 rimPx;").replace("#include <map_fragment>",`#include <map_fragment>
	#ifdef USE_MAP
	if(diffuseColor.a<.5*opacity){ float rimA=max(max(texture2D(map,vMapUv+vec2(rimPx.x,0.)).a,texture2D(map,vMapUv-vec2(rimPx.x,0.)).a),max(texture2D(map,vMapUv+vec2(0.,rimPx.y)).a,texture2D(map,vMapUv-vec2(0.,rimPx.y)).a));
	  if(rimA>.5) diffuseColor=vec4(1.,.84,.5,opacity*.95); }
	#endif`); };
  mat.customProgramCacheKey=()=>"aop-rim"; mat.needsUpdate=true; }
function rimSize(mat){ const im=mat.map&&mat.map.image, px=mat.userData.rimPx; if(px&&im&&im.width) px.value.set(1.5/im.width,1.5/im.height); }
const FOL_GAP=.5, FOL_REST=[[-.42,.16],[-.8,-.12],[-1.16,.18],[-1.5,-.1],[-1.86,.14]];
let fol=[], folKey="", crumbs=[];
function setFollowers(list){ list=(Array.isArray(list)?list:[]).filter(h=>h&&h.walk&&h.idle).slice(0,FOL_REST.length);
  const key=list.map(h=>h.walk.src).join("|"); if(key===folKey) return; folKey=key;
  for(const f of fol){ scene.remove(f.sprite); scene.remove(f.shadow); f.mat.dispose(); f.tex.walk.dispose(); f.tex.idle.dispose(); } fol=[];
  list.forEach((h,i)=>{ const tex={};
    for(const kind of ["walk","idle"]){ const t=loader.load(h[kind].src); t.colorSpace=THREE.SRGBColorSpace; t.magFilter=t.minFilter=THREE.NearestFilter; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(1/h[kind].frames,1/8); tex[kind]=t; }
    const mat=new THREE.SpriteMaterial({map:tex.idle,transparent:true,depthWrite:false}); rimLight(mat);
    const sprite=new THREE.Sprite(mat); sprite.scale.setScalar(Number.isFinite(h.scale)?h.scale:(h.cell||128)/128); sprite.center.set(.5,Number.isFinite(h.foot)?h.foot:.02); scene.add(sprite);
    const sh=shadow.clone(); scene.add(sh); const o=FOL_REST[i];
    fol.push({h,tex,mat,sprite,shadow:sh,pos:new THREE.Vector3(heroPos.x+o[0],0,heroPos.z+o[1]),row:0,anim:"idle",t:i*.37,still:1}); });
}
function trailTick(dt,aboard){
  rimSize(heroMat); if(!fol.length) return;
  const last=crumbs[crumbs.length-1], step=last?Math.hypot(heroPos.x-last.x,heroPos.z-last.z):0;
  if(!last||step>2){ crumbs=[{x:heroPos.x,z:heroPos.z}];   // the party was simply put somewhere: nobody runs across the map to catch up
    if(last) fol.forEach((f,i)=>f.pos.set(heroPos.x+FOL_REST[i][0],0,heroPos.z+FOL_REST[i][1])); }
  else if(step>.04){ crumbs.push({x:heroPos.x,z:heroPos.z}); if(crumbs.length>600) crumbs.shift(); }
  const show=hero.visible&&!aboard, k=1-Math.exp(-dt*7);
  fol.forEach((f,i)=>{ const want=(i+1)*FOL_GAP; let ax=heroPos.x, az=heroPos.z, acc=0, tx=null, tz=0;
    for(let j=crumbs.length-1;j>=0;j--){ const b=crumbs[j], d=Math.hypot(ax-b.x,az-b.z); if(d>0&&acc+d>=want){ const u=(want-acc)/d; tx=ax+(b.x-ax)*u; tz=az+(b.z-az)*u; break; } acc+=d; ax=b.x; az=b.z; }
    if(tx==null){ const r=1-acc/want; tx=ax+FOL_REST[i][0]*r; tz=az+FOL_REST[i][1]*r; }   // the trail is still short: stand where the walk began
    const dx=(tx-f.pos.x)*k, dz=(tz-f.pos.z)*k; f.pos.x+=dx; f.pos.z+=dz;
    if(Math.hypot(dx,dz)/Math.max(dt,1e-3)>.25){ f.still=0; f.row=rowFor(dx,dz); } else f.still+=dt;
    const anim=f.still<.18?"walk":"idle"; if(anim!==f.anim){ f.anim=anim; f.t=0; f.mat.map=f.tex[anim]; f.mat.needsUpdate=true; }
    f.t+=dt; const meta=f.h[anim], m=f.mat.map, fr=Math.floor(f.t*meta.fps)%meta.frames; m.repeat.set(1/meta.frames,1/8); m.offset.set(fr/meta.frames,1-(f.row+1)/8);
    rimSize(f.mat); f.mat.opacity=heroMat.opacity; f.sprite.visible=f.shadow.visible=show;
    f.sprite.position.set(f.pos.x,.02,f.pos.z); f.shadow.position.set(f.pos.x,.05,f.pos.z); });
}
/* ---------- GAME MODE: what looms at a lair (Sam, 2026-11-12: "oversized boss silhouettes") ----------
   A place the game names as a lair shows its creature as a large dark shape standing behind the stop, with a
   red edge, breathing. Which stops are lairs and whose shape it is come from the game (lib/travel/map-hero.ts,
   MAP_LAIRS); the page draws only what it is sent, and only at a stop the party can see. */
const LOOM_SIZE=2;
let looms=[], loomKey="";
function loomLook(mat){ const px={value:new THREE.Vector2(1/160,1/1280)}; mat.userData.rimPx=px;
  mat.onBeforeCompile=s=>{ s.uniforms.rimPx=px;
    s.fragmentShader=s.fragmentShader.replace("uniform float opacity;","uniform float opacity;\nuniform vec2 rimPx;").replace("#include <map_fragment>",`#include <map_fragment>
	#ifdef USE_MAP
	if(diffuseColor.a<.5*opacity){ float rimA=max(max(texture2D(map,vMapUv+vec2(rimPx.x,0.)).a,texture2D(map,vMapUv-vec2(rimPx.x,0.)).a),max(texture2D(map,vMapUv+vec2(0.,rimPx.y)).a,texture2D(map,vMapUv-vec2(0.,rimPx.y)).a));
	  if(rimA>.5) diffuseColor=vec4(.8,.1,.08,opacity*.9); }
	else diffuseColor.rgb=mix(vec3(.02,.015,.035),diffuseColor.rgb,.08);
	#endif`); };
  mat.customProgramCacheKey=()=>"aop-loom"; mat.needsUpdate=true; }
function setLairs(list){ list=(Array.isArray(list)?list:[]).filter(l=>l&&stops.has(l.k)&&l.fig&&l.fig.idle);
  const key=list.map(l=>l.k+"@"+l.fig.idle.src).join("|"); if(key===loomKey) return; loomKey=key;
  for(const L of looms){ scene.remove(L.sprite); L.mat.dispose(); L.tex.dispose(); } looms=[];
  for(const l of list){ const h=l.fig, t=loader.load(h.idle.src); t.colorSpace=THREE.SRGBColorSpace; t.magFilter=t.minFilter=THREE.NearestFilter; t.wrapS=t.wrapT=THREE.RepeatWrapping;
    t.repeat.set(1/h.idle.frames,1/8); t.offset.set(0,1-1/8);   // one still, facing south, toward the road
    const mat=new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}); loomLook(mat);
    const sprite=new THREE.Sprite(mat), base=(Number.isFinite(h.scale)?h.scale:(h.cell||128)/128)*LOOM_SIZE, p=stops.get(l.k).position;
    sprite.center.set(.5,Number.isFinite(h.foot)?h.foot:.02); sprite.position.set(p.x+.2,.02,p.z-.6); sprite.scale.set(base,base,1); sprite.visible=false; sprite.renderOrder=1; scene.add(sprite);
    looms.push({k:l.k,sprite,mat,tex:t,base}); }
}
// A tall shape reaches up the screen past the fog sheet behind it, and the sheet (drawn later, being farther off) would
// paint over everything above its knees. So a shape that shows is drawn after the sheet, and the walkers after the shape.
function loomTick(t){ let up=false;
  for(const L of looms){ L.sprite.visible=visibleNode(L.k); if(!L.sprite.visible) continue; up=true; rimSize(L.mat); L.sprite.scale.set(L.base,L.base*(1+.025*Math.sin(t*1.3)),1); }
  if(up&&hero.renderOrder<2) hero.renderOrder=2; for(const f of fol) f.sprite.renderOrder=up?2:0; }
function gameWhere(){ const n=N.get(party); document.getElementById("where").textContent = n&&n.t==="location"&&nameShown(n) ? n.n : "On the road"; }
function applyState(s,first){
  GS=s; gameDM=!!s.dm; gameLead=!!s.lead; document.body.classList.toggle("gm",gameDM); document.body.classList.toggle("lead",gameLead);
  if(!gameDM&&dm){ dm=false; tgP.setAttribute("aria-pressed","true"); tgD.setAttribute("aria-pressed","false"); }
  const seen=new Set(); let moved=false;
  for(const n of s.nodes){ if(!placed(n)) continue; seen.add(n.k); const cur=N.get(n.k);
    if(!cur){ const o=gameNode(n); N.set(o.k,o); addStop(o); addBanner(o); }
    else { if(cur.x!==n.x||cur.y!==n.y) moved=true; cur.n=n.n||null; cur.nk=!!n.nk; cur.d=!!n.d; } }
  if(moved&&!first){ location.reload(); return; }   // the DM moved a stop on the painting: draw it again from scratch
  known.clear(); for(const n of N.values()) if(n.d&&seen.has(n.k)) known.add(n.k); known.add(party);
  for(const e of s.edges){ if(e.road!==true||!N.has(e.a)||!N.has(e.b)) continue; const o=gameEdge(e); if(roadMesh.has(eKey(o))) continue; E.push(o); addRoad(o); }
  const bk=s.boat?"duergar":"none"; if((boatKind||"none")!==bk) chooseBoat(bk);
  setHero(s.hero); setFollowers(s.followers); setLairs(s.lairs); refresh(); gameWhere(); if(!cineK&&!entK) showCard(walking?walking.dest:(hovered||party));
}
function gamePlace(k){ if(!N.has(k)||walking) return; party=k; visited.add(k); heroPos.copy(stops.get(k).position).setY(0); setSheet("idle"); known.add(k);
  playTrack(trackFor(party,false)); setBed(bedFor(party,false)); refresh(); gameWhere(); showCard(party); }
// One leg of a walk the game has already allowed. A leg with no drawn road still walks, straight, so the token never jumps.
function gameLeg(a,b,last){
  if(!N.has(a)||!N.has(b)||walking){ if(N.has(b)&&!walking) gamePlace(b); post({type:"aop:map-reached",k:b}); return; }
  if(party!==a){ party=a; heroPos.copy(stops.get(a).position).setY(0); }
  let e=E.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a));
  if(!e){ e={a,b,m:"walk",o:0,mi:1,d:false}; e.pts=curvePts(e,40); }
  gameLast=!!last; gameLegP={legs:[{from:a,to:b,e}],miles:e.mi}; queued=null; goTo(b);
}
if(GAME){
  document.body.classList.add("game"); rimLight(heroMat);
  const soon=document.querySelector("#entEnter .soon"); if(soon) soon.remove();
  applyState(GS,true);
  addEventListener("message",ev=>{ if(ev.origin!==location.origin||!ev.data) return; const m=ev.data;
    if(m.type==="aop:map-state") applyState(m,false);
    else if(m.type==="aop:map-leg") gameLeg(m.a,m.b,m.last);
    else if(m.type==="aop:map-place") gamePlace(m.k); });
}
'''

GAME_CSS = r'''
/* GAME MODE: the leader and the boat come from the game; a player who is not the DM sees the map, the place card, zoom and sound, nothing else */
body.game #leadRow,body.game .boatpick,body.game .clock,body.game #cineBtn,body.game #trackName{display:none !important}
body.game:not(.gm) .hud.toggles,body.game:not(.gm) .hud.keys,body.game:not(.gm) #legend,body.game:not(.gm) #atlasLink{display:none !important}
body.game:not(.lead) #entEnter{display:none !important}
'''

PATCHES = [
    # ---- data and the first state
    ('const G={"nodes"', 'let G={"nodes"'),
    ("const PACE=24; // SRD normal pace, miles per day\n", "const PACE=24; // SRD normal pace, miles per day\n" + GAME_BLOCK),
    ("let party=G.party, dm=false, boat=false, caveFound=false, fallsOff=false, swimOk=false, groveFound=false;",
     "let party=G.party, dm=false, boat=false, caveFound=false, fallsOff=false, swimOk=false, groveFound=false;\n"
     "if(GAME){ caveFound=true; fallsOff=true; }   // the game has no dive or falls rule: a road is a road"),
    # ---- what is known. In the game a road is known when both of its ends are.
    ("knownE.has(eKey(e))", "eKnown(e)", 0),
    ("function eKey(e){ return e.a<e.b? e.a+\"|\"+e.b : e.b+\"|\"+e.a }",
     "function eKey(e){ return e.a<e.b? e.a+\"|\"+e.b : e.b+\"|\"+e.a }\n"
     "function eKnown(e){ return GAME ? (known.has(e.a)&&known.has(e.b)) : knownE.has( eKey(e) ); }"),
    ("function revealAround(k){ known.add(k); for(", "function revealAround(k){ known.add(k); if(GAME) return; for("),
    ("const visibleNode=k=> dm || reach.has(k);", "const visibleNode=k=> dm || (GAME ? known.has(k) : reach.has(k));"),
    ("const visibleEdge=e=> dm ? true : (usable(e) && reach.has(e.a) && reach.has(e.b));",
     "const visibleEdge=e=> dm ? true : GAME ? usable(e) : (usable(e) && reach.has(e.a) && reach.has(e.b));"),
    # ---- roads, stops and labels can be added after the page is built (a discovery mid-session)
    ("const roadMesh=new Map();\nfor(const e of E){ const sail=", "const roadMesh=new Map();\nfunction addRoad(e){ const sail="),
    ("roadGroup.add(m); roadMesh.set(eKey(e),m); e.pts=curvePts(e,40); }", "roadGroup.add(m); roadMesh.set(eKey(e),m); e.pts=curvePts(e,40); }\nfor(const e of E) addRoad(e);"),
    ("for(const n of N.values()){\n  const big=n.t===\"location\"&&!n.lesser, g=new THREE.Group();", "function addStop(n){\n  const big=n.t===\"location\"&&!n.lesser, g=new THREE.Group();"),
    ("stopGroup.add(g); stops.set(n.k,g);\n}", "stopGroup.add(g); stops.set(n.k,g);\n}\nfor(const n of N.values()) addStop(n);"),
    ("for(const n of N.values()){\n  const b=document.createElement(\"div\"); b.className=\"banner\"+", "function addBanner(n){\n  const b=document.createElement(\"div\"); b.className=\"banner\"+"),
    ("labelsEl.appendChild(b); banners.set(n.k,b); }", "labelsEl.appendChild(b); banners.set(n.k,b); }\nfor(const n of N.values()) addBanner(n);"),
    # ---- names: only what the game says the party has learned
    ("const nameShown=n=> dm || n.nk || visited.has(n.k);", "const nameShown=n=> GAME ? (!!n.n && (dm || n.nk)) : (dm || n.nk || visited.has(n.k));"),
    ("b.textContent=n.n.replace(\"Road Marker \",\"Marker \")", "b.textContent=(n.n||\"\").replace(\"Road Marker \",\"Marker \")"),
    # ---- the hero: any hero's sheets, not only Fifi's
    ("function frameSprite(dt){\n  heroT+=dt; const frames=heroAnim===\"walk\"?6:4, fps=heroAnim===\"walk\"?12:5, f=",
     "const sheetMeta={walk:{frames:6,fps:12},idle:{frames:4,fps:5}}; let heroK=1;\nfunction frameSprite(dt){\n  heroT+=dt; const frames=sheetMeta[heroAnim].frames, fps=sheetMeta[heroAnim].fps, f="),
    ("hero.scale.setScalar(aboard?.82:1);", "hero.scale.setScalar((aboard?.82:1)*heroK);"),
    ("const idleImg=new Image(); idleImg.src=IDLE;", "const idleImg=new Image(); idleImg.src=IDLE; let entIdleFrames=4, heroFoot=.02;"),
    ("Math.round(sy+py-dh),dw,dh); }", "Math.round(sy+py-dh+dh*heroFoot),dw,dh); }"),
    ("const fw=idleImg.naturalWidth/4, fh=idleImg.naturalHeight/8, f=Math.floor(t*5)%4, row=4;", "const fw=idleImg.naturalWidth/entIdleFrames, fh=idleImg.naturalHeight/8, f=Math.floor(t*5)%entIdleFrames, row=4;"),
    # ---- the card: no prototype rules, no instructions for someone who cannot move the party
    ("card.meta.innerHTML= walking? \"On the march.\" : \"You are here. Arrow keys or WASD walk to the next stop.\";",
     "card.meta.innerHTML= walking? \"On the march.\" : (GAME&&!gameLead)? \"You are here.\" : \"You are here. Arrow keys or WASD walk to the next stop.\";"),
    ("if(!walking) poolCard(k); return; }", "if(!walking&&!GAME) poolCard(k); return; }"),
    ("  const days=p.miles/PACE;\n", "  if(GAME){ card.meta.innerHTML=`<b>${p.miles.toFixed(1)} mi</b> by the roads you know${mode===\"hover\"&&gameLead?\" · click to set out\":\"\"}`; return p; }\n  const days=p.miles/PACE;\n"),
    ("  if(k===hovered) return; hovered=k; preview.clear();", "  if(k===hovered) return; hovered=k; preview.clear(); post({type:\"aop:map-hover\",k:k||null});"),
    # ---- moving: the leader asks, the game answers with legs
    ("  if(walking){ queued={k}; return; }\n  let p=route(party,k), atGate=false;",
     "  if(walking){ if(!GAME) queued={k}; return; }\n  if(GAME&&!gameLegP){ if(gameLead) post({type:\"aop:map-pick\",k}); return; }\n  let p=gameLegP||route(party,k), atGate=false; gameLegP=null;"),
    ("  if(!w.atGate && PLATES[party] && cineOn) setTimeout(()=>startCinematic(party),420);", "  if(!w.atGate && PLATES[party] && cineOn && (!GAME||gameLast)) setTimeout(()=>startCinematic(party),420);"),
    ("  if(w.atGate){ queued=null; showToll(); return; }", "  if(GAME){ gameWhere(); post({type:\"aop:map-reached\",k:party}); return; }\n  if(w.atGate){ queued=null; showToll(); return; }"),
    ("function step(d){\n  if(walking){ queued={dir:d}; return; }", "function step(d){\n  if(GAME&&(!gameLead||walking)) return;\n  if(walking){ queued={dir:d}; return; }"),
    ("document.getElementById(\"entEnter\").onclick=()=>{ const s=", "document.getElementById(\"entEnter\").onclick=()=>{ if(GAME&&(GS.enterable||[]).includes(entK)){ post({type:\"aop:map-enter\",k:entK}); return; } const s="),
    # ---- fog (Sam, 2026-11-10: "I can see through the fog of war"). The artifact's fog was a mist, 73-94% opaque,
    # so the painted roads, rings and cities showed through it. In the game the unknown is black: nothing shows.
    ("uniforms:{mask:{value:fogTex},t:{value:0}},", "uniforms:{mask:{value:fogTex},t:{value:0},solid:{value:GAME?1:0}},"),
    ("fragmentShader:`uniform sampler2D mask; uniform float t; varying vec2 vUv;\n  float h(vec2 p)", "fragmentShader:`uniform sampler2D mask; uniform float t; uniform float solid; varying vec2 vUv;\n  float h(vec2 p)"),
    ("    float a=m*(.78+.22*c)*smoothstep(0.,.35,m+.15*c2-.1);", "    float a=m*mix(.78+.22*c,1.,solid)*smoothstep(0.,.35,m+.15*c2-.1);"),
    ("    gl_FragColor=vec4(col,a*.94); }`});", "    col=mix(col,col*.45,solid);\n    gl_FragColor=vec4(col,a*mix(.94,1.,solid)); }`});"),
    # ---- chrome
    ("guardTag.onclick=()=>showToll(); labelsEl.appendChild(guardTag);", "guardTag.onclick=()=>showToll(); guardTag.hidden=true; labelsEl.appendChild(guardTag);"),
    ("#loading{position:fixed;", GAME_CSS + "#loading{position:fixed;"),
    # ---- the marching line: the followers are moved in the page's own frame loop, right after the leader
    ("  frameSprite(dt);\n  const here=stops.get(party);", "  frameSprite(dt); if(GAME){ trailTick(dt,aboard); loomTick(t); }\n  const here=stops.get(party);"),
    ("tick();\nwindow.__wm={", GAME_TAIL + "tick();\nwindow.__wm={"),
]
