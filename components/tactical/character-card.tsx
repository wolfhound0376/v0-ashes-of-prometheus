"use client"

// ============================================================================
// THE CHARACTER CARD — Sam's commissioned frame, with live numbers laid into it.
//
// The frame is the art: gold gothic ironwork, an arched portrait window, a
// red HP bar, a gold XP bar, and three recessed sockets labelled AC / INIT /
// LVL. Nothing here re-draws any of that. The PNG is the card; this component
// only positions real values into the holes the artist left.
//
// EVERY COORDINATE BELOW WAS MEASURED, not guessed. The frame was analysed
// pixel-by-pixel: the portrait window is the one fully transparent interior
// region, and each recessed field is a large opaque near-black blob. Their
// bounding boxes, as percentages of the card, are the constants in SLOTS.
// If Sam ever re-cuts the frame, re-run that measurement and edit this block
// alone — no layout code changes.
// ============================================================================

import type { CSSProperties } from "react"
import { frameForClass } from "@/lib/class-frames"
import { ClassMedallion } from "./class-medallion"

const FRAME = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/ui-frames"

/** Measured from the artwork. Percentages of the card's own box. */
const SLOTS = {
  portrait: { left: 6.9, top: 12.0, width: 32.4, height: 62.5 },
  namePlate: { left: 12.2, top: 77.9, width: 28.8, height: 9.6 },
  classSigil: { left: 2.2, top: 9.4, width: 8.9, height: 12.5 },
  hpBar: { left: 46.5, top: 29.5, width: 31.5, height: 7.5 },
  hpCurrent: { left: 80.5, top: 29.0, width: 7.0, height: 9.0 },
  hpMax: { left: 90.5, top: 29.0, width: 7.0, height: 9.0 },
  xpBar: { left: 50.1, top: 40.4, width: 45.4, height: 2.8 },
  ac: { left: 51.6, top: 53.3, width: 6.8, height: 9.2 },
  init: { left: 70.4, top: 53.3, width: 6.8, height: 9.2 },
  lvl: { left: 88.2, top: 53.3, width: 6.9, height: 9.3 },
  statusIcon: { left: 47.8, top: 71.4, width: 7.9, height: 10.8 },
  statusText: { left: 57.5, top: 72.5, width: 38.0, height: 8.5 },
} as const

const box = (s: { left: number; top: number; width: number; height: number }): CSSProperties => ({
  position: "absolute",
  left: `${s.left}%`,
  top: `${s.top}%`,
  width: `${s.width}%`,
  height: `${s.height}%`,
})

/** Text that fills its slot and stays readable at any card size. */
const fitted: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "Georgia, serif",
  fontSize: "clamp(7px, 1.05vw, 13px)",
  lineHeight: 1,
  color: "#f4e6c4",
  textShadow: "0 1px 2px #000, 0 0 6px #0009",
  whiteSpace: "nowrap",
}

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
  /** The FACE alone, with no ornament — `portraits/face-{slug}.webp`. When it
   *  exists the card composites it under the class frame, so the box is chosen
   *  by class rather than baked into the art. When it is null the card falls
   *  back to `portrait_image_url` and looks exactly as it always did. */
  face_image_url?: string | null
  /** 0–1 through the current level, when the campaign tracks it. */
  xpFraction?: number
  conditions?: string[]
}

/** A cut stone in the ironwork. Blue carries the action, red the bonus.
 *  Multifaceted per Sam's sketch: a kite silhouette with a bright table
 *  facet, two shaded pavilions and a sparkle when lit. */
function EconomyGem({ hue, state, size = 14 }: { hue: "green" | "red"; state: "lit" | "spent" | "dormant"; size?: number }) {
  const P =
    hue === "green"
      ? { hi: "#d2f5c8", mid: "#3dbb4e", lo: "#0e5c1b", glow: "#54e868", dark: "#152819", darkHi: "#2a5232" }
      : { hi: "#ffd2c4", mid: "#d84a3a", lo: "#6e100a", glow: "#ff5a44", dark: "#2a1512", darkHi: "#57302a" }
  const lit = state === "lit"
  // spent goes to dead grey; dormant keeps a visible memory of its colour.
  // Sam: "I only see one red diamond" — the old dormant/spent bodies sank
  // into the card's black. Every state now keeps a readable silhouette:
  // dormant wears its colour dimmed, spent greys out but holds its edge.
  const body = lit ? P.mid : state === "dormant" ? P.darkHi : "#2c2c2b"
  const table = lit ? P.hi : state === "dormant" ? P.mid : "#3a3a39"
  const shade = lit ? P.lo : state === "dormant" ? P.dark : "#20201f"
  const edge = lit ? P.hi : state === "dormant" ? P.mid : "#4a4a49"
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      style={{
        filter: lit ? `drop-shadow(0 0 3px ${P.glow}) drop-shadow(0 0 7px ${P.glow}88)` : "none",
        opacity: state === "spent" ? 0.45 : 1,
        transition: "filter 220ms, opacity 220ms",
      }}
    >
      <polygon points="10,0.8 18.4,7 10,19.2 1.6,7" fill={body} stroke={edge} strokeWidth="0.9" />
      <polygon points="10,0.8 14.4,7 10,10.2 5.6,7" fill={table} />
      <polygon points="1.6,7 5.6,7 10,10.2 10,19.2" fill={shade} />
      <polygon points="18.4,7 14.4,7 10,10.2 10,19.2" fill={body} opacity="0.8" />
      {lit && <polygon points="10,0.8 11.4,5.2 10,6.8 8.6,5.2" fill="#ffffff" opacity="0.85" />}
    </svg>
  )
}

