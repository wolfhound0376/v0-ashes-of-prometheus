// ============================================================================
// THE CHARACTER CARD — live combat state in the locked baroque composition.
//
// CharacterCards_Warlock_Kenta is the layout authority: portrait and name on
// the left; HP, XP, Inspiration, three stat plaques and a class banner on the
// right; five resource chambers and a full-width conditions rail below. The
// frame is CSS/SVG so live values remain sharp and database-driven at any size.
//
// One large stone represents each action resource. There are deliberately no
// counters, secondary diamonds, decorative orbs, or icons inside those stones.
// ============================================================================

import type { CSSProperties, ReactNode } from "react"
import { frameForClass } from "@/lib/class-frames"
import { ClassMedallion } from "./class-medallion"
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

const GOLD = "#c89b42"
const GOLD_HI = "#ffe091"
const GOLD_DIM = "#70501a"
const CREAM = "#f6e3b9"
const NUMBER_FORMAT = new Intl.NumberFormat("en-US")

const engravedPanel: CSSProperties = {
  background:
    "radial-gradient(circle at 30% 15%,rgba(255,255,255,.035),transparent 42%)," +
    "repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 1px,transparent 1px 4px)," +
    "linear-gradient(180deg,#141319 0%,#09090d 58%,#040406 100%)",
}

const metalEdge = (edge = GOLD): CSSProperties => ({
  border: `1px solid ${edge}`,
  boxShadow:
    `inset 0 0 0 1px rgba(255,225,145,.12),` +
    ` inset 0 2px 2px rgba(255,235,180,.16),` +
    ` inset 0 -2px 3px rgba(0,0,0,.86),` +
    ` 0 1px 2px rgba(0,0,0,.92)`,
})

/** Crisp filigree that follows the same silhouette as the reference frame. */
function OrnateOverlay({ accent }: { accent: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1000 820"
      preserveAspectRatio="none"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4 }}
    >
      <rect x="10" y="10" width="980" height="800" rx="18" fill="none" stroke="#4e3210" strokeWidth="22" />
      <rect x="11" y="11" width="978" height="798" rx="18" fill="none" stroke={GOLD_HI} strokeWidth="5" />
      <rect x="24" y="24" width="952" height="772" rx="12" fill="none" stroke={GOLD} strokeWidth="4" />
      <path d="M16 135 16 48 48 16 137 16 108 35 67 35 35 67 35 107Z" fill="#211407" stroke={GOLD_HI} strokeWidth="4" />
      <path d="M984 135 984 48 952 16 863 16 892 35 933 35 965 67 965 107Z" fill="#211407" stroke={GOLD_HI} strokeWidth="4" />
      <path d="M16 685 16 772 48 804 137 804 108 785 67 785 35 753 35 713Z" fill="#211407" stroke={GOLD_HI} strokeWidth="4" />
      <path d="M984 685 984 772 952 804 863 804 892 785 933 785 965 753 965 713Z" fill="#211407" stroke={GOLD_HI} strokeWidth="4" />
      <path d="M410 24 457 24 500 6 543 24 590 24 552 38 500 27 448 38Z" fill="#241607" stroke={GOLD_HI} strokeWidth="4" />
      <path d="M18 248 4 288 18 328 31 288Z M982 248 996 288 982 328 969 288Z" fill={accent} stroke={GOLD_HI} strokeWidth="4" />
    </svg>
  )
}

function ActiveSphere({ size }: { size: number }) {
  return (
    <span
      aria-label="active character"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "block",
        background: "radial-gradient(circle at 33% 27%,#f1ffed 0%,#42ef5e 20%,#18a735 57%,#064b17 100%)",
        border: `2px solid ${GOLD_HI}`,
        outline: `1px solid ${GOLD_DIM}`,
        boxShadow:
          "0 0 0 3px #170e05,0 0 0 4px #c89b42,0 0 10px 3px rgba(50,238,80,.9),inset 0 0 5px rgba(255,255,255,.8)",
      }}
    />
  )
}

