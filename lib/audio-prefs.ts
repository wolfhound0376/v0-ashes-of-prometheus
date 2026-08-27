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

// Whether the listener has ever pressed play. Separate from the mute pref
// above, and it has to be separate: "off" is a refusal, this is consent.
//
// Browsers will not start audio without a user gesture, so playback begins
// disabled on every mount. That was fine when the dashboard was the only page
// with music — you pressed play once and stayed. It is not fine now: a DM is
// navigated to /battle the moment a fight starts, which mounts a fresh player
// that has forgotten, and the fight — the one scene with its own commissioned
// track — begins in silence. Every reload did the same thing.
//
// Remembering consent is what lets the next page start on its own.
const STARTED_KEY = "aop_music_on"

export function isMusicStarted(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STARTED_KEY) === "true"
  } catch {
    return false
  }
}

export function setMusicStarted(on: boolean): void {
  if (typeof window === "undefined") return
  try {
    if (on) window.localStorage.setItem(STARTED_KEY, "true")
    else window.localStorage.removeItem(STARTED_KEY)
  } catch {
    /* private mode — this session still plays, it just will not be remembered */
  }
}

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
