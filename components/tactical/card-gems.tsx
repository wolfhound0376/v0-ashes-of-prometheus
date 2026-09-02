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
//   REACTION      one amber       — nothing drawn inside it
//   SPELL SLOTS   several tall cobalt crystals, vertical
//
// Explicitly NOT here, because previous passes drifted into them: counters
// under the stones, "1 / 1" labels, secondary dots, mini crystals, swords in
// the action, shields in the reaction. The single stone IS the readout.
// ============================================================================

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
const AMBER: Facets    = { table: "#ffe9a8", body: "#e8a91c", shade: "#6d4703", edge: "#ffd76b", glow: "#ffb524" }
const COBALT: Facets   = { table: "#bfe4ff", body: "#2b7fe0", shade: "#08234f", edge: "#7fc4ff", glow: "#3d9bff" }

/** Spent: the stone is still mounted, the fire has gone out of it. */
const DEAD: Facets = { table: "#4a4a48", body: "#2a2a29", shade: "#141413", edge: "#5c5c59", glow: "#000000" }

export type GemHue = "ruby" | "amethyst" | "amber"
const HUES: Record<GemHue, Facets> = { ruby: RUBY, amethyst: AMETHYST, amber: AMBER }

/**
 * One large cut stone: action, bonus action, or reaction.
 *
 * Spent darkens and desaturates the SAME stone rather than removing it or
 * adding a counter beside it — the socket never empties, so the eye learns
 * one shape per resource and reads its state by colour alone.
 */
export function ResourceGem({
  hue, spent = false, size = 26,
}: { hue: GemHue; spent?: boolean; size?: number }) {
  const F = spent ? DEAD : HUES[hue]
  const id = `${hue}${spent ? "-s" : ""}`
  return (
    <svg
      width={size}
      height={size * 1.18}
      viewBox="0 0 40 47"
      style={{
        display: "block",
        filter: spent
          ? "saturate(0.15) brightness(0.75)"
          : `drop-shadow(0 0 3px ${F.glow}bb) drop-shadow(0 0 9px ${F.glow}55)`,
        transition: "filter 260ms ease",
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
      </defs>

      {/* Silhouette: a kite brilliant. Wide across the girdle, long to the
          point, which is the shape on the reference sheet. */}
      <polygon points="20,1 38.5,16 20,46 1.5,16" fill={`url(#b-${id})`} stroke={F.edge} strokeWidth="1.1" />

      {/* Crown facets — the bright top. */}
      <polygon points="20,1 29,16 20,22 11,16" fill={`url(#t-${id})`} />
      <polygon points="20,1 38.5,16 29,16" fill={F.table} opacity={spent ? 0.35 : 0.62} />
      <polygon points="20,1 1.5,16 11,16" fill={F.shade} opacity="0.55" />

      {/* Pavilion — the darker lower half, split so the point reads as an
          edge between two planes rather than a flat wedge. */}
      <polygon points="1.5,16 11,16 20,22 20,46" fill={F.shade} />
      <polygon points="38.5,16 29,16 20,22 20,46" fill={F.body} opacity="0.72" />

      {/* The girdle: a thin bright line across the widest point. */}
      <path d="M1.5,16 L38.5,16" stroke={F.edge} strokeWidth="0.7" opacity={spent ? 0.3 : 0.75} />

      {/* Internal highlight — one small hot spot on the table. Not a sparkle
          burst; the reference stones are lit, not twinkling. */}
      {!spent && (
        <polygon points="20,4 24,14 20,17.5 16,14" fill="#ffffff" opacity="0.5" />
      )}
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
  const F = COBALT
  const id = spent ? "sl-s" : "sl"
  return (
    <svg
      width={height * 0.34}
      height={height}
      viewBox="0 0 14 40"
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
      </defs>
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
        fill={spent ? "#0b1524" : F.table}
        opacity={spent ? 0.5 : 0.3}
      />
      {!spent && (
        <path d="M7,3 L7,36" stroke="#ffffff" strokeWidth="1.1" opacity="0.42" />
      )}
    </svg>
  )
}
