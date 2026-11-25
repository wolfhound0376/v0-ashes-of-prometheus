"use client"

// /intro — the TITLE SCREEN. The front door of Ashes of Prometheus.
//
// Sam, 2026-10-24: "The intro to most players should have a start new game and then route you
// immediately into character creation", "Play Saved Game … will ask for your code", and the DM
// entrance "should only be an administrative way with the code."
//
// THE DOOR READS THE TABLE (Sam, 2026-11-10; lib/title-door.ts; project doc
// claude/One_Door_Entry_Flow_2026-11-10.md). It asks /api/table what the table is doing and puts one
// obvious button first, re-reading every few seconds so the button changes the moment the table opens:
//
// ONE DOOR (Sam, 2026-11-25: "Remove Continue from the intro and load game. Joining a Table should get you to the
// appropriate load game or new game."; rule in lib/title-door.ts). Two sections:
//   PLAYERS   JOIN A TABLE  the four-letter room code → /t/<code>, which asks a newcomer for their words or a new
//                           hero. On a device that already holds a hero, an empty box and the arrow go where
//                           Continue used to (your seat, the game, or the table to wait).
//   HOSTING   below a rule, smaller: HOST A TABLE (via /dm, or straight to the table for the host), where New Game
//             and the saved games both live; and, for a host mid-session, the quiet link The Table.
// Gone: Continue, New Campaign / Load Game, the "table is dark" pill. Rehearsal is a row in Settings (the gear).
// "Watch the opening" sits under the ASHES OF PROMETHEUS title on a wide screen, under the menu's own heading on a
// phone.
//
// THE TITLE FILM (Sam, 2026-11-25: "Replace the song and the image still of the Title landing page with this new
// video loop … Make sure that like the title page all that there is a title and button options in the same format
// as before"). Behind the menu, in place of the old painting: the party attacks the lich and it does nothing, the
// camera closes on him as he clenches his fist, charges his staff and laughs, and it comes to rest on a still of the
// lich alone, where the title lettering (cut from the old painting, same font) writes itself in. The menu is there
// from the first frame, so nobody waits on the film. It plays once per visit to this page; with Cinematics off, or
// reduced motion, the page opens on the still with the title already up. The film file carries only the storm (thunder);
// the song is the theme element, and both follow the Intro music switch.

// The opening film plays once per DEVICE per CAMPAIGN RUN — a New Game earns one more showing, and
// "Watch the opening" brings it back — click anywhere or Skip, and only while Cinematics is ON in
// the settings sheet (bottom-right gear, lib/settings.ts). It used to replay every browser session,
// i.e. every game night (Sam, 2026-10-11: sitting through the intro every time is annoying). The
// title score follows the Intro music switch the same way.

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Settings, Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"
import { getThemeAudio, playThemeAudio } from "@/components/theme-audio"
import { SettingsSheet } from "@/components/settings-sheet"
import { InstallAppLink } from "@/components/install-app"
import { isMusicOff, onMusicPrefChange, setMusicOff } from "@/lib/audio-prefs"
import { cinematicsOn, introMusicOn, onSettingsChange } from "@/lib/settings"
import { markDmDoor } from "@/lib/dm-door"
import { createClient } from "@/lib/supabase/client"
import { doorMenu, doorTableOf, shouldPlayFilm, FILM_RUN_KEY, FILM_RUN_UNKNOWN, type DoorButton, type DoorTable } from "@/lib/title-door"
import { DOOR_INTENT_KEY, intentValue } from "@/lib/door-intent"
import { normalizeRoomCode } from "@/lib/room-code"

