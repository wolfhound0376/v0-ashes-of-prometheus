"use client"

// The two camp pages that began life as claude.ai artifacts — "Camp at the
// Fire" and "Underdark Scenes" — served same-origin from public/camp/ and
// shown full-screen in the app. Their saved state (Map maker layouts, rooms
// explored, playtest notes, tuning) goes through public/camp/claude-shim.js to
// /api/camp/docs, so it is shared across every device.

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { cn } from "@/lib/utils"

const PAGES = [
  { href: "/camp", label: "Camp at the Fire", src: "/camp/fire/index.html" },
  { href: "/camp/scenes", label: "Painted Scenes", src: "/camp/scenes/index.html" },
] as const

export function CampFrame({ page }: { page: "/camp" | "/camp/scenes" }) {
  const current = PAGES.find((p) => p.href === page)!
  return (
    <div className="flex h-dvh flex-col bg-[#07060a] text-[#efe4cf]">
      <nav className="flex flex-wrap items-center gap-2 border-b border-[#7a6238]/60 px-3 py-2 font-serif text-xs tracking-widest">
        <Link
          href="/"
          className="flex items-center gap-1 rounded border border-[#7a6238] px-3 py-1.5 uppercase text-[#e3b95c] hover:border-[#e3b95c]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            aria-current={p.href === page ? "page" : undefined}
            className={cn(
              "rounded border px-3 py-1.5 uppercase",
              p.href === page
                ? "border-[#e3b95c] text-[#e3b95c]"
                : "border-[#3a3040] text-[#a89a80] hover:border-[#7a6238] hover:text-[#efe4cf]",
            )}
          >
            {p.label}
          </Link>
        ))}
      </nav>
      <iframe
        key={current.src}
        src={current.src}
        title={current.label}
        className="min-h-0 w-full flex-1 border-0"
        allow="autoplay; fullscreen"
      />
    </div>
  )
}
