"use client"

// The travel map as a dashboard stage: same component, same data, same rules —
// Malachar's key unlocks travel, players get the fog-of-war view — just sized to
// live inside the character stage instead of owning the page.

import UnderdarkMap from "./underdark-map"

export default function MapStage() {
  return <UnderdarkMap embedded />
}
