"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { freshScene, nextNudge, nudgePrompt, onNudged, onPlayerMessage, type PacingState } from "@/lib/pacing"
import Link from "next/link"
import { Settings, Sparkles, X, Save, RotateCcw, Flame, Hammer, Download, ChevronUp, RefreshCw, UserMinus, Circle, BookOpen, ScrollText, Map, Users, Landmark } from "lucide-react"
import { LeftColumn } from "@/components/dashboard/left-column"
import { CenterColumn } from "@/components/dashboard/center-column"
import { RightColumn } from "@/components/dashboard/right-column"
import { fadeOutThemeAudio } from "@/components/theme-audio"
import { DiceProvider, type DiceResult } from "@/components/dice/dice-provider"
import { TopNav } from "@/components/dashboard/top-nav"
import { StatusBar } from "@/components/dashboard/status-bar"
import { PartyStatus } from "@/components/dashboard/party-status"
import { V4Dashboard } from "@/components/dashboard/v4-dashboard"
import { DmAssetsPanel } from "@/components/dashboard/dm-assets-panel"
import { CampaignBookModal, type CampaignBookSection } from "@/components/dashboard/campaign-book-modal"
import { WorldAIPanel } from "@/components/world-ai"
import { MusicPlayer } from "@/components/dashboard/music-player"
import { DynamicMusic } from "@/components/dashboard/dynamic-music"
import { characterData, dialogueData, actionsData, inventoryData, environmentData, getClassActions, CANONICAL_START_LOCATION } from "@/lib/game-data"
import { useTelemetry } from "@/lib/hooks/use-telemetry"
import { createClient } from "@/lib/supabase/client"
import { PEN_DOOR_OPEN, useWorldFlag } from "@/lib/world-flags"
import { isCombatant } from "@/lib/challenge-rating"
import { dmHeaders, ensureDmKey, hasDmKey } from "@/lib/dm-key"
import { playCues, subscribeSfxCues } from "@/lib/sfx-cues"
import { dmCharacters } from "@/lib/dm-characters"
import { GameClockPanel } from "@/components/dashboard/game-clock-panel"
import { useLich } from "@/lib/hooks/use-lich"
import { emitCinematicCue } from "@/lib/cinematic-cue"
import { usePanelAssets } from "@/lib/hooks/use-panel-assets"
import { CAMPAIGNS } from "@/lib/world-ai/campaigns"
import type { Character, InventoryItem, EquipmentItem, Environment } from "@/lib/types/database"
import type { Campaign } from "@/lib/world-ai/campaigns"
import { rollMatchesRequest, type RollRequestSpec } from "@/lib/roll-requests"

// A dialogue message carries the DB row `id` so we can dedupe. Optimistic
// entries added before the row exists get a temporary id and `pending: true`.
type SpeechSegment = { speaker: string; line: string; npc_id: string | null; voice_id: string | null }
type DialogueMessage = {
  id: string
  speaker: string
  text: string
  speech_segments?: SpeechSegment[] | null
  speaker_type?: string | null
  channel?: string | null
  pending?: boolean
  /** Client-only. All rows produced by ONE Malachar turn share this. Lets the
   *  narration queue tell "one turn, several rows" apart from a bulk refetch. */
  turn_id?: string
  /** Server timestamp — the fallback turn key for rows that arrive by realtime
   *  or refetch rather than through the optimistic path. */
  created_at?: string
}

function optimisticLichEntries(response: { text: string; speechSegments?: SpeechSegment[] | null; dialogueEntries?: Array<{ speaker: string; text: string; speech_segments?: SpeechSegment[] | null }> }): DialogueMessage[] {
  // One turn, one id, however many rows the route split it into.
  const turn = tempId()
  const entries = response.dialogueEntries?.filter((entry) => entry.text?.trim())
  if (entries?.length) {
    return entries.map((entry) => ({ ...entry, id: tempId(), turn_id: turn, pending: true }))
  }
  return response.text ? [{ id: tempId(), speaker: "Malachar", text: response.text, speech_segments: response.speechSegments, turn_id: turn, pending: true }] : []
}

// Merge one dialogue row into state with id-based dedupe. This is the single
// funnel every append goes through so a message can never render twice:
//   1. If a message with the same id is already present (e.g. the realtime
//      echo of a row we already have, or a duplicate delivery from a stacked
//      channel), state is returned unchanged.
//   2. If a still-pending optimistic entry matches the same speaker+text, it is
//      upgraded in place — its temporary id is swapped for the real DB id —
//      instead of being appended a second time.
//   3. Otherwise the message is appended.
function mergeDialogue(prev: DialogueMessage[], incoming: DialogueMessage): DialogueMessage[] {
  if (prev.some((m) => m.id === incoming.id)) return prev
  // A settled realtime row can arrive immediately before the HTTP response's
  // optimistic copy. Only compare a pending incoming row with the newest row:
  // searching the entire transcript would swallow a legitimate repeated line
  // merely because the same speaker said the same words earlier in the game.
  const newestIdx = prev.length - 1
  const newest = prev[newestIdx]
  const pendingIdx = incoming.pending && newest && !newest.pending &&
    newest.speaker === incoming.speaker && newest.text === incoming.text
    ? newestIdx
    : prev.findIndex((m) =>
        m.pending && !incoming.pending &&
        m.speaker === incoming.speaker && m.text === incoming.text,
      )
  if (pendingIdx !== -1) {
    const next = prev.slice()
    next[pendingIdx] = { ...incoming, pending: false }
    return next
  }
  return [...prev, incoming]
}

// Stable unique id for optimistic / client-only entries.
const tempId = () =>
  `optimistic-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()}`

// localStorage key for the per-browser player character selection. This is what
// makes four browsers each keep their own character instead of sharing one
// global session pointer.
const CHARACTER_LS_KEY = "aop_character_id"
// Set by the /join code gate. The claim token is kept here instead of the URL so
// it can't be forwarded or read out of someone's address bar; the role records
// whether this browser is a claimed player seat or the DM / shared-TV screen.
const TOKEN_LS_KEY = "aop_claim_token"
const ROLE_LS_KEY = "aop_access_role"

// Top-bar navigation destinations. These builder/companion routes ship in later
// Dashboard v3 phases, so they render as honest "soon" affordances rather than
// dead links that 404.
const NAV_ITEMS: { label: string; Icon: typeof BookOpen }[] = [
  { label: "Journal", Icon: BookOpen },
  { label: "Quests", Icon: ScrollText },
  { label: "Maps", Icon: Map },
  { label: "NPCs", Icon: Users },
  { label: "Lore", Icon: Landmark },
]

