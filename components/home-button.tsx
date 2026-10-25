"use client"

// The way home. Sam, 2026-10-25: "There should be a button in the top right somewhere to quickly go back the main
// screen from anywhere in the forge or similar areas." Fixed in the top-right corner of the pages before the game
// (the Forge and its steps, the importer, the builder, /join, /dm), just left of the music toggle, and always the
// same: a small gold pill back to /intro, the title screen. Nothing is lost by pressing it: the Forge keeps its
// draft on the device (aop_forge_draft_v1), so Start New Game picks up where the player left off.

import Link from "next/link"
import { Home } from "lucide-react"
import { cn } from "@/lib/utils"

export const MAIN_SCREEN = "/intro"

export function HomeButton({ className }: { className?: string }) {
  return (
    <Link
      href={MAIN_SCREEN}
      title="Back to the main screen"
      aria-label="Back to the main screen"
      className={cn(
        "fixed right-16 top-4 z-50 inline-flex h-9 items-center gap-2 rounded-full border border-[#8a6a3a]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] px-3.5 text-[11px] uppercase tracking-[0.22em] text-[#c4a777] shadow-lg shadow-black/40 transition-colors hover:border-[#c4a777] hover:text-[#e8c56a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c4a777]",
        className,
      )}
    >
      <Home className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">Main screen</span>
    </Link>
  )
}
