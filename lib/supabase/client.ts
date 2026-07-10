import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Warn once so it's obvious in the console why data isn't loading.
let warned = false
function warnMissingEnv() {
  if (warned) return
  warned = true
  console.warn(
    "[v0] Supabase environment variables are not set (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
      "Running with a no-op Supabase client — database features are disabled until you connect Supabase.",
  )
}

/**
 * A safe, chainable stub that mimics enough of the Supabase client surface to
 * keep the UI rendering when Supabase is not configured. Every query resolves
 * to `{ data: [], error: null }`, and realtime channels are inert.
 */
function createStubClient() {
  warnMissingEnv()

  const result = { data: [], error: null, count: 0, status: 200, statusText: "OK" }

  // A thenable proxy: any method returns itself so calls can be chained
  // (.from().select().eq().order()...), and awaiting it resolves to `result`.
  const queryHandler: ProxyHandler<any> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: typeof result) => unknown) => resolve(result)
      }
      // Any chained method returns the same chainable proxy.
      return () => queryProxy
    },
  }
  const queryProxy: any = new Proxy(function () {}, queryHandler)

  const channelStub: any = {
    on: () => channelStub,
    subscribe: () => channelStub,
    unsubscribe: () => channelStub,
  }

  return {
    from: () => queryProxy,
    rpc: () => queryProxy,
    channel: () => channelStub,
    removeChannel: () => {},
    removeAllChannels: () => {},
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: null }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
  } as any
}

export function createClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return createStubClient()
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
