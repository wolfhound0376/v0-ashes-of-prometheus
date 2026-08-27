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
  /** 0–1 through the current level, when the campaign tracks it. */
  xpFraction?: number
  conditions?: string[]
}

const CLASS_GLYPH: Record<string, string> = {
  cleric: "✧", rogue: "🗡", sorcerer: "✦", wizard: "✦", bard: "♪", fighter: "⚔",
  paladin: "✝", ranger: "➶", warlock: "◈", barbarian: "⚒", druid: "❋", monk: "☯",
}

export function CharacterCard({
  character: c,
  tone = "blue",
  active = false,
  onClick,
  width = 236,
}: {
  character: CardCharacter
  /** blue for the party, red for hostiles — the artist cut both. */
  tone?: "blue" | "red"
  active?: boolean
  onClick?: () => void
  width?: number
}) {
  const max = c.hp_max ?? 0
  const cur = c.hp_current ?? max
  const frac = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0
  // The frames are 1004x752 (blue) and 1004x782 (red); one ratio is close
  // enough for both and keeps the row even.
  const height = Math.round(width * (752 / 1004))

  return (
    <button
      onClick={onClick}
      title={c.name}
      style={{ width, height, position: "relative", flexShrink: 0 }}
      className={
        "block transition-[filter,transform] duration-200 " +
        (active ? "brightness-110 drop-shadow-[0_0_14px_#c9a22755]" : "brightness-[0.82] hover:brightness-100")
      }
    >
      {/* 1. The portrait, BEHIND the frame — the arched window masks it. */}
      <div style={{ ...box(SLOTS.portrait), overflow: "hidden" }}>
        {c.portrait_image_url ? (
          <img src={c.portrait_image_url} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <div
            className="grid h-full w-full place-items-center"
            style={{ background: "radial-gradient(circle at 50% 35%, #2a2114, #0a0805)" }}
          >
            <span style={{ fontSize: width * 0.13, color: "#6b5a34" }}>
              {CLASS_GLYPH[(c.class ?? "").toLowerCase()] ?? "✧"}
            </span>
          </div>
        )}
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

      {/* The class sigil in the small top-left socket. */}
      <div style={{ ...box(SLOTS.classSigil), ...fitted, fontSize: width * 0.055, color: "#c9a227" }}>
        {CLASS_GLYPH[(c.class ?? "").toLowerCase()] ?? "✧"}
      </div>

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
