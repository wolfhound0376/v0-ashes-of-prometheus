"use client"

// The two camp pages that began life as claude.ai artifacts — "Camp at the
// Fire" and "Underdark Scenes" — served same-origin from public/camp/ and
// shown full-screen in the app. Their saved state (Map maker layouts, rooms
// explored, playtest notes, tuning) goes through public/camp/claude-shim.js to
// /api/camp/docs, so it is shared across every device.

import { useEffect, useState } from "react"
import Link from "next/link"
import { StageLink } from "@/components/stage/stage-provider"
import { ArrowLeft, Flame } from "lucide-react"
import { cn } from "@/lib/utils"
import { hasDmKey } from "@/lib/dm-key"
import { useCampVerdict } from "@/lib/hooks/use-camp-verdict"

const PAGES = [
  { href: "/camp", label: "Camp at the Fire", src: "/camp/fire/index.html" },
  { href: "/camp/scenes", label: "Painted Scenes", src: "/camp/scenes/index.html" },
] as const

export function CampFrame({ page }: { page: "/camp" | "/camp/scenes" }) {
  const current = PAGES.find((p) => p.href === page)!
  // Camp is made on the travel map only (Sam, 2026-10-14). Inside a place's
  // node map the fire stays out; the DM may still open it to test.
  const verdict = useCampVerdict()
  const [dm, setDm] = useState(false)
  const [override, setOverride] = useState(false)
  useEffect(() => setDm(hasDmKey()), [])
  const barred = page === "/camp" && verdict !== null && !verdict.allowed && !override
  return (
    <div className="flex h-dvh flex-col bg-[#07060a] text-[#efe4cf]">
      <nav className="flex flex-wrap items-center gap-2 border-b border-[#7a6238]/60 px-3 py-2 font-serif text-xs tracking-widest">
        <StageLink
          href="/"
          className="flex items-center gap-1 rounded border border-[#7a6238] px-3 py-1.5 uppercase text-[#e3b95c] hover:border-[#e3b95c]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </StageLink>
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
      {barred ? (
        <div className="grid flex-1 place-items-center p-6">
          <div className="max-w-md rounded border border-[#7a6238] bg-[#0e0c14] p-6 text-center font-serif">
            <Flame className="mx-auto h-6 w-6 text-[#6f624b]" />
            <h1 className="mt-3 text-sm uppercase tracking-[.2em] text-[#e3b95c]">No fire here</h1>
            <p className="mt-3 text-sm leading-relaxed text-[#cfc3a8]">{verdict?.reason}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs uppercase tracking-widest">
              <StageLink href="/" className="rounded border border-[#7a6238] px-3 py-1.5 text-[#e3b95c] hover:border-[#e3b95c]">
                Back to the dashboard
              </StageLink>
              {dm ? (
                <button type="button" onClick={() => setOverride(true)} className="rounded border border-[#3a3040] px-3 py-1.5 text-[#a89a80] hover:border-[#7a6238] hover:text-[#efe4cf]">
                  Open anyway (DM)
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
      <iframe
        key={current.src}
        src={current.src}
        title={current.label}
        className="min-h-0 w-full flex-1 border-0"
        allow="autoplay; fullscreen"
      />
      )}
    </div>
  )
}
