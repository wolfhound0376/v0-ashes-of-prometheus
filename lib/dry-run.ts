// A Supabase client that reads but never writes: the rehearsal half of the chat route.
//
// Sandbox is a house word here (Sam: "a sandbox where we can ... try out interactions"): the
// alchemy routes, the ground items and the rehearsal board all take `sandbox: true` to mean
// "resolve it, write NOTHING". Malachar had no such door. A talk with him always became canon —
// a dialogue row, a wound, an item, the clock moving — so there was no way to hear how a scene
// would play before playing it.
//
// The chat route is five thousand lines with some seventy writes across six clients and the
// helpers they are handed. Gating each one would miss one, and the one it missed would be the
// one that mattered. So instead the CLIENT is replaced: every read goes through to the real
// database as before (the room must look exactly as it is, or the rehearsal teaches nothing),
// and every insert, upsert, update and delete returns a quiet empty success without touching
// anything. The same wrapper covers a helper that takes the client as a parameter, because it
// is handed the wrapped one.
//
// What this is NOT: a transaction, a shadow database, or a promise that a rehearsal is free.
// Model calls still happen and still cost. Art generation is gated separately in the route,
// because that is money spent on the outside, not a row written.
//
// The write log is for the response ("this rehearsal would have written 7 rows"), so a DM can
// see that a turn had teeth without feeling them.

import type { SupabaseClient } from "@supabase/supabase-js"

/** Postgres functions that only read. Any other rpc is treated as a write and swallowed. */
export const READ_RPCS: ReadonlySet<string> = new Set([
  "party_location_label",
  "scene_key",
  "subnodal_active_run",
  "subnodal_backdrop_here",
])

const WRITE_METHODS: ReadonlySet<string> = new Set(["insert", "upsert", "update", "delete"])

export type DryWrite = { table: string; op: string }
export type DryRunLog = { writes: DryWrite[] }

export const newDryRunLog = (): DryRunLog => ({ writes: [] })

/** What a swallowed write resolves to: an empty success, shaped like PostgREST's. */
export function dryResult(single: boolean) {
  return { data: single ? null : [], error: null, count: null, status: 200, statusText: "dry-run" }
}

/**
 * A stand-in for the query builder after a write: every chained call (eq, select, order, …)
 * keeps the chain, `single`/`maybeSingle` switch the shape, and awaiting it yields dryResult.
 */
export function dryBuilder(single = false): unknown {
  const target = function dry() { /* callable so a stray invocation also chains */ }
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === "then") {
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          Promise.resolve(dryResult(single)).then(onFulfilled, onRejected)
      }
      if (prop === "catch") return (onRejected?: (e: unknown) => unknown) => Promise.resolve(dryResult(single)).catch(onRejected)
      if (prop === "finally") return (f?: () => void) => Promise.resolve(dryResult(single)).finally(f)
      if (prop === "single" || prop === "maybeSingle") return () => dryBuilder(true)
      if (prop === Symbol.toStringTag) return "DryRunBuilder"
      if (prop === Symbol.toPrimitive || prop === "toJSON") return () => "[dry-run]"
      return () => dryBuilder(single)
    },
    apply() { return proxy },
  })
  return proxy
}

/** The real builder for a table, with its four write methods swapped for the stand-in. */
function wrapBuilder<B extends object>(builder: B, table: string, log: DryRunLog): B {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && WRITE_METHODS.has(prop)) {
        return () => { log.writes.push({ table, op: prop }); return dryBuilder() }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}

/**
 * Wrap a Supabase client so it reads normally and writes nothing. Returns the same type, so it
 * drops in wherever the real client went, including into helpers that take a client.
 */
export function dryRun<T extends SupabaseClient<any, any, any>>(db: T, log: DryRunLog = newDryRunLog()): T {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) => wrapBuilder((target as SupabaseClient).from(table) as object, table, log)
      }
      if (prop === "rpc") {
        return (fn: string, args?: Record<string, unknown>, options?: Record<string, unknown>) => {
          if (READ_RPCS.has(fn)) return (target as SupabaseClient).rpc(fn, args as never, options as never)
          log.writes.push({ table: `rpc:${fn}`, op: "rpc" })
          return dryBuilder(true)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as T
}