const FILM_SEEN_KEY = "aop_title_film_seen" // sessionStorage: never twice in one browser session
const TABLE_POLL_MS = 5000 // how often the door re-reads the table
const FILM_WAIT_MS = 1500 // the longest the first paint waits on the table before deciding film or menu
const WATCH_CLASS = "rounded-full bg-black/70 px-4 py-1.5 font-serif text-[10px] uppercase tracking-[0.3em] text-[#a88a5a] backdrop-blur-[2px] hover:text-[#e8c56a]"
// The title film: 1080p for most screens, the 4K file where the screen can show it.
const TITLE_FILM = "/videos/title-lich.mp4"
const TITLE_FILM_4K = "/videos/title-lich-4k.mp4"
const TITLE_FILM_4K_MIN_PX = 2560 // physical pixels across
const TITLE_STORM_VOLUME = 0.5 // the thunder sits behind the song
// The film comes to rest on the lich 20 s in (10 s of the party, 10 s closing on him). The file then holds that last
// frame for 6 s more so the thunder can roll out under the title, which is why landing reads the clock and not the end.
const TITLE_LANDS_AT = 20.0

type Stage = "film" | "title"

export default function TitleScreen() {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stage, setStage] = useState<Stage | null>(null) // null until the device's settings are read
  const [seated, setSeated] = useState<"player" | "dm" | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [musicOff, setMusicOffState] = useState(false)
  const [needsTap, setNeedsTap] = useState(false)
  const [filmNeedsTap, setFilmNeedsTap] = useState(false)
  const [leaving, setLeaving] = useState<string | null>(null)
  const [table, setTable] = useState<DoorTable>("unknown")
  const [seat, setSeat] = useState({ seated: false, away: false })
  const [heroName, setHeroName] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false) // this browser's hero hosts the campaign (lib/host.ts)
  const runRef = useRef<string | null>(null) // the campaign run the table last reported
  const titleFilmRef = useRef<HTMLVideoElement | null>(null)
  const [titleFilmSrc, setTitleFilmSrc] = useState<string | null>(null) // chosen on the device: 1080p or 4K
  const [landed, setLanded] = useState(false) // the title film has come to rest on the lich: the lettering goes up
  const landedRef = useRef(false)
  const land = useCallback(() => { landedRef.current = true; setLanded(true) }, [])

  // First paint: remember that this browser has seen the door, learn whether it already holds a
  // seat, and decide film or title from the device's settings.
  useEffect(() => {
    try {
      window.sessionStorage.setItem("aop_intro_seen", "1")
      window.localStorage.setItem("aop_intro_seen_ever", "1")
    } catch { /* storage blocked */ }
    try {
      const role = window.localStorage.getItem("aop_access_role")
      const token = window.localStorage.getItem("aop_claim_token")
      const character = window.localStorage.getItem("aop_character_id")
      if (role === "dm") setSeated("dm")
      else if (role === "player" && token && character) setSeated("player")
    } catch { /* storage blocked */ }
    setMusicOffState(!introMusicOn())
    try {
      const px = Math.max(window.screen?.width ?? 0, window.innerWidth) * (window.devicePixelRatio || 1)
      setTitleFilmSrc(px >= TITLE_FILM_4K_MIN_PX ? TITLE_FILM_4K : TITLE_FILM)
    } catch { setTitleFilmSrc(TITLE_FILM) }

    // Who is at the door, for the table read and the "As <hero>" line.
    let characterId: string | null = null
    try {
      if (window.localStorage.getItem("aop_access_role") === "player" && window.localStorage.getItem("aop_claim_token")) characterId = window.localStorage.getItem("aop_character_id")
    } catch { /* storage blocked */ }
    if (characterId) {
      createClient().from("characters").select("name").eq("id", characterId).limit(1).maybeSingle()
        .then(({ data }: { data: { name?: string } | null }) => { if (data?.name) setHeroName(data.name) })
    }

    // Film or menu? Decided once, after the first table read (it carries the campaign run) or after
    // FILM_WAIT_MS, whichever comes first — a slow or failed read never holds the door shut.
    let decided = false
    const decide = () => {
      if (decided) return
      decided = true
      let seenThisSession = false, seenRun: string | null = null
      try {
        seenThisSession = window.sessionStorage.getItem(FILM_SEEN_KEY) === "1"
        seenRun = window.localStorage.getItem(FILM_RUN_KEY)
      } catch { /* storage blocked */ }
      setStage(shouldPlayFilm({ cinematics: cinematicsOn(), seenThisSession, seenRun, currentRun: runRef.current }) ? "film" : "title")
    }
    const wait = window.setTimeout(decide, FILM_WAIT_MS)

    // The table: what it is doing, and whether this player holds a chair. Re-read while the door is up.
    let live = true
    const readTable = async () => {
      try {
        const q = characterId ? `?characterId=${encodeURIComponent(characterId)}` : ""
        const j = await fetch(`/api/table${q}`, { cache: "no-store" }).then((r) => r.json())
        if (!live || j?.error) return
        if (typeof j.run === "string") runRef.current = j.run
        setTable(doorTableOf(j?.state?.status))
        setSeat({ seated: Boolean(j?.mine), away: Boolean(j?.mine?.away) })
        setIsHost(Boolean(characterId && j?.host?.id === characterId))
      } catch { /* the next read will do */ }
    }
    readTable().finally(decide)
    const poll = window.setInterval(readTable, TABLE_POLL_MS)

    const offSettings = onSettingsChange(() => {
      setMusicOffState(!introMusicOn())
      if (!cinematicsOn()) setStage("title")
    })
    return () => { live = false; window.clearTimeout(wait); window.clearInterval(poll); offSettings() }
  }, [])

  // The film. Since 2026-10-25 it is "Into the Underdark" (Sam: "Use this as the new intro to the
  // game"), and it carries its own score — the bard's dirge — baked into the file. So: try to play
  // with sound; if the browser refuses unmuted autoplay, play muted rather than skipping the film,
  // and let the first tap bring the sound up. Any click on the film itself still skips.
  useEffect(() => {
    if (stage !== "film") return
    const video = videoRef.current
    if (!video) return
    video.muted = musicOff
    video.play().catch(() => {
      video.muted = true
      setFilmNeedsTap(!musicOff)
      video.play().catch(() => finishFilm())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])

  // The mute button and the Intro music switch also govern the film's own sound.
  useEffect(() => {
    const video = videoRef.current
    if (stage !== "film" || !video) return
    video.muted = musicOff || video.muted && filmNeedsTap
    if (musicOff) setFilmNeedsTap(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicOff, stage])

  // The title film behind the menu. It starts when the title is up and its file is chosen, plays once and rests on
  // the still (land). Once it has landed it stays landed — coming back from "Watch the opening" does not replay it.
  // It starts muted when the browser will not let it start with sound; the first tap brings the thunder up with the song.
  useEffect(() => {
    const video = titleFilmRef.current
    if (stage === "film") { video?.pause(); return }
    if (stage !== "title" || landedRef.current) return
    let still = !cinematicsOn()
    try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) still = true } catch { /* no matchMedia */ }
    if (still || !video || !titleFilmSrc) { if (still) land(); return }
    video.volume = TITLE_STORM_VOLUME
    video.muted = musicOff
    video.play().catch(() => {
      video.muted = true
      video.play().catch(() => land()) // the film cannot play at all here: show the still and the title
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, titleFilmSrc])

  // The mute button and the Intro music switch govern the thunder too; a refusal silences it at once.
  useEffect(() => {
    const video = titleFilmRef.current
    if (video && musicOff) video.muted = true
  }, [musicOff])

  const unmuteFilm = () => {
    const video = videoRef.current
    if (!video || musicOff) return
    video.muted = false
    setFilmNeedsTap(false)
  }

  // The title score. One place starts it (playThemeAudio honours the global mute); the Intro music
  // switch gates it here. Asks on mount, again on the first gesture, and again when a switch flips.
  // It waits while the film runs — the film has its own score and the two must not play together.
  useEffect(() => {
    if (stage === null) return
    const audio = getThemeAudio()
    if (!audio) return
    audio.volume = 0.55
    if (stage === "film") { if (!audio.paused) audio.pause(); return }
    // The thunder in the title film comes up with the song and never without it (playThemeAudio resolves without
    // playing when music is refused, so the pause check is what says the song is really on).
    const stormUp = () => {
      const film = titleFilmRef.current
      if (film && !audio.paused && introMusicOn() && !isMusicOff()) film.muted = false
    }
    const tryTheme = () => {
      if (!introMusicOn()) { if (!audio.paused) audio.pause(); return }
      if (!audio.paused) { setNeedsTap(false); stormUp(); return }
      playThemeAudio().then(() => { setNeedsTap(false); stormUp() }).catch(() => setNeedsTap(true))
    }
    tryTheme()
    window.addEventListener("pointerdown", tryTheme)
    window.addEventListener("keydown", tryTheme)
    const offPref = onMusicPrefChange(tryTheme)
    const offSettings = onSettingsChange(tryTheme)
    return () => {
      window.removeEventListener("pointerdown", tryTheme)
      window.removeEventListener("keydown", tryTheme)
      offPref(); offSettings()
      // Deliberately NOT pausing: the theme carries on into the Forge and the door.
    }
  }, [stage])

  const finishFilm = useCallback(() => {
    try {
      window.sessionStorage.setItem(FILM_SEEN_KEY, "1")
      // Remember it against this run of the campaign, so the next game night goes straight to the menu.
      window.localStorage.setItem(FILM_RUN_KEY, runRef.current ?? window.localStorage.getItem(FILM_RUN_KEY) ?? FILM_RUN_UNKNOWN)
    } catch { /* storage blocked */ }
    setStage("title")
  }, [])

  const go = (href: string) => {
    if (leaving) return
    setLeaving(href)
    window.setTimeout(() => router.push(href), 420)
  }

  // A door button: stamp the DM door when it goes through /dm (lib/dm-door.ts), and leave the table a note saying
  // why we came (lib/door-intent.ts), so New Campaign lands on New Game and Load Game on the shelf.
  const press = (b: DoorButton) => {
    if (!b.href) return
    if (b.door) markDmDoor()
    try {
      if (b.intent) window.sessionStorage.setItem(DOOR_INTENT_KEY, intentValue(b.intent))
      else window.sessionStorage.removeItem(DOOR_INTENT_KEY)
    } catch { /* storage blocked */ }
    go(b.href)
  }

  // JOIN A TABLE: the room code the host shares (lib/room-code.ts). Its own page (/t/<code>) does the rest.
  const [roomCode, setRoomCode] = useState("")
  const [roomError, setRoomError] = useState(false)
  const joinTable = () => {
    const c = normalizeRoomCode(roomCode)
    // An empty box on a device the game already knows: the way back in (lib/title-door.ts, wayBack).
    const j = menu.buttons.find((b) => b.key === "join")
    if (!roomCode.trim() && j?.href) { press(j); return }
    if (!c) { setRoomError(true); return }
    go(`/t/${c}`)
  }

  const toggleMute = () => {
    const off = !isMusicOff()
    setMusicOff(off)
    setMusicOffState(off || !introMusicOn())
  }

  const filmUp = stage === "film"
  const menu = doorMenu(seated ?? "none", table, seat, heroName, isHost)

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-stone-200">
      <style>{`
        @keyframes ttl-drift { from { transform: scale(1) } to { transform: scale(1.03) } }
        @keyframes ttl-ember { 0% { transform: translate3d(0,0,0) scale(1); opacity: 0 } 10% { opacity: .9 } 90% { opacity: .5 } 100% { transform: translate3d(var(--dx), -110vh, 0) scale(.3); opacity: 0 } }
        @keyframes ttl-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes ttl-rule { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        .ttl-art { animation: ttl-drift 48s ease-in-out infinite alternate; will-change: transform; }
        .ttl-ember { position: absolute; bottom: -2vh; width: 3px; height: 3px; border-radius: 50%; background: #ffb257; box-shadow: 0 0 8px 2px rgba(255,140,40,.55); animation: ttl-ember linear infinite; pointer-events: none; }
        .ttl-menu > * { animation: ttl-rise .7s cubic-bezier(.2,.7,.2,1) both; }
        .ttl-rule { transform-origin: 50% 50%; animation: ttl-rule 1.2s cubic-bezier(.2,.7,.2,1) .3s both; }
        /* The title lettering is one picture shown twice: the top band (ASHES OF) flares up first, then the lower
           band (PROMETHEUS) writes in from the left. 38.5% is where the two lines part in the picture. */
        @keyframes ttl-word-a { from { opacity: 0; filter: brightness(2.4) blur(3px) } to { opacity: 1; filter: brightness(1) blur(0) } }
        @keyframes ttl-word-b { from { clip-path: inset(38.5% 100% 0 0); filter: brightness(2.2) } to { clip-path: inset(38.5% 0 0 0); filter: brightness(1) } }
        .ttl-word-a { clip-path: inset(0 0 61.5% 0); animation: ttl-word-a 1.3s ease-out .5s both; }
        .ttl-word-b { clip-path: inset(38.5% 0 0 0); animation: ttl-word-b 1.9s cubic-bezier(.3,.6,.2,1) 1.4s both; }
        @media (prefers-reduced-motion: reduce) { .ttl-art, .ttl-ember, .ttl-menu > *, .ttl-rule, .ttl-word-a, .ttl-word-b { animation: none !important; } }
      `}</style>

      {/* THE TITLE FILM, then the still it rests on (see the note at the top of this file). Both fill the screen and
          hold the lich in frame: his head is never cropped (Sam, 2026-10-25: "the head of the lich is cut off"). On a
          phone the frame is pulled a little right so he stays in the narrow window. */}
      <div className={cn("absolute inset-0 transition-opacity duration-1000", filmUp ? "opacity-0" : "opacity-100")}>
        <video
          ref={titleFilmRef}
          src={titleFilmSrc ?? undefined}
          poster="/images/title-lich-open.webp"
          onTimeUpdate={(e) => { if (!landedRef.current && e.currentTarget.currentTime >= TITLE_LANDS_AT) land() }}
          onEnded={land}
          onError={land}
          muted
          playsInline
          preload="auto"
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[56%_center] md:object-center"
        />
        <div className={cn("ttl-art absolute inset-0 bg-[url('/images/title-lich.webp')] bg-cover bg-[52%_center] transition-opacity duration-700 md:bg-center", landed ? "opacity-100" : "opacity-0")} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.35)_55%,rgba(0,0,0,0.85)_100%)]" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
        {/* the floor the lettering stands on, once the film has come to rest */}
        <div className={cn("absolute inset-x-0 bottom-0 hidden h-[55%] bg-gradient-to-t from-black/85 via-black/45 to-transparent transition-opacity duration-1000 md:block", landed ? "opacity-100" : "opacity-0")} />
        {/* embers */}
        {EMBERS.map((e, i) => (
          <span key={i} className="ttl-ember" style={{ left: e.left, animationDuration: e.dur, animationDelay: e.delay, ["--dx" as string]: e.dx } as React.CSSProperties} />
        ))}
      </div>

      {/* THE FILM — once per session, only while Cinematics is on. Click anywhere to skip. */}
      {filmUp && (
        <video
          ref={videoRef}
          onClick={finishFilm}
          onEnded={finishFilm}
          src="/videos/intro.mp4"
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {filmUp && (
        <button type="button" onClick={finishFilm} className="absolute bottom-6 right-8 z-20 rounded-sm border border-[#8a6a3a]/50 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-stone-400 backdrop-blur-sm transition-colors hover:border-[#c9a868] hover:text-[#e8c56a]">
          Skip ▸
        </button>
      )}
      {filmUp && filmNeedsTap && (
        <button type="button" onClick={unmuteFilm} className="absolute bottom-6 left-8 z-20 rounded-sm border border-[#8a6a3a]/50 bg-black/50 px-4 py-2 text-[11px] uppercase tracking-[0.3em] text-stone-400 backdrop-blur-sm transition-colors hover:border-[#c9a868] hover:text-[#e8c56a]">
          ♪ Tap for sound
        </button>
      )}

      {/* THE MENU — right of centre on a wide screen, below the art's focus on a phone. */}
      {stage === "title" && (
        <div className={cn("absolute inset-0 flex items-end justify-center pb-[9vh] transition-opacity duration-500 md:items-center md:justify-end md:pb-0 md:pr-[4vw]", leaving ? "opacity-0" : "opacity-100")}>
          <div className="ttl-menu relative w-[min(92vw,380px)]">
            {/* a soft scrim so the buttons read against the busiest part of the painting */}
            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.55)_55%,transparent_78%)]" />

            <div className="mb-6 text-center" style={{ animationDelay: "0s" }}>
              <div className="text-[10px] uppercase tracking-[0.5em] text-[#8a6a3a]">Out of the Abyss</div>
              <div className="ttl-rule mx-auto mt-3 h-px w-40 bg-gradient-to-r from-transparent via-[#c9a868] to-transparent" />
              {/* on a phone the menu covers the painted title, so the film link sits under this heading instead */}
              <button type="button" onClick={() => setStage("film")} className={cn(WATCH_CLASS, "mt-3 md:hidden")}>Watch the opening</button>
            </div>

            {/* what the table is doing — the pill is left out when it could not be read */}
            {menu.status.open !== null && (
              <div className="mb-4 flex justify-center" style={{ animationDelay: ".04s" }}>
                <div role="status" className="flex items-center gap-2.5 rounded-full border border-[#5a4a30] bg-black/70 px-4 py-2 font-serif text-[11px] uppercase tracking-[0.24em] text-[#f0dba8]">
                  <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", menu.status.open ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,168,0.9)]" : "border-2 border-stone-400")} />
                  {menu.status.text}
                </div>
              </div>
            )}

            {menu.buttons.map((b, i) => b.key === "join" ? (
              <JoinBox key={b.key} primary={menu.primary === "join"} delay={`${0.08 + i * 0.08}s`} label={b.label} sub={b.sub}
                value={roomCode} error={roomError} onChange={(v) => { setRoomCode(v); setRoomError(false) }} onGo={joinTable} />
            ) : (
              <MenuButton key={b.key} primary={menu.primary === b.key} onClick={() => press(b)} delay={`${0.08 + i * 0.08}s`} sub={b.sub}>
                {b.label}
              </MenuButton>
            ))}

            {/* HOSTING (Sam, 2026-11-23: "remove confusion for the players"): the key holder's doors, below a rule and
                smaller, so a player reads only Continue and Join a Table. The key is said once, here. */}
            <div className="mt-4 rounded-[3px] bg-black/75 px-3 pb-1.5 pt-3 backdrop-blur-[3px]" style={{ animationDelay: ".32s" }}>
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#5a4a30]" />
                <span className="font-serif text-[10px] uppercase tracking-[0.42em] text-[#a88a5a]">{menu.host.title}</span>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#5a4a30]" />
              </div>
              <p className="mt-1.5 text-center text-[11px] tracking-[0.03em] text-stone-400">{menu.host.sub}</p>
              <div className="mt-2.5 grid gap-2">
                {menu.host.buttons.map((b) => (
                  <button key={b.key} type="button" onClick={() => press(b)}
                    className="group rounded-[3px] border border-[#5a4a30]/80 bg-black/70 px-3 py-2.5 text-center backdrop-blur-[2px] transition-colors hover:border-[#c9a868]/80">
                    <span className="block font-serif text-[12px] uppercase tracking-[0.24em] text-[#d9bd7e] group-hover:text-[#f0dba8]">{b.label}</span>
                    <span className="mt-0.5 block text-[10px] text-stone-400 group-hover:text-stone-300">{b.sub}</span>
                  </button>
                ))}
              </div>
              <div className={cn("flex flex-wrap justify-center gap-x-5", menu.host.links.length ? "mt-2" : "mt-1.5")}>
                {menu.host.links.map((l) => (
                  <button key={l.href} type="button" onClick={() => { try { window.sessionStorage.removeItem(DOOR_INTENT_KEY) } catch { /* storage blocked */ } go(l.href) }}
                    title={l.sub} className="px-1 py-1 font-serif text-[10px] uppercase tracking-[0.3em] text-stone-400 transition-colors hover:text-[#e8c56a]">
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* THE TITLE, and WATCH THE OPENING under it (Sam, 2026-11-25: "below ashes of prometheus title"). The lettering
          is cut from the old painting (public/images/title-lettering.webp, 2899x952), so it is the same font as
          before. On a wide screen it stands at the bottom, centred in the room left of the menu; on a phone it sits
          at the top, above the lich, because the menu fills the bottom. Its room is kept from the start, so nothing
          jumps when it writes itself in. */}
      {stage === "title" && (
        <div className={cn("pointer-events-none absolute inset-x-0 top-[5vh] z-10 flex flex-col items-center px-[9vw] transition-opacity duration-500 md:bottom-[3vh] md:left-[3vw] md:right-[calc(min(92vw,380px)+7vw)] md:top-auto md:px-0", leaving ? "opacity-0" : "opacity-100")}>
          <div className="relative w-full drop-shadow-[0_6px_22px_rgba(0,0,0,0.9)]" style={{ maxWidth: "min(1100px, 92vh)", aspectRatio: "2899 / 952" }}>
            {landed && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/title-lettering.webp" alt="Ashes of Prometheus" className="ttl-word-a absolute inset-0 h-full w-full" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/title-lettering.webp" alt="" aria-hidden className="ttl-word-b absolute inset-0 h-full w-full" />
              </>
            )}
          </div>
          <button type="button" onClick={() => setStage("film")} className={cn(WATCH_CLASS, "pointer-events-auto mt-2 hidden md:block")}>
            Watch the opening
          </button>
        </div>
      )}

      {/* corners: the sound and the gear (Rehearsal is a row inside the gear's sheet since 2026-11-25) */}
      <button
        type="button"
        onClick={toggleMute}
        title={musicOff ? "Music on" : "Music off"}
        aria-label={musicOff ? "Turn music on" : "Turn music off"}
        className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-[#8a6a3a]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] text-[#c4a777] shadow-lg shadow-black/40 transition-colors hover:border-[#c4a777] hover:text-[#e8c56a]"
      >
        {musicOff ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
      {needsTap && !musicOff && stage === "title" && (
        <div className="pointer-events-none fixed left-1/2 top-6 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#8a6a3a]/60 bg-black/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-[#c9a868] backdrop-blur-sm">
          Tap anywhere for sound
        </div>
      )}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        title="Settings"
        aria-label="Open settings"
        className="fixed bottom-4 right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-[#8a6a3a]/60 bg-gradient-to-b from-[#1a1614] to-[#0f0d0b] text-[#c4a777] shadow-lg shadow-black/40 transition-all duration-500 hover:rotate-90 hover:border-[#c4a777] hover:text-[#e8c56a]"
      >
        <Settings className="h-4 w-4" />
      </button>
      {/* INSTALL THE GAME (Sam, 2026-11-23, "PR6"): its own icon on the taskbar or home screen. Shown only where the
          browser can install it and it is not installed yet (lib/install-app.ts). */}
      {stage === "title" && (
        <div className="fixed bottom-5 left-6 z-50"><InstallAppLink /></div>
      )}

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} rehearsal />
    </div>
  )
}

