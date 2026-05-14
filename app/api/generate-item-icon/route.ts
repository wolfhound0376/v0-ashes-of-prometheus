import { put } from "@vercel/blob"
import { generateImage } from "ai"

export async function POST(req: Request) {
  const { itemName, itemType } = await req.json()
  
  try {
    // Generate a fantasy RPG item icon
    const prompt = `A fantasy RPG inventory icon of a ${itemName}. ${getStyleForType(itemType)}. Square icon, dark background with subtle golden border, detailed pixel art or hand-painted style, suitable for a medieval fantasy game UI. No text.`
    
    const result = await generateImage({
      model: "google/gemini-3.1-flash-image-preview",
      prompt,
      size: "256x256",
    })
    
    if (result.image?.base64) {
      // Convert base64 to buffer
      const imageBuffer = Buffer.from(result.image.base64, 'base64')
      
      // Upload to Vercel Blob
      const filename = `item-icons/${itemName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`
      const blob = await put(filename, imageBuffer, {
        access: 'public',
        contentType: 'image/png',
      })
      
      return Response.json({ iconUrl: blob.url })
    }
    
    return Response.json({ iconUrl: null }, { status: 500 })
  } catch (error) {
    console.error('[GenerateItemIcon] Error:', error)
    return Response.json({ iconUrl: null }, { status: 500 })
  }
}

function getStyleForType(itemType: string): string {
  const styles: Record<string, string> = {
    weapon: "Metallic sheen, sharp edges, dangerous appearance",
    armor: "Protective gear, sturdy materials, defensive",
    tool: "Practical, worn from use, utilitarian",
    consumable: "Glowing slightly, magical essence, enticing",
    treasure: "Gleaming, precious, valuable appearance",
    misc: "Simple, everyday item, subtle details",
  }
  return styles[itemType] || styles.misc
}
