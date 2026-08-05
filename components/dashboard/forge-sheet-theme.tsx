"use client"

// ============================================================================
// FORGE 2014 SHEET THEME
//
// The visual system ported from the standalone `aop-forge-2014` artifact so the
// in-dashboard character sheet matches the sheet players already know: a painted
// hero poster with the character's details laid over the darkened left third,
// gold-ruled glass panels, ability medallions, and a parchment tab box below.
//
// It ships as one scoped <style> block rather than Tailwind classes on purpose.
// The artifact's look leans on layered gradients, inset hairlines, radial
// medallion fills and clip-path shapes — expressing those as arbitrary-value
// utilities would be both unreadable and a poor translation. Everything here is
// namespaced under `.aop-forge-sheet` so it cannot leak into the dashboard.
// ============================================================================

/** The six poster backdrops. Slot 0 is a photographic scene when one is
 *  supplied; 1–5 are pure-CSS painted scenes so the sheet never depends on a
 *  network fetch to look finished. */
const SCENE = (a: string, glow: string, b: string) =>
  `linear-gradient(180deg,rgba(8,6,10,.35),rgba(5,4,8,.88)),` +
  `radial-gradient(900px 500px at 72% 38%,${glow},transparent 70%),` +
  `linear-gradient(160deg,${a} 0%,${b} 100%)`

export const BACKDROPS: { label: string; css: string }[] = [
  { label: "Arcane Vault", css: SCENE("#1a1230", "rgba(120,90,200,.35)", "#0a0716") },
  { label: "Ember Caldera", css: SCENE("#241207", "rgba(255,107,53,.38)", "#0d0503") },
  { label: "Underdark", css: SCENE("#071a1c", "rgba(60,180,190,.30)", "#03090c") },
  { label: "Feywild", css: SCENE("#0d1f10", "rgba(90,190,90,.28)", "#040a05") },
  { label: "Storm Coast", css: SCENE("#101722", "rgba(160,190,230,.30)", "#05080d") },
  { label: "Blood Moon", css: SCENE("#25080d", "rgba(200,60,70,.32)", "#0b0305") },
]

/** Stable per-character backdrop: the same character always gets the same
 *  scene, so the sheet doesn't reshuffle every time it opens. */
export function backdropIndexFor(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % BACKDROPS.length
}

/** Photographic art gets a left-to-right scrim instead of a painted scene, so
 *  the text side stays readable while the art reads on the right. */
export function backdropCss(index: number, imageUrl?: string | null): string {
  if (imageUrl) {
    return (
      `linear-gradient(90deg,rgba(6,5,8,.72) 0%,rgba(6,5,8,.30) 45%,rgba(6,5,8,0) 70%),` +
      `url('${imageUrl.replace(/'/g, "\\'")}')`
    )
  }
  return BACKDROPS[index % BACKDROPS.length].css
}

