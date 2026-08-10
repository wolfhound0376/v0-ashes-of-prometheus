"use client"

import { useMemo, useRef } from "react"
import { useFrame, type ThreeEvent } from "@react-three/fiber"
import { Billboard, Text } from "@react-three/drei"
import type { Group } from "three"
import type { Token } from "./tabletop-client"

const SIZE_RADIUS: Record<string, number> = {
  tiny: 0.25,
  small: 0.35,
  medium: 0.4,
  large: 0.8,
  huge: 1.2,
  gargantuan: 1.6,
}

function tokenColor(token: Token): string {
  if (token.tint_color) return token.tint_color
  const type = token.characters?.character_type
  if (type === "player") return "#10b981"
  if (type === "monster") return "#ef4444"
  return "#f59e0b"
}

type Props = {
  token: Token
  gridWidth: number
  gridHeight: number
  selected: boolean
  onSelect: (id: string | null) => void
}

export function TokenMesh({ token, gridWidth, gridHeight, selected, onSelect }: Props) {
  const groupRef = useRef<Group>(null)
  const ringRef = useRef<Group>(null)

  const radius = SIZE_RADIUS[token.token_size ?? "medium"] ?? 0.4
  const color = useMemo(() => tokenColor(token), [token])

  // Target world position derived from the grid cell.
  const targetX = token.grid_x - gridWidth / 2 + 0.5
  const targetZ = token.grid_y - gridHeight / 2 + 0.5
  const targetY = token.elevation ?? 0

  const hpCurrent = token.characters?.hp_current
  const hpMax = token.characters?.hp_max
  const hasHp = typeof hpCurrent === "number" && typeof hpMax === "number" && hpMax > 0
  const hpRatio = hasHp ? Math.max(0, Math.min(1, hpCurrent! / hpMax!)) : 1
  const hpColor = `rgb(${Math.round(255 * (1 - hpRatio))}, ${Math.round(200 * hpRatio)}, 60)`

  const label = token.label || token.characters?.name || "?"

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const g = groupRef.current
    const speed = Math.min(1, delta * 8)
    g.position.x += (targetX - g.position.x) * speed
    g.position.z += (targetZ - g.position.z) * speed
    g.position.y += (targetY - g.position.y) * speed

    if (selected && ringRef.current) {
      const t = performance.now() / 1000
      const s = 1 + Math.sin(t * 4) * 0.12
      ringRef.current.scale.set(s, 1, s)
    }
  })

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect(selected ? null : token.id)
  }

  const pawnHeight = radius * 1.4

  return (
    <group ref={groupRef} position={[targetX, targetY, targetZ]}>
      {/* Selection ring */}
      {selected && (
        <group ref={ringRef} position={[0, 0.03, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[radius * 1.4, 0.06, 12, 40]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1.4} />
          </mesh>
        </group>
      )}

      {/* Pawn base */}
      <mesh
        position={[0, pawnHeight / 2, 0]}
        castShadow
        rotation={[0, token.rotation_y ?? 0, 0]}
        onClick={handleClick}
      >
        <cylinderGeometry args={[radius, radius * 1.1, pawnHeight, 24]} />
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
      </mesh>

      {/* Pawn head */}
      <mesh position={[0, pawnHeight + radius * 0.55, 0]} castShadow onClick={handleClick}>
        <sphereGeometry args={[radius * 0.7, 20, 20]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.25} />
      </mesh>

      {/* Label + HP bar, always facing camera */}
      <Billboard position={[0, pawnHeight + radius * 2.1, 0]}>
        <Text fontSize={0.35} color="#f5f5f5" anchorX="center" anchorY="bottom" outlineWidth={0.012} outlineColor="#000">
          {label}
        </Text>
        {hasHp && (
          <group position={[0, -0.12, 0]}>
            <mesh position={[0, 0, 0]}>
              <planeGeometry args={[1, 0.1]} />
              <meshBasicMaterial color="#1a1a1a" />
            </mesh>
            <mesh position={[-(1 - hpRatio) / 2, 0, 0.001]}>
              <planeGeometry args={[hpRatio, 0.09]} />
              <meshBasicMaterial color={hpColor} />
            </mesh>
          </group>
        )}
      </Billboard>
    </group>
  )
}
