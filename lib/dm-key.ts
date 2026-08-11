// One place for the DM access code on the client.
//
// The code used to live in two places that did not talk to each other: /join
// wrote it to localStorage under "aop_forge_key" so the Forge importer could
// use it, while the NPC assets tab kept its own copy in React state and asked
// again with window.prompt after every reload. A DM working in a browser that
// had not been through /join got a silent 403 from the asset endpoints with no
// hint as to why.
//
// Everything now reads and writes the same localStorage entry, so the code is
// entered once per browser and remembered from then on. It cannot be shared
// ACROSS browsers — localStorage is per-origin, per-browser, and putting the
// code in a URL or a cookie readable by other sites would be worse than
// retyping it once.

export const DM_KEY_LS_KEY = "aop_forge_key"

/** Custom event so an unlock anywhere refreshes every mounted consumer. */
const DM_KEY_EVENT = "aop:dm-key-changed"

export function getDmKey(): string {
  if (typeof window === "undefined") return ""
  try {
    return window.localStorage.getItem(DM_KEY_LS_KEY) ?? ""
  } catch {
    // Private mode and hardened settings can throw on access.
    return ""
  }
}

export function hasDmKey(): boolean {
  return getDmKey().length > 0
}

export function setDmKey(value: string): void {
  if (typeof window === "undefined") return
  try {
    const trimmed = value.trim()
    if (trimmed) window.localStorage.setItem(DM_KEY_LS_KEY, trimmed)
    else window.localStorage.removeItem(DM_KEY_LS_KEY)
    window.dispatchEvent(new CustomEvent(DM_KEY_EVENT))
  } catch {
    /* nothing useful to do; the caller will see the next request fail */
  }
}

export function clearDmKey(): void {
  setDmKey("")
}

/** Subscribe to unlock/clear. Returns an unsubscribe function. */
export function onDmKeyChange(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(DM_KEY_EVENT, handler)
  // Another tab in the same browser writing the key fires "storage", not ours.
  const onStorage = (e: StorageEvent) => {
    if (e.key === DM_KEY_LS_KEY) handler()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(DM_KEY_EVENT, handler)
    window.removeEventListener("storage", onStorage)
  }
}

/** Header bag for the asset endpoints. Empty when no code is stored, which is
 *  correct: with DM_ACCESS_CODE unset server-side the routes stay open. */
export function dmHeaders(): Record<string, string> {
  const key = getDmKey()
  return key ? { "x-dm-key": key } : {}
}

/** Whether the server is actually enforcing the gate. */
export async function fetchDmGateEnabled(): Promise<boolean> {
  try {
    const res = await fetch("/api/claim-code", { cache: "no-store" })
    const gates = (await res.json()) as { dmGate?: boolean }
    return Boolean(gates.dmGate)
  } catch {
    // Assume enforced; the worst case is one unnecessary prompt.
    return true
  }
}

/** Return the stored code, prompting once and persisting it if absent.
 *  Returns null when the DM dismisses the prompt. */
export function ensureDmKey(purpose: string): string | null {
  const existing = getDmKey()
  if (existing) return existing
  if (typeof window === "undefined") return null
  const entered = window.prompt(`Enter the DM access code to ${purpose}`) || ""
  if (!entered.trim()) return null
  setDmKey(entered)
  return entered.trim()
}
