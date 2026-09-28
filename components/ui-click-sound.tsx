"use client"

import { useEffect } from "react"
import { uiChime, uiKeyTap, uiTick } from "@/lib/ui-tick"

const WINDOW_OPENER = '[data-tick="window"], [aria-haspopup="dialog"], [aria-haspopup="true"], [aria-haspopup="menu"]'

const CLICKABLE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], summary, label[for], input[type="checkbox"], input[type="radio"], input[type="button"], input[type="submit"], select'

/** One listener for the whole app, so every clickable control ticks without each one opting in. */
export function UiClickSound() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const target = event.target as Element | null
      const control = target?.closest?.(CLICKABLE)
      if (!control || control.closest("[data-no-tick]")) return
      if (control.matches(":disabled, [aria-disabled='true']")) return
      // Sam, 2026-09-28: "an audible click like that from an Apple phone for
      // pressing buttons" — the iPhone key tap is now every button's sound.
      // The opt-outs stay: data-tick="click" keeps the dry tick (ability
      // cards), and window openers keep the chime.
      if (control.matches('[data-tick="click"]')) uiTick("firm")
      else if (control.matches(WINDOW_OPENER)) uiChime()
      else uiKeyTap()
    }
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true })
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true })
  }, [])
  return null
}
