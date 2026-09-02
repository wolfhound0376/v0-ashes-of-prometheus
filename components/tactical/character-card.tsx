// ============================================================================
// THE CHARACTER CARD — combat telemetry, in the game's own dress.
//
// Rebuilt to Sam's locked reference sheet (the Kenta card). The reference is
// the authority on layout, hierarchy and styling; this file reproduces it and
// does not reinterpret it.
//
// WHY THIS IS DRAWN AND NOT PHOTOGRAPHED. The previous card laid live values
// into holes in a commissioned PNG. That is why it could never satisfy the
// brief's quality bar: a raster frame scaled to 236px on a retina panel is a
// soft frame, and every socket position was a measured constant that broke if
// the art moved a pixel. Everything here except the portrait is CSS and SVG,
// so it is crisp at any size and any device pixel ratio, and the layout is
// laid out rather than measured.
//
// WHAT IT DELIBERATELY DOES NOT SHOW. Inventory, equipment, weapons, feature
// text, ability scores, saves, skills, sorcery points. Those belong to the
// expanded sheet, reachable from the bar at the foot of the card. This is a
// combat card: what is true right now, and what you may still spend.
//
// One stone per resource. No counters under them, no "1 / 1", no secondary
// dots, no icons inside the stones. The stone IS the readout — stated in the
// brief, and repeated here because earlier passes drifted into all of them.
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
  /** The FACE alone, with no ornament. Composited under the class frame. */
  face_image_url?: string | null
  /** 0–1 through the current level, when the campaign tracks it. */
  xpFraction?: number
  xp?: number | null
  xp_to_next?: number | null
  /** `characters.sheet_heroic_inspiration`. */
  inspiration?: boolean | number | null
  conditions?: string[]
}

/** Spendable, gone, or not this character's turn to spend anything. */
export type GemState = "lit" | "spent" | "dormant"

// ---- the palette, one place -------------------------------------------
const GOLD = "#c9a24a"
const GOLD_HI = "#f0d79a"
const GOLD_DIM = "#6b5320"
const CREAM = "#f4e6c4"
const INK = "#0b0a09"

/** Antique gold that reads as metal rather than as orange. */
const goldEdge = (a = 1): CSSProperties => ({
  border: `1px solid rgba(201,162,74,${a})`,
  // Four layers, and each is doing a job: a lit top edge and a dark bottom
  // edge give the panel thickness; the inner hairline reads as the bevel's
  // inside face; the outer drop separates it from the card behind. Without
  // these the boxes flatten into the Material-UI look the brief rules out.
  boxShadow:
    `inset 0 1px 0 rgba(240,215,154,0.26),` +
    ` inset 0 -1px 0 rgba(0,0,0,0.75),` +
    ` inset 0 0 0 1px rgba(240,215,154,0.06),` +
    ` 0 1px 2px rgba(0,0,0,0.85)`,
})

/** Charcoal with visible grain, so panels separate without borders shouting. */
const panel: CSSProperties = {
  background:
    "linear-gradient(180deg, #16151a 0%, #0d0c10 55%, #08080b 100%)",
  backgroundBlendMode: "normal",
}

/**
 * THE ACTIVE SPHERE — upper-left of the frame, and functional.
 *
 * Green is the character whose turn it is. Inactive cards render no sphere at
 * all, so this one marker has one meaning and cannot be confused with decor.
 * It does not track selection, because a light that moves when you merely
 * LOOK at something is a light nobody at the table can trust.
 *
 * It is the only sphere on the card. The blue stone the old commissioned
 * frame carried in its lower-left socket is gone with the frame.
 */
function ActiveSphere({ size }: { size: number }) {
  const C = { hi: "#efffeb", mid: "#39e653", lo: "#075c19", glow: "rgba(57,230,83,0.94)" }
  return (
    <span
      aria-label="active character"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "block",
        background: `radial-gradient(circle at 34% 28%, ${C.hi} 0%, ${C.mid} 52%, ${C.lo} 100%)`,
        boxShadow: `0 0 9px 2px ${C.glow}, inset 0 0 3px rgba(255,255,255,0.62), 0 1px 2px #000`,
        border: `1px solid rgba(201,162,74,0.75)`,
        transition: "background 180ms, box-shadow 180ms",
      }}
    />
  )
}

