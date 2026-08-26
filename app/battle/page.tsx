"use client"

// /battle — the combat board, full screen.
//
// It lived inside the dashboard's stage window first, and Sam's verdict was
// immediate: "too cluttered and it's really dark, can't see anything." He was
// right on both. A 3D board squeezed into a 500-px strip between nine panels
// has no room to orbit, and the stage's own toolbar, tabs and gradients sat
// on top of it. The board is a place you GO, like /map — the whole viewport,
// nothing else fighting for it.

import { useRouter } from "next/navigation"
import CombatBoard3D from "@/components/tactical/combat-board-3d"

export default function BattlePage() {
  const router = useRouter()
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020204]">
      <CombatBoard3D onBack={() => router.push("/")} />
    </div>
  )
}
