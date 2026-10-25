// Player settings that live on the device: the things a person wants to decide
// ONCE and never be asked about again.
//
// Sam, 2026-10-24: "I also should be able to have an option to not have
// cinematics or intro scores." Two switches, both defaulting ON for a fresh
// browser so the first visit is the full show, and both remembered here so the
// second visit is whatever that person chose:
//
//   cinematics  — the opening film on the title screen and the dream / title /
//                 waker / laugh beats of /awaken. OFF means a still and a line
//                 of text instead; the fortune ROLL is gameplay, not cinema,
//                 and always runs.
//   introMusic  — the title theme and the "Dark and Stormy" bed under the
//                 opening. OFF silences those scores only; game sound effects
//                 and the dashboard's own music are not touched. The older,
//                 global "music off" (lib/audio-prefs.ts) still wins when set.
//
// Every storage touch is guarded (SSR, private mode, hardened browsers), and a
// write fires a same-window CustomEvent — the native `storage` event only
// reaches OTHER tabs — so a sheet and the page behind it agree at once.

export interface PlayerSettings {
  cinematics: boolean
  introMusic: boolean
}

export const SETTINGS_KEY = "aop_settings_v1"
const EVENT = "aop-settings"

export const DEFAULT_SETTINGS: PlayerSettings = { cinematics: true, introMusic: true }

/** Parse whatever is in storage into a full settings object. Anything odd falls back to the defaults
 *  field by field, so one bad key never costs the other. Exported for tests. */
export function parseSettings(raw: string | null | undefined): PlayerSettings {
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== "object") return { ...DEFAULT_SETTINGS }
    return {
      cinematics: typeof v.cinematics === "boolean" ? v.cinematics : DEFAULT_SETTINGS.cinematics,
      introMusic: typeof v.introMusic === "boolean" ? v.introMusic : DEFAULT_SETTINGS.introMusic,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function readSettings(): PlayerSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS }
  try {
    return parseSettings(window.localStorage.getItem(SETTINGS_KEY))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function writeSettings(patch: Partial<PlayerSettings>): PlayerSettings {
  const next = { ...readSettings(), ...patch }
  if (typeof window === "undefined") return next
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    /* private mode — the event below still drives this session */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    /* no CustomEvent — nothing else to do */
  }
  return next
}

/** Cinematics on for this device? (Convenience for the pages that play them.) */
export function cinematicsOn(): boolean {
  return readSettings().cinematics
}

/** Intro score allowed on this device? Both switches must agree: this one and the older global mute. */
export function introMusicOn(): boolean {
  if (!readSettings().introMusic) return false
  if (typeof window === "undefined") return true
  try {
    // lib/audio-prefs.ts stores its refusal under this key; honour it without importing a cycle.
    return window.localStorage.getItem("aop_music_off") !== "true"
  } catch {
    return true
  }
}

/** Subscribe to settings changes from this tab and others. Returns an unsubscribe function. */
export function onSettingsChange(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === SETTINGS_KEY || e.key === "aop_music_off" || e.key === null) fn()
  }
  window.addEventListener(EVENT, fn)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener("storage", onStorage)
  }
}
