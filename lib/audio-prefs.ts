// A single, shared "music off" preference, honoured everywhere the campaign
// theme (and the intro video's own audio) can play.
//
// Default is MUSIC ON: the key is only ever present when the player has
// actively refused music, so a fresh browser plays as it always did. Every
// window/localStorage touch is guarded so this is SSR-safe and never throws in
// private mode.
//
// Writes go through setMusicOff, which also fires a same-window CustomEvent
// ("aop-music-pref") — the native `storage` event only reaches OTHER tabs, so
// components in the SAME tab need this to react immediately. Subscribers via
// onMusicPrefChange hear both.

const KEY = "aop_music_off"
const EVENT = "aop-music-pref"

export function isMusicOff(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(KEY) === "true"
  } catch {
    return false
  }
}

export function setMusicOff(off: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (off) window.localStorage.setItem(KEY, "true")
    else window.localStorage.removeItem(KEY)
  } catch {
    /* private mode — the in-memory event below still drives this session */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT))
  } catch {
    /* no CustomEvent — nothing else to do */
  }
}

/**
 * Subscribe to preference changes from this tab (the CustomEvent) AND other
 * tabs (the native storage event). Returns an unsubscribe function.
 */
export function onMusicPrefChange(fn: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) fn()
  }
  window.addEventListener(EVENT, fn)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener("storage", onStorage)
  }
}
