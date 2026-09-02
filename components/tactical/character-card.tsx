// ============================================================================
// THE CHARACTER CARD - Sam's commissioned frame, with live values in it.
//
// Sam: "it needs to look exactly in this style. Use the image and code around
// it." So the art IS the card. Nothing here re-draws the filigree, the gems,
// the arch, the shield, the crossed swords or the gothic labels - CSS cannot
// make hand-drawn gold ironwork and should not try. This component positions
// real numbers into the holes the artist left, and nothing else.
//
// THE FRAME WAS PREPARED, NOT USED RAW. The delivered artwork carries baked
// values - 8/8, 3,200/6,000, KENTA, the AC, the conditions. Those regions were
// blanked back to their own panel texture; the portrait window and both bar
// troughs were cut to transparency so live content renders BEHIND the frame
// and the artist's ornament sits over it. Every label, stone and sigil was
// left untouched.
//
// EVERY COORDINATE BELOW WAS MEASURED against the 1437x1094 original by
// finding each feature in the pixels and converting to a percentage. They are
// percentages so the card scales as one object. Type sizes are likewise
// derived from the artwork's own proportions rather than chosen: the name is
// ~64px on a 1437px card, so 64/1437 = 0.045. If the frame is ever re-cut,
// re-measure and edit SLOTS alone - no layout code changes.
// ============================================================================

import type { CSSProperties } from "react"
import { frameForClass } from "@/lib/class-frames"
import { ClassMedallion } from "./class-medallion"

// The frame is chosen by CLASS - see cardFrameUrl in lib/class-frames.ts.
// One painting, recut thirteen ways, so a cleric stops wearing a sorcerer's
// card. All thirteen share the same geometry, so SLOTS below is correct for
// every one of them.

/** Measured from the artwork. Percentages of the card's own box. */
const SLOTS = {
  portrait:  { left:  9.4, top: 15.2, width: 34.6, height: 38.0 },
  sphere:    { left:  3.3, top:  3.9, width:  6.3, height:  8.8 },
  hpFill:    { left: 51.6, top:  8.2, width: 21.4, height:  4.7 },
  hpText:    { left: 74.6, top:  7.0, width: 11.6, height:  6.4 },
  xpFill:    { left: 50.0, top: 16.0, width: 21.6, height:  2.9 },
  xpText:    { left: 72.4, top: 14.8, width: 17.6, height:  4.8 },
  insp:      { left: 91.4, top:  6.2, width:  7.4, height:  7.4 },
  ac:        { left: 53.6, top: 28.4, width: 10.8, height:  9.2 },
  init:      { left: 69.1, top: 28.4, width: 10.8, height:  9.2 },
  level:     { left: 87.1, top: 28.4, width:  8.8, height:  9.2 },
  className: { left: 56.5, top: 45.8, width: 26.5, height:  8.9 },
  name:      { left: 11.0, top: 54.8, width: 30.0, height:  8.4 },
  subclass:  { left: 15.5, top: 61.0, width: 21.0, height:  4.2 },
  gemAction: { left:  9.0, top: 70.5, width: 10.5, height: 13.5 },
  gemBonus:  { left: 27.5, top: 70.5, width: 10.5, height: 13.5 },
  gemMove:   { left: 45.0, top: 70.5, width: 10.0, height: 11.0 },
  moveText:  { left: 43.8, top: 82.0, width: 12.2, height:  6.0 },
  gemReact:  { left: 62.5, top: 70.5, width: 10.5, height: 13.5 },
  slots:     { left: 77.0, top: 70.5, width: 16.2, height: 13.5 },
  conds:     { left: 21.8, top: 88.1, width: 66.9, height:  9.4 },
} as const

type Slot = { left: number; top: number; width: number; height: number }

const box = (s: Slot): CSSProperties => ({
  position: "absolute",
  left: `${s.left}%`,
  top: `${s.top}%`,
  width: `${s.width}%`,
  height: `${s.height}%`,
})

/** Centred in its slot, sized from the card rather than the viewport. */
const fitted = (w: number, scale: number, color = "#f2e4c0"): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: Math.max(6, w * scale),
  fontWeight: 700,
  color,
  lineHeight: 1,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textShadow: "0 1px 2px #000, 0 0 8px rgba(0,0,0,0.85)",
})

