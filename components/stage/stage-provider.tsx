"use client"

// components/stage/stage-provider.tsx
//
// The one stage. Mounted once in app/layout.tsx, it owns every move between the game's places
// (the table, the painted scene, the map, camp, the battle board) so that:
//
//   - a move is a soft navigation, never a page load — the theme music and this provider survive it;
//   - the move is drawn from what the player was looking at (lib/stage.ts has the grammar);
//   - Malachar's caption stays on screen through the move;
//   - the table moves together: the move is written to sessions.stage and other browsers follow;
//   - film is a mode too (Sam, 2026-10-14): a clip grows out of the stage window, plays once, and
//     shrinks back, on every page. Checks fire it through lib/check-cue.ts; Malachar's own cues and
//     the dashboard's look-around chip call `film()` directly.
//
// Pages ask for a move with `useStage().go("/map", { from: element, caption })`. Nothing here
// decides WHETHER a move is legal — that is lib/game-context.ts and the server. This only draws it.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  STAGE_ROUTES, durationsFor, modeForPath, shouldFollow, transitionFor,
  type StageMode, type StageRecord, type TransitionKind,
} from "@/lib/stage"
import { onCheckCue, type CheckCue } from "@/lib/check-cue"
import { readPlayed, rememberPlayed, shouldPlay } from "@/lib/cinematic-replay"

export type GoOptions = {
  /** The element the move starts from (the stage window). Defaults to `[data-stage-window]` on the page. */
  from?: HTMLElement | null
  /** A picture to carry through the move. Defaults to the first <img> inside `from`. */
  image?: string | null
  /** Malachar's line for the move. Stays on screen until the move lands, then fades. */
  caption?: string
  /** Write the move to the shared record so the rest of the table follows (default true). */
  share?: boolean
  /** Use router.replace instead of push. */
  replace?: boolean
}

export type FilmOptions = {
  /** The clip to roll (cinematic_clips.video_url). */
  url: string
  /** Malachar's line, carried through the film. */
  caption?: string
  /** A party clip is written to sessions.stage so every browser rolls it; a solo clip plays here only. */
  scope?: "solo" | "party"
  /** Write the move to the shared record (default: true for party, never for solo). The dashboard's own broadcast passes false. */
  share?: boolean
  /** The element the film grows out of. Defaults to `[data-stage-window]`, else a dip through black. */
  from?: HTMLElement | null
  /** What cued it, for the shared record. */
  cue?: string
}

type StageApi = {
  mode: StageMode
  busy: boolean
  go: (href: string, opts?: GoOptions) => Promise<void>
  /** Roll a clip over the current page: grow out of the stage window, play once, shrink back. */
  film: (opts: FilmOptions) => Promise<void>
  caption: (text: string, who?: string) => void
}

const Ctx = createContext<StageApi | null>(null)

export function useStage(): StageApi {
  const v = useContext(Ctx)
  if (!v) throw new Error("useStage() needs <StageProvider> in the root layout")
  return v
}

/** Stable per-browser id so a browser never follows its own move. */
function selfId(): string {
  try {
    const k = "aop_stage_self"
    let v = sessionStorage.getItem(k)
    if (!v) { v = Math.random().toString(36).slice(2, 10); sessionStorage.setItem(k, v) }
    return v
  } catch { return "anon" }
}

type Rect = { x: number; y: number; w: number; h: number; r: number }