export function CharacterCard({
  character: c,
  tone = "blue",
  active = false,
  isTurn = false,
  gems,
  onClick,
  width = 236,
}: {
  character: CardCharacter
  /** blue for the party, red for hostiles — the artist cut both. */
  tone?: "blue" | "red"
  /** Focused — this is the card whose globes and ability rack are showing.
   *  A view state. It brightens the card and nothing more. */
  active?: boolean
  /** Up NOW, by initiative. The lamp's only meaning. */
  isTurn?: boolean
  /** Action-economy stones under the class line: blue = the action, red =
   *  the bonus action. "lit" is spendable and glows; "spent" has gone dark;
   *  "dormant" is any card whose turn it is not. Omit to render none. */
  gems?: { action: "lit" | "spent" | "dormant"; bonus: "lit" | "spent" | "dormant" } | null
  onClick?: () => void
  width?: number
}) {
  // The class decides the box. Not the artist, not the filename, not whoever
  // happened to be holding the lute the day the medallion was rendered.
  const cls = frameForClass(c.class)
  const max = c.hp_max ?? 0
  const cur = c.hp_current ?? max
  const frac = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0
  // The frames are 1004x752 (blue) and 1004x782 (red); one ratio is close
  // enough for both and keeps the row even.
  const height = Math.round(width * (752 / 1004))

  /**
   * THE PERIPHERY.
   *
   * Three states, and they are not the same question:
   *
   *   isTurn  — the initiative has reached this character. Not a preference,
   *             a fact about the round. This is the one that must be readable
   *             across the room, on a stream, at a glance.
   *   active  — you clicked this plate to look at it. A quiet distinction.
   *   neither — dimmed back so the lit card has something to be brighter than.
   *
   * Built from STACKED drop-shadows rather than a border or a ring. A ring
   * draws a rectangle, and this card is not a rectangle — the frame webp has
   * an arched crown and cut corners. `drop-shadow` follows the composited
   * alpha silhouette, so the light hugs the actual frame the artist drew
   * instead of boxing it. Three layers: a tight near-white core so the edge
   * reads as hot metal, a mid gold spread, and a wide soft falloff for the
   * halo.
   *
   * Gold, not green. Green already means "up" on the status lamp two
   * elements down, and a green wash over gold frame art turns it sickly.
   * The lamp says whose turn it is in colour; the periphery says it in light.
   */
  // PLATINUM, AND THE SAME PLATINUM THE BOARD USES.
  //
  // This was gold. The board's active ring was green. So the one fact that
  // matters most — whose turn it is — was announced in two different colours
  // depending on where you happened to be looking, and gold additionally
  // collided with the walk-range squares painted under that same character.
  //
  // #fff2d0 here and ACTIVE_HUE in combat-board-3d are one decision. Change
  // one and change the other, or the board and the plate start disagreeing
  // again.
  const rim = isTurn
    ? "brightness-[1.16] scale-[1.03] " +
      "drop-shadow-[0_0_3px_#ffffff] " +
      "drop-shadow-[0_0_11px_#fff2d0dd] " +
      "drop-shadow-[0_0_26px_#fff2d077]"
    : active
      ? "brightness-110 drop-shadow-[0_0_14px_#c9a22755]"
      : "brightness-[0.82] hover:brightness-100"

  return (
    <button
      onClick={onClick}
      title={c.name}
      style={{
        width,
        height,
        position: "relative",
        flexShrink: 0,
        // Lift the lit card over its neighbours so the rim glow spills across
        // them rather than being painted under the next card in the row.
        zIndex: isTurn ? 2 : 1,
      }}
      className={"block transition-[filter,transform] duration-200 " + rim}
    >
      {/* 1. The portrait, BEHIND the frame — the arched window masks it.
             Face + class frame, assembled by the one component that knows how. */}
      <div style={{ ...box(SLOTS.portrait), overflow: "hidden" }}>
        <ClassMedallion
          faceUrl={c.face_image_url}
          portraitUrl={c.portrait_image_url}
          characterClass={c.class}
          fallback={<span style={{ fontSize: width * 0.13, color: cls.accent }}>{cls.sigil}</span>}
        />
      </div>

      {/* 2. The frame itself, over the portrait. */}
      <img
        src={`${FRAME}/card-${tone}.webp`}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ objectFit: "fill" }}
      />

      {/* 3. Live values, laid into the sockets the artist left. */}
      {/* HP fill — the frame already paints the empty bar's housing. */}
      <div style={{ ...box(SLOTS.hpBar), overflow: "hidden", borderRadius: "999px" }}>
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${frac * 100}%`,
            background: frac > 0.5
              ? "linear-gradient(180deg,#e5523f,#8f1810)"
              : frac > 0.25
                ? "linear-gradient(180deg,#e0a33c,#8a5410)"
                : "linear-gradient(180deg,#c23b2e,#5a0d08)",
            boxShadow: "inset 0 1px 2px #ffffff55, inset 0 -2px 4px #00000088",
          }}
        />
      </div>
      <div style={{ ...box(SLOTS.hpCurrent), ...fitted }}>{cur}</div>
      <div style={{ ...box(SLOTS.hpMax), ...fitted }}>{max || "—"}</div>

      {/* XP, when the campaign tracks it; the bar sits empty rather than lying. */}
      <div style={{ ...box(SLOTS.xpBar), overflow: "hidden", borderRadius: "999px" }}>
        <div
          className="h-full"
          style={{
            width: `${Math.max(0, Math.min(1, c.xpFraction ?? 0)) * 100}%`,
            background: "linear-gradient(180deg,#f0c860,#a87820)",
          }}
        />
      </div>

      <div style={{ ...box(SLOTS.ac), ...fitted }}>{c.ac ?? "—"}</div>
      <div style={{ ...box(SLOTS.init), ...fitted }}>
        {c.dex_modifier == null ? "—" : `${c.dex_modifier >= 0 ? "+" : ""}${c.dex_modifier}`}
      </div>
      <div style={{ ...box(SLOTS.lvl), ...fitted }}>{c.level ?? "—"}</div>

      {/* The name plate under the portrait. Long names lose their epithet
          rather than overflowing the ironwork. */}
      <div
        style={{
          ...box(SLOTS.namePlate),
          ...fitted,
          fontSize: "clamp(7px, 0.95vw, 12px)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#e8dcc0",
        }}
      >
        {c.name.split(/\s+of\s+|\s+the\s+/i)[0]}
      </div>

      {/* The class sigil in the small top-left socket. Glyph and colour come
          from the class registry, not a hardcoded table. */}
      <div style={{ ...box(SLOTS.classSigil), ...fitted, fontSize: width * 0.055, color: cls.accent }}>
        {cls.sigil}
      </div>

      {/* THE TURN LAMP.
          Red at rest, green when this character is up. Every playable
          character carries one, so the party reads as a row of red lights with
          exactly one green in it — and the green travels as initiative passes.

          The red matters. An unlit socket says "this card has a lamp that is
          off"; a red one says "waiting", which is the actual state, and it
          makes the single green unmistakable at a glance across four cards.

          What it does NOT track is selection. Selection is a view state; it
          changes every time you click across the party to read someone's
          slots, and a light that moves when you merely LOOK at something is a
          light nobody at the table can trust.

          It is a glance signal, not the announcement — the turn banner already
          tells the active player in words. This is what the rest of the table
          reads without being told.

          It sits in SLOTS.statusIcon, the round housing at the left of the
          status band, which had been empty since the card shipped. */}
      <div
        aria-label={isTurn ? `${c.name} is up` : `${c.name} is waiting`}
        style={{ ...box(SLOTS.statusIcon), display: "grid", placeItems: "center" }}
      >
        <div
          style={{
            width: "74%",
            height: "74%",
            borderRadius: "50%",
            background: isTurn
              ? "radial-gradient(circle at 35% 30%, #d8ffd4, #35d94a 55%, #0d5c18)"
              : "radial-gradient(circle at 35% 30%, #ffcfcb, #c92f2f 55%, #560c0c)",
            boxShadow: isTurn
              ? "0 0 8px 2px rgba(53,217,74,0.85), inset 0 0 3px rgba(255,255,255,0.65)"
              : "0 0 4px 1px rgba(201,47,47,0.45), inset 0 0 3px rgba(255,255,255,0.4)",
            transition: "background 160ms, box-shadow 160ms",
          }}
        />
      </div>

      {/* THE ECONOMY GEMS - Sam's brief (revised 8/29): one GREEN diamond
          per action, one RED per bonus action, under the class line and in
          step with the lamp. The count of glowing stones IS the count still
          available; a dim stone is one that exists but is not yours to spend
          right now. */}
      {gems && (
        <div
          style={{
            position: "absolute",
            left: `${SLOTS.statusIcon.left}%`,
            top: "84.2%",
            height: "12%",
            display: "flex",
            alignItems: "center",
            gap: Math.max(3, Math.round(width * 0.018)),
          }}
        >
          <EconomyGem hue="green" state={gems.action} size={Math.round(width * 0.07)} />
          <EconomyGem hue="red" state={gems.bonus} size={Math.round(width * 0.07)} />
        </div>
      )}

      {/* The wide field at the foot: conditions, or the class when clear. */}
      <div
        style={{
          ...box(SLOTS.statusText),
          ...fitted,
          justifyContent: "flex-start",
          fontSize: "clamp(6px, 0.8vw, 10px)",
          color: c.conditions?.length ? "#e0956a" : "#8a7952",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          overflow: "hidden",
        }}
      >
        {c.conditions?.length ? c.conditions.slice(0, 2).join(" · ") : (c.class ?? "")}
      </div>
    </button>
  )
}