export type GemState = "lit" | "spent" | "dormant"

/** Kept exported because callers and the sheet still speak in levels. */
export interface SpellSlotLevel { level: number; total: number; used: number }

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

/**
 * Condition colour. Crimson harms, green helps, violet is a sense.
 * Anything unrecognised reads as a debuff - the safe direction for a mistake,
 * since a missed green word costs less than a missed red one.
 */
const BUFFS = new Set(["blessed","bless","hasted","haste","aided","aid","inspired","raging","concentrating","shielded","invisible","flying"])
const SENSES = new Set(["darkvision","truesight","blindsight","tremorsense","detect magic","faerie fire","marked","hunter's mark"])
function condColor(name: string): string {
  const n = name.toLowerCase().replace(/\s*\d+.*$/, "").trim()
  if (BUFFS.has(n)) return "#6ee87f"
  if (SENSES.has(n)) return "#c79bff"
  return "#ff5f52"
}

/**
 * The four resource stones are PAINTED INTO THE FRAME, lit, because that is
 * how the artist drew them. Code cannot brighten a stone that is already
 * bright - but it can take the light out of one.
 *
 * So a spent resource is a dark pane laid over its own stone: desaturated and
 * dimmed. The stone stays exactly where the art put it and simply stops
 * burning, which is what the brief asked for ("visually darken/desaturate the
 * existing diamond rather than adding counters") and the only behaviour the
 * artwork permits.
 */
function Spent({ slot, on }: { slot: Slot; on: boolean }) {
  if (!on) return null
  return (
    <div
      style={{
        ...box(slot),
        pointerEvents: "none",
        borderRadius: "12%",
        background: "rgba(4,4,6,0.70)",
        backdropFilter: "grayscale(1) brightness(0.45)",
        WebkitBackdropFilter: "grayscale(1) brightness(0.45)",
        transition: "background 260ms",
      }}
    />
  )
}

/**
 * Spell slots: four crystals in the art, all lit. Expended ones darken in
 * place from the RIGHT, so the row empties the way a bar does and the count
 * still burning is the count remaining.
 */
