"use client"

// DM Assets — the slide-over behind the gear icon.
//
// Five tabs over one idea: everything the DM can swap out without redeploying.
// NPCs keep their own tab because their identity is by NAME (every row sharing a
// name gets the same art) and they route through /api/npc-face and
// /api/npc-video. The other four are row-keyed and share /api/asset-media.
//
// EVERY SLOT TAKES A VIDEO. Previously only NPC faces could hold a loop —
// image-uploader.tsx hardcoded accept="image/*" and the assets panel rendered
// everything through <img>, so a scene background could only ever be a still.
// Now a scene, a fog overlay, an item icon or a library asset can each be an MP4,
// and MediaSlot picks <video> or <img> from the URL.
//
// Clearing removes the DATABASE REFERENCE ONLY, never the file — blob objects are
// shared between rows and deletion cannot be undone. Re-upload overwrites at the
// same deterministic path.
//
// DM-only: the parent renders this for a DM browser, and both endpoints re-check
// DM_ACCESS_CODE server-side.

import { useEffect, useState } from "react"
import { KeyRound, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { NpcAssetsTab } from "./npc-assets-panel"
import { MediaTab, type MediaTabConfig } from "./dm-assets/media-tab"
import { CinematicsTab } from "./dm-assets/cinematics-tab"
import { clearDmKey, hasDmKey, onDmKeyChange, setDmKey } from "@/lib/dm-key"

type TabId = "npcs" | "characters" | "scenes" | "overlays" | "items" | "library" | "cinematics"

const SCENES: MediaTabConfig = {
  table: "environments",
  select: "id, name, time_of_day, background_image_url",
  labelColumn: "name",
  subtitleColumn: "time_of_day",
  orderBy: "name",
  slots: [{ target: "environment.background", column: "background_image_url", label: "Background" }],
  emptyMessage: "No environments recorded yet.",
}

const OVERLAYS: MediaTabConfig = {
  table: "environments",
  select: "id, name, time_of_day, fog_overlay_url",
  labelColumn: "name",
  subtitleColumn: "time_of_day",
  orderBy: "name",
  slots: [{ target: "environment.fog", column: "fog_overlay_url", label: "Fog overlay" }],
  emptyMessage: "No environments recorded yet.",
}

const ITEMS: MediaTabConfig = {
  table: "items",
  select: "id, name, slug, item_type, icon_url",
  labelColumn: "name",
  subtitleColumn: "item_type",
  orderBy: "name",
  slots: [{ target: "item.icon", column: "icon_url", label: "Icon" }],
  emptyMessage: "No items in the catalogue yet.",
}

const LIBRARY: MediaTabConfig = {
  table: "dashboard_assets",
  select: "id, name, asset_type, file_url, thumbnail_url",
  labelColumn: "name",
  subtitleColumn: "asset_type",
  orderBy: "name",
  slots: [
    { target: "asset.file", column: "file_url", label: "File" },
    { target: "asset.thumbnail", column: "thumbnail_url", label: "Thumbnail" },
  ],
  emptyMessage: "No dashboard assets recorded yet.",
}

const CHARACTERS: MediaTabConfig = {
  table: "characters",
  select: "id, name, class, idle_url, talking_url, voice_id, voice_description, stage_scale, stage_offset_y",
  labelColumn: "name",
  subtitleColumn: "class",
  orderBy: "name",
  filter: { column: "is_player", value: true },
  slots: [
    { target: "character.idle", column: "idle_url", label: "Idle" },
    { target: "character.talking", column: "talking_url", label: "Talking" },
  ],
  emptyMessage: "No player characters found.",
  archivable: true,
  voiceEditable: true,
  stageEditable: true,
}

const TABS: Array<{ id: TabId; label: string; blurb: string }> = [
  { id: "characters", label: "Characters", blurb: "Player-character idle and talking loops, how tall each figure stands on the scene stage, and each character's ElevenLabs voice for the Player Voices toggle." },
  { id: "npcs", label: "NPCs", blurb: "Canon face, idle and talking loops, and the ElevenLabs voice. Applies to every row sharing a name." },
  { id: "scenes", label: "Scenes", blurb: "Environment backgrounds. A looping MP4 works here — an animated cavern, drifting water." },
  { id: "overlays", label: "Overlays", blurb: "Fog and ambient layers drawn over the scene." },
  { id: "items", label: "Items", blurb: "Catalogue icons — the roundel shown beside an item in inventory." },
  { id: "library", label: "Library", blurb: "Everything else in dashboard_assets." },
  { id: "cinematics", label: "Cinematics", blurb: "Rendered clips for the trigger system — 5–8s loops and moments, tagged by location, variant state, scope and kind. Players never see this panel, only playback." },
]

export function DmAssetsPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<TabId>("npcs")
  const [keySet, setKeySet] = useState(true)
  const [keyDraft, setKeyDraft] = useState("")

  // Read after mount only — localStorage is not available during SSR, and
  // reading it in the initial state would desync hydration.
  useEffect(() => {
    const sync = () => setKeySet(hasDmKey())
    sync()
    return onDmKeyChange(sync)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const active = TABS.find((t) => t.id === tab)

  return (
    <div
      className="fixed inset-0 z-[300] flex justify-end bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="DM Assets"
        className="flex h-full w-full max-w-3xl flex-col border-l border-[#6b5123] bg-[radial-gradient(circle_at_top,#1d1509,#0a0806_65%)] shadow-[-25px_0_80px_#000]"
      >
        <header className="shrink-0 border-b border-[#3d3428] px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-lg tracking-wide text-[#c4a777]">DM Assets</h2>
            <button
              onClick={onClose}
              aria-label="Close DM Assets"
              className="ml-auto rounded border border-[#4b3a19] p-1.5 text-[#c6a060] hover:border-[#c9a868] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="mt-3 flex flex-wrap gap-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-sm border px-3 py-1 text-[11px] uppercase tracking-[0.14em] transition-colors",
                  tab === t.id
                    ? "border-[#c9a868] bg-[#c4a777]/12 text-[#f0dcae]"
                    : "border-[#3d3428] text-stone-500 hover:border-[#c4a777]/60 hover:text-[#d9c79c]",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {active && <p className="mt-2 text-[11px] leading-snug text-stone-500">{active.blurb}</p>}

          {keySet ? (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-stone-600">
              <KeyRound className="h-3 w-3 text-[#c4a777]/70" />
              DM code remembered on this browser.
              <button onClick={() => clearDmKey()} className="underline hover:text-stone-400">
                forget it
              </button>
              <span className="text-stone-700">·</span>
              {/* The only route to /admin in the whole UI. Shown once the code is
                  stored so a player never sees the door, and so the DM does not
                  have to remember a URL that appears nowhere else. */}
              <a href="/admin" className="underline hover:text-stone-400">
                admin panels
              </a>
            </p>
          ) : (
            <div className="mt-2 rounded-sm border border-[#c4a777]/40 bg-[#c4a777]/5 p-2">
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#c4a777]">
                <KeyRound className="h-3 w-3" />
                DM code not saved on this browser
              </label>
              <p className="mt-1 text-[10px] leading-snug text-stone-500">
                Enter it once and every tab here will remember it. Without it, uploads come back 403.
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keyDraft.trim()) {
                      setDmKey(keyDraft)
                      setKeyDraft("")
                    }
                  }}
                  placeholder="DM access code"
                  className="min-w-0 flex-1 rounded-sm border border-[#3d3428] bg-[#0f0d0b] px-2 py-1 text-xs text-[#e8dcc4] placeholder:text-stone-600 focus:border-[#c4a777]/60 focus:outline-none"
                />
                <button
                  onClick={() => {
                    if (!keyDraft.trim()) return
                    setDmKey(keyDraft)
                    setKeyDraft("")
                  }}
                  className="rounded-sm border border-[#c9a868] bg-[#c4a777]/12 px-3 py-1 text-[11px] uppercase tracking-wider text-[#f0dcae] hover:bg-[#c4a777]/20"
                >
                  Save
                </button>
              </div>
            </div>
          )}
          <p className="mt-1 text-[10px] text-stone-600">
            Clearing removes the reference; the file stays in storage and re-uploading restores it.
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "npcs" && <NpcAssetsTab />}
          {tab === "characters" && <MediaTab key="characters" config={CHARACTERS} />}
          {tab === "scenes" && <MediaTab key="scenes" config={SCENES} />}
          {tab === "overlays" && <MediaTab key="overlays" config={OVERLAYS} />}
          {tab === "items" && <MediaTab key="items" config={ITEMS} />}
          {tab === "library" && <MediaTab key="library" config={LIBRARY} />}
          {tab === "cinematics" && <CinematicsTab key="cinematics" />}
        </div>
      </section>
    </div>
  )
}