function MenuButton({ children, sub, primary, onClick, delay }: { children: React.ReactNode; sub?: string; primary?: boolean; onClick: () => void; delay: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: delay }}
      className={cn(
        "group relative mb-3 block w-full rounded-[3px] border px-6 py-4 text-left transition-all duration-300",
        "bg-gradient-to-b from-[#15110c]/95 via-[#100d09]/95 to-[#0b0907]/95 backdrop-blur-[2px]",
        primary
          ? "border-[#c9a868]/80 shadow-[inset_0_0_24px_rgba(201,168,104,0.10),0_0_40px_rgba(201,168,104,0.18)] hover:shadow-[inset_0_0_28px_rgba(201,168,104,0.16),0_0_70px_rgba(232,197,106,0.35)]"
          : "border-[#7a5f33]/60 hover:border-[#c9a868]/80 hover:shadow-[0_0_40px_rgba(201,168,104,0.18)]",
        "hover:-translate-y-0.5",
      )}
    >
      <Bracket className="left-[4px] top-[4px]" />
      <Bracket className="right-[4px] top-[4px] -scale-x-100" />
      <Bracket className="bottom-[4px] left-[4px] -scale-y-100" />
      <Bracket className="bottom-[4px] right-[4px] -scale-100" />
      <span className={cn("block font-serif text-[17px] uppercase tracking-[0.28em] transition-colors", primary ? "text-[#e8c56a] group-hover:text-[#fff3cf]" : "text-[#d9bd7e] group-hover:text-[#f0dba8]")}>
        {children}
      </span>
      {sub && <span className="mt-1 block text-[11px] tracking-[0.04em] text-stone-500 transition-colors group-hover:text-stone-400">{sub}</span>}
    </button>
  )
}

