// ============================================================================
// CARD GEMS — the stones mounted into the character card.
//
// Drawn as SVG rather than shipped as art, for the reason Sam set out: the
// card has to stay crisp on a retina panel at battlefield size, and a raster
// gem scaled down is a muddy gem. Vector holds its edge at any size and any
// device pixel ratio, and the facets can be re-lit by changing four colours
// instead of re-cutting a PNG.
//
// The reference sheet is the authority on their shape and behaviour:
//
//   ACTION        one ruby        — nothing drawn inside it
//   BONUS ACTION  one amethyst    — nothing drawn inside it
//   MOVEMENT      an illustrated boot, owned by character-card.tsx
//   REACTION      one amber       — nothing drawn inside it
//   SPELL SLOTS   several tall cobalt crystals, vertical
//
// Explicitly NOT here, because previous passes drifted into them: counters
// under the stones, "1 / 1" labels, secondary dots, mini crystals, swords in
// the action, shields in the reaction. The single stone IS the readout.
// ============================================================================

import { useId } from "react"

/** The four colours a cut stone needs, plus the light it throws. */
interface Facets {
  /** The table — the bright flat top facet. */
  table: string
  /** The main body colour. */
  body: string
  /** The pavilion — the shaded lower facets. */
  shade: string
  /** The thin luminous rim. */
  edge: string
  /** What it casts onto the card around it. */
  glow: string
}

const RUBY: Facets     = { table: "#ff9d8a", body: "#d32c1e", shade: "#5e0a06", edge: "#ff8f78", glow: "#ff3a22" }
const AMETHYST: Facets = { table: "#e4b8ff", body: "#9a3fd6", shade: "#3d0d63", edge: "#d79bff", glow: "#b44dff" }
const EMERALD: Facets   = { table: "#c9ffd2", body: "#20bf48", shade: "#064f1b", edge: "#76ff91", glow: "#28e95a" }
const AMBER: Facets    = { table: "#ffe9a8", body: "#e8a91c", shade: "#6d4703", edge: "#ffd76b", glow: "#ffb524" }
const COBALT: Facets   = { table: "#bfe4ff", body: "#2b7fe0", shade: "#08234f", edge: "#7fc4ff", glow: "#3d9bff" }

/** Spent: the stone is still mounted, the fire has gone out of it. */
const DEAD: Facets = { table: "#4a4a48", body: "#2a2a29", shade: "#141413", edge: "#5c5c59", glow: "#000000" }

export type GemHue = "ruby" | "amethyst" | "emerald" | "amber"
export type ResourceGemState = "lit" | "spent" | "dormant"
const HUES: Record<GemHue, Facets> = { ruby: RUBY, amethyst: AMETHYST, emerald: EMERALD, amber: AMBER }

/**
 * One large cut stone: action, bonus action, or reaction.
 *
 * Spent darkens and desaturates the SAME stone rather than removing it or
 * adding a counter beside it — the socket never empties, so the eye learns
 * one shape per resource and reads its state by colour alone.
 */
export function ResourceGem({
  hue, state = "lit", size = 26,
}: { hue: GemHue; state?: ResourceGemState; size?: number }) {
  const uniqueId = useId()
  const spent = state === "spent"
  const F = spent ? DEAD : HUES[hue]
  const id = `${hue}-${uniqueId.replace(/:/g, "")}${spent ? "-s" : ""}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`${hue} ${state === "lit" ? "available" : state} resource`}
      style={{
        display: "block",
        filter: spent
          ? "saturate(0.15) brightness(0.75)"
          : state === "dormant"
            ? "saturate(0.38) brightness(0.58)"
            : `drop-shadow(0 0 3px ${F.glow}bb) drop-shadow(0 0 9px ${F.glow}55)`,
        opacity: state === "dormant" ? 0.72 : 1,
        transition: "filter 260ms ease, opacity 260ms ease",
      }}
    >
      <defs>
        {/* The body gradient does most of the dimensional work: lit across the
            upper shoulders, falling away toward the point. */}
        <linearGradient id={`b-${id}`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={F.body} />
          <stop offset="55%" stopColor={F.body} />
          <stop offset="100%" stopColor={F.shade} />
        </linearGradient>
        <linearGradient id={`t-${id}`} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor={F.table} />
          <stop offset="100%" stopColor={F.body} />
        </linearGradient>
        <radialGradient id={`hot-${id}`} cx="34%" cy="24%" r="69%">
          <stop offset="0%" stopColor="#fff" stopOpacity=".94" />
          <stop offset="18%" stopColor={F.table} stopOpacity=".72" />
          <stop offset="54%" stopColor={F.body} stopOpacity=".15" />
          <stop offset="100%" stopColor={F.shade} stopOpacity="0" />
        </radialGradient>
        <filter id={`bevel-${id}`} x="-45%" y="-45%" width="190%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.15" result="blur" />
          <feSpecularLighting in="blur" surfaceScale="4" specularConstant="1.05" specularExponent="18" lightingColor="#fff" result="spec">
            <fePointLight x="9" y="4" z="24" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
          <feDropShadow dx="0" dy="2.4" stdDeviation="1.6" floodColor="#000" floodOpacity=".92" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /><feMergeNode in="specIn" /></feMerge>
        </filter>
      </defs>

      {/* A true diamond silhouette. The bevels and split lower facets give it
          depth without adding a symbol or a second resource marker. */}
      <g filter={`url(#bevel-${id})`}>
      <polygon points="20,1 39,20 20,39 1,20" fill={`url(#b-${id})`} stroke="#2a1708" strokeWidth="3" />
      <polygon points="20,1 39,20 20,39 1,20" fill={`url(#b-${id})`} stroke={F.edge} strokeWidth="1.15" />

      {/* Crown facets — the bright top. */}
      <polygon points="20,1 30,20 20,25 10,20" fill={`url(#t-${id})`} />
      <polygon points="20,1 39,20 30,20" fill={F.table} opacity={spent ? 0.35 : 0.62} />
      <polygon points="20,1 1,20 10,20" fill={F.shade} opacity="0.55" />
      <polygon points="20,1 30,20 20,25 10,20" fill={`url(#hot-${id})`} />

      {/* Pavilion — the darker lower half, split so the point reads as an
          edge between two planes rather than a flat wedge. */}
      <polygon points="1,20 10,20 20,25 20,39" fill={F.shade} />
      <polygon points="39,20 30,20 20,25 20,39" fill={F.body} opacity="0.72" />

      {/* The girdle: a thin bright line across the widest point. */}
      <path d="M1,20 L39,20" stroke={F.edge} strokeWidth="0.7" opacity={spent ? 0.3 : 0.75} />

      {/* Internal highlight — one small hot spot on the table. Not a sparkle
          burst; the reference stones are lit, not twinkling. */}
      {!spent && (
        <>
          <polygon points="20,4 25,16 20,20 15,16" fill="#ffffff" opacity="0.46" />
          <path d="M7 20 20 7 33 20M20 25 20 37" fill="none" stroke="#fff" strokeWidth=".55" opacity=".48" />
        </>
      )}
      </g>
    </svg>
  )
}

