// Live character state composed over a painted, reference-matched HUD plate.
// The visual authority is CharacterCards_Warlock_Kenta: painted materials and
// relief live in raster assets; type and values remain database-driven.

import type { CSSProperties, ReactNode } from "react"
import { frameForClass } from "@/lib/class-frames"
import { ResourceGem, SlotCrystal } from "./card-gems"

export interface CardCharacter {
  id: string
  name: string
  class: string | null
  level: number | null
  ac: number | null
  hp_current: number | null
  hp_max: number | null
  dex_modifier: number | null
  portrait_image_url: string | null
  face_image_url?: string | null
  xpFraction?: number
  xp?: number | null
  xp_to_next?: number | null
  inspiration?: boolean | number | null
  conditions?: string[]
}

export type GemState = "lit" | "spent" | "dormant"
export interface SpellSlotLevel { level: number; total: number; used: number }

const CREAM = "#f7dfae"
const GOLD = "#f0c66b"
const NUMBER_FORMAT = new Intl.NumberFormat("en-US")

const absolute = (left: string, top: string, width: string, height: string): CSSProperties => ({
  position: "absolute", left, top, width, height,
})

function fitText(size: number): CSSProperties {
  return {
    color: CREAM,
    fontFamily: "var(--font-display), Cinzel, Georgia, serif",
    fontSize: size,
    fontWeight: 700,
    lineHeight: 1,
    textShadow: "0 2px 3px #000,0 0 5px #000",
  }
}

function PaintedIcon({ src, size, filter }: { src: string; size: number; filter?: string }) {
  return <img src={src} alt="" draggable={false} style={{width:size,height:size,objectFit:"contain",filter}} />
}

const BUFFS = new Set(["blessed", "bless", "hasted", "haste", "aided", "aid", "inspired", "raging", "concentrating", "shielded", "invisible", "flying"])
const SENSES = new Set(["darkvision", "truesight", "blindsight", "tremorsense", "detect magic", "faerie fire", "marked", "hunter's mark"])

function conditionTone(name: string): { fg: string; icon: string } {
  const n = name.toLowerCase().replace(/\s*\d+.*$/, "").trim()
  if (BUFFS.has(n)) return { fg: "#82f052", icon: "≋" }
  if (SENSES.has(n)) return { fg: "#c36cff", icon: "◉" }
  if (n.includes("poison")) return { fg: "#ff5b4c", icon: "☠" }
  return { fg: "#ff8b72", icon: "!" }
}

function Gauge({ value, color }: { value: number; color: "hp" | "xp" }) {
  const fill = color === "hp"
    ? "linear-gradient(180deg,#fff4ea 0%,#ff6d5d 13%,#f4140e 43%,#9d0403 75%,#390000 100%)"
    : "linear-gradient(180deg,#fff8c6 0%,#ffe15b 15%,#ffad08 44%,#a74b00 78%,#3c1700 100%)"
  return (
    <span style={{position:"relative",display:"block",width:"100%",height:"100%",overflow:"hidden",clipPath:"polygon(4% 0,96% 0,100% 50%,96% 100%,4% 100%,0 50%)",background:"#100704",boxShadow:`inset 0 0 5px #000,0 0 5px ${color === "hp" ? "#f21b12" : "#ffad08"}`}}>
      <span style={{display:"block",width:`${Math.max(0,Math.min(1,value))*100}%`,height:"100%",background:fill,boxShadow:"inset 0 2px 2px #fff, inset 0 -3px 4px #210000, 0 0 8px currentColor",transition:"width 300ms"}} />
      <span style={{position:"absolute",left:"7%",right:"7%",top:"10%",height:"18%",borderRadius:999,background:"rgba(255,255,255,.62)"}} />
    </span>
  )
}