/** JOIN A TABLE — dressed like the other buttons, with the room-code field inside it. */
function JoinBox({ primary, delay, label, sub, value, error, onChange, onGo }: { primary: boolean; delay: string; label: string; sub: string; value: string; error: boolean; onChange: (v: string) => void; onGo: () => void }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onGo() }}
      style={{ animationDelay: delay }}
      className={cn(
        "group relative mb-3 block w-full rounded-[3px] border px-6 py-4 text-left transition-all duration-300",
        "bg-gradient-to-b from-[#15110c]/95 via-[#100d09]/95 to-[#0b0907]/95 backdrop-blur-[2px]",
        primary
          ? "border-[#c9a868]/80 shadow-[inset_0_0_24px_rgba(201,168,104,0.10),0_0_40px_rgba(201,168,104,0.18)]"
          : "border-[#7a5f33]/60 focus-within:border-[#c9a868]/80",
      )}
    >
      <Bracket className="left-[4px] top-[4px]" />
      <Bracket className="right-[4px] top-[4px] -scale-x-100" />
      <Bracket className="bottom-[4px] left-[4px] -scale-y-100" />
      <Bracket className="bottom-[4px] right-[4px] -scale-100" />
      <label htmlFor="room-code" className={cn("block font-serif text-[17px] uppercase tracking-[0.28em]", primary ? "text-[#e8c56a]" : "text-[#d9bd7e]")}>{label}</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id="room-code"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
          placeholder="VKRT"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          inputMode="text"
          aria-invalid={error}
          className={cn(
            "w-0 flex-1 rounded-sm border bg-black/60 px-3 py-2 text-center font-serif text-xl uppercase tracking-[0.6em] text-[#f0dba8] placeholder:text-stone-700 focus:outline-none",
            error ? "border-red-500/70" : "border-[#3d3428] focus:border-[#c9a868]",
          )}
        />
        <button type="submit" aria-label="Join the table" className="grid h-11 w-11 place-items-center rounded-sm border border-[#7a5f33] text-[#d9bd7e] transition-colors hover:border-[#c9a868] hover:text-[#f0dba8]">
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <span className={cn("mt-1 block text-[11px] tracking-[0.04em]", error ? "text-red-300/80" : "text-stone-500")}>{error ? "Four letters, like VKRT." : sub}</span>
    </form>
  )
}

