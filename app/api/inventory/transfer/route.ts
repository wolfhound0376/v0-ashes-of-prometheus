// Transfer items from environment inventory to player inventory
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { environmentItemId, characterId, quantity = 1 } = await req.json()

    if (!environmentItemId || !characterId) {
      return NextResponse.json(
        { error: "Missing environmentItemId or characterId" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get the environment item
    const { data: envItem, error: envError } = await supabase
      .from("environment_inventory")
      .select("*")
      .eq("id", environmentItemId)
      .eq("is_available", true)
      .single()

    if (envError || !envItem) {
      return NextResponse.json(
        { error: "Item not found or not available" },
        { status: 404 }
      )
    }

    // Check if we have enough quantity
    if (envItem.quantity < quantity) {
      return NextResponse.json(
        { error: "Not enough items available" },
        { status: 400 }
      )
    }

    // Check if player already has this item in inventory
    const { data: existingItem } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("character_id", characterId)
      .eq("name", envItem.name)
      .single()

    if (existingItem) {
      // Update existing inventory item quantity
      const { error: updateError } = await supabase
        .from("inventory_items")
        .update({ quantity: existingItem.quantity + quantity })
        .eq("id", existingItem.id)

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update inventory" },
          { status: 500 }
        )
      }
    } else {
      // Add new item to player inventory
      const { error: insertError } = await supabase
        .from("inventory_items")
        .insert({
          character_id: characterId,
          name: envItem.name,
          description: envItem.description,
          quantity: quantity,
          icon_url: envItem.icon_url,
          icon_type: envItem.icon_type,
          preset_icon: envItem.preset_icon,
          weight: envItem.weight,
          category: envItem.item_type,
        })

      if (insertError) {
        return NextResponse.json(
          { error: "Failed to add item to inventory" },
          { status: 500 }
        )
      }
    }

    // Update environment inventory
    const newQuantity = envItem.quantity - quantity
    if (newQuantity <= 0) {
      // Mark as unavailable if no more items
      await supabase
        .from("environment_inventory")
        .update({ is_available: false, quantity: 0 })
        .eq("id", environmentItemId)
    } else {
      // Reduce quantity
      await supabase
        .from("environment_inventory")
        .update({ quantity: newQuantity })
        .eq("id", environmentItemId)
    }

    // Log to dialogue
    await supabase
      .from("dialogue")
      .insert({
        speaker: "System",
        text: `Acquired ${quantity}x ${envItem.name}`,
        source: "system",
        metadata: { item: envItem.name, quantity },
      })

    return NextResponse.json({
      success: true,
      item: envItem.name,
      quantity,
      message: `Successfully acquired ${quantity}x ${envItem.name}`,
    })
  } catch (error) {
    console.error("Transfer error:", error)
    return NextResponse.json(
      { error: "Transfer failed" },
      { status: 500 }
    )
  }
}
