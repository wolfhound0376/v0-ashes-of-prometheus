"use client"

import { useCallback, useEffect } from "react"
import { Canvas, type ThreeEvent } from "@react-three/fiber"
import { Grid, OrbitControls } from "@react-three/drei"
import type { Token, VttMap } from "./tabletop-client"
import { TokenMesh } from "./token-mesh"

type SceneProps = {
  map: VttMap
  tokens: Token[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  moveToken: (id: string, gridX: number, gridY: number) => void
}

function Lighting({ preset }: { preset: VttMap["ambient_preset"] }) {
  switch (preset) {
    case "day":
      return (
        <>
          <ambientLight intensity={0.9} />
          <directionalLight
            position={[20, 30, 15]}
            intensity={1.6}
            color="#fff6e8"
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
        </>
      )
    case "night":
      return (
        <>
          <ambientLight intensity={0.18} color="#243049" />
          <directionalLight position={[-15, 25, -10]} intensity={0.5} color="#aec4ff" castShadow />
        </>
      )
    case "dusk":
      return (
        <>
          <ambientLight intensity={0.35} color="#3a2a2a" />
          <directionalLight position={[-25, 8, 10]} intensity={1.4} color="#ff8a4c" castShadow />
        </>
      )
    case "dungeon":
    default:
      return (
        <>
          <ambientLight intensity={0.15} />
          <hemisphereLight color="#3a3f66" groundColor="#141018" intensity={0.5} />
          <pointLight position={[-12, 5, -12]} intensity={30} distance={22} decay={2} color="#ff7a2a" castShadow />
          <pointLight position={[12, 5, -12]} intensity={30} distance={22} decay={2} color="#ff7a2a" />
          <pointLight position={[0, 5, 12]} intensity={26} distance={20} decay={2} color="#ffa347" />
        </>
      )
  }
}

function Ground({
  map,
  selectedId,
  moveToken,
}: {
  map: VttMap
  selectedId: string | null
  moveToken: (id: string, gridX: number, gridY: number) => void
}) {
  const w = map.grid_width
  const h = map.grid_height
  const groundColor = map.ambient_preset === "day" ? "#4a5d3a" : "#2a2a35"

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!selectedId) return
      e.stopPropagation()
      // World coords → grid cell. Plane spans [-w/2, w/2] × [-h/2, h/2].
      const gx = Math.floor(e.point.x + w / 2)
      const gy = Math.floor(e.point.z + h / 2)
      const clampedX = Math.max(0, Math.min(w - 1, gx))
      const clampedY = Math.max(0, Math.min(h - 1, gy))
      moveToken(selectedId, clampedX, clampedY)
    },
    [selectedId, moveToken, w, h],
  )

  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        onClick={handleClick}
      >
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={groundColor} roughness={0.95} metalness={0.05} />
      </mesh>
      <Grid
        args={[w, h]}
        cellSize={1}
        cellThickness={0.6}
        sectionSize={5}
        sectionThickness={1.2}
        cellColor="#4a4a5a"
        sectionColor="#6b6b80"
        fadeDistance={60}
        fadeStrength={1}
        infiniteGrid={false}
        position={[0, 0.02, 0]}
      />
    </group>
  )
}

export default function TabletopScene({ map, tokens, selectedId, onSelect, moveToken }: SceneProps) {
  // Escape deselects.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onSelect(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onSelect])

  return (
    <div className="h-full w-full">
      <Canvas shadows camera={{ position: [15, 18, 28], fov: 45 }}>
        <color attach="background" args={[map.ambient_preset === "day" ? "#8db3d9" : "#0a0910"]} />
        <Lighting preset={map.ambient_preset} />

        <Ground map={map} selectedId={selectedId} moveToken={moveToken} />

        {tokens
          .filter((t) => t.is_visible !== false)
          .map((token) => (
            <TokenMesh
              key={token.id}
              token={token}
              gridWidth={map.grid_width}
              gridHeight={map.grid_height}
              selected={token.id === selectedId}
              onSelect={onSelect}
            />
          ))}

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI / 2.2}
          minDistance={5}
          maxDistance={60}
        />
      </Canvas>
    </div>
  )
}
