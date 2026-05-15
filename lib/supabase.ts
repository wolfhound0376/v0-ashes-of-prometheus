// Browser-safe Supabase client.
// Uses the anon (publishable) key — safe to expose in client code.
// Database security is enforced by Row Level Security policies on the Supabase side.

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't crash at build time — let the health-check component show a clear error in the UI.
  console.warn(
    "[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
      "Set them in Vercel → Project Settings → Environment Variables.",
  )
}

export const supabase = createClient(
  supabaseUrl ?? "https://missing-supabase-url.invalid",
  supabaseAnonKey ?? "missing-anon-key",
)
