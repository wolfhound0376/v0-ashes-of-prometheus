/**
 * Simplified vs full dashboard, remembered per browser.
 *
 * Simplified is the DEFAULT: a fresh seat opens on the quiet view. Sam's call —
 * most people at the table want the picture and their options, not nine panels.
 * The preference is per browser rather than per account, because "this laptop
 * is the TV in the corner" and "this laptop is the DM" are different machines
 * more often than they are different logins.
 *
 * Every storage touch is guarded: SSR-safe, and private mode never throws.
 * Same shape as lib/audio-prefs.ts, including the same-window CustomEvent —
 * the native `storage` event only reaches OTHER tabs.
 */

const KEY = "aop_dashboard_full"
const EVENT = "aop-view-mode"

export function isFullDashboard(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(KEY) === "true"
  } catch {
    return false
  }
}

export function setFullDashboard(full: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (full) window.localStorage.setItem(KEY, "true")
    else window.localStorage.removeItem(KEY)
  } catch {
    /* private mode — the event below still drives this session */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    /* no CustomEvent — nothing else to do */
  }
}

export function onViewModeChange(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const handler = () => fn()
  window.addEventListener(EVENT, handler)
  window.addEventListener("storage", handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener("storage", handler)
  }
}
