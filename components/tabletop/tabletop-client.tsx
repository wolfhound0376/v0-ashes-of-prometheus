"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { createClient } from "@/lib/supabase/client"
import { Card } from "@/components/ui/card"

const TabletopScene = dynamic(() => import("./tabletop-scene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted-foreground">Summoning the tabletop…</div>
  ),
})

export type CharacterRef = {
  name: string | null
  avatar_image_url: string | null
  hp_current: number | null
  hp_max: number | null
  character_type: string | null
}

export type Token = {
  id: string
  map_id: string
  character_id: string | null
  bestiary_id: string | null
  label: string | null
  model_url: string | null
  model_scale: number | null
  model_y_offset: number | null
  grid_x: number
  grid_y: number
  elevation: number | null
  rotation_y: number | null
  token_size: string | null
  tint_color: string | null
  is_visible: boolean | null
  updated_by: string | null
  characters: CharacterRef | null
}

export type VttMap = {
  id: string
  name: string
  environment_id: string | null
  grid_width: number
  grid_height: number
  cell_size: number | null
  terrain: unknown
  ground_texture_url: string | null
  ambient_preset: "day" | "night" | "dusk" | "dungeon" | null
  is_active: boolean | null
}

// Per-browser player name, matching how the dashboard identifies the player.
function getPlayerName(): string {
  if (typeof window === "undefined") return "Player"
  try {
    const raw = window.localStorage.getItem("aop_selected_character")
    if (raw) return raw
  } catch {
    /* ignore */
  }
  return "Player"
}

export function TabletopClient() {
  const supabase = useMemo(() => createClient(), [])
  const [map, setMap] = useState<VttMap | null>(null)
  const [tokens, setTokens] = useState<Map<string, Token>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const playerNameRef = useRef<string>("Player")

  useEffect(() => {
    playerNameRef.current = getPlayerName()
  }, [])

  // Fetch active map + its tokens, then subscribe to realtime token changes.
  useEffect(() => {
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    async function load() {
      const { data: mapData, error: mapErr } = await supabase
        .from("vtt_maps")
        .select("*")
        .eq("is_active", true)
        .single()

      if (cancelled) return
      if (mapErr || !mapData) {
        setError("No active map found.")
        setLoading(false)
        return
      }
      setMap(mapData as VttMap)

      const { data: tokenData, error: tokErr } = await supabase
        .from("vtt_tokens")
        .select("*, characters(name, avatar_image_url, hp_current, hp_max, character_type)")
        .eq("map_id", mapData.id)

      if (cancelled) return
      if (tokErr) {
        setError("Failed to load tokens.")
        setLoading(false)
        return
      }

      const next = new Map<string, Token>()
      for (const t of (tokenData ?? []) as Token[]) next.set(t.id, t)
      setTokens(next)
      setLoading(false)

      // Single realtime channel for all token mutations on this map.
      channel = supabase
        .channel(`vtt_tokens:${mapData.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "vtt_tokens", filter: `map_id=eq.${mapData.id}` },
          (payload: {
            eventType: "INSERT" | "UPDATE" | "DELETE"
            new: Record<string, unknown>
            old: Record<string, unknown>
          }) => {
            setTokens((prev) => {
              const updated = new Map(prev)
              if (payload.eventType === "DELETE") {
                const oldId = (payload.old as { id?: string })?.id
                if (oldId) updated.delete(oldId)
                return updated
              }
              const row = payload.new as unknown as Token
              // Preserve joined character data on UPDATE (realtime payloads omit joins).
              const existing = updated.get(row.id)
              updated.set(row.id, { ...row, characters: existing?.characters ?? row.characters ?? null })
              return updated
            })
          },
        )
        .subscribe()
    }

    load()

    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [supabase])

  const moveToken = useCallback(
    async (id: string, gridX: number, gridY: number) => {
      let previous: Token | undefined
      setTokens((prev) => {
        const t = prev.get(id)
        if (!t) return prev
        previous = t
        const updated = new Map(prev)
        updated.set(id, { ...t, grid_x: gridX, grid_y: gridY })
        return updated
      })

      const { error: updErr } = await supabase
        .from("vtt_tokens")
        .update({ grid_x: gridX, grid_y: gridY, updated_by: playerNameRef.current })
        .eq("id", id)

      if (updErr && previous) {
        // Revert on failure.
        setTokens((prev) => {
          const updated = new Map(prev)
          updated.set(id, previous as Token)
          return updated
        })
      }
    },
    [supabase],
  )

  const tokenList = useMemo(() => Array.from(tokens.values()), [tokens])

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background">
      {loading && (
        <div className="flex h-full items-center justify-center text-muted-foreground">Summoning the tabletop…</div>
      )}

      {!loading && error && (
        <div className="flex h-full items-center justify-center text-destructive">{error}</div>
      )}

      {!loading && !error && map && (
        <>
          <TabletopScene
            map={map}
            tokens={tokenList}
            selectedId={selectedId}
            onSelect={setSelectedId}
            moveToken={moveToken}
          />

          <Card className="absolute left-4 top-4 z-10 w-60 border-border/60 bg-card/85 p-3 backdrop-blur-sm">
            <h1 className="font-serif text-lg text-foreground">{map.name}</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Select a token, then click the ground to move it.
            </p>
            <ul className="mt-3 space-y-1">
              {tokenList.map((t) => {
                const isSel = t.id === selectedId
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(isSel ? null : t.id)}
                      className={`w-full rounded px-2 py-1 text-left text-sm transition-colors ${
                        isSel
                          ? "bg-primary/20 text-foreground"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {t.label || t.characters?.name || "Unnamed"}
                    </button>
                  </li>
                )
              })}
              {tokenList.length === 0 && <li className="px-2 text-sm text-muted-foreground">No tokens.</li>}
            </ul>
          </Card>
        </>
      )}
    </main>
  )
}
