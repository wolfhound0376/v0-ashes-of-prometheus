"use client"

// /battle — the combat board, full screen.
//
// It lived inside the dashboard's stage window first, and Sam's verdict was
// immediate: "too cluttered and it's really dark, can't see anything." He was
// right on both. A 3D board squeezed into a 500-px strip between nine panels
// has no room to orbit, and the stage's own toolbar, tabs and gradients sat
// on top of it. The board is a place you GO, like /map — the whole viewport,
// nothing else fighting for it.

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import CombatBoard3D from "@/components/tactical/combat-board-3d"

function BattleBoardPage() {
  const router = useRouter()
  const sandbox = useSearchParams().get("sandbox") === "1"
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#020204]">
      {sandbox && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-40 -translate-x-1/2 rounded-b border border-t-0 border-[#7a5c2b] bg-[#2a1f10]/95 px-4 py-1 font-serif text-[10px] uppercase tracking-[0.25em] text-[#f0cd7a]">
          Rehearsal — nothing here is canon
        </div>
      )}
      <CombatBoard3D sandbox={sandbox} onBack={() => router.push("/")} />
    </div>
  )
}

// useSearchParams forces this subtree to render on the client; without a
// Suspense boundary the App Router fails the build at prerender time.
export default function BattlePage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen bg-[#020204]" />}>
      <BattleBoardPage />
    </Suspense>
  )
}
