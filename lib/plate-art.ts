// The painted plate behind a saved game's card in the Load Game book (Sam, 2026-11-23: "PR4"). Server only — it
// reads the walk's own spec (scripts/velkynvelve-walk/spec.json), so the card shows exactly the painting the party
// stood on. The URL rule is the walk's own (public/velkynvelve-walk/index.html plateUrl): a plate with its own
// `img` is served from the site; every other plate lives in the vtt-assets bucket under its slug.

import SPEC from "@/scripts/velkynvelve-walk/spec.json"

const ASSET = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/scenes/velkynvelve/walk/"
const PLATE_DIR = "/velkynvelve-walk/img/"

type Plate = { slug?: string; name?: string; img?: string }
const PLATES = SPEC as unknown as Record<string, Plate>

/** The plate's name and picture, or nulls for a plate the walk does not know. */
export function plateArt(key: string | null | undefined, plates: Record<string, Plate> = PLATES): { name: string | null; art: string | null } {
  if (!key) return { name: null, art: null }
  const p = plates[key]
  if (!p) return { name: null, art: null }
  const art = p.img ? PLATE_DIR + p.img : p.slug ? `${ASSET}img/${p.slug}.jpg` : null
  return { name: p.name ?? null, art }
}
