import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { DM_COOKIE, verifyDmToken } from "@/lib/dm-session"
import { FORGE_PASS_COOKIE, verifyForgePass } from "@/lib/forge-pass"

// THE FORGE'S ONE DOOR. Sam, 2026-10-25: the chooser's Forge Your Own is "THE ONLY WAY TO THE
// FORGE OUTSIDE THE DM CREATING ONE HIMSELF." Every page under /forge (the wizard, the builder it
// embeds, the DM's importer) needs either the pass the chooser hands out (lib/forge-pass.ts) or the
// DM's session cookie (lib/dm-session.ts, set at /dm). Anyone else goes to /choose.

export const dynamic = "force-dynamic"

export default async function ForgeLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies()
  const pass = jar.get(FORGE_PASS_COOKIE)?.value
  const dm = jar.get(DM_COOKIE)?.value
  if (!verifyForgePass(pass) && !verifyDmToken(dm)) redirect("/choose")
  return <>{children}</>
}