/** One of the three stat sockets: AC, INITIATIVE, LEVEL. */
function StatBox({ label, value, w }: { label: string; value: ReactNode; w: number }) {
  return (
    <div
      style={{
        ...panel,
        ...goldEdge(0.55),
        borderRadius: 2,
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: `${w * 0.008}px 0 ${w * 0.012}px`,
      }}
    >
      <div
        style={{
          fontFamily: "Georgia, serif",
          fontSize: Math.max(5.5, w * 0.030),
          letterSpacing: "0.09em",
          color: GOLD,
          textTransform: "uppercase",
          lineHeight: 1,
          textShadow: "0 1px 1px #000",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Georgia, serif",
          fontSize: Math.max(9, w * 0.058),
          fontWeight: 700,
          color: CREAM,
          lineHeight: 1.05,
          textShadow: "0 1px 2px #000, 0 0 7px rgba(201,162,74,0.35)",
        }}
      >
        {value}
      </div>
    </div>
  )
}

/** One cell of the combat-resource row. */
function ResourceBox({
  label, tint, w, children, labelColor = GOLD,
}: { label: string; tint: string; w: number; children: ReactNode; labelColor?: string }) {
  return (
    <div
      style={{
        ...goldEdge(0.5),
        borderRadius: 2,
        flex: 1,
        minWidth: 0,
        // A whisper of the resource's own colour in the well, so the five
        // boxes are distinguishable before you have read a single word.
        background: `linear-gradient(180deg, ${tint} 0%, rgba(8,8,11,0.96) 62%, rgba(4,4,6,1) 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        gap: w * 0.006,
        padding: `${w * 0.012}px 0 ${w * 0.014}px`,
      }}
    >
      <div
        style={{
          fontFamily: "Georgia, serif",
          fontSize: Math.max(5, w * 0.0255),
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: labelColor,
          lineHeight: 1.05,
          textAlign: "center",
          textShadow: "0 1px 1px #000",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

/**
 * How a condition is coloured.
 *
 * Crimson harms, green helps, violet is a sense or a neutral state. The lists
 * are the ones that actually turn up at this table; anything unrecognised
 * reads as a debuff, which is the safe direction for a mistake to fall — a
 * player who checks an unexpected crimson word has lost two seconds, where one
 * who ignores a green word may have missed the thing that is killing them.
 */
const BUFFS = new Set([
  "blessed", "bless", "hasted", "haste", "aided", "aid", "inspired", "raging",
  "concentrating", "shielded", "invisible", "flying",
])
const SENSES = new Set([
  "darkvision", "truesight", "blindsight", "tremorsense", "detect magic",
  "faerie fire", "marked", "hunter's mark",
])
function conditionTone(name: string): { fg: string; glow: string; bg: string; border: string } {
  const n = name.toLowerCase().replace(/\s*\d+.*$/, "").trim()
  if (BUFFS.has(n)) return { fg: "#91f29a", glow: "rgba(53,217,74,0.5)", bg: "rgba(22,92,35,0.42)", border: "rgba(91,224,108,0.6)" }
  if (SENSES.has(n)) return { fg: "#d8b5ff", glow: "rgba(160,90,255,0.5)", bg: "rgba(83,39,124,0.42)", border: "rgba(188,122,255,0.6)" }
  return { fg: "#ff8a7f", glow: "rgba(230,60,45,0.5)", bg: "rgba(111,27,22,0.48)", border: "rgba(255,104,91,0.62)" }
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
  /** Focused — the card whose rack is showing. A view state; brightens only. */
  active?: boolean
  /** Up NOW, by initiative. The sphere's only meaning. */
  isTurn?: boolean
  /** The three spendable halves of the turn. Omit to render all dormant. */
  gems?: { action: GemState; bonus: GemState; reaction: GemState } | null
  /** Feet left this turn, and the character's full speed. */
  movement?: { remainingFt: number; speedFt: number } | null
  /** Spell slots across every level, flattened: total mounted, how many spent. */
  slots?: { total: number; used: number } | null
  onClick?: () => void
  /** The expand bar at the foot. Omitted, the bar is not rendered. */
  onExpand?: () => void
  width?: number
}) {
  const cls = frameForClass(c.class)
  const max = c.hp_max ?? 0
  const cur = c.hp_current ?? max
  const frac = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0
  const xpFrac = Math.max(0, Math.min(1, c.xpFraction ?? 0))
  const conditions = c.conditions ?? []
  const insp = typeof c.inspiration === "number" ? c.inspiration : c.inspiration ? 1 : 0

  // Proportional to the card's own width so one number drives every size and
  // the card scales as a unit. The reference is 1400x1100; the foot bars make
  // it a touch taller in proportion at compact size, where they need real
  // pixels to stay legible.
  const W = width
  const height = Math.round(W * 0.81)
  const g = gems ?? { action: "dormant" as GemState, bonus: "dormant" as GemState, reaction: "dormant" as GemState }
  // The stones carry the row, so they get the pixels. Everything around them
  // was tightened rather than the card being allowed to grow — the brief is
  // explicit that the reference is art direction, not licence to make the
  // battlefield card enormous.
  const gemPx = Math.max(15, W * 0.086)

  /**
   * THE PERIPHERY. Platinum, and the same platinum the board's active ring
   * uses — one fact, one colour, wherever you happen to be looking.
   * `drop-shadow` follows the composited silhouette rather than boxing it.
   */
  const rim = isTurn
    ? "brightness-[1.10] " +
      "drop-shadow-[0_0_3px_#ffffff] " +
      "drop-shadow-[0_0_11px_#fff2d0dd] " +
      "drop-shadow-[0_0_26px_#fff2d077]"
    : active
      ? "brightness-105 drop-shadow-[0_0_12px_#c9a22755]"
      : "brightness-[0.86] hover:brightness-100"

  return (
    <div style={{ width: W, flexShrink: 0, position: "relative" }} className={`transition duration-200 ${rim}`}>
      <button
        onClick={onClick}
        title={c.name}
        style={{
          width: W,
          height,
          position: "relative",
          display: "block",
          textAlign: "left",
          padding: W * 0.018,
          borderRadius: 3,
          overflow: "hidden",
          // The card's own body: charcoal, lifted at the top by the class's
          // database-resolved accent so different classes never share one skin.
          background:
            `radial-gradient(120% 80% at 20% 0%, color-mix(in srgb, ${cls.accent} 24%, transparent) 0%, rgba(0,0,0,0) 60%),` +
            "linear-gradient(180deg, #131218 0%, #0a0a0d 60%, #060608 100%)",
          border: `1px solid ${GOLD}`,
          boxShadow:
            `inset 0 0 0 1px rgba(240,215,154,0.10), inset 0 1px 0 rgba(240,215,154,0.25),` +
            ` 0 3px 10px rgba(0,0,0,0.85)`,
          cursor: onClick ? "pointer" : "default",
        }}
      >
        {/* ---------- UPPER: portrait left, vitals right ---------- */}
        <div style={{ display: "flex", gap: W * 0.022, height: height * 0.59 }}>

          {/* PORTRAIT COLUMN. Character art remains untouched; the class data
              chooses both the ornate medallion and the surrounding accent.
              The portrait is the dominant element per the brief, so it takes
              the largest single share of the card. */}
          <div style={{ width: W * 0.425, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div
              style={{
                position: "relative",
                flex: 1,
                borderRadius: `${W * 0.09}px ${W * 0.09}px 3px 3px`,
                overflow: "hidden",
                border: `1px solid ${GOLD}`,
                background:
                  `radial-gradient(80% 70% at 50% 40%, color-mix(in srgb, ${cls.accent} 48%, transparent) 0%, color-mix(in srgb, ${cls.accent} 18%, #08070b) 60%, #07060b 100%)`,
                boxShadow:
                  `inset 0 0 12px color-mix(in srgb, ${cls.accent} 52%, transparent), inset 0 0 0 1px rgba(240,215,154,0.18), 0 2px 6px #000`,
              }}
            >
              <ClassMedallion
                faceUrl={c.face_image_url}
                portraitUrl={c.portrait_image_url}
                characterClass={c.class}
                fallback={
                  <span style={{ fontSize: W * 0.13, color: cls.accent }}>{cls.sigil}</span>
                }
              />
            </div>

            {/* Name, immediately beneath the portrait, class under it. */}
            <div
              style={{
                marginTop: W * 0.012,
                textAlign: "center",
                fontFamily: "Georgia, serif",
                fontSize: Math.max(10, W * 0.061),
                fontWeight: 700,
                letterSpacing: "0.03em",
                color: CREAM,
                lineHeight: 1,
                textShadow: "0 1px 2px #000, 0 0 8px rgba(201,162,74,0.35)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {c.name.toUpperCase()}
            </div>
            <div
              style={{
                textAlign: "center",
                fontFamily: "Georgia, serif",
                fontSize: Math.max(5.5, W * 0.030),
                letterSpacing: "0.14em",
                color: cls.accent,
                lineHeight: 1.3,
                textShadow: "0 1px 2px #000",
                whiteSpace: "nowrap",
              }}
            >
              {(c.class ?? "").toUpperCase()}
            </div>
          </div>

          {/* VITALS COLUMN. */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between", gap: W * 0.014 }}>

            {/* HP + INSPIRATION share the top line: the bar takes the room,
                inspiration takes a small bright socket at the corner. */}
            <div style={{ display: "flex", gap: W * 0.018, alignItems: "stretch" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: W * 0.016 }}>
                  <span style={{ fontFamily: "Georgia, serif", fontSize: Math.max(6, W * 0.036), color: GOLD, letterSpacing: "0.06em" }}>HP</span>
                  <div
                    style={{
                      flex: 1,
                      height: Math.max(8, W * 0.048),
                      borderRadius: 999,
                      overflow: "hidden",
                      ...goldEdge(0.6),
                      background: "linear-gradient(180deg,#1a0a0a,#080404)",
                    }}
                  >
                    <div
                      className="transition-[width] duration-300"
                      style={{
                        width: `${frac * 100}%`,
                        height: "100%",
                        background:
                          frac > 0.5
                            ? "linear-gradient(180deg,#ff6a54 0%,#d3281c 55%,#7d0f08 100%)"
                            : frac > 0.25
                              ? "linear-gradient(180deg,#f0b451 0%,#c07a15 55%,#6a3c05 100%)"
                              : "linear-gradient(180deg,#e0574a 0%,#8f1810 55%,#450703 100%)",
                        boxShadow: "inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.6)",
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: Math.max(9, W * 0.054),
                      fontWeight: 700,
                      color: CREAM,
                      textShadow: "0 1px 2px #000",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {cur} / {max || "—"}
                  </span>
                </div>

                {/* XP — thinner, per the brief's compact priority order. */}
                <div style={{ display: "flex", alignItems: "center", gap: W * 0.016, marginTop: W * 0.014 }}>
                  <span style={{ fontFamily: "Georgia, serif", fontSize: Math.max(6, W * 0.036), color: GOLD, letterSpacing: "0.06em" }}>XP</span>
                  <div
                    style={{
                      flex: 1,
                      height: Math.max(3.5, W * 0.020),
                      borderRadius: 999,
                      overflow: "hidden",
                      ...goldEdge(0.45),
                      background: "#0a0906",
                    }}
                  >
                    <div
                      style={{
                        width: `${xpFrac * 100}%`,
                        height: "100%",
                        background: "linear-gradient(180deg,#ffd977 0%,#c9932a 60%,#7a5510 100%)",
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4)",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* INSPIRATION. Brighter gold than the trim, and a number —
                  no crystal, no diamond, per the brief. */}
              <div
                style={{
                  width: W * 0.115,
                  background: "linear-gradient(145deg,#fff0a8 0%,#e0b43c 40%,#a06d10 78%,#5c3905 100%)",
                  border: `1px solid ${GOLD_HI}`,
                  borderRadius: 2,
                  boxShadow: "0 0 10px rgba(255,208,90,0.48), inset 0 1px 0 rgba(255,255,220,0.72), inset 0 -2px 3px rgba(72,39,0,0.55)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: `${W * 0.006}px 0`,
                }}
              >
                <div style={{ fontFamily: "Georgia, serif", fontSize: Math.max(4.5, W * 0.021), fontWeight: 700, color: "#3a2102", letterSpacing: "0.04em", lineHeight: 1, textShadow: "0 1px 0 rgba(255,245,190,0.45)" }}>
                  INSP
                </div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: Math.max(10, W * 0.059), fontWeight: 700, color: "#fff8d7", lineHeight: 1.1, textShadow: "0 1px 2px #4a2700, 0 0 5px rgba(255,255,220,0.65)" }}>
                  {insp}
                </div>
              </div>
            </div>

            {/* AC | INITIATIVE | LEVEL. No star on the level, per the brief. */}
            <div style={{ display: "flex", gap: W * 0.016 }}>
              <StatBox label="AC" value={c.ac ?? "—"} w={W} />
              <StatBox
                label="Init"
                value={
                  c.dex_modifier == null
                    ? "—"
                    : `${c.dex_modifier >= 0 ? "+" : ""}${c.dex_modifier}`
                }
                w={W}
              />
              <StatBox label="Level" value={c.level ?? "—"} w={W} />
            </div>

          </div>
        </div>

        {/* ---------- THE COMBAT RESOURCE ROW ----------
            Five boxes, one line, read at a glance. One stone each for the
            three spendable halves of the turn; movement in feet; the slots
            as crystals, which are the one resource where a count belongs. */}
        <div style={{ display: "flex", gap: W * 0.014, marginTop: W * 0.020 }}>
          <ResourceBox label="Action" tint="rgba(90,14,10,0.55)" w={W}>
            <ResourceGem hue="ruby" state={g.action} size={gemPx} />
          </ResourceBox>

          <ResourceBox label={"Bonus"} tint="rgba(58,14,92,0.55)" w={W}>
            <ResourceGem hue="amethyst" state={g.bonus} size={gemPx} />
          </ResourceBox>

          <ResourceBox label="Reaction" tint="rgba(92,64,6,0.5)" w={W}>
            <ResourceGem hue="amber" state={g.reaction} size={gemPx} />
          </ResourceBox>

          <ResourceBox label="Movement" tint="rgba(7,78,28,0.62)" labelColor="#67f184" w={W}>
            <span
              style={{
                fontFamily: "Georgia, serif",
                fontSize: Math.max(9, W * 0.055),
                fontWeight: 700,
                color: movement && movement.remainingFt <= 0 ? "#6f6f6c" : "#3ff06c",
                lineHeight: 1.35,
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px #000, 0 0 9px rgba(42,235,100,0.72)",
              }}
            >
              {movement ? `${Math.max(0, Math.round(movement.remainingFt))} FT.` : "—"}
            </span>
          </ResourceBox>

          {/* SPELL SLOTS — the widest box, and the only stack of stones. */}
          <ResourceBox label="Slots" tint="rgba(10,42,92,0.55)" w={W}>
            {slots && slots.total > 0 ? (
              <span style={{ display: "flex", gap: Math.max(1.5, W * 0.008), alignItems: "flex-end" }}>
                {Array.from({ length: Math.min(slots.total, 6) }, (_, i) => (
                  <SlotCrystal key={i} spent={i >= slots.total - slots.used} height={gemPx * 1.24} />
                ))}
              </span>
            ) : (
              <span style={{ fontFamily: "Georgia, serif", fontSize: Math.max(8, W * 0.05), color: "#4a4a48", lineHeight: 1.35 }}>—</span>
            )}
          </ResourceBox>
        </div>

        {/* ---------- CONDITIONS ----------
            One strip, colour-coded, and legible at battlefield size — which
            is why it is cream-on-black at a real font size rather than the
            muddy brown micro-type the brief called out. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: W * 0.020,
            marginTop: W * 0.016,
            padding: `${W * 0.010}px ${W * 0.020}px`,
            borderRadius: 2,
            ...goldEdge(0.4),
            background: "linear-gradient(180deg, rgba(16,15,19,0.95), rgba(6,6,8,0.98))",
            minHeight: Math.max(13, W * 0.070),
          }}
        >
          <span
            style={{
              fontFamily: "Georgia, serif",
              fontSize: Math.max(5, W * 0.026),
              letterSpacing: "0.10em",
              color: GOLD,
              textTransform: "uppercase",
              flexShrink: 0,
              textShadow: "0 1px 1px #000",
            }}
          >
            Cond
          </span>
          <span
            style={{
              display: "flex",
              gap: W * 0.018,
              overflow: "hidden",
              flex: 1,
              minWidth: 0,
            }}
          >
            {conditions.length === 0 ? (
              <span style={{ fontFamily: "Georgia, serif", fontSize: Math.max(6, W * 0.030), color: "#5d574a", fontStyle: "italic" }}>
                none
              </span>
            ) : (
              conditions.slice(0, 3).map((cond) => {
                const t = conditionTone(cond)
                return (
                  <span
                    key={cond}
                    title={cond}
                    style={{
                      fontFamily: "Georgia, serif",
                      // Sam: conditions must stay VERY readable when the card
                      // is scaled down. This one gets a hard floor rather than
                      // being allowed to shrink with the card.
                      fontSize: Math.max(8.5, W * 0.037),
                      fontWeight: 700,
                      letterSpacing: "0.03em",
                      color: t.fg,
                      textShadow: `0 0 6px ${t.glow}, 0 1px 2px #000`,
                      background: t.bg,
                      border: `1px solid ${t.border}`,
                      borderRadius: 2,
                      padding: `${Math.max(1, W * 0.004)}px ${Math.max(3, W * 0.012)}px`,
                      whiteSpace: "nowrap",
                      textTransform: "uppercase",
                    }}
                  >
                    {cond}
                  </span>
                )
              })
            )}
          </span>
        </div>
      </button>

      {/* ---------- THE EXPAND BAR ----------
          Sam: "a small bar for expanding character information somewhere
          convenient." A slim strip welded to the foot of the card, so the
          fuller sheet is one click from the plate it belongs to rather than
          from a button that appears elsewhere when a card happens to be
          focused. Outside the card's own <button> — nesting one button in
          another is invalid HTML and the inner one stops receiving clicks. */}
      {onExpand && (
        <button
          onClick={onExpand}
          style={{
            width: W,
            marginTop: -1,
            padding: `${Math.max(2, W * 0.011)}px 0`,
            borderRadius: "0 0 3px 3px",
            border: `1px solid ${GOLD_DIM}`,
            borderTop: "none",
            background: "linear-gradient(180deg, rgba(28,22,12,0.95), rgba(8,7,5,0.95))",
            color: GOLD,
            fontFamily: "Georgia, serif",
            fontSize: Math.max(5.5, W * 0.028),
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            textShadow: "0 1px 1px #000",
            cursor: "pointer",
            transition: "color 160ms, border-color 160ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = GOLD_HI
            e.currentTarget.style.borderColor = GOLD
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = GOLD
            e.currentTarget.style.borderColor = GOLD_DIM
          }}
        >
          ◈ Sheet ◈
        </button>
      )}

      {/* The active sphere rides the card's upper-left corner, exactly as the
          reference has it. Anchored to the WRAPPER rather than the card so it
          is never clipped by the card's own overflow:hidden — the corner it
          sits on is the corner that clips. */}
      {isTurn ? (
        <div
          style={{
            position: "absolute",
            left: W * 0.030,
            top: W * 0.030,
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          <ActiveSphere size={Math.max(10, W * 0.055)} />
        </div>
      ) : null}
    </div>
  )
}