/**
 * One spell slot: a tall narrow crystal, stood upright.
 *
 * The only resource on the card that is drawn more than once, because the
 * count is the information — three lit and one dark says what a number would
 * have said, without a number.
 */
export function SlotCrystal({
  spent = false, height = 26,
}: { spent?: boolean; height?: number }) {
  const uniqueId = useId()
  const F = COBALT
  const id = `sl-${uniqueId.replace(/:/g, "")}${spent ? "-s" : ""}`
  return (
    <svg
      width={height * 0.34}
      height={height}
      viewBox="0 0 14 40"
      role="img"
      aria-label={spent ? "spent spell slot" : "available spell slot"}
      style={{
        display: "block",
        filter: spent ? "none" : `drop-shadow(0 0 3px ${F.glow}aa) drop-shadow(0 0 7px ${F.glow}44)`,
        transition: "filter 260ms ease",
      }}
    >
      <defs>
        <linearGradient id={`c-${id}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={spent ? "#0a1220" : F.table} />
          <stop offset="45%" stopColor={spent ? "#070d18" : F.body} />
          <stop offset="100%" stopColor={spent ? "#04080f" : F.shade} />
        </linearGradient>
        <linearGradient id={`side-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={spent ? "#111a28" : "#061a43"} />
          <stop offset=".48" stopColor={spent ? "#273343" : "#9be0ff"} />
          <stop offset=".58" stopColor={spent ? "#0b111b" : "#167bea"} />
          <stop offset="1" stopColor={spent ? "#03070d" : "#03152f"} />
        </linearGradient>
        <filter id={`slot-bevel-${id}`} x="-80%" y="-25%" width="260%" height="155%">
          <feGaussianBlur in="SourceAlpha" stdDeviation=".75" result="blur" />
          <feSpecularLighting in="blur" surfaceScale="3" specularConstant="1.15" specularExponent="22" lightingColor="#dff5ff" result="spec">
            <fePointLight x="2" y="2" z="18" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn" />
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#000" floodOpacity=".95" />
          <feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /><feMergeNode in="specIn" /></feMerge>
        </filter>
      </defs>
      <g filter={`url(#slot-bevel-${id})`}>
      {/* An elongated hexagonal crystal — pointed at both ends. */}
      <polygon
        points="7,0.6 13.2,8 13.2,31 7,39.4 0.8,31 0.8,8"
        fill={`url(#c-${id})`}
        stroke={spent ? "#3d4a5c" : F.edge}
        strokeWidth="1"
      />
      {/* The lit facet down the left of the shaft. */}
      <polygon
        points="7,0.6 7,39.4 0.8,31 0.8,8"
        fill={`url(#side-${id})`}
        opacity={spent ? 0.66 : 0.78}
      />
      <polygon points="7,.6 13.2,8 10.1,10.2 7,6.2 3.9,10.2 .8,8" fill="#fff" opacity={spent ? ".08" : ".56"} />
      <path d="M1.6 9.2 4.1 11.3 4.1 29.2 1.6 30.6M12.4 9.2 9.9 11.3 9.9 29.2 12.4 30.6" fill="none" stroke={spent ? "#334052" : "#caefff"} strokeWidth=".55" opacity=".8" />
      {!spent && (
        <><path d="M7,3 L7,36" stroke="#ffffff" strokeWidth="1.15" opacity="0.62" /><path d="M3.2 12 3.2 25" stroke="#fff" strokeWidth=".8" opacity=".46" /></>
      )}
      </g>
    </svg>
  )
}
