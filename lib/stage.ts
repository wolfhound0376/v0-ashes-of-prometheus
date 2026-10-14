// lib/stage.ts
//
// Stage transitions — the grammar of moving between the game's places.
// Source: the "Stage Transitions" mock (claude.ai artifact, 2026-10-10) and its four rules:
//
//   1. One stage, no page loads. The modes are swapped inside one shell that never unloads.
//   2. Every move starts from what you were looking at. The stage window grows into the film or
//      the painting; a painting shrinks into the party's token; the map dives into camp.
//   3. Malachar's voice is the thread: his caption stays on screen through the move.
//   4. The table moves together: one shared record (sessions.stage) says which mode the party is
//      in, and every browser follows it.
//
// This file is pure data and pure functions: no React, no DOM, no database. The provider in
// components/stage/stage-provider.tsx does the moving.

/** The places a browser can be looking at. `table` is the dashboard. */
export type StageMode = "table" | "film" | "scene" | "map" | "camp" | "battle" | "other"

/** Which page each mode lives on today. `scene` is the walkable painted outpost. */
export const STAGE_ROUTES: Record<Exclude<StageMode, "other">, string> = {
  table: "/",
  film: "/", // a cinematic plays over the table; it has no page of its own
  scene: "/velkynvelve",
  map: "/map",
  camp: "/camp",
  battle: "/battle",
}

/** The mode a pathname is showing. Anything the grammar doesn't know is `other` (admin, forge, previews). */
export function modeForPath(pathname: string | null | undefined): StageMode {
  const p = (pathname ?? "/").split("?")[0]
  if (p === "/") return "table"
  if (p === "/velkynvelve" || p.startsWith("/velkynvelve/")) return "scene"
  if (p === "/map" || p.startsWith("/map/")) return "map"
  if (p === "/camp" || p.startsWith("/camp/")) return "camp"
  if (p === "/battle" || p.startsWith("/battle/")) return "battle"
  return "other"
}

/**
 * How the move is drawn.
 *   grow      the stage window on the table grows to fill the screen (table -> film / scene / map / battle)
 *   shrink    the full screen shrinks back into the stage window (anything -> table)
 *   medallion the painting shrinks to a medallion and the map opens around it (scene -> map)
 *   dive      the camera dives into the party's token and camp opens out of it (map -> camp)
 *   dip       dip through black in 0.4 s; never a hard cut (everything else)
 */
export type TransitionKind = "grow" | "shrink" | "medallion" | "dive" | "dip"

export function transitionFor(from: StageMode, to: StageMode): TransitionKind {
  if (from === to) return "dip"
  if (from === "table" && (to === "film" || to === "scene" || to === "map" || to === "battle" || to === "camp")) return "grow"
  if (to === "table") return "shrink"
  if (from === "scene" && to === "map") return "medallion"
  if (from === "map" && to === "camp") return "dive"
  return "dip"
}

/** Milliseconds for each kind — the mock's timings. Reduced motion collapses them to one frame. */
export const DURATIONS: Record<TransitionKind, { out: number; in: number }> = {
  grow: { out: 800, in: 350 },
  shrink: { out: 250, in: 750 },
  medallion: { out: 850, in: 1200 },
  dive: { out: 950, in: 850 },
  dip: { out: 400, in: 400 },
}

export function durationsFor(kind: TransitionKind, reducedMotion: boolean) {
  return reducedMotion ? { out: 1, in: 1 } : DURATIONS[kind]
}

/**
 * Which moves every browser at the table follows when the shared record changes.
 * Sam's call on the mock ("Does the party move as one?"): yes for film, travel and camp; in a
 * painted scene each player walks their own character, but leaving it is a party move. The
 * battle board is the DM's place and is not forced on anyone.
 */
export const FOLLOWED_MODES: ReadonlySet<StageMode> = new Set<StageMode>(["table", "scene", "map", "camp"])

/** The shared record, as written to sessions.stage (jsonb). */
export type StageRecord = {
  mode: StageMode
  /** A random id for the browser that made the move, so it does not follow itself. */
  by: string
  /** ISO time of the move. Browsers ignore records older than STALE_AFTER_MS on first load. */
  at: string
  /** Malachar's line for the move, shown in the caption of every browser that follows. */
  caption?: string
}

/** A record older than this is history, not an instruction: a browser opening the game an hour later stays where it is. */
export const STALE_AFTER_MS = 2 * 60 * 1000

export function shouldFollow(rec: StageRecord | null | undefined, self: string, current: StageMode, now = Date.now()): boolean {
  if (!rec || typeof rec !== "object") return false
  if (rec.by === self) return false
  if (!FOLLOWED_MODES.has(rec.mode)) return false
  if (rec.mode === current) return false
  // Browsers on pages outside the grammar (admin, forge, previews) are left alone.
  if (current === "other") return false
  const t = Date.parse(rec.at)
  if (!Number.isFinite(t) || now - t > STALE_AFTER_MS) return false
  return true
}
