"use client"

// INSTALL THE GAME — the small link on the title (Sam, 2026-11-23, "PR6"). The rule is lib/install-app.ts; the
// manifest is app/manifest.ts. Chrome and Edge get the browser's own install prompt; iPhone and iPad Safari get the
// three Add to Home Screen steps; an installed copy, and a browser that cannot install sites, see nothing.

import { useEffect, useState } from "react"
import { Download, X } from "lucide-react"
import { INSTALL_TEXT, installWay, type InstallWay } from "@/lib/install-app"

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

function isStandalone(): boolean {
  try {
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

export function InstallAppLink({ className }: { className?: string }) {
  const [prompt, setPrompt] = useState<PromptEvent | null>(null)
  const [way, setWay] = useState<InstallWay>("none")
  const [steps, setSteps] = useState(false)

  useEffect(() => {
    const decide = (p: PromptEvent | null) =>
      setWay(installWay({ standalone: isStandalone(), hasPrompt: Boolean(p), userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints }))
    decide(null)
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); decide(e as PromptEvent) }
    const onInstalled = () => { setPrompt(null); setWay("installed") }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  if (way === "none" || way === "installed") return null

  const press = async () => {
    if (way === "ios") { setSteps(true); return }
    if (!prompt) return
    await prompt.prompt()
    const choice = await prompt.userChoice.catch(() => null)
    setPrompt(null)                                    // a prompt can be raised once
    setWay(choice?.outcome === "accepted" ? "installed" : "none")
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void press()}
        title="Its own icon on your taskbar or home screen, full screen, always the latest version"
        className={className ?? "group flex items-center gap-2 text-[10px] uppercase tracking-[0.35em] text-stone-600 transition-colors hover:text-[#c9a868]"}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full border border-stone-700 text-stone-500 transition-colors group-hover:border-[#c9a868] group-hover:text-[#e8c56a]"><Download className="h-3 w-3" /></span>
        {INSTALL_TEXT.link}
      </button>
      {steps && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={INSTALL_TEXT.iosTitle}>
          <button type="button" aria-label="Close" onClick={() => setSteps(false)} className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />
          <div className="relative w-full max-w-sm rounded-t-md border border-[#7a5f33]/70 bg-gradient-to-b from-[#15110c] to-[#0b0907] p-6 sm:rounded-md">
            <button type="button" aria-label="Close" onClick={() => setSteps(false)} className="absolute right-3 top-3 text-stone-500 hover:text-[#e8c56a]"><X className="h-4 w-4" /></button>
            <div className="mb-4 flex items-center gap-3">
              <img src="/icons/icon-192.png" alt="" className="h-12 w-12 rounded-[22%]" />
              <div className="font-serif text-[15px] tracking-[0.06em] text-[#e8d9ae]">{INSTALL_TEXT.iosTitle}</div>
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-stone-400">
              {INSTALL_TEXT.iosSteps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
        </div>
      )}
    </>
  )
}