export function ForgeSheetTheme() {
  return (
    <style>{`
.aop-forge-sheet{
  --gold:#c9a86a; --gold-lt:#e8d5ae; --red:#d9232e; --green:#3fb96b;
  --ember:#ff6b35; --ink:#26221b; --pw:#fdfaf1; --dred:#9e2b25;
  color:#e4dcc9;
  font-family:"Segoe UI",system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;
  line-height:1.45;
}
.aop-forge-sheet .serif{font-family:Georgia,"Times New Roman",serif}

/* ---- poster ---------------------------------------------------------- */
.aop-forge-sheet .hero{
  position:relative;border:1px solid #4a3b22;border-radius:14px;overflow:hidden;
  background-color:#0a0908;background-size:cover;background-position:center right;
  box-shadow:0 14px 40px rgba(0,0,0,.65);
}
.aop-forge-sheet .hero-inner{
  display:flex;flex-direction:column;gap:14px;padding:18px 16% 24px 18px;
}
@media (max-width:1100px){ .aop-forge-sheet .hero-inner{padding:14px} }

/* ---- glass panel ------------------------------------------------------ */
.aop-forge-sheet .hpanel{
  position:relative;background:rgba(11,8,7,.80);
  border:1px solid rgba(201,168,106,.5);border-radius:10px;padding:11px 13px;
  box-shadow:inset 0 0 22px rgba(0,0,0,.55),0 2px 10px rgba(0,0,0,.5);
  color:#e4dcc9;min-width:0;overflow:hidden;
}
.aop-forge-sheet .hpanel::before{
  content:"";position:absolute;inset:3px;
  border:1px solid rgba(201,168,106,.18);border-radius:7px;pointer-events:none;
}
.aop-forge-sheet button.hpanel{cursor:pointer;text-align:inherit;width:100%}
.aop-forge-sheet button.hpanel:hover{border-color:var(--gold)}
.aop-forge-sheet .hpanel h4{
  margin:0 0 7px;font-family:Georgia,serif;font-size:12px;letter-spacing:.14em;
  text-transform:uppercase;color:var(--gold-lt);
}

/* ---- name banner + chips --------------------------------------------- */
.aop-forge-sheet .hero-head{display:flex;gap:14px;align-items:stretch;flex-wrap:wrap}
.aop-forge-sheet .hbanner{
  display:flex;gap:12px;align-items:center;
  background:linear-gradient(180deg,rgba(38,12,12,.93),rgba(20,8,8,.93));
  border:1.5px solid #a4552c;border-radius:10px;padding:10px 16px;
  min-width:320px;flex:1;
}
.aop-forge-sheet .hb-name{
  font-family:Georgia,serif;font-size:clamp(17px,1.6vw,24px);letter-spacing:.05em;
  text-transform:uppercase;color:#f2e8d5;line-height:1.12;
  overflow-wrap:anywhere;
}
.aop-forge-sheet .hb-sub{
  font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);
}
.aop-forge-sheet .hgauge{
  width:min(240px,100%);height:6px;border-radius:3px;background:#241a12;overflow:hidden;
}
.aop-forge-sheet .hgauge>i{
  display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--ember));
}
.aop-forge-sheet .hchips{
  display:flex;flex-wrap:wrap;background:rgba(11,8,7,.82);
  border:1px solid rgba(201,168,106,.4);
  border-radius:10px;flex:2;min-width:300px;align-items:stretch;
}
.aop-forge-sheet .hchip{
  flex:1 1 110px;padding:8px 13px;border-right:1px solid rgba(201,168,106,.22);min-width:0;
}
.aop-forge-sheet .hchip:last-child{border-right:none}
.aop-forge-sheet .hchip .k{
  display:block;font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);
}
.aop-forge-sheet .hchip .v{
  font-family:Georgia,serif;font-size:12.5px;text-transform:uppercase;color:#f2e8d5;
  display:block;line-height:1.25;overflow-wrap:anywhere;
}

/* ---- grid ------------------------------------------------------------- */
.aop-forge-sheet .hero-grid{
  display:grid;grid-template-columns:208px minmax(340px,1fr) 260px;gap:14px;align-items:start;
}
@media (max-width:1180px){
  .aop-forge-sheet .hero-grid{grid-template-columns:200px 1fr}
  .aop-forge-sheet .hero-grid>div:nth-child(3){grid-column:1/-1}
}
@media (max-width:760px){ .aop-forge-sheet .hero-grid{grid-template-columns:1fr} }

/* ---- ability medallions ---------------------------------------------- */
.aop-forge-sheet .med{
  display:flex;align-items:center;gap:10px;width:100%;margin-bottom:10px;
  cursor:pointer;background:none;text-align:left;border:none;padding:0;
}
.aop-forge-sheet .med-score{
  width:60px;height:60px;flex:none;border-radius:50%;
  display:flex;align-items:center;justify-content:center;
  font-family:Georgia,serif;font-size:25px;color:#f2e8d5;
  background:radial-gradient(circle at 38% 32%,#2c241c,#100c0a 78%);
  border:2px solid #8a6f3c;
  box-shadow:0 0 0 3px rgba(0,0,0,.55),0 4px 12px rgba(0,0,0,.6);
  transition:border-color .15s,box-shadow .15s;
}
.aop-forge-sheet .med.savep .med-score{
  border-color:var(--red);box-shadow:0 0 0 3px rgba(0,0,0,.55),0 0 14px rgba(217,35,46,.5);
}
.aop-forge-sheet .med:hover .med-score{
  border-color:var(--gold);box-shadow:0 0 0 3px rgba(0,0,0,.55),0 0 16px rgba(201,168,106,.55);
}
.aop-forge-sheet .med-plaque{
  flex:1;background:rgba(11,8,7,.82);border:1px solid rgba(201,168,106,.45);
  border-radius:8px;padding:5px 11px;min-width:0;
}
.aop-forge-sheet .med-plaque .m{font-family:Georgia,serif;font-size:17px;color:#f2e8d5}
.aop-forge-sheet .med-plaque .n{
  display:block;font-size:9.5px;letter-spacing:.12em;color:#cbb27e;
  text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}

/* ---- stat strip ------------------------------------------------------- */
.aop-forge-sheet .hstat-row{display:flex;gap:10px;flex-wrap:wrap}
.aop-forge-sheet .hstat{flex:1;min-width:96px;text-align:center}
.aop-forge-sheet .hstat .v{
  font-family:Georgia,serif;font-size:26px;color:#f2e8d5;display:block;line-height:1.1;
}
.aop-forge-sheet .hstat .k{
  font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);
}
.aop-forge-sheet .hstat.on{border-color:var(--gold);box-shadow:0 0 14px rgba(201,168,106,.4)}

/* ---- saves / skills --------------------------------------------------- */
.aop-forge-sheet .hduo{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
.aop-forge-sheet .hduo>*{min-width:0}
.aop-forge-sheet .hsheet-panel{flex:1 1 420px}
.aop-forge-sheet .hrow2-panel{flex:1 1 240px}
.aop-forge-sheet .hsplit{display:grid;grid-template-columns:1fr 1.25fr;gap:14px}
@media (max-width:640px){ .aop-forge-sheet .hsplit{grid-template-columns:1fr} }
.aop-forge-sheet .hsv-row,.aop-forge-sheet .hsk-row{
  display:flex;align-items:center;gap:8px;width:100%;min-width:0;overflow:hidden;
  padding:2px 5px;border-radius:4px;font-size:13px;color:#ddd5c6;
  background:none;border:none;text-align:left;cursor:pointer;
}
/* Without min-width:0 the skill name refuses to shrink and the row spills the
   ability tag outside the panel, where it reads as ghost text over the vitals. */
.aop-forge-sheet .hsv-row>span:not(.hdot),
.aop-forge-sheet .hsk-row>span:not(.hdot):not(.ab){
  min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.aop-forge-sheet .hsv-row:hover,.aop-forge-sheet .hsk-row:hover{background:rgba(201,168,106,.12)}
.aop-forge-sheet .hsv-row b,.aop-forge-sheet .hsk-row b{
  min-width:32px;flex:none;text-align:right;color:#f2e8d5;font-family:Georgia,serif;font-weight:normal;
}
.aop-forge-sheet .hsk-row .ab{flex:none;margin-left:4px;font-size:9.5px;letter-spacing:.1em;color:#8f8570}
.aop-forge-sheet .hdot{
  width:9px;height:9px;border-radius:50%;flex:none;
  border:1px solid rgba(201,168,106,.55);background:transparent;
}
.aop-forge-sheet .hdot.p{background:var(--red);border-color:var(--red)}
.aop-forge-sheet .hdot.e{background:var(--gold);border-color:var(--gold)}

/* ---- vitals ----------------------------------------------------------- */
.aop-forge-sheet .hvitals{width:200px;display:flex;flex-direction:column;gap:12px}
@media (max-width:1100px){ .aop-forge-sheet .hvitals{width:100%} }
.aop-forge-sheet .hcenter{text-align:center}
.aop-forge-sheet .hHP .big{font-family:Georgia,serif;font-size:25px;color:#f2e8d5}
.aop-forge-sheet .hHP .mx{font-family:Georgia,serif;font-size:16px;color:#9a8f72}

/* ---- personality ------------------------------------------------------ */
.aop-forge-sheet .pers-block{margin-bottom:10px}
.aop-forge-sheet .pers-block .k{
  font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--gold);display:block;
}
.aop-forge-sheet .pers-block .v{font-size:12.5px;color:#ddd5c6}

/* ---- parchment tab box ------------------------------------------------ */
.aop-forge-sheet .dbx{
  position:relative;margin-top:16px;background:var(--pw);color:var(--ink);
  border:2px solid var(--dred);border-radius:12px;
  box-shadow:0 4px 14px rgba(0,0,0,.5),inset 0 0 24px rgba(158,43,37,.05);
}
.aop-forge-sheet .dbx::before{
  content:"";position:absolute;inset:3px;border:1px solid rgba(158,43,37,.5);
  border-radius:8px;pointer-events:none;
}
.aop-forge-sheet .dtabs{
  display:flex;gap:2px;flex-wrap:wrap;padding:8px 10px 0;position:relative;z-index:1;
}
.aop-forge-sheet .dtab{
  font-family:Georgia,serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  padding:7px 13px;border-radius:7px 7px 0 0;border:1px solid transparent;
  color:#6b6255;background:transparent;cursor:pointer;
}
.aop-forge-sheet .dtab:hover{color:var(--dred)}
.aop-forge-sheet .dtab.on{
  background:var(--dred);color:#fdfaf1;border-color:var(--dred);
}
.aop-forge-sheet .dbx-body{padding:14px 16px 16px;position:relative;z-index:1;font-size:13px}
.aop-forge-sheet .dbx-body h5{
  font-family:Georgia,serif;font-size:12px;letter-spacing:.12em;text-transform:uppercase;
  color:var(--dred);margin:0 0 6px;
}
.aop-forge-sheet .dbx-body .muted{color:#6b6255}
.aop-forge-sheet .dbx-body table{width:100%;border-collapse:collapse}
.aop-forge-sheet .dbx-body th{
  text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:#8a7f6d;border-bottom:1px solid #c9b88e;padding:4px 6px;font-weight:600;
}
.aop-forge-sheet .dbx-body td{padding:5px 6px;border-bottom:1px solid #e6ddc6;color:#4a4438}
.aop-forge-sheet .dbx-body textarea{
  width:100%;min-height:130px;background:#fffdf6;border:1px solid #c9b88e;border-radius:6px;
  padding:8px 10px;color:var(--ink);font-family:inherit;font-size:13px;resize:vertical;
}
`}</style>
  )
}