function Bracket({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className={cn("pointer-events-none absolute h-3 w-3 text-[#c9a868]/70", className)}>
      <path d="M0 11V0h11" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="2" cy="2" r="1" fill="currentColor" />
    </svg>
  )
}

/** A dozen embers drifting up the painting. Fixed values so SSR and the client agree. */
const EMBERS = [
  { left: "6%", dur: "14s", delay: "0s", dx: "40px" },
  { left: "14%", dur: "18s", delay: "-6s", dx: "-30px" },
  { left: "22%", dur: "16s", delay: "-11s", dx: "25px" },
  { left: "31%", dur: "20s", delay: "-3s", dx: "-45px" },
  { left: "40%", dur: "15s", delay: "-9s", dx: "35px" },
  { left: "48%", dur: "19s", delay: "-14s", dx: "-20px" },
  { left: "57%", dur: "17s", delay: "-5s", dx: "50px" },
  { left: "66%", dur: "21s", delay: "-12s", dx: "-35px" },
  { left: "74%", dur: "15s", delay: "-2s", dx: "20px" },
  { left: "83%", dur: "18s", delay: "-8s", dx: "-50px" },
  { left: "91%", dur: "16s", delay: "-15s", dx: "30px" },
  { left: "96%", dur: "22s", delay: "-4s", dx: "-25px" },
]
