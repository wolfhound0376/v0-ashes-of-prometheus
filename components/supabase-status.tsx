"use client"

// Floating status badge that pings Supabase on page load so you can confirm
// the env vars are set correctly. Visible top-right of every page.
// Once the integration is proven and stable, you can delete this component
// and remove its import from app/layout.tsx.

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

type Status = "checking" | "connected" | "failed"

export function SupabaseStatus() {
  const [status, setStatus] = useState<Status>("checking")
  const [detail, setDetail] = useState<string>("")

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        // getSession() is the lightest possible auth call. It returns a valid
        // response shape whether or not a user is logged in, so it works as
        // a pure "can the SDK reach Supabase with these credentials" probe.
        const { error } = await supabase.auth.getSession()
        if (cancelled) return

        if (error) {
          setStatus("failed")
          setDetail(error.message)
        } else {
          setStatus("connected")
          setDetail("Anon key + URL valid; database reachable.")
        }
      } catch (e: unknown) {
        if (cancelled) return
        setStatus("failed")
        setDetail(e instanceof Error ? e.message : "Unknown error")
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  // This pill predates the dashboard's top bar and was pinned to the same
  // top-right corner the nav now occupies, sitting on top of NPCs / Lore / the
  // settings gear. Rather than fight for that corner, it now behaves as an
  // alert: silent while the connection is healthy, loud the moment it isn't.
  // The dashboard's own status bar ("Last Saved … ●") covers the healthy case.
  if (status === "connected") return null

  const color = status === "failed" ? "#E24B4A" : "#FAC775"
  const label = status === "failed" ? "Supabase: failed" : "Supabase: checking…"

  return (
    <div
      title={detail}
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 100,
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 6,
        background: "rgba(10, 9, 8, 0.85)",
        border: "0.5px solid rgba(255,255,255,0.15)",
        color,
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "system-ui, sans-serif",
        pointerEvents: "auto",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          display: "inline-block",
        }}
      />
      {label}
    </div>
  )
}