function viewport(): Rect { return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight, r: 0 } }
function rectOf(el: HTMLElement | null | undefined): Rect | null {
  if (!el) return null
  const b = el.getBoundingClientRect()
  if (b.width < 8 || b.height < 8) return null
  return { x: b.left, y: b.top, w: b.width, h: b.height, r: parseFloat(getComputedStyle(el).borderRadius) || 0 }
}
function medallion(): Rect { const d = 56; return { x: window.innerWidth / 2 - d / 2, y: window.innerHeight / 2 - d / 2, w: d, h: d, r: d / 2 } }
function css(r: Rect) { return { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px", borderRadius: r.r + "px" } }
function place(el: HTMLElement, r: Rect) { Object.assign(el.style, css(r)) }
function morph(el: HTMLElement, from: Rect, to: Rect, ms: number, easing = "cubic-bezier(.6,0,.2,1)") {
  const a = el.animate([css(from), css(to)], { duration: ms, easing, fill: "forwards" })
  return a.finished.then(() => { place(el, to); a.cancel() }).catch(() => { place(el, to) })
}
function fade(el: HTMLElement, from: number, to: number, ms: number) {
  const a = el.animate([{ opacity: from }, { opacity: to }], { duration: ms, fill: "forwards" })
  return a.finished.then(() => { el.style.opacity = String(to); a.cancel() }).catch(() => { el.style.opacity = String(to) })
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
function pictureIn(el: HTMLElement | null | undefined): string | null {
  if (!el) return null
  const img = el.querySelector("img") as HTMLImageElement | null
  if (img?.currentSrc || img?.src) return img.currentSrc || img.src
  const vid = el.querySelector("video") as HTMLVideoElement | null
  if (vid?.poster) return vid.poster
  const bg = getComputedStyle(el).backgroundImage
  const m = bg && /url\(["']?(.+?)["']?\)/.exec(bg)
  return m ? m[1] : null
}

export function StageProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const mode = useMemo(() => modeForPath(pathname), [pathname])
  const [busy, setBusy] = useState(false)
  const [cap, setCap] = useState<{ who: string; text: string } | null>(null)
  const layer = useRef<HTMLDivElement>(null)
  const pic = useRef<HTMLImageElement>(null)
  const vid = useRef<HTMLVideoElement>(null)
  const filmDone = useRef<(() => void) | null>(null)
  const landing = useRef<{ kind: TransitionKind; to: StageMode; resolve: () => void; inMs: number } | null>(null)
  const capTimer = useRef<number | null>(null)
  const reduced = useRef(false)
  useEffect(() => { reduced.current = matchMedia("(prefers-reduced-motion: reduce)").matches }, [])

  const caption = useCallback((text: string, who = "Malachar") => {
    if (capTimer.current) window.clearTimeout(capTimer.current)
    setCap(text ? { who, text } : null)
  }, [])

  // The second half of a move plays once the new page is on screen. The pathname changing is the signal.
  useEffect(() => {
    const L = landing.current
    if (!L || !layer.current) return
    landing.current = null
    const el = layer.current
    const ms = L.inMs
    const run = async () => {
      // Give the new page a frame to lay out, so [data-stage-window] has a size.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      const win = document.querySelector("[data-stage-window]") as HTMLElement | null
      const winRect = rectOf(win)
      if (L.kind === "shrink" && winRect) {
        // the full picture shrinks back into the table's stage window
        const src = pictureIn(win)
        if (src && pic.current) { pic.current.src = src; pic.current.style.opacity = "1" }
        await morph(el, viewport(), winRect, ms)
        await fade(el, 1, 0, 180)
      } else if (L.kind === "medallion") {
        // the medallion sits on the map for a beat while the camera settles, then goes
        await wait(Math.min(ms, 600))
        await fade(el, 1, 0, Math.max(200, ms - 600))
      } else {
        // grow, dive, dip: the new place is already underneath — dissolve into it
        await fade(el, 1, 0, ms)
      }
      el.style.display = "none"
      if (pic.current) pic.current.style.opacity = "0"
      setBusy(false)
      L.resolve()
      capTimer.current = window.setTimeout(() => setCap(null), 4500)
    }
    void run()
  }, [pathname])

  const go = useCallback(async (href: string, opts: GoOptions = {}) => {
    const el = layer.current
    if (!el) { router.push(href); return }
    if (busy) return
    const from = mode
    const to = modeForPath(href)
    const kind = transitionFor(from, to)
    const d = durationsFor(kind, reduced.current)
    setBusy(true)
    if (opts.caption) caption(opts.caption)

    // share the move with the table (fire and forget; the record is best-effort)
    if (opts.share !== false && to !== "other" && to !== "battle") {
      const rec: StageRecord = { mode: to, by: selfId(), at: new Date().toISOString(), caption: opts.caption }
      fetch("/api/stage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rec) }).catch(() => {})
    }

    const srcEl = opts.from ?? (document.querySelector("[data-stage-window]") as HTMLElement | null)
    const srcRect = rectOf(srcEl)
    const image = opts.image ?? pictureIn(srcEl)
    el.style.display = "block"
    el.style.opacity = "1"
    if (pic.current) { pic.current.src = image ?? ""; pic.current.style.opacity = image ? "1" : "0" }

    // the first half: leave what you were looking at
    if (kind === "grow" && srcRect) {
      place(el, srcRect)
      await morph(el, srcRect, viewport(), d.out)
    } else if (kind === "medallion") {
      place(el, viewport())
      await morph(el, viewport(), medallion(), d.out)
    } else if (kind === "dive") {
      // a dark iris closes in on the party, then opens out again on camp
      place(el, viewport())
      el.style.opacity = "0"
      el.style.clipPath = "circle(0% at 50% 50%)"
      el.style.opacity = "1"
      const a = el.animate([{ clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)" }], { duration: d.out, easing: "cubic-bezier(.6,0,.2,1)", fill: "forwards" })
      await a.finished.catch(() => {})
      el.style.clipPath = ""
      a.cancel()
    } else {
      // shrink and dip start with a short dip to black over the old page
      place(el, viewport())
      el.style.opacity = "0"
      await fade(el, 0, 1, d.out)
    }

    // the second half runs when the new pathname arrives (see the effect above)
    const done = new Promise<void>((resolve) => { landing.current = { kind, to, resolve, inMs: d.in } })
    try { sessionStorage.setItem("aop_intro_seen", "1") } catch {}
    if (opts.replace) router.replace(href); else router.push(href)
    // never leave a black screen behind if the page does not change (same route, failed push)
    const guard = window.setTimeout(() => {
      if (landing.current) { landing.current = null; el.style.display = "none"; setBusy(false) }
    }, d.out + d.in + 4000)
    await done
    window.clearTimeout(guard)
  }, [busy, caption, mode, router])

  // FILM. A moment, not a place: no route changes. The layer grows out of the stage window
  // (or dips through black where there is none), the clip plays once, muted — the house rule,
  // Tabletop Audio owns sound — and the layer shrinks back to where it came from. Click, Escape
  // or the clip's end all bring the page back; nothing loops.
  const film = useCallback(async (opts: FilmOptions) => {
    const el = layer.current
    const v = vid.current
    if (!el || !v || !opts.url) return
    if (busy) return
    const scope = opts.scope ?? "solo"
    const d = durationsFor("grow", reduced.current)
    const back = durationsFor("shrink", reduced.current)
    setBusy(true)
    if (opts.caption) caption(opts.caption)
    if (scope === "party" && opts.share !== false) {
      const rec: StageRecord = { mode: "film", by: selfId(), at: new Date().toISOString(), caption: opts.caption, clip: opts.url, cue: opts.cue }
      fetch("/api/stage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(rec) }).catch(() => {})
    }

    const srcEl = opts.from ?? (document.querySelector("[data-stage-window]") as HTMLElement | null)
    const srcRect = rectOf(srcEl)
    if (pic.current) pic.current.style.opacity = "0"
    v.src = opts.url
    v.style.opacity = "1"
    el.style.display = "block"
    el.style.pointerEvents = "auto"
    el.style.cursor = "pointer"
    if (srcRect) {
      place(el, srcRect)
      el.style.opacity = "1"
      void v.play().catch(() => {})
      await morph(el, srcRect, viewport(), d.out)
    } else {
      place(el, viewport())
      el.style.opacity = "0"
      await fade(el, 0, 1, d.out)
      void v.play().catch(() => {})
    }

    // wait for the end of the clip, a click, or Escape
    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => { if (settled) return; settled = true; cleanup(); resolve() }
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") done() }
      const cleanup = () => {
        v.removeEventListener("ended", done); v.removeEventListener("error", done)
        el.removeEventListener("click", done); window.removeEventListener("keydown", onKey)
        filmDone.current = null
      }
      filmDone.current = done
      v.addEventListener("ended", done); v.addEventListener("error", done)
      el.addEventListener("click", done); window.addEventListener("keydown", onKey)
      // a clip the browser cannot decode fires neither `playing` nor `error` (headless Chromium
      // and H.264, for one): if nothing is moving after ten seconds, give the page back
      let started = false
      v.addEventListener("playing", () => { started = true }, { once: true })
      window.setTimeout(() => { if (!started) done() }, 10 * 1000)
      // and a clip that never fires `ended` (a stalled network) still lets the table go
      window.setTimeout(done, 5 * 60 * 1000)
    })

    v.pause()
    el.style.pointerEvents = "none"
    el.style.cursor = ""
    if (srcRect) {
      await morph(el, viewport(), srcRect, back.in)
      await fade(el, 1, 0, 180)
    } else {
      await fade(el, 1, 0, back.in)
    }
    v.style.opacity = "0"
    v.removeAttribute("src"); v.load()
    el.style.display = "none"
    setBusy(false)
    capTimer.current = window.setTimeout(() => setCap(null), 4500)
  }, [busy, caption])

  // Rule 4: the table moves together. Follow the shared record when another browser moves.
  const goRef = useRef(go); goRef.current = go
  const filmRef = useRef(film); filmRef.current = film
  const modeRef = useRef(mode); modeRef.current = mode
  useEffect(() => {
    const supabase = createClient()
    const self = selfId()
    const ch = supabase
      .channel("stage-follow")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions" }, (payload: { new?: Record<string, unknown> }) => {
        const rec = (payload.new?.stage ?? null) as StageRecord | null
        if (!shouldFollow(rec, self, modeRef.current)) return
        if (rec!.mode === "film") {
          void filmRef.current({ url: rec!.clip!, caption: rec!.caption, scope: "party", share: false, cue: rec!.cue })
          return
        }
        const href = STAGE_ROUTES[rec!.mode as Exclude<StageMode, "other">]
        if (href) void goRef.current(href, { share: false, caption: rec!.caption })
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [])

  // THE THIRD DOOR (lib/check-cue.ts): a check resolved somewhere on the page and named its
  // moment. Ask the server for film the same way the dashboard asks for Malachar's cues —
  // event_driven, never an override — and roll what comes back. Nothing here decides whether
  // there is film, whether this character has seen it, or whether it is solo or party.
  useEffect(() => {
    return onCheckCue((cue: CheckCue) => {
      void (async () => {
        let seat: string | null = null
        try { seat = localStorage.getItem("aop_character_id") } catch {}
        const params = new URLSearchParams({ location: cue.location || "generic", state: cue.state, kind: "action", scope: cue.scope, trigger_type: "event_driven" })
        if (seat) params.set("character_id", seat)
        try {
          const res = await fetch(`/api/cinematics?${params.toString()}`)
          if (!res.ok) return
          const body = await res.json()
          const clip = body?.clip as { id?: string; video_url?: string; scope?: string } | null
          if (!clip?.video_url) return // no film for this check here, or already seen: the ordinary outcome
          const clipId = clip.id ?? clip.video_url
          if (!shouldPlay({ clipId, characterId: seat, trigger: "event_driven", playedHere: readPlayed() })) return
          if (!seat) rememberPlayed(clipId)
          const scope = clip.scope === "party" || clip.scope === "solo" ? clip.scope : cue.scope
          await filmRef.current({ url: clip.video_url, caption: cue.caption, scope, cue: cue.state })
        } catch {
          /* the check stands; the film was never promised */
        }
      })()
    })
  }, [])

  const api = useMemo<StageApi>(() => ({ mode, busy, go, film, caption }), [mode, busy, go, film, caption])

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* the layer that travels between modes */}
      <div
        ref={layer}
        aria-hidden="true"
        style={{ display: "none", position: "fixed", left: 0, top: 0, width: 0, height: 0, zIndex: 9990, overflow: "hidden", background: "#050403", boxShadow: "0 0 0 1px #c49b4e, 0 0 40px #000", pointerEvents: "none" }}
      >
        <img ref={pic} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0 }} />
        {/* film: plays once, muted (Tabletop Audio owns sound), never loops */}
        <video ref={vid} muted playsInline preload="auto" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0, background: "#000" }} />
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 70%, transparent 30%, #050403cc 95%)" }} />
      </div>
      {/* Malachar's voice is the thread: the caption outlives the page it was spoken on */}
      <div
        aria-live="polite"
        style={{
          position: "fixed", left: "50%", bottom: 28, transform: "translateX(-50%)", width: "min(880px, calc(100vw - 32px))", textAlign: "center",
          zIndex: 9995, opacity: cap ? 1 : 0, transition: "opacity .6s ease", pointerEvents: "none",
        }}
      >
        {cap ? (
          <>
            <b style={{ display: "block", fontFamily: "var(--font-serif), Cinzel, serif", fontSize: 11, letterSpacing: ".24em", color: "#c58cff", textTransform: "uppercase", marginBottom: 2 }}>{cap.who}</b>
            <span style={{ fontFamily: "var(--font-sans), 'Crimson Text', serif", fontSize: 21, fontStyle: "italic", color: "#f2e8d6", textShadow: "0 2px 6px #000, 0 0 20px #000" }}>{cap.text}</span>
          </>
        ) : null}
      </div>
    </Ctx.Provider>
  )
}

/**
 * A link that moves the stage instead of reloading the page. Drop-in for the "← Dashboard" style
 * links on the map, camp and scene pages: same href, same classes, soft move.
 */
export function StageLink({ href, caption, from, className, children, ...rest }: {
  href: string; caption?: string; from?: () => HTMLElement | null; className?: string; children: ReactNode
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  const stage = useStage()
  return (
    <a
      href={href}
      className={className}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return // let a new tab be a new tab
        e.preventDefault()
        void stage.go(href, { caption, from: from?.() ?? undefined })
      }}
    >
      {children}
    </a>
  )
}