function StatBox({ label, value, w }: { label: string; value: ReactNode; w: number }) {
  return (
    <div
      style={{
        ...engravedPanel,
        ...metalEdge(),
        position: "relative",
        flex: 1,
        minWidth: 0,
        display: "grid",
        placeItems: "center",
        alignContent: "center",
        gap: Math.max(1, w * 0.005),
        clipPath: "polygon(5% 0,95% 0,100% 14%,100% 86%,95% 100%,5% 100%,0 86%,0 14%)",
      }}
    >
      <span style={{ color: GOLD_HI, font: `700 ${Math.max(5.5, w * 0.028)}px Georgia,serif`, letterSpacing: ".06em", lineHeight: 1, textTransform: "uppercase", textShadow: "0 1px 2px #000" }}>
        {label}
      </span>
      <span style={{ color: CREAM, font: `700 ${Math.max(10, w * 0.061)}px Georgia,serif`, lineHeight: 1, textShadow: "0 1px 2px #000,0 0 6px rgba(255,211,120,.3)" }}>
        {value}
      </span>
    </div>
  )
}

function ResourceBox({ label, tint, edge, labelColor, w, flex = 1, children }: {
  label: string
  tint: string
  edge: string
  labelColor: string
  w: number
  flex?: number
  children: ReactNode
}) {
  return (
    <div
      style={{
        flex,
        minWidth: 0,
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: Math.max(1, w * 0.004),
        padding: `${Math.max(3, w * 0.013)}px ${Math.max(1, w * 0.004)}px ${Math.max(2, w * 0.009)}px`,
        background: `radial-gradient(circle at 50% 42%,${tint},transparent 60%),linear-gradient(180deg,#100d0f,#050507)`,
        border: `1px solid ${edge}`,
        clipPath: "polygon(5% 0,95% 0,100% 9%,100% 91%,95% 100%,5% 100%,0 91%,0 9%)",
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,.08),inset 0 0 10px ${tint},0 0 4px rgba(0,0,0,.9)`,
      }}
    >
      <span style={{ color: labelColor, font: `700 ${Math.max(5.5, w * 0.026)}px Georgia,serif`, letterSpacing: ".035em", lineHeight: 1, textTransform: "uppercase", textAlign: "center", whiteSpace: "nowrap", textShadow: `0 0 5px ${tint},0 1px 2px #000` }}>
        {label}
      </span>
      {children}
    </div>
  )
}

const BUFFS = new Set(["blessed", "bless", "hasted", "haste", "aided", "aid", "inspired", "raging", "concentrating", "shielded", "invisible", "flying"])
const SENSES = new Set(["darkvision", "truesight", "blindsight", "tremorsense", "detect magic", "faerie fire", "marked", "hunter's mark"])

function conditionTone(name: string): { fg: string; glow: string; icon: string } {
  const n = name.toLowerCase().replace(/\s*\d+.*$/, "").trim()
  if (BUFFS.has(n)) return { fg: "#78ec65", glow: "rgba(68,230,75,.5)", icon: "≋" }
  if (SENSES.has(n)) return { fg: "#c578ff", glow: "rgba(175,80,255,.55)", icon: "◉" }
  if (n.includes("poison")) return { fg: "#ff655b", glow: "rgba(240,55,45,.55)", icon: "☠" }
  return { fg: "#ff8a72", glow: "rgba(230,70,45,.45)", icon: "!" }
}

function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value)
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
  slots?: { total: number; used: number } | null
  onClick?: () => void
  onExpand?: () => void
  width?: number
}) {
  const cls = frameForClass(c.class)
  const max = c.hp_max ?? 0
  const cur = c.hp_current ?? max
  const hpFraction = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0
  const xpFraction = Math.max(0, Math.min(1, c.xpFraction ?? 0))
  const conditions = c.conditions ?? []
  const inspiration = typeof c.inspiration === "number" ? c.inspiration : c.inspiration ? 1 : 0
  const economy = gems ?? { action: "dormant" as GemState, bonus: "dormant" as GemState, reaction: "dormant" as GemState }
  const W = width
  const height = Math.round(W * 0.82)
  const gemSize = Math.max(17, W * 0.10)
  const xpText = c.xp != null && c.xp_to_next ? `${formatNumber(c.xp)} / ${formatNumber(c.xp_to_next)}` : null

  const rim = isTurn
    ? "brightness-[1.08] drop-shadow-[0_0_3px_#ffffff] drop-shadow-[0_0_13px_#fff0c488]"
    : active
      ? "brightness-105 drop-shadow-[0_0_10px_#c89b4255]"
      : "brightness-[0.84] hover:brightness-100"

  return (
    <div style={{ width: W, flexShrink: 0, position: "relative" }} className={`transition duration-200 ${rim}`}>
      <button
        type="button"
        onClick={onClick}
        title={c.name}
        style={{
          width: W,
          height,
          position: "relative",
          display: "block",
          overflow: "hidden",
          padding: W * 0.025,
          textAlign: "left",
          cursor: onClick ? "pointer" : "default",
          background:
            `radial-gradient(circle at 23% 22%,color-mix(in srgb,${cls.accent} 24%,transparent),transparent 29%),` +
            "repeating-linear-gradient(135deg,rgba(255,255,255,.015) 0 1px,transparent 1px 4px)," +
            "linear-gradient(180deg,#101014,#050507 72%,#020203)",
          border: `1px solid ${GOLD_DIM}`,
          borderRadius: 4,
          boxShadow: "inset 0 0 20px #000,0 4px 12px rgba(0,0,0,.9)",
        }}
      >
        <OrnateOverlay accent={cls.accent} />

        <div style={{ height: W * 0.465, display: "grid", gridTemplateColumns: "42% 1fr", gap: W * 0.018, position: "relative", zIndex: 1 }}>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                position: "relative",
                overflow: "hidden",
                borderRadius: `${W * 0.12}px ${W * 0.12}px 2px 2px`,
                border: `2px solid ${GOLD}`,
                outline: `1px solid ${GOLD_DIM}`,
                background: `radial-gradient(circle at 50% 45%,color-mix(in srgb,${cls.accent} 52%,#100a18),#040306 72%)`,
                boxShadow: `inset 0 0 12px color-mix(in srgb,${cls.accent} 65%,transparent),0 0 5px #000`,
              }}
            >
              <ClassMedallion
                faceUrl={c.face_image_url}
                portraitUrl={c.portrait_image_url}
                characterClass={c.class}
                fallback={<span style={{ color: cls.accent, fontSize: W * 0.16 }}>{cls.sigil}</span>}
              />
              <div aria-hidden="true" style={{ position: "absolute", inset: 2, border: `1px solid ${GOLD_HI}55`, borderRadius: "inherit", pointerEvents: "none" }} />
            </div>

            <div style={{ ...engravedPanel, ...metalEdge(), marginTop: W * 0.008, minHeight: W * 0.078, display: "grid", placeItems: "center", alignContent: "center", padding: `0 ${W * 0.01}px`, clipPath: "polygon(4% 0,96% 0,100% 20%,96% 100%,4% 100%,0 80%)" }}>
              <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: CREAM, font: `700 ${Math.max(9, W * 0.055)}px Georgia,serif`, letterSpacing: ".08em", lineHeight: 1, textShadow: "0 1px 2px #000" }}>
                {c.name.toUpperCase()}
              </span>
              <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: cls.accent, font: `700 ${Math.max(5, W * 0.027)}px Georgia,serif`, letterSpacing: ".12em", lineHeight: 1.2, textShadow: `0 0 6px ${cls.accent}` }}>
                {(c.class ?? "Adventurer").toUpperCase()}
              </span>
            </div>
          </div>

          <div style={{ minWidth: 0, display: "grid", gridTemplateRows: "1.15fr .65fr 1.35fr .9fr", gap: W * 0.009 }}>
            <div style={{ display: "flex", gap: W * 0.012, minHeight: 0 }}>
              <div style={{ ...engravedPanel, ...metalEdge(), flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: W * 0.012, padding: `0 ${W * 0.014}px` }}>
                <span style={{ color: "#ff6b58", fontSize: Math.max(8, W * 0.047), lineHeight: 1, textShadow: "0 0 6px #f33" }}>♥</span>
                <span style={{ color: GOLD_HI, font: `700 ${Math.max(6, W * 0.034)}px Georgia,serif` }}>HP</span>
                <div style={{ flex: 1, minWidth: 8, height: Math.max(8, W * 0.043), overflow: "hidden", borderRadius: 999, border: `1px solid ${GOLD}`, background: "#1a0505", boxShadow: "inset 0 0 4px #000" }}>
                  <div style={{ width: `${hpFraction * 100}%`, height: "100%", background: hpFraction > .5 ? "linear-gradient(#ff5a4c,#c5140d 55%,#650705)" : hpFraction > .25 ? "linear-gradient(#ffc05c,#b56b11)" : "linear-gradient(#e24a3b,#6d0805)", boxShadow: "inset 0 1px 2px #fff7,inset 0 -2px 3px #0009", transition: "width 300ms" }} />
                </div>
                <span style={{ color: CREAM, font: `700 ${Math.max(8, W * 0.047)}px Georgia,serif`, whiteSpace: "nowrap" }}>{cur} / {max || "—"}</span>
              </div>

              <div style={{ ...engravedPanel, ...metalEdge(GOLD_HI), width: W * 0.145, flexShrink: 0, display: "grid", placeItems: "center", alignContent: "center", background: "radial-gradient(circle,#6d4609,#171005 72%)", boxShadow: "inset 0 0 8px #ffd15e55,0 0 7px #e6ad3844" }}>
                <span style={{ color: GOLD_HI, font: `700 ${Math.max(4.5, W * 0.021)}px Georgia,serif`, letterSpacing: ".03em", lineHeight: 1 }}>INSPIRATION</span>
                <span style={{ color: "#fff0bd", font: `700 ${Math.max(10, W * 0.06)}px Georgia,serif`, lineHeight: 1.05, textShadow: "0 0 7px #f5b835" }}>{inspiration}</span>
              </div>
            </div>

            <div style={{ ...engravedPanel, ...metalEdge(), minHeight: 0, display: "flex", alignItems: "center", gap: W * 0.012, padding: `0 ${W * 0.018}px` }}>
              <span style={{ color: GOLD_HI, font: `700 ${Math.max(6, W * 0.033)}px Georgia,serif` }}>XP</span>
              <div style={{ flex: 1, height: Math.max(4, W * 0.021), overflow: "hidden", borderRadius: 999, border: `1px solid ${GOLD}`, background: "#150e03" }}>
                <div style={{ width: `${xpFraction * 100}%`, height: "100%", background: "linear-gradient(#ffe063,#d59412 60%,#714608)", boxShadow: "inset 0 1px 1px #fff8" }} />
              </div>
              {xpText ? <span style={{ color: CREAM, font: `600 ${Math.max(5, W * 0.026)}px Georgia,serif`, whiteSpace: "nowrap" }}>{xpText}</span> : null}
            </div>

            <div style={{ display: "flex", gap: W * 0.012, minHeight: 0 }}>
              <StatBox label="AC" value={c.ac ?? "—"} w={W} />
              <StatBox label="Initiative" value={c.dex_modifier == null ? "—" : `${c.dex_modifier >= 0 ? "+" : ""}${c.dex_modifier}`} w={W} />
              <StatBox label="Level" value={c.level ?? "—"} w={W} />
            </div>

            <div style={{ ...engravedPanel, ...metalEdge(), minHeight: 0, display: "flex", alignItems: "center", gap: W * 0.02, padding: `0 ${W * 0.025}px`, background: `radial-gradient(circle at 82% 50%,color-mix(in srgb,${cls.accent} 22%,transparent),transparent 45%),linear-gradient(180deg,#111016,#07070a)` }}>
              <span aria-hidden="true" style={{ width: W * 0.055, height: W * 0.055, flexShrink: 0, display: "grid", placeItems: "center", transform: "rotate(45deg)", border: `1px solid ${cls.accent}`, background: `color-mix(in srgb,${cls.accent} 35%,#08060b)`, boxShadow: `0 0 7px ${cls.accent}88` }}>
                <span style={{ transform: "rotate(-45deg)", color: "#f8eaff", fontSize: Math.max(6, W * 0.03) }}>{cls.sigil}</span>
              </span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: cls.accent, font: `700 ${Math.max(8, W * 0.048)}px Georgia,serif`, letterSpacing: ".07em", textShadow: `0 0 8px ${cls.accent}88` }}>
                {(c.class ?? "Adventurer").toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        <div style={{ height: W * 0.20, display: "flex", gap: W * 0.010, marginTop: W * 0.014, position: "relative", zIndex: 1 }}>
          <ResourceBox label="Actions" tint="rgba(190,30,20,.38)" edge="#d5523e" labelColor="#f4bf8d" w={W}>
            <ResourceGem hue="ruby" state={economy.action} size={gemSize} />
          </ResourceBox>
          <ResourceBox label="Bonus Actions" tint="rgba(150,45,220,.34)" edge="#9e55c9" labelColor="#d89aff" w={W}>
            <ResourceGem hue="amethyst" state={economy.bonus} size={gemSize} />
          </ResourceBox>
          <ResourceBox label="Movement" tint="rgba(20,150,55,.34)" edge="#3c9d50" labelColor="#9be58d" w={W}>
            <ResourceGem hue="emerald" state={movement && movement.remainingFt <= 0 ? "spent" : isTurn ? "lit" : "dormant"} size={gemSize * .88} />
            <span style={{ color: movement && movement.remainingFt <= 0 ? "#686864" : "#b8f0a8", font: `700 ${Math.max(7, W * 0.038)}px Georgia,serif`, lineHeight: .9, textShadow: "0 0 6px #22c94d88", whiteSpace: "nowrap" }}>
              {movement ? `${Math.max(0, Math.round(movement.remainingFt))} FT.` : "—"}
            </span>
          </ResourceBox>
          <ResourceBox label="Reactions" tint="rgba(195,125,16,.35)" edge="#d49b31" labelColor="#ffd17a" w={W}>
            <ResourceGem hue="amber" state={economy.reaction} size={gemSize} />
          </ResourceBox>
          <ResourceBox label="Spell Slots" tint="rgba(20,105,210,.35)" edge="#318bd0" labelColor="#6bc9ff" w={W} flex={1.22}>
            {slots && slots.total > 0 ? (
              <span style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: Math.max(1, W * 0.006) }}>
                {Array.from({ length: Math.min(slots.total, 6) }, (_, i) => (
                  <SlotCrystal key={i} spent={i >= slots.total - slots.used} height={gemSize * 1.12} />
                ))}
              </span>
            ) : (
              <span style={{ color: "#405064", font: `700 ${Math.max(8, W * 0.045)}px Georgia,serif` }}>—</span>
            )}
          </ResourceBox>
        </div>

        <div style={{ ...engravedPanel, ...metalEdge(), height: W * 0.075, minHeight: 15, display: "flex", alignItems: "center", gap: W * 0.018, marginTop: W * 0.012, padding: `0 ${W * 0.026}px`, position: "relative", zIndex: 1, overflow: "hidden" }}>
          <span style={{ color: GOLD_HI, font: `700 ${Math.max(5.5, W * 0.028)}px Georgia,serif`, letterSpacing: ".06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Conditions</span>
          <span style={{ width: 1, alignSelf: "stretch", background: GOLD_DIM, flexShrink: 0 }} />
          {conditions.length === 0 ? (
            <span style={{ color: "#6d675b", font: `italic ${Math.max(6, W * 0.029)}px Georgia,serif` }}>none</span>
          ) : (
            <span style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", justifyContent: "space-around", gap: W * 0.018, overflow: "hidden" }}>
              {conditions.slice(0, 3).map((condition) => {
                const tone = conditionTone(condition)
                return (
                  <span key={condition} title={condition} style={{ minWidth: 0, display: "flex", alignItems: "center", gap: W * 0.008, color: tone.fg, font: `700 ${Math.max(7.5, W * 0.035)}px Georgia,serif`, textTransform: "uppercase", whiteSpace: "nowrap", textShadow: `0 0 6px ${tone.glow}` }}>
                    <span aria-hidden="true" style={{ fontSize: Math.max(9, W * 0.045), lineHeight: 1 }}>{tone.icon}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{condition}</span>
                  </span>
                )
              })}
            </span>
          )}
        </div>
      </button>

      {onExpand ? (
        <button
          type="button"
          onClick={onExpand}
          style={{ width: W, marginTop: -1, padding: `${Math.max(2, W * 0.009)}px 0`, border: `1px solid ${GOLD_DIM}`, borderTop: "none", borderRadius: "0 0 3px 3px", background: "linear-gradient(#201608,#070504)", color: GOLD, font: `700 ${Math.max(5.5, W * 0.026)}px Georgia,serif`, letterSpacing: ".2em", textTransform: "uppercase", cursor: "pointer" }}
        >
          ◈ Sheet ◈
        </button>
      ) : null}

      {isTurn ? (
        <div style={{ position: "absolute", left: W * 0.04, top: W * 0.04, zIndex: 6, pointerEvents: "none" }}>
          <ActiveSphere size={Math.max(12, W * 0.065)} />
        </div>
      ) : null}
    </div>
  )
}