// Render a compact "X ago" string for the last-saved indicator.
function formatSavedAgo(ms: number): string {
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function DashboardPage() {
  const supabase = createClient()

  // Admin-managed per-panel background/overlay overrides (dashboard_assets).
  // Environments remain the primary source; these only apply when a row matches.
  const { resolvePanelAsset } = usePanelAssets()

  // Character selection state
  const [characters, setCharacters] = useState<Character[]>([])
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  // Per-browser character claim. When a player opens a claim link
  // (/?c=<characterId>&k=<claimToken>) and it verifies server-side, the picker
  // is locked to that character and the token is sent with every message so the
  // chat route can prove the browser owns that sheet. `null` = DM / shared-TV.
  const [claimToken, setClaimToken] = useState<string | null>(null)
  const [claimLocked, setClaimLocked] = useState(false)
  // Set only when a claim link is present but the pair is invalid — we show a
  // plain error state instead of silently exposing the full picker.
  const [claimInvalid, setClaimInvalid] = useState(false)
  // The active game session. active_character_id is now a DM-only "spotlight"
  // pointer — players persist their own selection to localStorage instead.
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [characterInventory, setCharacterInventory] = useState<InventoryItem[]>([])
  const [characterEquipment, setCharacterEquipment] = useState<EquipmentItem[]>([])
  const [npcEncounters, setNpcEncounters] = useState<{ id: string; name: string; description: string | null; portrait_url: string | null; face_url: string | null; idle_url: string | null; talking_url: string | null; voice_id: string | null; voice_description: string | null; is_active: boolean; hp_current: number | null; hp_max: number | null; challenge_rating: string | number | null; conditions: string[] | null }[]>([])
  // The WHOLE NPC roster, not just the active-on-stage one. `is_active` is a
  // stage/portrait flag and must not gate who is allowed a voice, so the
  // narration queue reads this instead of `npcEncounters`.
  const [npcRoster, setNpcRoster] = useState<typeof npcEncounters>([])
  const [loadingCharacters, setLoadingCharacters] = useState(true)

  // Current environment from database
  const [currentEnvironment, setCurrentEnvironment] = useState<Environment | null>(null)
  // The scene bound to the node the party is actually standing on.
  //
  // `currentEnvironment` above is "whichever environments row was touched
  // last", which is the party's room only by luck. Edit any other scene in the
  // admin panel and that row silently becomes the newest one, and the NPC
  // window starts painting a room the party has never set foot in. Position is
  // the authority here, not update order.
  //
  // Null when the node has no scene bound yet, in which case the backdrop
  // falls back to the old behaviour rather than blanking the window.
  const [nodeEnvironment, setNodeEnvironment] = useState<Environment | null>(null)
  /** The jsonb payload of public.subnodal_backdrop_here(). */
  type SubnodalBackdrop = {
    node_number: number
    node_name: string
    backdrop_url: string | null
  }
  // The backdrop belonging to the tactical node the party occupies, which is a
  // different thing from the scene bound to the travel node. Null whenever the
  // party is not inside a subnodal map - the ordinary case out on the world
  // map, not a failure, so the chain below simply falls through it.
  const [nodeBackdropUrl, setNodeBackdropUrl] = useState<string | null>(null)
  // Set the moment the pen door is unlocked, picked, or opened from outside.
  // The NPC window swaps to the open-door painting for everyone at once.
  const penDoorOpen = useWorldFlag(PEN_DOOR_OPEN)
  // Player-safe vague time-of-day pushed by the chat route (derived from the
  // world clock). Takes precedence over the environment row's static value so
  // the scene header tracks the passage of time without exposing the DM clock.
  const [liveTimeOfDay, setLiveTimeOfDay] = useState<string | null>(null)
  // Bumped after every Lich turn so the DM-only clock panel re-pulls the
  // advanced world clock (day / exact time / pacing counter).
  const [clockRefresh, setClockRefresh] = useState(0)

  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [dialogueInput, setDialogueInput] = useState("")
  const [dialogue, setDialogue] = useState<DialogueMessage[]>([])
  // Server-issued handoff for Malachar's current roll request. The ref is read
  // at click time; state renders the lifecycle without making the browser the
  // authority over whether a result was accepted.
  const pendingRollRef = useRef<RollRequestSpec | null>(null)
  const [pendingRoll, setPendingRoll] = useState<RollRequestSpec | null>(null)
  const [rollLifecycle, setRollLifecycle] = useState<"idle" | "pending" | "resolving" | "committed" | "retry">("idle")
  // Single source of truth for THIS browser's claimed identity. Updated on every
  // render (below) so every send path — typed input, suggestion chips, dice —
  // reads the character + claim token AT CLICK TIME rather than from a value
  // captured when a button was rendered. This is what stops a suggestion click
  // from POSTing a character this browser no longer controls.
  const claimRef = useRef<{ characterId: string | null; claimToken: string | null }>({ characterId: null, claimToken: null })
  const [npcImageUrl, setNpcImageUrl] = useState<string | null>(null)
  const [sceneImageUrl, setSceneImageUrl] = useState<string | null>(null)
  // TTS mute state - persisted in localStorage, loaded after mount to avoid hydration mismatch
  const [isTTSMuted, setIsTTSMuted] = useState(false)
  useEffect(() => {
    setIsTTSMuted(localStorage.getItem("tts-muted") === "true")
  }, [])
  const toggleTTSMute = useCallback(() => {
    setIsTTSMuted(prev => {
      const next = !prev
      localStorage.setItem("tts-muted", String(next))
      return next
    })
  }, [])

  // World AI panel state
  const [worldAIPanelOpen, setWorldAIPanelOpen] = useState(false)
  const [npcAssetsOpen, setNpcAssetsOpen] = useState(false)
  const [campaignBook, setCampaignBook] = useState<CampaignBookSection | null>(null)
  const [showCampaignChangeDialog, setShowCampaignChangeDialog] = useState(false)
  const [pendingCampaignChange, setPendingCampaignChange] = useState<Campaign | null>(null)

  // Save/Restart campaign state
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [showPartyManager, setShowPartyManager] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // Status-bar state (v3.0 design): last successful save, auto-save preference,
  // and the DM-mode flag shown at the bottom of the dashboard.
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [autoSave, setAutoSave] = useState(true)
  const [dmMode, setDmMode] = useState(false)

  // Default campaign is Out of the Abyss
  const [activeCampaign, setActiveCampaign] = useState<Campaign>(CAMPAIGNS["abyss"])

  // Simple lich connection - uses Vercel AI Gateway, stores dialogue in Supabase
  const { sendMessage: sendToLich, isLoading: lichLoading } = useLich(activeCampaign.id)

  // The chat route returned 403: this browser's character claim is stale (e.g.
  // the character was deleted, or the token no longer matches). Surface it
  // instead of failing silently, and drop the cached claim so the browser stops
  // re-sending a claim the server will keep rejecting.
  const handleClaimRejected = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_LS_KEY)
      window.localStorage.removeItem(ROLE_LS_KEY)
      window.localStorage.removeItem(CHARACTER_LS_KEY)
    }
    setClaimToken(null)
    setClaimLocked(false)
    // Route the player to the plain re-claim state rather than silently
    // dropping them into the open picker with a dead token.
    setClaimInvalid(true)
  }, [])

  // Every message to Malachar goes through here so the character + claim token
  // are resolved from claimRef at call time — the same single source of truth
  // the typed-input path uses. A 403 (stale claim) is caught once and handled;
  // any other error propagates as before.
  const dispatchToLich = useCallback(
    async (text: string) => {
      const { characterId, claimToken: token } = claimRef.current
      try {
        return await sendToLich(text, characterId, token)
      } catch (err) {
        if ((err as { claimRejected?: boolean })?.claimRejected) {
          handleClaimRejected()
          return null
        }
        throw err
      }
    },
    [sendToLich, handleClaimRejected],
  )


  // Handle campaign change with confirmation
  const handleCampaignChange = (newCampaign: Campaign) => {
    if (newCampaign.id === activeCampaign.id) return
    setPendingCampaignChange(newCampaign)
    setShowCampaignChangeDialog(true)
  }

  // Confirm campaign change - clears dialogue and restarts
  const confirmCampaignChange = async () => {
    if (!pendingCampaignChange) return

    // Clear all dialogue from the database
    const { error } = await supabase
      .from('dialogue')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

    if (error) {
      console.error('Error clearing dialogue:', error)
    }

    // Clear local dialogue state
    setDialogue([])

    // Set the new campaign
    setActiveCampaign(pendingCampaignChange)

    // Close dialog
    setShowCampaignChangeDialog(false)
    setPendingCampaignChange(null)
  }

  const cancelCampaignChange = () => {
    setShowCampaignChangeDialog(false)
    setPendingCampaignChange(null)
  }

  // Save campaign - stores dialogue, inventory, and character state
  const handleSaveCampaign = async () => {
    if (!selectedCharacter) return

    setIsSaving(true)
    setSaveMessage(null)

    try {
      // Get current inventory
      const { data: inventoryData } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('character_id', selectedCharacter.id)

      // Create save
      const { error } = await supabase
        .from('campaign_saves')
        .insert({
          campaign_id: activeCampaign.id,
          save_name: `${activeCampaign.name} - ${new Date().toLocaleString()}`,
          dialogue_snapshot: dialogue,
          inventory_snapshot: inventoryData || [],
          character_snapshot: {
            id: selectedCharacter.id,
            name: selectedCharacter.name,
            class: selectedCharacter.class,
            level: selectedCharacter.level,
            hp_current: selectedCharacter.hp_current,
            hp_max: selectedCharacter.hp_max,
          },
          campaign_metadata: {
            savedAt: new Date().toISOString(),
          }
        })

      if (error) throw error

      setLastSavedAt(Date.now())
      setSaveMessage("Campaign saved!")
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      console.error('Error saving campaign:', err)
      setSaveMessage("Failed to save")
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  // Restart campaign - confirms then clears dialogue and inventory
  const handleRestartCampaign = () => {
    setShowRestartDialog(true)
  }

  const confirmRestartCampaign = async () => {
    // The work moved to /api/restart-campaign. It has to: `sessions` and
    // `session_beats` are RLS'd SELECT-only for the anon key, so the deletes
    // this used to attempt from the browser removed zero rows and reported
    // success. Malachar's session history outlived every restart — the reason
    // NPCs kept remembering a wiped campaign.
    //
    // NO selectedCharacter guard. The DM runs this, and the DM has no character
    // selected — the old guard made the button silently do nothing for the one
    // person it exists for.
    setIsRestarting(true)
    try {
      // Prompts once per browser and remembers; returns null if dismissed.
      ensureDmKey("restart the campaign")

      const res = await fetch("/api/restart-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...dmHeaders() },
      })
      const body = await res.json().catch(() => null)

      if (res.status === 403) {
        console.error("[restart] rejected: wrong or missing DM code")
        window.alert("That DM code was not accepted. The campaign was not restarted.")
        return
      }
      if (!res.ok || !body?.ok) {
        console.error("[restart] server reported problems:", body)
        window.alert(
          "The restart did not fully complete. Check the browser console — some tables may need a manual pass.",
        )
        return
      }

      console.log("[restart] complete:", body.report)

      // Clear local state. Realtime will also push the empty tables, but doing
      // it here means the screen goes clean immediately rather than a beat later.
      setDialogue([])
      setCharacterInventory([])
      setCharacterEquipment([])
      setNpcEncounters([])

      // Pull the starting location back onto the screen.
      const { data: env } = await supabase
        .from('environments')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()
      if (env) setCurrentEnvironment(env)

      setShowRestartDialog(false)
    } catch (err) {
      console.error('Error restarting campaign:', err)
      window.alert("The restart failed to reach the server. Nothing was changed.")
    } finally {
      setIsRestarting(false)
    }
  }

  const cancelRestartCampaign = () => {
    setShowRestartDialog(false)
  }

  const [resources, setResources] = useState({
    action: 1,
    bonusAction: 1,
    reaction: 1,
    spellSlots: 3,
    maxSpellSlots: 3,
    sorceryPoints: 4,
    maxSorceryPoints: 4,
    arcaneCharges: 2,
    maxArcaneCharges: 3,
  })

  // Fetch characters and environment from Supabase on mount
  useEffect(() => {
    async function fetchCharacters() {
      setLoadingCharacters(true)
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .is('archived_at', null)
        .order('character_type', { ascending: false })
        .order('name')

      if (error) {
        console.error('Error fetching characters:', error)
        setLoadingCharacters(false)
        return
      }
      if (data && data.length > 0) {
        setCharacters(data)
        const players = data.filter((c: any) => c.is_player)

        // Resolve the session pointer (DM "spotlight") so the DM view can still
        // display it. Players no longer follow this pointer for their own seat.
        const { data: sess } = await supabase
          .from('sessions')
          .select('id, status, started_at, active_character_id')
          .order('started_at', { ascending: false })
        const rows = (sess ?? []) as { id: string; status: string | null; active_character_id: string | null }[]
        const activeSession = rows.find((s) => s.status === 'active') ?? rows[0] ?? null
        setActiveSessionId(activeSession?.id ?? null)

        // 1. Claim link takes precedence. If /?c=&k= verified server-side, we've
        //    already locked selectedCharacterId in the claim effect — respect it.
        // 2. Otherwise prefer this browser's own localStorage selection.
        // 3. Only when localStorage is empty (first visit) fall back to the
        //    session spotlight pointer, then the first player.
        const stored =
          typeof window !== 'undefined' ? window.localStorage.getItem(CHARACTER_LS_KEY) : null

        setSelectedCharacterId((current) => {
          // A claim effect already picked a character for this browser.
          if (current) return current
          if (stored && data.some((c: any) => c.id === stored)) return stored
          const sessionCharId = activeSession?.active_character_id ?? null
          return sessionCharId && players.some((p: any) => p.id === sessionCharId)
            ? sessionCharId
            : players[0]?.id ?? data[0].id
        })
      }
      setLoadingCharacters(false)
    }

    async function fetchEnvironment() {
      // Fetch the current/active environment
      const { data, error } = await supabase
        .from('environments')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (error) {
        console.error('Error fetching environment:', error)
      } else if (data) {
        setCurrentEnvironment(data)
      }
    }

    fetchCharacters()
    fetchEnvironment()
  }, [])

  // Claim-link handling. A URL shaped /?c=<characterId>&k=<claimToken> locks
  // this browser to a single character:
  //   - Both params present  -> verify the pair SERVER-SIDE (/api/verify-claim,
  //     service-role). On valid: lock + persist to localStorage + hide picker.
  //     On invalid: show a plain error state, never fall back to the picker.
  //   - No params            -> DM / shared-TV mode; leave the picker alone.
  // Runs once on mount and sets selectedCharacterId ahead of the roster fetch,
  // which respects an already-set selection.
  // Reaching the dashboard is the end of the journey - the theme bows out.
  useEffect(() => {
    fadeOutThemeAudio()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const c = params.get('c')
    const k = params.get('k')

    // No claim link. Either this browser already came through the /join code gate
    // (rehydrate it), or it has no access at all and belongs at the gate.
    if (!c || !k) {
      // Everyone passes through the intro once per browser session — claimed or
      // not. The intro page sets the flag; claim links skip the ceremony.
      if (!window.sessionStorage.getItem("aop_intro_seen")) {
        window.location.replace("/intro")
        return
      }

      const storedRole = window.localStorage.getItem(ROLE_LS_KEY)
      const storedToken = window.localStorage.getItem(TOKEN_LS_KEY)
      const storedChar = window.localStorage.getItem(CHARACTER_LS_KEY)

      if (storedRole === 'player' && storedToken && storedChar) {
        setSelectedCharacterId(storedChar)
        setClaimToken(storedToken)
        setClaimLocked(true)
        // Validate the cached claim SERVER-SIDE on load. If the character was
        // deleted or the token rotated, discard the stale claim now instead of
        // letting every message silently 403 later.
        ;(async () => {
          try {
            const res = await fetch('/api/verify-claim', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ characterId: storedChar, claimToken: storedToken }),
            })
            const result = await res.json().catch(() => null)
            if (!res.ok || !result?.valid) handleClaimRejected()
          } catch {
            /* network hiccup — leave the cached claim in place rather than
               locking the player out over a transient error */
          }
        })()
        return
      }
      if (storedRole === 'dm') return // DM / shared-TV mode, already unlocked.

      // Unknown browser. Only send it to the gate if the gate is actually armed —
      // if DM_ACCESS_CODE is unset the dashboard stays open exactly as before, so
      // a missing env var can never lock Sam out of his own game.
      ;(async () => {
        try {
          const res = await fetch('/api/claim-code')
          const cfg = await res.json()
          if (cfg?.dmGate) window.location.replace('/intro') // fresh visitors get the front door
        } catch {
          /* gate unreachable — leave the dashboard as-is rather than stranding anyone */
        }
      })()
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/verify-claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ characterId: c, claimToken: k }),
        })
        const result = await res.json()
        if (cancelled) return
        if (res.ok && result?.valid) {
          setSelectedCharacterId(c)
          setClaimToken(k)
          setClaimLocked(true)
          setClaimInvalid(false)
          window.localStorage.setItem(CHARACTER_LS_KEY, c)
          // Upgrade this browser to a gate-style claim so the link only has to be
          // used once — after this the token lives in localStorage, not the URL.
          window.localStorage.setItem(TOKEN_LS_KEY, k)
          window.localStorage.setItem(ROLE_LS_KEY, 'player')
        } else {
          setClaimInvalid(true)
        }
      } catch (err) {
        console.error('[v0] claim verification failed:', err)
        if (!cancelled) setClaimInvalid(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  // Fetch the SHARED active NPC encounters — NO character_id filter — so every
  // client renders the same world state (one truth row per NPC). Independent of
  // the selected character; driven by a realtime subscription below.
  const fetchNpcEncounters = useCallback(async () => {
    const columns = 'id, name, aliases, description, portrait_url, face_url, idle_url, talking_url, voice_id, voice_description, is_active, hp_current, hp_max, challenge_rating, conditions, disposition, stage_scale, stage_offset_y'
    const { data: npcData } = await supabase
      .from('npc_encounters')
      .select(columns)
      .eq('is_active', true)

    if (npcData) setNpcEncounters(npcData)

    // The FULL roster — no is_active filter — so any NPC can be voiced even
    // when only one is the active stage portrait. Same realtime subscription
    // keeps both in sync.
    const { data: rosterData } = await supabase
      .from('npc_encounters')
      .select(columns)

    if (rosterData) setNpcRoster(rosterData)
  }, [])

  // Walk position -> node -> scene, so the NPC window's backdrop is a
  // statement about WHERE THE PARTY IS.
  //
  // Three plain reads rather than one PostgREST embed: party_position's key
  // into travel_nodes is composite (id, node_type), which is not a shape worth
  // handing to relationship inference for something every screen at the table
  // reads all session. All three are readable with the anon key
  // (party_position_read, and travel_nodes_read_discovered - the node the
  // party occupies is discovered by definition).
  const fetchNodeEnvironment = useCallback(async () => {
    // FIRST, and unconditionally. This function has two early returns below,
    // and a read placed after either of them stops refreshing on that path -
    // leaving the window painting the node the party has just left. Called
    // with no argument on purpose: p_run_id defaults through
    // subnodal_active_run(), and only a specific run would pass one.
    const { data: here } = await supabase.rpc('subnodal_backdrop_here')
    setNodeBackdropUrl((here as SubnodalBackdrop | null)?.backdrop_url ?? null)

    const { data: position } = await supabase
      .from('party_position')
      .select('node_id')
      .limit(1)
      .maybeSingle()
    if (!position?.node_id) return

    const { data: node } = await supabase
      .from('travel_nodes')
      .select('scene_environment_id')
      .eq('id', position.node_id)
      .maybeSingle()
    // A node with no scene bound yet is not an error - fall back rather than
    // blank the window.
    if (!node?.scene_environment_id) {
      setNodeEnvironment(null)
      return
    }

    const { data: env } = await supabase
      .from('environments')
      .select('*')
      .eq('id', node.scene_environment_id)
      .maybeSingle()
    setNodeEnvironment(env ?? null)
  }, [])

  // Fetch dialogue from Supabase and subscribe to real-time updates
  useEffect(() => {
    // Initial fetch
    async function fetchDialogue() {
      const { data, error } = await supabase
        .from('dialogue')
        .select('id, speaker, text, speech_segments, speaker_type, channel, created_at')
        .eq('channel', 'dm')
        .order('created_at', { ascending: true })
        .limit(50)

if (error) {
        console.error('Error fetching dialogue:', error)
      } else if (data) {
        setDialogue(data as DialogueMessage[])
      }
    }
    fetchDialogue()

    // Subscribe to real-time updates for dialogue and environment.
    // Every INSERT is funneled through mergeDialogue so an echo of a row we
    // already have (optimistic append, or a duplicate delivery) never
    // double-appends. Dedupe is by the row's real `id`.
    const dialogueChannel = supabase
      .channel('dialogue-changes')
      .on(
        'postgres_changes',
        // Only the DM channel feeds this transcript. Party chatter lives in its
        // own realtime subscription inside <PartyChat> and must never leak here.
        { event: 'INSERT', schema: 'public', table: 'dialogue', filter: 'channel=eq.dm' },
        (payload: { new: Record<string, any> }) => {
          const newEntry = payload.new as DialogueMessage
          setDialogue(prev =>
            mergeDialogue(prev, newEntry),
          )
        }
      )
      .subscribe()

    // Subscribe to environment changes (when Malachar or admin changes location)
    const environmentChannel = supabase
      .channel('environment-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'environments' },
        async () => {
          // Refetch the current environment on any change
          const { data } = await supabase
            .from('environments')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(1)
            .single()

          if (data) {
            setCurrentEnvironment(data)
          }
          // The party's room may be the row that just changed - re-read it so
          // a backdrop edited in the admin panel lands on the NPC window.
          void fetchNodeEnvironment()
        }
      )
      .subscribe()

    // Subscribe to party movement. Arriving somewhere is a moment the whole
    // table should see at once, the same way the pen door opening is: the NPC
    // window changes rooms as the party arrives, not on whoever refreshes first.
    const partyPositionChannel = supabase
      .channel('party-position-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'party_position' },
        () => { void fetchNodeEnvironment() }
      )
      .subscribe()

    // Subscribe to SHARED NPC encounter changes. Listening to INSERT, UPDATE and
    // DELETE means an HP change (or a new/leaving NPC) on ANY player's screen
    // refetches the shared active set here, so every dashboard stays in sync
    // within a second. Created once per mount with cleanup — no channel stacking.
    const npcChannel = supabase
      .channel('npc-encounters-shared')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'npc_encounters' },
        () => { fetchNpcEncounters() }
      )
      .subscribe()

    // Initial shared fetch so encounters render before any realtime event.
    fetchNpcEncounters()
    // Same for the party's room, so the first paint is already the right one.
    void fetchNodeEnvironment()

    return () => {
      supabase.removeChannel(dialogueChannel)
      supabase.removeChannel(environmentChannel)
      supabase.removeChannel(partyPositionChannel)
      supabase.removeChannel(npcChannel)
    }
  }, [fetchNpcEncounters, fetchNodeEnvironment])

  // Sounds another seat earned. A party-scoped cue is relayed by whoever acted
  // (see lib/sfx-cues), so this is how the rest of the table hears the natural
  // 20 somebody else rolled, or the monster that died on the DM's screen.
  // Received cues play locally and are never relayed on - otherwise two seats
  // would bounce the same sound between them for as long as both are open.
  useEffect(() => subscribeSfxCues(), [])

  // Fetch character data function - callable from multiple places
  const fetchCharacterData = useCallback(async () => {
    if (!selectedCharacterId) return

    // Fetch inventory.
    //
    // Reads the RESOLVED view, not the raw table: uploaded item art lives in
    // the items catalogue and the DM asset library, while inventory_items
    // .icon_url is null on virtually every row. The view walks the fallback
    // chain (row → catalogue by item_id → catalogue by item_key/alias → asset
    // library) and hands back resolved_icon_url. Collapsing it onto icon_url
    // here means every downstream component keeps reading one field.
    const { data: invData } = await supabase
      .from('inventory_items_resolved')
      .select('*')
      .eq('character_id', selectedCharacterId)
      .order('name')

    if (invData) {
      setCharacterInventory(
        invData.map((row: any) => ({
          ...row,
          icon_url: row.resolved_icon_url ?? row.icon_url ?? null,
          item_type: row.resolved_item_type ?? row.item_type ?? null,
        })),
      )
    }

    // Fetch equipment (same resolved-view treatment as inventory above).
    const { data: equipData } = await supabase
      .from('equipment_items_resolved')
      .select('*')
      .eq('character_id', selectedCharacterId)

    if (equipData) {
      setCharacterEquipment(
        equipData.map((row: any) => ({
          ...row,
          icon_url: row.resolved_icon_url ?? row.icon_url ?? null,
        })),
      )
    }

    // Refresh character to get updated XP
    const { data: charData } = await supabase
      .from('characters')
      .select('*')
      .eq('id', selectedCharacterId)
      .single()

    if (charData) {
      setCharacters(prev => prev.map(c => c.id === selectedCharacterId ? charData : c))
    }

    // NPC encounters are SHARED world state — fetched unscoped via
    // fetchNpcEncounters (kept live by its own realtime subscription).
    await fetchNpcEncounters()
  }, [selectedCharacterId, fetchNpcEncounters])

  // Fetch inventory and equipment when character changes
  useEffect(() => {
    fetchCharacterData()
  }, [fetchCharacterData])

  // Subscribe to inventory + equipment changes for the active character so
  // admin edits and Lich-awarded items push live without a page refresh.
  useEffect(() => {
    if (!selectedCharacterId) return

    const inventoryChannel = supabase
      .channel(`inventory-${selectedCharacterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items', filter: `character_id=eq.${selectedCharacterId}` },
        () => { fetchCharacterData() }
      )
      .subscribe()

    const equipmentChannel = supabase
      .channel(`equipment-${selectedCharacterId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'equipment_items', filter: `character_id=eq.${selectedCharacterId}` },
        () => { fetchCharacterData() }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(inventoryChannel)
      supabase.removeChannel(equipmentChannel)
    }
  }, [selectedCharacterId, fetchCharacterData])

  // Get the currently selected character
  const selectedCharacter = characters.find(c => c.id === selectedCharacterId)

  // Keep the claim ref in lockstep with the live selection so any handler that
  // fires later (a suggestion click, a dice announce) reads the current values,
  // never a copy captured in a stale closure.
  claimRef.current = { characterId: selectedCharacterId, claimToken }

  // Only player characters are selectable in the dashboard dropdown.
  // The party is who the DM has SEATED (in_party), not everyone who happens to
  // be a player character. Falls back to is_player so a stale cache can never
  // render an empty table.
  const players = characters.some((c: any) => c.in_party)
    ? characters.filter((c: any) => c.in_party)
    : characters.filter((c: any) => c.is_player)
  // Anyone not currently seated is available to add — players first, then the
  // NPC allies. Monsters are excluded: nobody is seating a Giant Spider.
  const partyPool = characters.filter((c: any) =>
    !players.some((p: any) => p.id === c.id) && (c.is_player || (c.character_type ?? '') === 'npc' || c.claim_token))

  const setSeated = async (id: string, seated: boolean) => {
    const { error } = await dmCharacters({ action: 'update', id, patch: { in_party: seated } })
    if (error) { console.error('[party] seat change failed:', error); return }
    setCharacters(prev => prev.map((c: any) => (c.id === id ? { ...c, in_party: seated } : c)))
  }

  // DM-only soft delete for the Character box. Stamps characters.archived_at
  // instead of DELETEing: the row, its inventory, equipment and abilities all
  // survive, so a mis-click is recoverable by clearing archived_at in Supabase.
  // A hard DELETE would also fail outright whenever the character is a
  // session's active_character_id or is referenced by inventory_items
  // .confiscated_from — both of those foreign keys are NO ACTION.
  const handleArchiveCharacter = async (characterId: string) => {
    const { error } = await dmCharacters({ action: 'archive', id: characterId })
    if (error) {
      console.error('[archive] character archive failed:', error)
      setSaveMessage('Could not remove that character')
      setTimeout(() => setSaveMessage(null), 3000)
      return
    }
    const removed = characters.find((c: any) => c.id === characterId)
    setCharacters(prev => prev.filter((c: any) => c.id !== characterId))
    // If the DM just removed whoever this browser was looking at, move the
    // view to another seated player rather than leaving an empty sheet.
    if (selectedCharacterId === characterId) {
      const remaining = characters.filter((c: any) => c.id !== characterId)
      const next = remaining.find((c: any) => c.in_party) ?? remaining.find((c: any) => c.is_player) ?? remaining[0]
      setSelectedCharacterId(next?.id ?? null)
      if (typeof window !== 'undefined') {
        if (next?.id) window.localStorage.setItem(CHARACTER_LS_KEY, next.id)
        else window.localStorage.removeItem(CHARACTER_LS_KEY)
      }
    }
    setSaveMessage(`${removed?.name ?? 'Character'} removed`)
    setTimeout(() => setSaveMessage(null), 3000)
  }

  // Change the active player for THIS browser only. Selection is per-browser
  // now: it lives in local state and persists to localStorage so a reload keeps
  // the same seat. It is NEVER written to sessions.active_character_id — that
  // pointer is the DM-only "spotlight" and writing it here is exactly the bug
  // that made the last picker the speaker for everyone.
  const handleCharacterSelect = (characterId: string) => {
    setSelectedCharacterId(characterId)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CHARACTER_LS_KEY, characterId)
    }
  }

  // In combat when any active NPC has a Challenge Rating above 0 (monsters, not friendly prisoners).
  // isCombatant, not `(cr ?? 0) > 0`: the column is text, and a CR written as
  // a fraction coerces to NaN, which is never greater than zero.
  const inCombat = npcEncounters.some(n => n.is_active && isCombatant(n.challenge_rating))

  // Get available actions based on character class
  const availableActionIds = selectedCharacter
    ? getClassActions(selectedCharacter.class)
    : getClassActions('Fighter')

  // Telemetry hook for AI-assisted game state tracking
  const { buildPayload, pushTelemetry, isPushing } = useTelemetry({
    campaignId: 'ashes_of_prometheus',
    encounterId: 'exploration',
  })

  // Handle telemetry push on action/intent
  const handleTelemetryPush = async (actionType: string, intent: string, roll?: number) => {
    if (!selectedCharacter) return

    const payload = buildPayload(
      selectedCharacter,
      { type: actionType, intent, roll },
      { name: environmentData.location, description: currentEnvironment?.description ?? undefined },
      { action: resources.action > 0, bonusAction: resources.bonusAction > 0, reaction: resources.reaction > 0 }
    )

    try {
      await pushTelemetry(payload)
      console.log('[Telemetry] Pushed game state:', actionType)
    } catch (err) {
      console.error('[Telemetry] Failed to push:', err)
    }
  }

  const handleActionSelect = (actionId: string) => {
    setSelectedAction(actionId === selectedAction ? null : actionId)
  }

  const captureRollRequest = useCallback((request?: RollRequestSpec) => {
    if (!request) return
    pendingRollRef.current = request
    setPendingRoll(request)
    setRollLifecycle("pending")
  }, [])

  /**
   * Send one line to Malachar and fold his answer back into the board.

   * Extracted from the CenterColumn JSX so the reaction panel can reach it.
   * There are now two producers of player lines - the chat box, whose text is
   * stripped of reserved prefixes first, and the reaction panel, which is
   * ALLOWED to use one. Duplicating forty lines of response handling for the
   * second producer would have guaranteed the two drifted; the cinematic cue
   * or the XP refetch would have been wired into one and not the other.
   */
  // ─── THE SCENE KEEPS MOVING ───────────────────────────────────────────
  //
  // Sam: "there needs to be a timer of sorts that helps move the game along in
  // the dialogue portion to prevent it from getting too slow."
  //
  // Combat drives itself; the roleplay had no clock at all, so a quiet room
  // stayed quiet until somebody typed — and on a session being recorded for a
  // weekly video, dead air is what ruins the take.
  //
  // Two clocks and a ladder, all in lib/pacing: silence brings a bark from an
  // NPC, then Malachar leaning in, then something happening TO them. A player
  // speaking resets it, because the point is to restart a scene rather than
  // nag a room that is already going.
  //
  // ONLY THE DM'S BROWSER RUNS IT. Four seats watching the same quiet room
  // would each fire, and the party would get four prods and four bills for a
  // single silence. Same rule the board already uses to decide who resolves a
  // monster's turn.
  const pacing = useRef<PacingState>(freshScene(Date.now()))
  const nudging = useRef(false)
  useEffect(() => {
    if (!hasDmKey()) return
    const id = window.setInterval(() => {
      if (nudging.current) return
      const kind = nextNudge(pacing.current, Date.now(), inCombat)
      if (!kind) return
      nudging.current = true
      pacing.current = onNudged(pacing.current, Date.now())
      console.log(`[pacing] the room went quiet — ${kind}`)
      void sendToLich(nudgePrompt(kind), selectedCharacterId, claimToken)
        .catch((e) => console.error("[pacing] nudge failed", e))
        .finally(() => { nudging.current = false })
    }, 4000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCombat, selectedCharacterId, claimToken])

  const submitToLich = useCallback(async (message: string) => {
          // Optimistically add player message to dialogue immediately (pending
          // → reconciled by id when the realtime echo of the row arrives).
          const playerName = selectedCharacter?.name || "Player"
          // Somebody spoke: the ladder starts again from the bottom, and the
          // scene gains a beat toward "this has gone on long enough".
          pacing.current = onPlayerMessage(pacing.current, Date.now())
          setDialogue(prev => mergeDialogue(prev, { id: tempId(), speaker: playerName, text: message, pending: true }))

          // Send to Lich, carrying THIS browser's character + claim token.
          const response = await sendToLich(message, selectedCharacterId, claimToken)
          if (response) {
            // Optimistically add Malachar's response to dialogue (also pending)
            if (response.text) {
              setDialogue(prev => optimisticLichEntries(response).reduce(mergeDialogue, prev))
            }
            // Advance the player-facing time-of-day if the clock moved.
            if (response.timeOfDay) {
              setLiveTimeOfDay(response.timeOfDay)
            }
            // Malachar cued a filmed moment. The dashboard owns the overlay,
            // so hand the cue name over and let /api/cinematics decide
            // whether anything actually plays.
            if (response.cinematicCue) {
              emitCinematicCue(response.cinematicCue)
            }
            setClockRefresh((n) => n + 1)
            // Update NPC image if the response includes one
            if (response.npcImageUrl) {
              setNpcImageUrl(response.npcImageUrl)
            }
            // Update scene image if the location changed
            if (response.locationImageUrl) {
              setSceneImageUrl(response.locationImageUrl)
            }
            // Optimistically update environment if location changed
            if (response.updatedLocation) {
              setCurrentEnvironment(prev => ({
                ...prev,
                name: response.updatedLocation,
                background_image_url: response.locationImageUrl || prev?.background_image_url,
              } as any))
            }
            // Refresh character data to pick up any XP or items from the Lich
            await fetchCharacterData()
          }
  }, [selectedCharacter, selectedCharacterId, claimToken, fetchCharacterData])

  // Typed messages cannot impersonate the app. "[Dice Roll]" and the 🎲 prefix
  // are reserved for rolls the physics engine actually resolved; "[Reaction]"
  // is reserved for the reaction panel, which is the only thing that knows a
  // reaction was actually spent. A player typing either gets the plain text
  // sent instead, which Malachar is instructed to treat as table talk rather
  // than as a result.
  //
  // The reaction prefix earns its place here for the same reason the dice one
  // did: Malachar is told to TRUST it. A prefix the model trusts and a player
  // can type is a prefix a player can use to award themselves a free Shield.
  const stripReservedPrefixes = (text: string) =>
    text.replace(/^\s*(\[\s*dice\s*roll\s*\]|\[\s*reaction\s*\]|🎲)\s*/i, "")

  // When Malachar cannot answer, SAY SO in the log. Silence reads as a broken
  // app: the player types, nothing happens, and they type again. The line is
  // client-only (never persisted) so it does not pollute the transcript or the
  // model's history.
  const reportDmFailure = useCallback((err: unknown) => {
    const e = err as (Error & { playerFacing?: boolean; claimRejected?: boolean }) | undefined
    if (e?.claimRejected) return   // handled by the claim flow
    const text = e?.playerFacing && e.message
      ? e.message
      : "Malachar does not answer. Something between here and his tower is broken."
    setDialogue(prev => mergeDialogue(prev, { id: tempId(), speaker: "System", text }))
  }, [])

  const handleDialogueSubmit = async () => {
    if (dialogueInput.trim()) {
      const text = stripReservedPrefixes(dialogueInput.trim())
      setDialogueInput("")

      // Optimistically add player message to dialogue immediately. It is marked
      // pending so the realtime echo of the persisted row reconciles onto it by
      // id instead of appending a duplicate.
      const playerName = selectedCharacter?.name || "Player"
      setDialogue(prev => mergeDialogue(prev, { id: tempId(), speaker: playerName, text, pending: true }))

      // Send to the Lich, carrying THIS browser's character + claim token so
      // the chat route attributes the message to the right player.
      let response: Awaited<ReturnType<typeof dispatchToLich>> = null
      try {
        response = await dispatchToLich(text)
      } catch (err) {
        reportDmFailure(err)
        return
      }
      if (response?.text) {
        captureRollRequest(response.rollRequest)
        // Optimistically add Malachar's response (also pending → reconciled by id)
        setDialogue(prev => optimisticLichEntries(response).reduce(mergeDialogue, prev))

        // Update images if returned
        if (response.npcImageUrl) {
          setNpcImageUrl(response.npcImageUrl)
        }
        if (response.locationImageUrl) {
          setSceneImageUrl(response.locationImageUrl)
        }
        if (response.timeOfDay) {
          setLiveTimeOfDay(response.timeOfDay)
        }
        setClockRefresh((n) => n + 1)
        if (response.cinematicCue) emitCinematicCue(response.cinematicCue)
        playCues(response.sfxCues)
        // Refresh NPC encounters so the center column shows newly encountered NPCs
        await fetchCharacterData()
      }
    }
  }

  // Send a quick-reply line straight through the normal player-message path
  // (same optimistic insert + speaker attribution as typing it by hand).
  const handleQuickReply = useCallback(
    async (text: string) => {
      const playerName = selectedCharacter?.name || "Player"
      setDialogueInput("")
      setDialogue(prev => mergeDialogue(prev, { id: tempId(), speaker: playerName, text, pending: true }))
      let response: Awaited<ReturnType<typeof dispatchToLich>> = null
      try {
        response = await dispatchToLich(text)
      } catch (err) {
        reportDmFailure(err)
        return
      }
      if (response?.text) {
        captureRollRequest(response.rollRequest)
        setDialogue(prev => optimisticLichEntries(response).reduce(mergeDialogue, prev))
        if (response.npcImageUrl) setNpcImageUrl(response.npcImageUrl)
        if (response.locationImageUrl) setSceneImageUrl(response.locationImageUrl)
        if (response.timeOfDay) setLiveTimeOfDay(response.timeOfDay)
        setClockRefresh((n) => n + 1)
        if (response.cinematicCue) emitCinematicCue(response.cinematicCue)
        playCues(response.sfxCues)
        await fetchCharacterData()
      }
    },
    [selectedCharacter, dispatchToLich, fetchCharacterData, reportDmFailure, captureRollRequest],
  )

  // Announce a completed sheet roll to the table. Every browser sees the roll
  // line in the shared dialogue feed (realtime on the dialogue table); action
  // rolls (attacks, spell attacks) additionally go to Malachar as this
  // browser's character so the DM narrates the outcome of these EXACT numbers
  // — the roll already happened, he never re-rolls.
  const handleDiceAnnounce = useCallback(
    async (text: string, opts: { toLich: boolean; result?: DiceResult }) => {
      const playerName = selectedCharacter?.name || "Player"
      const line = `🎲 ${text}`
      const request = pendingRollRef.current

      // Feed line, visible on all browsers. Optimistic → reconciled by the
      // realtime echo of the inserted row.
      setDialogue(prev => mergeDialogue(prev, { id: tempId(), speaker: playerName, text: line, pending: true }))
      const { error } = await supabase.from("dialogue").insert({ speaker: playerName, speaker_type: "player", channel: "dm", text: line })
      if (error) console.error("[Dice] failed to persist roll announcement:", error)

      let dmMessage: string | null = null
      if (request && opts.result) {
        setRollLifecycle("resolving")
        const { characterId, claimToken } = claimRef.current
        const matches = rollMatchesRequest(request, opts.result)
        let resolution: Response
        try {
          resolution = await fetch("/api/rolls/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: request.id, characterId, claimToken, result: opts.result }),
          })
        } catch {
          setRollLifecycle("retry")
          setDialogue(prev => mergeDialogue(prev, {
            id: tempId(),
            speaker: "System",
            text: "The roll ledger could not be reached. Try the requested roll again.",
          }))
          return
        }
        const resolved = await resolution.json().catch(() => null)
        if (!resolution.ok || !resolved?.accepted) {
          setRollLifecycle("retry")
          const reason = matches
            ? "The roll could not be committed. Try the requested roll again."
            : `Malachar is waiting for ${request.expression}; that roll did not match.`
          setDialogue(prev => mergeDialogue(prev, { id: tempId(), speaker: "System", text: reason }))
          return
        }
        pendingRollRef.current = null
        setPendingRoll(null)
        setRollLifecycle("committed")
        // The die has landed and the ledger has it. playCues is total - a
        // missing key, an empty array or a slug with no audio behind it all do
        // nothing - so this can never come between the player and their roll.
        playCues(resolved.sfxCues)
        if (resolved.shouldDispatch && typeof resolved.message === "string") dmMessage = resolved.message
      } else if (opts.toLich) {
        dmMessage = `[Dice Roll] ${playerName} rolled — ${text}. Narrate the outcome of this exact result; do not re-roll or change the numbers.`
      }

      // Only the first accepted resolution is returned to Malachar. A replay
      // cannot mutate the roll ledger a second time.
      if (dmMessage) {
        const response = await dispatchToLich(dmMessage)
        if (response?.text) {
          if (response.rollRequest) captureRollRequest(response.rollRequest)
          else setRollLifecycle("idle")
          setDialogue(prev => optimisticLichEntries(response).reduce(mergeDialogue, prev))
          if (response.npcImageUrl) setNpcImageUrl(response.npcImageUrl)
          if (response.locationImageUrl) setSceneImageUrl(response.locationImageUrl)
          if (response.timeOfDay) setLiveTimeOfDay(response.timeOfDay)
          setClockRefresh((n) => n + 1)
          if (response.cinematicCue) emitCinematicCue(response.cinematicCue)
          playCues(response.sfxCues)
          await fetchCharacterData()
        }
      }
    },
    [selectedCharacter, dispatchToLich, fetchCharacterData, captureRollRequest],
  )

  // Handler for populating starting equipment (D&D 5E standard gear)
  const handlePopulateStartingGear = async (equipment: any[], inventory: any[], gold: number) => {
    if (!selectedCharacterId) return

    try {
      // Clear existing inventory and equipment for this character
      await supabase.from('inventory_items').delete().eq('character_id', selectedCharacterId)
      await supabase.from('equipment_items').delete().eq('character_id', selectedCharacterId)

      // Insert new equipment items
      if (equipment.length > 0) {
        const equipmentToInsert = equipment.map(item => ({
          character_id: selectedCharacterId,
          slot: item.slot,
          name: item.name,
          preset_icon: item.icon,
          equipped: true,
        }))
        await supabase.from('equipment_items').insert(equipmentToInsert)
      }

      // Insert new inventory items (including gold)
      const inventoryToInsert = [
        ...inventory.map(item => ({
          character_id: selectedCharacterId,
          name: item.name,
          quantity: item.quantity,
          preset_icon: item.icon,
        })),
        {
          character_id: selectedCharacterId,
          name: 'Gold Pieces',
          quantity: gold,
          preset_icon: 'coins',
        }
      ]
      await supabase.from('inventory_items').insert(inventoryToInsert)

      // Refresh inventory and equipment
      // Resolved views again — starting gear must show the same art the
      // main fetch shows, or icons would depend on which code path loaded them.
      const { data: invData } = await supabase
        .from('inventory_items_resolved')
        .select('*')
        .eq('character_id', selectedCharacterId)
        .order('name')
      if (invData) {
        setCharacterInventory(
          invData.map((row: any) => ({
            ...row,
            icon_url: row.resolved_icon_url ?? row.icon_url ?? null,
            item_type: row.resolved_item_type ?? row.item_type ?? null,
          })),
        )
      }

      const { data: equipData } = await supabase
        .from('equipment_items_resolved')
        .select('*')
        .eq('character_id', selectedCharacterId)
      if (equipData) {
        setCharacterEquipment(
          equipData.map((row: any) => ({
            ...row,
            icon_url: row.resolved_icon_url ?? row.icon_url ?? null,
          })),
        )
      }

    } catch (error) {
      console.error('Error populating starting gear:', error)
    }
  }

  // Invalid claim link: do NOT fall back to the full picker — show a plain
  // "that link isn't valid" state so a bad/expired token can't reveal the roster.
  if (claimInvalid) {
    return (
      <div className="min-h-screen bg-[#0a0908] text-stone-200 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-[#1a1614] border border-[#3d3428] rounded-lg p-8 text-center shadow-2xl">
          <h1 className="text-2xl font-serif text-[#d4b15a] mb-3 text-balance">That link isn&apos;t valid</h1>
          <p className="text-stone-400 leading-relaxed">
            This character claim link is invalid or has expired. Ask your Dungeon Master for a fresh link to join the session.
          </p>
          <a
            href="/join"
            className="mt-5 inline-block rounded-[3px] border border-[#c9a868]/70 px-4 py-2 font-serif text-[12px] uppercase tracking-[0.16em] text-[#d9bd7e] transition-colors hover:border-[#c9a868] hover:text-[#f0dba8]"
          >
            Enter a code instead
          </a>
        </div>
      </div>
    )
  }

  const handleEquipItem = async (itemId: string, slot: EquipmentItem['slot']) => {
    if (!selectedCharacterId) return
    const item = characterInventory.find((entry) => entry.id === itemId)
    if (!item || item.equippable_slot !== slot) return
    await supabase.from('equipment_items').delete().eq('character_id', selectedCharacterId).eq('slot', slot)
    const itemWithBonuses = item as InventoryItem & { stats_bonus?: Record<string, number> }
    const { error } = await supabase.from('equipment_items').insert({
      character_id: selectedCharacterId,
      slot,
      name: item.name,
      icon_url: item.icon_url,
      equipped: true,
      description: item.description,
      stats_bonus: itemWithBonuses.stats_bonus ?? {},
    })
    if (error) console.error('[equip] insert failed:', error)
    await fetchCharacterData()
  }

  const handleUnequipItem = async (slot: EquipmentItem['slot']) => {
    if (!selectedCharacterId) return
    const { error } = await supabase.from('equipment_items').delete().eq('character_id', selectedCharacterId).eq('slot', slot)
    if (error) console.error('[unequip] delete failed:', error)
    await fetchCharacterData()
  }

  // Out of the pack and onto the board, at the character's feet. The route
  // fences it (on the board, catalogue item, their turn if a fight is on)
  // and narrates it; the inventory channel above redraws the pack.
  const handleDropItem = async (itemId: string) => {
    if (!selectedCharacterId) return
    try {
      const res = await fetch('/api/ground-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...dmHeaders() },
        body: JSON.stringify({ action: 'drop', character_id: selectedCharacterId, inventory_item_id: itemId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        console.warn('[drop] refused:', data?.error)
        window.alert(data?.error ?? 'It could not be set down.')
        return
      }
    } catch (err) {
      console.error('[drop] failed:', err)
    }
    await fetchCharacterData()
  }

  return (
    <DiceProvider onAnnounce={handleDiceAnnounce}>
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0806] text-stone-200">
      {/* Top command bar (v3.0 design) */}
      <TopNav
        sessionNumber={1}
        level={selectedCharacter?.level ?? 1}
        campaignName={activeCampaign.name}
        // NPCs tab is DM-only. A claimed player browser is never the DM.
        isDM={dmMode && !claimLocked}
        activeSection={npcAssetsOpen ? "npcs" : campaignBook ?? (worldAIPanelOpen ? "npcs" : null)}
        onSection={(section) => {
          // In DM Mode, the top-right NPCs button is the direct door to canon
          // faces, loops and voices. Outside DM Mode it keeps its player-facing
          // World AI behaviour.
          if (section === "npcs" && dmMode && !claimLocked) {
            setWorldAIPanelOpen(false)
            setNpcAssetsOpen(true)
            return
          }
          // Sections that already have a home route there; the rest open the
          // World AI panel, which is where that content lives today.
          if (section === "settings") {
            if (!claimLocked) setNpcAssetsOpen(true)
            return
          }
          if (section === "journal" || section === "quests" || section === "maps" || section === "lore") {
            setWorldAIPanelOpen(false)
            setCampaignBook(section)
            return
          }
          setWorldAIPanelOpen(true)
        }}
      />

      {rollLifecycle !== "idle" && (
        <div className="fixed left-1/2 top-14 z-[65] -translate-x-1/2 rounded border border-[#7a5f33] bg-[#15110c]/95 px-3 py-1.5 text-xs text-[#e2c98e] shadow-lg">
          {rollLifecycle === "pending" && pendingRoll && `Malachar requests ${pendingRoll.expression}`}
          {rollLifecycle === "resolving" && "Resolving the committed dice result…"}
          {rollLifecycle === "committed" && "Roll committed — returning to Malachar…"}
          {rollLifecycle === "retry" && pendingRoll && `Roll ${pendingRoll.expression} to continue`}
        </div>
      )}

      {campaignBook ? <CampaignBookModal section={campaignBook} inventory={characterInventory} characterId={claimRef.current.characterId} onClose={() => setCampaignBook(null)} /> : null}
      {npcAssetsOpen && !claimLocked ? <DmAssetsPanel onClose={() => setNpcAssetsOpen(false)} /> : null}

      {/* Save toast */}
      {saveMessage && (
        <div className="fixed right-4 top-16 z-[60] animate-in fade-in slide-in-from-right-2 rounded-lg border border-[#3d3428] bg-[#1a1614]/95 px-3 py-1.5 text-sm text-[#d4b15a]">
          {saveMessage}
        </div>
      )}

      {/* Smoke/fog overlay */}
      <div className="fixed inset-0 pointer-events-none z-50 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
      </div>

      {/* World AI Slide-out Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-[420px] max-w-[90vw] z-[55] transition-transform duration-300 ease-in-out ${
          worldAIPanelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="h-full bg-gradient-to-b from-[#1a1614] to-[#0d0b0a] border-l border-[#3d3428]/60 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          {/* Close button */}
          <button
            onClick={() => setWorldAIPanelOpen(false)}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-sm bg-[#1a1614] border border-[#3d3428]/60 text-stone-500 hover:text-[#e0651a] hover:border-[#e0651a]/40 transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          <WorldAIPanel
            campaign={activeCampaign}
            onCampaignChange={handleCampaignChange}
            onLocationChange={(location) => {
              // Update environment data when location changes in World AI
              // Malachar manages location progression
            }}
            className="h-full"
          />
        </div>
      </div>

      <V4Dashboard
        environment={{
          name: currentEnvironment?.name || "Velkynvelve (Slave Pen)",
          region: "The Underdark",
          timeOfDay: currentEnvironment?.time_of_day || "Afternoon",
          imageUrl: sceneImageUrl || currentEnvironment?.background_image_url || "/images/scenes/velkynvelve-slave-pen.jpg",
          description: currentEnvironment?.description,
          // The room the party is STANDING IN, falling back to the
          // last-touched row only for a node with no scene bound yet. Both
          // paintings come off that one row, so the open-door art can never be
          // drawn from a different scene than the shut-door art.
          // The open-door painting only once the door is actually open, and
          // only where the scene has one; otherwise the room as it stands.
          npcBackdropUrl: (() => {
            const room = nodeEnvironment ?? currentEnvironment
            return (
              (penDoorOpen ? room?.npc_backdrop_open_url : null) ||
              nodeBackdropUrl ||
              room?.npc_backdrop_url ||
              null
            )
          })(),
        }}
        dialogue={dialogue}
        dialogueInput={dialogueInput}
        setDialogueInput={setDialogueInput}
        onDialogueSubmit={handleDialogueSubmit}
        onQuickReply={(text) => void handleQuickReply(text)}
        // The look-around chip replays cinematics only while this is on.
        dmMode={dmMode && !claimLocked}
        characters={players}
        selectedCharacter={selectedCharacter}
        selectedCharacterId={selectedCharacterId}
        onCharacterSelect={claimLocked ? undefined : handleCharacterSelect}
        inventory={characterInventory}
        equipment={characterEquipment}
        onEquipItem={handleEquipItem}
        onUnequipItem={handleUnequipItem}
        onDropItem={handleDropItem}
        npcEncounters={npcEncounters}
        npcRoster={npcRoster}
        isThinking={lichLoading}
        claimLocked={claimLocked}
      />

      {/* Legacy dashboard remains mounted out of view during the v4.1 migration
          so its existing handlers can be compared without losing code. */}
      <div className="hidden grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[330px_1fr_390px]">
<LeftColumn
  environment={(() => {
    // dashboard_assets override for the environment scene (panel_type "left_column").
    // Precedence: live in-play scene image > admin dashboard override > environment
    // table > static fallback. Overlay/animation override the environment's fog.
    const bgOverride = resolvePanelAsset("left_column", "background")
    const overlayOverride = resolvePanelAsset("left_column", "overlay")
    return {
      location: currentEnvironment?.name || environmentData.location,
      timeOfDay: liveTimeOfDay || currentEnvironment?.time_of_day || environmentData.timeOfDay,
      backgroundImageUrl:
        sceneImageUrl ||
        bgOverride?.fileUrl ||
        currentEnvironment?.background_image_url ||
        "/images/scenes/velkynvelve-slave-pen.jpg",
      fogOverlayUrl: overlayOverride?.fileUrl || currentEnvironment?.fog_overlay_url,
      ambientAnimation:
        overlayOverride?.animationCss || currentEnvironment?.ambient_animation,
      description: currentEnvironment?.description,
    }
  })()}
  dialogue={dialogue}
  dialogueInput={dialogueInput}
  setDialogueInput={setDialogueInput}
  onDialogueSubmit={handleDialogueSubmit}
  characterAvatar={selectedCharacter?.avatar_image_url}
  characterName={selectedCharacter?.name}
  isWorldAIThinking={lichLoading}
  isTTSMuted={isTTSMuted}
  initiativeModifier={selectedCharacter?.initiative ?? 0}
  onQuickReply={(text) => {
    setDialogueInput(text)
    // Send immediately so a quick reply is one click, not two.
    void handleQuickReply(text)
  }}
/>
          <div className="flex min-h-0 flex-col gap-2">
          <CenterColumn
            selectedAction={selectedAction}
            onActionSelect={handleActionSelect}
            actions={actionsData}
            resources={resources}
            availableActionIds={availableActionIds}
            onTelemetryPush={handleTelemetryPush}
            characterClass={selectedCharacter?.class}
            characterLevel={selectedCharacter?.level}
            characterName={selectedCharacter?.name}
            sceneImageUrl={npcImageUrl || undefined}
            environmentImageUrl={
              sceneImageUrl ||
              currentEnvironment?.background_image_url ||
              "/images/scenes/velkynvelve-slave-pen.jpg"
            }
            npcEncounters={npcEncounters}
            dialogue={dialogue}
          onDeclareReaction={(reaction) => {
            // The app composes the reserved prefix and submits it WITHOUT the
            // strip that typed input goes through. That asymmetry is the whole
            // security property: Malachar may trust "[Reaction]" precisely
            // because only this line can produce one.
            //
            // The message carries the TRIGGER as well as the name, because
            // Malachar has to rule on whether this was a legal moment to react.
            // He holds what just happened in the fiction; the dashboard only
            // knows which button was pressed. Sending the claimed trigger lets
            // him answer "nothing was casting" and hand the reaction back —
            // the correct outcome, and impossible if all he receives is a name.
            void submitToLich(
              `[Reaction] ${reaction.name} — declared when: ${reaction.trigger}`,
            )
          }}
          onSendToLich={(rawMessage) => submitToLich(stripReservedPrefixes(rawMessage))}
        />

          {/* Party Status row (v3.0 design) sits under the center column */}
          <PartyStatus
            members={players.map((p) => ({
              id: p.id,
              name: p.name,
              level: p.level,
              hp_current: p.hp_current,
              hp_max: p.hp_max,
              avatar_image_url: p.avatar_image_url,
              conditions: (p as any).conditions,
            }))}
            selectedCharacterId={selectedCharacterId}
            onSelect={claimLocked ? undefined : handleCharacterSelect}
          />
        </div>
<RightColumn
  characters={players}
  selectedCharacterId={selectedCharacterId}
  onCharacterSelect={handleCharacterSelect}
  disableCharacterSelect={claimLocked}
  dmMode={dmMode && !claimLocked}
  onArchiveCharacter={handleArchiveCharacter}
  selectedCharacter={selectedCharacter}
  characterInventory={characterInventory}
  characterEquipment={characterEquipment}
  loading={loadingCharacters}
  onEquipItem={(itemId, slot) => handleEquipItem(itemId, slot as EquipmentItem['slot'])}
  onUnequipItem={(slot) => handleUnequipItem(slot as EquipmentItem['slot'])}
  onAddXP={async (characterId, amount, reason) => {
    // Add XP to character and record in history
    const { error } = await supabase.rpc('add_character_xp', {
      p_character_id: characterId,
      p_amount: amount,
      p_reason: reason
    })
    if (!error) {
      // Refresh character data
      fetchCharacterData()
    }
  }}
  onLevelUp={async (characterId) => {
    // Level up the character
    const character = characters.find(c => c.id === characterId)
    if (character && character.level < 20) {
      const { error } = await dmCharacters({ action: 'update', id: characterId, patch: { level: character.level + 1 } })
      if (!error) {
        fetchCharacterData()
        // Notify the Lich. This is a client-only notice (never written to the
        // dialogue table), so it gets a stable id and is NOT pending — there is
        // no realtime echo to reconcile it against.
        setDialogue(prev => mergeDialogue(prev, {
          id: tempId(),
          speaker: "System",
          text: `${character.name} has reached Level ${character.level + 1}!`,
        }))
      }
    }
  }}
/>
      </div>

      {/* Campaign Change Confirmation Dialog */}
      {showCampaignChangeDialog && pendingCampaignChange && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1614] border border-[#3d3428] rounded-lg p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-serif text-[#d4b15a] mb-3">Change Campaign?</h2>
            <p className="text-stone-300 mb-4">
              Switching to <span className="text-[#e0651a] font-semibold">{pendingCampaignChange.name}</span> will clear all dialogue history and restart your session with Malachar.
            </p>
            <p className="text-stone-400 text-sm mb-6">
              Your character data will be preserved. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelCampaignChange}
                className="px-4 py-2 rounded bg-[#2a2520] border border-[#3d3428] text-stone-400 hover:text-stone-200 hover:border-stone-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmCampaignChange}
                className="px-4 py-2 rounded bg-[#e0651a]/20 border border-[#e0651a]/50 text-[#e0651a] hover:bg-[#e0651a]/30 transition-colors"
              >
                Change Campaign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Campaign Confirmation Dialog */}
      {/* DM-only party manager. Seats and unseats characters; presence lights
          are a separate job that needs a heartbeat and are deliberately not
          faked here. */}
      {showPartyManager && !claimLocked && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowPartyManager(false)}>
          <div className="max-h-[80vh] w-[560px] overflow-y-auto rounded-lg border border-[#3d3428] bg-[#1a1614] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 font-serif text-xl text-[#e0b765]">The Party</h2>
            <p className="mb-4 text-xs text-stone-400">Who is at the table. Removing someone leaves their character and inventory untouched — they simply stop appearing in Party Status.</p>

            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-[#8f8061]">Seated ({players.length})</h3>
            <div className="mb-5 space-y-1">
              {players.length === 0 ? <p className="text-xs text-stone-500">Nobody is seated.</p> : players.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 rounded border border-[#4b3a19] bg-[#12100b] px-3 py-2">
                  <span className="flex-1 truncate text-sm text-[#ddd2bc]">{c.name}</span>
                  <span className="text-[10px] text-[#8f8061]">{c.class} {c.level}</span>
                  <button onClick={() => void setSeated(c.id, false)} className="rounded border border-[#7a3333]/70 px-2 py-0.5 text-[10px] text-[#d9a3a3] hover:border-[#c96868] hover:text-[#f0cfcf]">Remove</button>
                </div>
              ))}
            </div>

            <h3 className="mb-2 text-[11px] uppercase tracking-wider text-[#8f8061]">Available ({partyPool.length})</h3>
            <div className="space-y-1">
              {partyPool.length === 0 ? <p className="text-xs text-stone-500">Everyone is already seated.</p> : partyPool.map((c: any) => (
                <div key={c.id} className="flex items-center gap-3 rounded border border-[#3b3325] bg-[#0f0e0b] px-3 py-2">
                  <span className="flex-1 truncate text-sm text-[#b9ac93]">{c.name}</span>
                  <span className="text-[10px] text-[#6d6450]">{c.class} {c.level}</span>
                  <button onClick={() => void setSeated(c.id, true)} className="rounded border border-[#695326] px-2 py-0.5 text-[10px] text-[#cdb276] hover:border-[#c9a868] hover:text-[#e0cfa0]">Add</button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setShowPartyManager(false)} className="rounded border border-[#4b3a19] px-4 py-1.5 text-sm text-stone-300 hover:border-[#c9a868]">Done</button>
            </div>
          </div>
        </div>
      )}

      {showRestartDialog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#1a1614] border border-[#3d3428] rounded-lg p-6 max-w-md mx-4 shadow-2xl">
            <h2 className="text-xl font-serif text-red-400 mb-3">Restart Campaign?</h2>
            <p className="text-stone-300 mb-4">
              This will <span className="text-red-400 font-semibold">permanently delete</span> all
              dialogue, Malachar&apos;s session memory, and every item held by every player.
            </p>
            <p className="text-stone-400 text-sm mb-6">
              NPCs forget the party and return to full health. Your uploaded scene art,
              character stats, XP and levels are preserved. The party wakes in the slave pen
              wearing rags. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelRestartCampaign}
                className="px-4 py-2 rounded bg-[#2a2520] border border-[#3d3428] text-stone-400 hover:text-stone-200 hover:border-stone-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestartCampaign}
                disabled={isRestarting}
                className="px-4 py-2 rounded bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRestarting ? "Restarting…" : "Restart Campaign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom status strip (v3.0 design).
          The TTS toggle and the scene-driven ambient music used to render here
          as free-floating fixed-position widgets pinned to the bottom-right —
          which put them directly on top of Export Campaign. Both are unchanged
          apart from being docked into the bar's centre slot; the `static`
          override cancels their own fixed positioning. */}
      <StatusBar
        lastSavedAt={lastSavedAt}
        autoSave={autoSave}
        onToggleAutoSave={() => setAutoSave((v) => !v)}
        dmMode={dmMode}
        onToggleDmMode={() => setDmMode((v) => !v)}
        onExport={handleSaveCampaign}
        exporting={isSaving}
        // The restart flow was fully built — handler, confirmation dialog and
        // all — but nothing ever called handleRestartCampaign, so it had no way
        // in. Same orphaning as the dice roller, Malachar's voice and the NPC
        // talking heads. DM only: a claimed player browser gets no control.
        onRestart={!claimLocked && dmMode ? handleRestartCampaign : undefined}
        onManageParty={claimLocked ? undefined : () => setShowPartyManager(true)}
        centerSlot={
          <>
            {dmMode && !claimLocked && <GameClockPanel refreshSignal={clockRefresh} />}
            <DynamicMusic
              location={currentEnvironment?.name ?? CANONICAL_START_LOCATION}
              inCombat={inCombat}
              className="static bottom-auto right-auto z-auto"
            />
            <MusicPlayer
              isTTSMuted={isTTSMuted}
              onToggleTTSMute={toggleTTSMute}
              className="static bottom-auto right-auto z-auto"
            />
          </>
        }
      />
    </div>
    </DiceProvider>
  )
}
