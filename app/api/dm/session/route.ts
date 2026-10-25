import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"

// GET /api/dm/session → { dm: boolean, gate: boolean }. Lets /dm decide whether to show the code
// field or go straight to the seating screen. Nothing secret in the answer.
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  return Response.json({ dm: isDmRequest(req, normalizeCode, safeEquals), gate: Boolean(process.env.DM_ACCESS_CODE) })
}
