"use client"

import { useEffect, useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { DashboardAsset } from "@/lib/types/database"

/**
 * Loads admin-managed dashboard_assets that target a specific panel (background
 * and overlay types with a non-null panel_type) and exposes a resolver so game
 * panels can consume them BY panel_type.
 *
 * This is intentionally an OVERRIDE/ADDITION layer: the caller stays in control
 * of precedence. Panels keep their existing primary source (e.g. the
 * environments table for the scene background) and only apply a resolved asset
 * when one matches — so with no matching row, panels render exactly as before.
 */
export type PanelAssetType = "background" | "overlay"

export interface ResolvedPanelAsset {
  fileUrl: string
  animationCss: string | null
  name: string
}

export function usePanelAssets() {
  const [assets, setAssets] = useState<DashboardAsset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      // Only the panel-targeting visual types are relevant here. Selecting a
      // narrow set keeps this cheap and avoids pulling icons/animations/etc.
      const { data, error } = await supabase
        .from("dashboard_assets")
        .select("*")
        .in("asset_type", ["background", "overlay"])
        .not("panel_type", "is", null)
        .order("updated_at", { ascending: false })

      if (cancelled) return
      if (error) {
        console.log("[v0] usePanelAssets load error:", error.message)
      } else {
        console.log("[v0] usePanelAssets loaded panel-targeted assets:", data?.length ?? 0)
        setAssets((data as DashboardAsset[]) ?? [])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Index by `${panel_type}:${asset_type}` → newest matching asset (rows are
  // pre-sorted by updated_at desc, so the first seen per key is the newest).
  const index = useMemo(() => {
    const map = new Map<string, ResolvedPanelAsset>()
    for (const a of assets) {
      if (!a.panel_type || !a.file_url) continue
      const key = `${a.panel_type}:${a.asset_type}`
      if (!map.has(key)) {
        map.set(key, { fileUrl: a.file_url, animationCss: a.animation_css, name: a.name })
      }
    }
    return map
  }, [assets])

  function resolvePanelAsset(
    panelType: string,
    assetType: PanelAssetType,
  ): ResolvedPanelAsset | null {
    return index.get(`${panelType}:${assetType}`) ?? null
  }

  return { loading, resolvePanelAsset }
}
