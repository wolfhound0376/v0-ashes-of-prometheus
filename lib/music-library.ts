// Music Library for Ashes of Prometheus
// Tracks categorized for the Lich DM to trigger based on narrative

export interface MusicTrack {
  id: string
  name: string
  url: string
  category: MusicCategory
  mood: string[]
  description: string
}

export type MusicCategory = 
  | "combat"
  | "exploration"
  | "tension"
  | "mystery"
  | "dungeon"
  | "nature"
  | "horror"
  | "epic"
  | "ambient"

export const MUSIC_LIBRARY: MusicTrack[] = [
  {
    id: "there-be-dragons",
    name: "There Be Dragons",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/47_There_be_Dragons-TfuKUKVjplbvlOeMFnoo3zbN8J2Lcs.mp3",
    category: "combat",
    mood: ["epic", "intense", "dramatic"],
    description: "Epic combat music for dragon encounters and boss battles"
  },
  {
    id: "dark-and-stormy",
    name: "Dark and Stormy",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/60_Dark_and_Stormy-NtUb6uhcJ4VZpIDSLL0gUmMTmuqCIP.mp3",
    category: "tension",
    mood: ["ominous", "foreboding", "stormy"],
    description: "Tension music for approaching danger or stormy weather"
  },
  {
    id: "forest-night",
    name: "Forest Night",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/69_Forest_Night-yoTFITQmWIo10M19aihusJXdwHWoAz.mp3",
    category: "nature",
    mood: ["peaceful", "mysterious", "nocturnal"],
    description: "Ambient night forest sounds for wilderness exploration"
  },
  {
    id: "sleeping-dragon",
    name: "Sleeping Dragon",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/71_Sleeping_Dragon-EzPtV3loRsPZt2AYJ5Tlni2Nv7eQ4F.mp3",
    category: "mystery",
    mood: ["suspenseful", "quiet", "dangerous"],
    description: "Tense music for sneaking past dangers or quiet exploration"
  },
  {
    id: "mountain-pass",
    name: "Mountain Pass",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/64_Mountain_Pass-BwMymYbx4D0i7wDdXD2sgIy6liGFyR.mp3",
    category: "exploration",
    mood: ["adventurous", "majestic", "open"],
    description: "Exploration music for mountain travel and open landscapes"
  },
  {
    id: "swamplandia",
    name: "Swamplandia",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/35_Swamplandia-bcRfhKakoOBPrxVFaSz0q5jyAYHaFC.mp3",
    category: "nature",
    mood: ["murky", "mysterious", "unsettling"],
    description: "Ambient swamp sounds for marshland and murky environments"
  },
  {
    id: "rise-of-the-ancients",
    name: "Rise of the Ancients",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/42_Rise_of_the_Ancients-pdIHXU05GTwWW8M7ctnmaP4MkVw05E.mp3",
    category: "epic",
    mood: ["dramatic", "powerful", "ancient"],
    description: "Epic music for discovering ancient ruins or awakening powers"
  },
  {
    id: "dungeon-i",
    name: "Dungeon I",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/65_Dungeon_I-WsSVzmxTgz560Sm8gohVCOHBINDeoZ.mp3",
    category: "dungeon",
    mood: ["dark", "echoing", "underground"],
    description: "Ambient dungeon sounds for underground exploration"
  }
]

// Get track by ID
export function getTrackById(id: string): MusicTrack | undefined {
  return MUSIC_LIBRARY.find(track => track.id === id)
}

// Get tracks by category
export function getTracksByCategory(category: MusicCategory): MusicTrack[] {
  return MUSIC_LIBRARY.filter(track => track.category === category)
}

// Get tracks by mood
export function getTracksByMood(mood: string): MusicTrack[] {
  return MUSIC_LIBRARY.filter(track => track.mood.includes(mood.toLowerCase()))
}

// Get all category options for the Lich
export const MUSIC_CATEGORIES: { id: MusicCategory; label: string; description: string }[] = [
  { id: "combat", label: "Combat", description: "Battle and action sequences" },
  { id: "exploration", label: "Exploration", description: "Travel and discovery" },
  { id: "tension", label: "Tension", description: "Building suspense and danger" },
  { id: "mystery", label: "Mystery", description: "Puzzles and unknown threats" },
  { id: "dungeon", label: "Dungeon", description: "Underground and enclosed spaces" },
  { id: "nature", label: "Nature", description: "Wilderness and outdoor environments" },
  { id: "horror", label: "Horror", description: "Fear and dread" },
  { id: "epic", label: "Epic", description: "Grand moments and revelations" },
  { id: "ambient", label: "Ambient", description: "Background atmosphere" }
]