function SlotsOverlay({ slot, total, used }: { slot: Slot; total: number; used: number }) {
  const shown = Math.min(total, 4)
  const dark = Math.min(shown, used)
  if (!shown || !dark) return null
  return (
    <div style={{ ...box(slot), display: "flex", pointerEvents: "none" }}>
      {Array.from({ length: shown }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            borderRadius: "18%",
            background: i >= shown - dark ? "rgba(3,4,8,0.78)" : "transparent",
            backdropFilter: i >= shown - dark ? "grayscale(1) brightness(0.4)" : undefined,
            WebkitBackdropFilter: i >= shown - dark ? "grayscale(1) brightness(0.4)" : undefined,
          }}
        />
      ))}
    </div>
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
  // `levels` is accepted and deliberately not drawn. The artist ruled ONE
  // chamber for spell slots, wide enough for four crystals; a per-level
  // breakdown cannot be told there without inventing furniture the reference
  // does not have. Callers already compute it for the sheet, so the field is
  // tolerated here rather than forcing every caller to strip it.
  slots?: { total: number; used: number; levels?: SpellSlotLevel[] } | null
  onClick?: () => void
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
  const g = gems ?? { action: "dormant" as GemState, bonus: "dormant" as GemState, reaction: "dormant" as GemState }

  const W = width
  // The artwork's own ratio. Anything else stretches the filigree.
  const H = Math.round(W * (1094 / 1437))

  /** Platinum periphery - the same platinum the board's active ring uses. */
  const rim = isTurn
    ? "brightness-[1.08] drop-shadow-[0_0_3px_#ffffff] drop-shadow-[0_0_12px_#fff2d0dd] drop-shadow-[0_0_28px_#fff2d066]"
    : active
      ? "brightness-105 drop-shadow-[0_0_12px_#c9a22755]"
      : "brightness-[0.88] hover:brightness-100"

  return (
    <div style={{ width: W, flexShrink: 0 }} className={`transition duration-200 ${rim}`}>
      <button
        onClick={onClick}
        title={c.name}
        style={{ width: W, height: H, position: "relative", display: "block", cursor: onClick ? "pointer" : "default" }}
      >
        {/* 1. PORTRAIT, behind the frame. The window is cut to transparency,
               so this shows through the arch the artist drew. */}
        <div style={{ ...box(SLOTS.portrait), overflow: "hidden" }}>
          <ClassMedallion
            faceUrl={c.face_image_url}
            portraitUrl={c.portrait_image_url}
            characterClass={c.class}
            // The painted arch is 492x412 - WIDER than it is tall - and the
            // hero art is 9:16. Cover keeps 47% of the source height, and
            // centring takes that 47% out of the middle, which is the torso.
            // Anchored to the top it is head-to-waist, which is what a
            // character card has always been.
            portraitPosition="top"
            fallback={<span style={{ fontSize: W * 0.12, color: cls.accent }}>{cls.sigil}</span>}
          />
        </div>

        {/* 2. BAR FILLS, also behind the frame, so the ornate troughs sit over
               them and clip their ends the way the art intends. */}
        <div style={{ ...box(SLOTS.hpFill), overflow: "hidden" }}>
          <div
            className="h-full transition-[width] duration-300"
            style={{
              width: `${frac * 100}%`,
              background: frac > 0.5
                ? "linear-gradient(180deg,#ff6a54 0%,#d3281c 52%,#7d0f08 100%)"
                : frac > 0.25
                  ? "linear-gradient(180deg,#f0b451 0%,#c07a15 52%,#6a3c05 100%)"
                  : "linear-gradient(180deg,#e0574a 0%,#8f1810 52%,#450703 100%)",
              boxShadow: "inset 0 1px 3px rgba(255,255,255,0.45), inset 0 -3px 6px rgba(0,0,0,0.55)",
            }}
          />
        </div>
        <div style={{ ...box(SLOTS.xpFill), overflow: "hidden" }}>
          <div
            className="h-full"
            style={{
              width: `${xpFrac * 100}%`,
              background: "linear-gradient(180deg,#ffe07a 0%,#d9a02a 55%,#7a5510 100%)",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.5)",
            }}
          />
        </div>

        {/* 3. THE FRAME, over portrait and bars. */}
        <img
          src={cls.cardFrameUrl}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ objectFit: "fill" }}
        />

        {/* 4. LIVE VALUES, laid into the holes the artist left. Every scale
               below is that element's height in the original over 1437. */}
        <div style={{ ...box(SLOTS.hpText), ...fitted(W, 0.038) }}>{cur} / {max || "-"}</div>
        {/* No thousands separators: two commas cost about a character and a
            half of width in a slot the artist ruled for ten glyphs, and
            "200 / 6,00" is worse than "200 / 6000" by any reading.

            And below ~260px the numerals go away entirely. Every other line on
            this card has a floor that keeps it legible when it shrinks; XP is
            the one that cannot, because it is the longest string in the
            narrowest trough. Holding it at the 6px floor does not make it
            readable at 210 - it only makes it overflow and lose its last
            digit, which is a lie. The gold bar still says how far along you
            are, and that is the whole of what the battlefield needs. */}
        {W >= 260 && (
          <div style={{ ...box(SLOTS.xpText), ...fitted(W, 0.017, "#e8d7a8") }}>
            {c.xp != null && c.xp_to_next ? `${c.xp} / ${c.xp_to_next}` : "-"}
          </div>
        )}
        <div style={{ ...box(SLOTS.insp), ...fitted(W, 0.034, "#ffe9a8") }}>{insp}</div>
        <div style={{ ...box(SLOTS.ac), ...fitted(W, 0.039) }}>{c.ac ?? "-"}</div>
        <div style={{ ...box(SLOTS.init), ...fitted(W, 0.039) }}>
          {c.dex_modifier == null ? "-" : `${c.dex_modifier >= 0 ? "+" : ""}${c.dex_modifier}`}
        </div>
        <div style={{ ...box(SLOTS.level), ...fitted(W, 0.039) }}>{c.level ?? "-"}</div>

        <div
          style={{
            ...box(SLOTS.className),
            ...fitted(W, 0.034, cls.accent),
            justifyContent: "flex-start",
            letterSpacing: "0.04em",
            textShadow: `0 0 10px ${cls.accent}66, 0 1px 2px #000`,
          }}
        >
          {(c.class ?? "Adventurer").toUpperCase()}
        </div>

        {/* First name only. The plate is sized for a name, not for
            "Fifi of Copperas Cove". */}
        <div style={{ ...box(SLOTS.name), ...fitted(W, 0.045), letterSpacing: "0.02em" }}>
          {c.name.split(" ")[0].toUpperCase()}
        </div>
        <div style={{ ...box(SLOTS.subclass), ...fitted(W, 0.019, cls.accent), letterSpacing: "0.12em" }}>
          {(c.class ?? "").toUpperCase()}
        </div>

        {/* Movement is the one resource the art states in words. */}
        <div
          style={{
            ...box(SLOTS.moveText),
            ...fitted(W, 0.030, movement && movement.remainingFt <= 0 ? "#6f6f6c" : "#dff3d8"),
          }}
        >
          {movement ? `${Math.max(0, Math.round(movement.remainingFt))} FT.` : "-"}
        </div>

        {/* 5. SPENDING, as darkness over the artist's stones. */}
        <Spent slot={SLOTS.gemAction} on={g.action === "spent"} />
        <Spent slot={SLOTS.gemBonus} on={g.bonus === "spent"} />
        <Spent slot={SLOTS.gemReact} on={g.reaction === "spent"} />
        <Spent slot={SLOTS.gemMove} on={Boolean(movement && movement.remainingFt <= 0)} />
        <SlotsOverlay slot={SLOTS.slots} total={slots?.total ?? 0} used={slots?.used ?? 0} />

        {/* 6. CONDITIONS, in the strip the artist ruled for them. */}
        <div
          style={{
            ...box(SLOTS.conds),
            display: "flex",
            alignItems: "center",
            gap: W * 0.022,
            overflow: "hidden",
            paddingLeft: W * 0.010,
          }}
        >
          {conditions.length === 0 ? (
            <span style={{ fontFamily: "Georgia, serif", fontSize: Math.max(6, W * 0.022), color: "#6d6552", fontStyle: "italic" }}>
              none
            </span>
          ) : (
            conditions.slice(0, 3).map((cond) => (
              <span
                key={cond}
                title={cond}
                style={{
                  fontFamily: "Georgia, serif",
                  // Hard floor: Sam asked that conditions stay readable when
                  // the card scales down, and this is the line that vanishes
                  // first if it is allowed to scale freely.
                  fontSize: Math.max(7, W * 0.025),
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: condColor(cond),
                  textShadow: "0 1px 2px #000, 0 0 7px rgba(0,0,0,0.9)",
                  whiteSpace: "nowrap",
                }}
              >
                {cond}
              </span>
            ))
          )}
        </div>

        {/* 7. THE ACTIVE SPHERE. The frame's own orb is painted GREEN, so it
               is already right for whoever is up. This covers it in red when
               the answer is no - same socket, same size. Green needs nothing:
               the art has already said it. */}
        {!isTurn && (
          <div style={{ ...box(SLOTS.sphere), pointerEvents: "none" }}>
            <div
              aria-label="waiting"
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background: "radial-gradient(circle at 34% 28%, #ffd6d2 0%, #c92f2f 52%, #4a0b0b 100%)",
                boxShadow: "0 0 5px 1px rgba(201,47,47,0.6), inset 0 0 4px rgba(255,255,255,0.5)",
              }}
            />
          </div>
        )}
      </button>

      {/* The expand bar, welded to the foot of the card. */}
      {onExpand && (
        <button
          onClick={onExpand}
          style={{
            width: W,
            marginTop: -2,
            padding: `${Math.max(2, W * 0.010)}px 0`,
            border: "1px solid #6b5320",
            borderTop: "none",
            borderRadius: "0 0 3px 3px",
            background: "linear-gradient(180deg, rgba(28,22,12,0.95), rgba(8,7,5,0.95))",
            color: "#c9a24a",
            fontFamily: "Georgia, serif",
            fontSize: Math.max(5.5, W * 0.026),
            letterSpacing: "0.20em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Sheet
        </button>
      )}
    </div>
  )
}
