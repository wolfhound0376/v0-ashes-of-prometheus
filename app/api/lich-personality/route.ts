import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Default personality values
const DEFAULTS = {
  snark: 5,
  crassness: 3,
  cruelty: 4,
  roast_target: "even" as const,
  swearing: "mild" as const,
  fourth_wall: "occasionally" as const,
}

export async function GET() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("lich_personality")
    .select("*")
    .limit(1)
    .single()
  
  if (error || !data) {
    // Return defaults if no row exists
    return NextResponse.json(DEFAULTS)
  }
  
  return NextResponse.json({
    snark: data.snark ?? DEFAULTS.snark,
    crassness: data.crassness ?? DEFAULTS.crassness,
    cruelty: data.cruelty ?? DEFAULTS.cruelty,
    roast_target: data.roast_target ?? DEFAULTS.roast_target,
    swearing: data.swearing ?? DEFAULTS.swearing,
    fourth_wall: data.fourth_wall ?? DEFAULTS.fourth_wall,
  })
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  
  // Validate and sanitize input
  const updates: Record<string, unknown> = {}
  
  if (typeof body.snark === "number" && body.snark >= 0 && body.snark <= 10) {
    updates.snark = Math.round(body.snark)
  }
  if (typeof body.crassness === "number" && body.crassness >= 0 && body.crassness <= 10) {
    updates.crassness = Math.round(body.crassness)
  }
  if (typeof body.cruelty === "number" && body.cruelty >= 0 && body.cruelty <= 10) {
    updates.cruelty = Math.round(body.cruelty)
  }
  if (["sam", "kenta", "fifi", "scott", "even", "off"].includes(body.roast_target)) {
    updates.roast_target = body.roast_target
  }
  if (["off", "mild", "unrestricted"].includes(body.swearing)) {
    updates.swearing = body.swearing
  }
  if (["off", "occasionally", "often"].includes(body.fourth_wall)) {
    updates.fourth_wall = body.fourth_wall
  }
  
  updates.updated_at = new Date().toISOString()
  
  // First check if a row exists
  const { data: existing } = await supabase
    .from("lich_personality")
    .select("id")
    .limit(1)
    .single()
  
  let result
  if (existing) {
    // Update existing row
    result = await supabase
      .from("lich_personality")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single()
  } else {
    // Insert new row with defaults merged with updates
    result = await supabase
      .from("lich_personality")
      .insert({ ...DEFAULTS, ...updates })
      .select()
      .single()
  }
  
  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 })
  }
  
  return NextResponse.json(result.data)
}
