import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// Default values matching the schema
const DEFAULTS = {
  snark: 5,
  crassness: 3,
  cruelty: 4,
  roast_target: "even",
  swearing: "mild",
  fourth_wall: "occasionally",
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
  
  return NextResponse.json(data)
}

export async function PUT(req: Request) {
  const supabase = await createClient()
  const body = await req.json()
  
  // Get existing row
  const { data: existing } = await supabase
    .from("lich_personality")
    .select("id")
    .limit(1)
    .single()
  
  if (existing?.id) {
    // Update existing row
    const { data, error } = await supabase
      .from("lich_personality")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json(data)
  } else {
    // Insert new row (shouldn't happen normally due to seed, but handle it)
    const { data, error } = await supabase
      .from("lich_personality")
      .insert({
        ...DEFAULTS,
        ...body,
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json(data)
  }
}
