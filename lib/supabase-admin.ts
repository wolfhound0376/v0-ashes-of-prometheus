// SERVER-SIDE ONLY Supabase client.
//
// IMPORTANT: never import this from a file that runs in the browser
// (a "use client" component, or anything imported by one). The service_role
// key bypasses Row Level Security and must never reach the user's browser.
//
// Safe places to import this from:
//   - app/api/**/route.ts (Next.js route handlers)
//   - server actions ("use server" files)
//   - one-off scripts run with `node` or `tsx`
//
// The env var SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_ prefix) is the
// signal to Next.js that this value should stay on the server.

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(
    "[supabase-admin] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Set them in Vercel → Project Settings → Environment Variables.",
  )
}

export const supabaseAdmin = createClient(
  supabaseUrl ?? "https://missing-supabase-url.invalid",
  serviceRoleKey ?? "missing-service-role-key",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)
