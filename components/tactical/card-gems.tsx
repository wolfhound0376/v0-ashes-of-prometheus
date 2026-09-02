// Painted HUD jewels derived from the approved CharacterCards_Warlock_Kenta
// art direction. The files carry the material detail; CSS only communicates
// live availability by dimming the same painted object.

export type GemHue = "ruby" | "amethyst" | "amber"
export type ResourceGemState = "lit" | "spent" | "dormant"

const GEM_ART: Record<GemHue, string> = {
  ruby: "/ui/character-card/action-ruby.png",
  amethyst: "/ui/character-card/bonus-amethyst.png",
  amber: "/ui/character-card/reaction-amber.png",
}

function stateFilter(state: ResourceGemState): string {
  if (state === "spent") return "grayscale(.86) saturate(.18) brightness(.34)"
  if (state === "dormant") return "saturate(.42) brightness(.5)"
  return "brightness(1.08) saturate(1.12) drop-shadow(0 0 5px currentColor)"
}

export function ResourceGem({
  hue,
  state = "lit",
  size = 34,
}: {
  hue: GemHue
  state?: ResourceGemState
  size?: number
}) {
  return (
    <img
      src={GEM_ART[hue]}
      alt=""
      aria-label={`${hue} ${state === "lit" ? "available" : state} resource`}
      draggable={false}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        filter: stateFilter(state),
        opacity: state === "dormant" ? 0.78 : 1,
        transition: "filter 220ms ease, opacity 220ms ease",
      }}
    />
  )
}

export function SlotCrystal({
  spent = false,
  height = 38,
}: {
  spent?: boolean
  height?: number
}) {
  return (
    <img
      src="/ui/character-card/spell-slot.png"
      alt=""
      aria-label={spent ? "spent spell slot" : "available spell slot"}
      draggable={false}
      style={{
        width: height * 0.36,
        height,
        objectFit: "contain",
        filter: spent
          ? "grayscale(.9) saturate(.16) brightness(.25)"
          : "brightness(1.08) saturate(1.1) drop-shadow(0 0 4px #219cff)",
      }}
    />
  )
}
