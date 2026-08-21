"use client"

// The travel map as a dashboard stage: same component, same data, same rules —
// Malachar's key unlocks travel, players get the fog-of-war view — just sized to
// live inside the character stage, with a way back to the character.

import UnderdarkMap from "./underdark-map"

export default function MapStage({ onBack }: { onBack?: () => void }) {
  return <UnderdarkMap embedded onBack={onBack} />
}