function ResourceCell({ label, color, children }: { label: string; color: string; children: ReactNode }) {
  return (
    <span style={{position:"relative",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",minWidth:0}}>
      <span style={{...fitText(6),color,fontSize:6,letterSpacing:".04em",textTransform:"uppercase",whiteSpace:"nowrap",marginTop:1,textShadow:`0 1px 2px #000,0 0 5px ${color}`}}>{label}</span>
      <span style={{flex:1,minHeight:0,width:"100%",display:"grid",placeItems:"center"}}>{children}</span>
    </span>
  )
}

export function CharacterCard({
  character: c,
  active = false,
  isTurn = false,
  gems,
  movement,
  slots,
  onClick,
  onExpand,
  width = 236,
}: {
  character: CardCharacter
  active?: boolean
  isTurn?: boolean
  gems?: { action: GemState; bonus: GemState; reaction: GemState } | null
  movement?: { remainingFt: number; speedFt: number } | null
  slots?: { total: number; used: number; levels?: SpellSlotLevel[] } | null
  onClick?: () => void
  onExpand?: () => void
  width?: number
}) {
  const cls = frameForClass(c.class)
  const max = c.hp_max ?? 0
  const cur = c.hp_current ?? max
  const hpFraction = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0
  const xpFraction = Math.max(0, Math.min(1, c.xpFraction ?? 0))
  const inspiration = typeof c.inspiration === "number" ? c.inspiration : c.inspiration ? 1 : 0
  const conditions = c.conditions ?? []
  const economy = gems ?? { action: "dormant" as GemState, bonus: "dormant" as GemState, reaction: "dormant" as GemState }
  const movementState: GemState = movement && movement.remainingFt <= 0 ? "spent" : isTurn ? "lit" : "dormant"
  const height = Math.round(width * 0.781)
  const scale = width / 210
  const portrait = c.face_image_url || c.portrait_image_url
  const xpText = c.xp != null && c.xp_to_next ? `${NUMBER_FORMAT.format(c.xp)} / ${NUMBER_FORMAT.format(c.xp_to_next)}` : ""
  const rim = isTurn ? "brightness-[1.08] drop-shadow-[0_0_12px_#ffe6a566]" : active ? "brightness-105" : "brightness-[0.82] hover:brightness-100"

  return (
    <div style={{width,flexShrink:0,position:"relative"}} className={`transition duration-200 ${rim}`}>
      <button type="button" onClick={onClick} title={c.name} style={{position:"relative",display:"block",width,height,padding:0,overflow:"hidden",border:0,background:"#030303",cursor:onClick?"pointer":"default",textAlign:"left",boxShadow:"0 5px 16px #000"}}>
        <img src="/ui/character-card/card-frame.webp" alt="" draggable={false} style={{position:"absolute",inset:0,width:"100%",height:"100%",zIndex:1}} />

        <span style={{...absolute("7.2%","9.8%","35.3%","46%"),zIndex:2,overflow:"hidden",borderRadius:"46% 46% 8% 8%",background:`radial-gradient(circle,${cls.accent}55,#08050b 72%)`,boxShadow:`inset 0 0 ${18*scale}px ${cls.accent}66`}}>
          {portrait ? <img src={portrait} alt={c.name} draggable={false} style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center 18%",transform:"scale(1.08)"}} /> : <span style={{display:"grid",placeItems:"center",width:"100%",height:"100%",color:cls.accent,fontSize:32*scale}}>{cls.sigil}</span>}
          <span style={{position:"absolute",inset:0,boxShadow:"inset 0 0 16px #000,inset 0 -12px 16px #0008"}} />
        </span>

        <span style={{...absolute("4.7%","56.2%","39.2%","7.3%"),zIndex:3,display:"grid",placeItems:"center",alignContent:"center"}}>
          <span style={{...fitText(Math.max(8,12*scale)),maxWidth:"94%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:".08em"}}>{c.name.toUpperCase()}</span>
          <span style={{...fitText(Math.max(5.5,6.5*scale)),color:cls.accent,letterSpacing:".12em",textTransform:"uppercase",textShadow:`0 0 6px ${cls.accent},0 1px 2px #000`}}>{c.class ?? "Adventurer"}</span>
        </span>

        <span style={{...absolute("46.8%","4.5%","37%","9%"),zIndex:3,display:"flex",alignItems:"center",gap:3*scale}}>
          <span style={{...fitText(Math.max(6,7*scale)),color:GOLD}}>HP</span>
          <span style={{width:"61%",height:Math.max(7,10*scale)}}><Gauge value={hpFraction} color="hp" /></span>
          <span style={{...fitText(Math.max(8,11*scale)),whiteSpace:"nowrap"}}>{cur} / {max || "—"}</span>
        </span>

        <span style={{...absolute("84.7%","3%","11.6%","11.8%"),zIndex:3,display:"grid",placeItems:"center",alignContent:"center"}}>
          <span style={{...fitText(Math.max(4.5,5.2*scale)),color:"#ffe295",textTransform:"uppercase",letterSpacing:".03em"}}>Inspiration</span>
          <span style={{...fitText(Math.max(10,14*scale)),color:"#fff0ad",textShadow:"0 0 10px #ffb51d,0 2px 2px #000"}}>{inspiration}</span>
        </span>

        <span style={{...absolute("47.2%","14.5%","45.5%","5.2%"),zIndex:3,display:"flex",alignItems:"center",gap:4*scale}}>
          <span style={{...fitText(Math.max(6,7*scale)),color:GOLD}}>XP</span>
          <span style={{width:"57%",height:Math.max(5,7*scale)}}><Gauge value={xpFraction} color="xp" /></span>
          {xpText ? <span style={{...fitText(Math.max(5,6*scale)),whiteSpace:"nowrap"}}>{xpText}</span> : null}
        </span>

        <span style={{...absolute("47%","21.9%","48.7%","18.8%"),zIndex:3,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"2.5%"}}>
          <span style={{display:"grid",placeItems:"center",alignContent:"center"}}><span style={{...fitText(Math.max(5.5,6.5*scale)),color:GOLD}}>AC</span><span style={{display:"flex",alignItems:"center"}}><PaintedIcon src="/ui/character-card/ac-shield.png" size={Math.max(17,27*scale)}/><span style={{...fitText(Math.max(10,15*scale))}}>{c.ac ?? "—"}</span></span></span>
          <span style={{display:"grid",placeItems:"center",alignContent:"center"}}><span style={{...fitText(Math.max(4.5,5.8*scale)),color:GOLD,textTransform:"uppercase"}}>Initiative</span><span style={{display:"flex",alignItems:"center"}}><PaintedIcon src="/ui/character-card/initiative-swords.png" size={Math.max(18,29*scale)}/><span style={{...fitText(Math.max(9,14*scale))}}>{c.dex_modifier == null ? "—" : `${c.dex_modifier >= 0 ? "+" : ""}${c.dex_modifier}`}</span></span></span>
          <span style={{display:"grid",placeItems:"center",alignContent:"center"}}><span style={{...fitText(Math.max(5.5,6.5*scale)),color:GOLD,textTransform:"uppercase"}}>Level</span><span style={{...fitText(Math.max(13,18*scale)),marginTop:4*scale}}>{c.level ?? "—"}</span></span>
        </span>

        <span style={{...absolute("47%","43.2%","48.8%","11%"),zIndex:3,display:"flex",alignItems:"center",paddingLeft:"9%",overflow:"hidden"}}>
          <span style={{position:"absolute",left:"1.2%",width:"10%",aspectRatio:"1",display:"grid",placeItems:"center",borderRadius:"50%",color:cls.accent,fontSize:Math.max(7,11*scale),textShadow:`0 0 8px ${cls.accent}`}}>{cls.sigil}</span>
          <span style={{...fitText(Math.max(9,14*scale)),color:cls.accent,letterSpacing:".08em",textTransform:"uppercase",textShadow:`0 0 9px ${cls.accent},0 2px 2px #000`,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.class ?? "Adventurer"}</span>
        </span>

        {isTurn ? <img src="/ui/character-card/active-gem.png" alt="Active character" draggable={false} style={{...absolute("1.5%",".7%","12.5%","16%"),zIndex:5,objectFit:"contain",filter:"drop-shadow(0 0 7px #33ff55)"}} /> : null}

        <span style={{...absolute("4.6%","65.4%","91.3%","21.5%"),zIndex:3,display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1.28fr",gap:"1.25%"}}>
          <ResourceCell label="Actions" color="#ffc08c"><ResourceGem hue="ruby" state={economy.action} size={Math.max(22,34*scale)} /></ResourceCell>
          <ResourceCell label="Bonus Actions" color="#e1a0ff"><ResourceGem hue="amethyst" state={economy.bonus} size={Math.max(22,34*scale)} /></ResourceCell>
          <ResourceCell label="Movement" color="#a9ec86"><span style={{display:"grid",placeItems:"center",alignContent:"center"}}><PaintedIcon src="/ui/character-card/movement-boot.png" size={Math.max(23,35*scale)} filter={movementState === "spent" ? "grayscale(1) brightness(.3)" : movementState === "dormant" ? "saturate(.4) brightness(.55)" : "drop-shadow(0 0 5px #32dd54)"}/><span style={{...fitText(Math.max(6,8*scale)),color:"#baf1a0",marginTop:-2*scale}}>{movement ? `${Math.max(0,Math.round(movement.remainingFt))} FT.` : "—"}</span></span></ResourceCell>
          <ResourceCell label="Reactions" color="#ffd27b"><ResourceGem hue="amber" state={economy.reaction} size={Math.max(22,34*scale)} /></ResourceCell>
          <ResourceCell label="Spell Slots" color="#68cfff">{slots && slots.total > 0 ? <span style={{display:"flex",justifyContent:"center",gap:2*scale}}>{(slots.levels?.length?slots.levels:[{level:1,total:slots.total,used:slots.used}]).slice(0,3).map(group=><span key={group.level} style={{display:"grid",placeItems:"center"}}><span style={{...fitText(Math.max(4.5,5*scale)),color:"#aee5ff"}}>L{group.level}</span><span style={{display:"flex",gap:1}}>{Array.from({length:Math.min(group.total,4)},(_,i)=><SlotCrystal key={i} spent={i>=group.total-group.used} height={Math.max(18,27*scale)}/>)}</span></span>)}</span>:<span style={{...fitText(9),color:"#486073"}}>—</span>}</ResourceCell>
        </span>

        <span style={{...absolute("5.4%","88.4%","89%","7.2%"),zIndex:3,display:"flex",alignItems:"center",gap:8*scale,overflow:"hidden"}}>
          <span style={{...fitText(Math.max(5.5,7*scale)),color:GOLD,textTransform:"uppercase",letterSpacing:".05em",flexShrink:0}}>Conditions</span>
          {conditions.length===0?<span style={{...fitText(6*scale),color:"#746b58",fontStyle:"italic"}}>none</span>:conditions.slice(0,3).map(condition=>{const tone=conditionTone(condition);return <span key={condition} title={condition} style={{display:"flex",alignItems:"center",gap:2*scale,minWidth:0,color:tone.fg,fontFamily:"Georgia,serif",fontWeight:700,fontSize:Math.max(5.5,7*scale),lineHeight:1,textTransform:"uppercase",whiteSpace:"nowrap",textShadow:`0 0 6px ${tone.fg}`}}><span aria-hidden="true" style={{fontSize:Math.max(7,9*scale)}}>{tone.icon}</span><span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{condition}</span></span>})}
        </span>
      </button>

      {onExpand ? <button type="button" onClick={onExpand} style={{width,marginTop:-1,padding:`${Math.max(2,2*scale)}px 0`,border:"1px solid #8b641f",borderTop:0,borderRadius:"0 0 4px 4px",background:"linear-gradient(#251605,#060403)",color:GOLD,fontFamily:"Georgia,serif",fontSize:Math.max(5.5,6*scale),fontWeight:700,letterSpacing:".2em",textTransform:"uppercase",cursor:"pointer"}}>◈ Sheet ◈</button> : null}
    </div>
  )
}
