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
  },
  // New tracks
  {
    id: "country-village",
    name: "Country Village",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/182_Country_Village-duH8bVeNSZMWdgEYiZStdWPgl7GukW.mp3",
    category: "ambient",
    mood: ["peaceful", "rustic", "safe"],
    description: "Pleasant village atmosphere for towns and settlements"
  },
  {
    id: "wizards-tower",
    name: "Wizard's Tower",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/174_Wizards_Tower-6nYQUTbA3ET4iLpW4E6GXsmlVdh6t9.mp3",
    category: "mystery",
    mood: ["magical", "arcane", "mysterious"],
    description: "Mystical ambience for wizard towers and magical locations"
  },
  {
    id: "vampire-castle",
    name: "Vampire Castle",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/102_Vampire_Castle-zs6f354TddEWwyL1DkyphiK1k49bph.mp3",
    category: "horror",
    mood: ["gothic", "dread", "undead"],
    description: "Gothic horror for vampire lairs and cursed castles"
  },
  {
    id: "dark-angel",
    name: "Dark Angel",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/162_Dark_Angel-plT5qqGnQ2c4cjkUp3xnVaEl11kQP1.mp3",
    category: "epic",
    mood: ["divine", "ominous", "celestial"],
    description: "Dark celestial theme for fallen angels and divine conflicts"
  },
  {
    id: "astral-plane",
    name: "Astral Plane",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/113_Astral_Plane-XPxLxu2E1vMIZ0Sa0GWBVO0hwhA303.mp3",
    category: "exploration",
    mood: ["otherworldly", "ethereal", "cosmic"],
    description: "Ethereal music for planar travel and astral exploration"
  },
  {
    id: "burning-village",
    name: "Burning Village",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/213_Burning_Village-yAIXcxjb0PuNnqjICl8wy4kMXbV83B.mp3",
    category: "tension",
    mood: ["urgent", "destruction", "chaos"],
    description: "Urgent atmosphere for villages under attack or disasters"
  },
  {
    id: "carriage-journey",
    name: "Carriage Journey",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/134_Carriage_Journey-GrBXRAoAwc8csz9tPBThNQCA8368qu.mp3",
    category: "exploration",
    mood: ["travel", "adventure", "road"],
    description: "Travel music for carriage rides and road journeys"
  },
  {
    id: "cavern-of-lost-souls",
    name: "Cavern of Lost Souls",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/99_Cavern_of_Lost_Souls-THx80DYk2x7Bbhv3h7KPAeIxLPywTO.mp3",
    category: "dungeon",
    mood: ["haunted", "echoing", "souls"],
    description: "Haunted cavern sounds for spirit-filled underground areas"
  },
  {
    id: "druid-hilltop",
    name: "Druid Hilltop",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/200_Druid_Hilltop-8LIrLq8GCIHvdNGedCJE4ZfUycG9Hv.mp3",
    category: "nature",
    mood: ["sacred", "natural", "peaceful"],
    description: "Serene druidic atmosphere for sacred groves and nature sites"
  },
  {
    id: "mummys-tomb",
    name: "Mummy's Tomb",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/142_Mummys_Tomb-Ol1rvEIq0MolDtr6ndJOHLpn8ehIjd.mp3",
    category: "dungeon",
    mood: ["ancient", "cursed", "egyptian"],
    description: "Ancient tomb ambience for pyramids and burial chambers"
  },
  {
    id: "castle-jail",
    name: "Castle Jail",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/172_Castle_Jail-2aIRsXyM4KmfAMNYFHb6nQI10132M7.mp3",
    category: "dungeon",
    mood: ["imprisonment", "despair", "chains"],
    description: "Grim dungeon atmosphere for prisons and jail cells"
  },
  {
    id: "the-feywild",
    name: "The Feywild",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/169_The_Feywild-o7NjJn6vZTdJW8eoonbmCp505x3svB.mp3",
    category: "nature",
    mood: ["magical", "whimsical", "fey"],
    description: "Enchanting fey realm music for Feywild encounters"
  },
  {
    id: "tavern-music",
    name: "Tavern Music",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/177_Tavern_Music-fzJbx23LWwYrKIB6wrU9tnppwrV75q.mp3",
    category: "ambient",
    mood: ["lively", "social", "drinking"],
    description: "Lively tavern atmosphere for inns and social gatherings"
  },
  {
    id: "waterkeep",
    name: "Waterkeep",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/158_Waterkeep-MVx43LgDRHkXKLv8MFpxVUKiJ2lr4C.mp3",
    category: "ambient",
    mood: ["city", "harbor", "urban"],
    description: "Bustling city sounds for large cities and ports"
  },
  {
    id: "floating-ice-castle",
    name: "Floating Ice Castle",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/146_Floating_Ice_Castle-4dbHgRn3fLdstqjr72dyxt6eVlWgN5.mp3",
    category: "mystery",
    mood: ["cold", "magical", "ethereal"],
    description: "Icy magical atmosphere for frost castles and winter realms"
  },
  {
    id: "blacksmith-shoppe",
    name: "Blacksmith Shoppe",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/80_Blacksmith_Shoppe-J0QPgtd1CT7ipqOQ94z4Mx10Fgw54x.mp3",
    category: "ambient",
    mood: ["industrial", "crafting", "fire"],
    description: "Forge sounds for blacksmith shops and crafting areas"
  },
  {
    id: "graveyard",
    name: "Graveyard",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/147_Graveyard-dQbn4fk1qkiR5STKR9bWhCm7BAOwNt.mp3",
    category: "horror",
    mood: ["death", "haunted", "somber"],
    description: "Eerie graveyard atmosphere for cemeteries and burial grounds"
  },
  {
    id: "sewers",
    name: "Sewers",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/85_Sewers-1VUKL9B6O2qMFZPxkMwFzKNOuMmcsB.mp3",
    category: "dungeon",
    mood: ["dank", "underground", "urban"],
    description: "Underground sewer sounds for city underbelly exploration"
  },
  {
    id: "heart-meat-corridor",
    name: "Heart Meat Corridor",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/204_Heart_Meat_Corridor-kojaOSupkeBMSQURGkvSsQq61RmZYF.mp3",
    category: "horror",
    mood: ["grotesque", "fleshy", "nightmare"],
    description: "Disturbing organic sounds for flesh dungeons and aberrant lairs"
  },
  {
    id: "shadowfell",
    name: "Shadowfell",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/198_Shadowfell-dMxt8FpApIUH0fIu8GZcoUt7fxeaQu.mp3",
    category: "horror",
    mood: ["dark", "despair", "shadow"],
    description: "Bleak atmosphere for Shadowfell and realms of darkness"
  },
  // Batch 3 tracks
  {
    id: "court-of-the-count",
    name: "Court of the Count",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/267_Court_of_the_Count-8YtJs3Hp7MmfHrAgrgq4blV1Lto9jA.mp3",
    category: "ambient",
    mood: ["noble", "regal", "gothic"],
    description: "Noble court atmosphere for vampire lords and aristocratic settings"
  },
  {
    id: "summoning",
    name: "Summoning",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/303_Summoning-t7H6vwjg0oHZBNMsaiXsOpDuXdJzto.mp3",
    category: "mystery",
    mood: ["ritual", "magical", "ominous"],
    description: "Dark ritual music for summoning circles and magical ceremonies"
  },
  {
    id: "the-hearth-inn",
    name: "The Hearth Inn",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/255_The_Hearth_Inn-HIvUewCvVbrbsJNuT7RlexCE2uhZGi.mp3",
    category: "ambient",
    mood: ["cozy", "warm", "rest"],
    description: "Warm and inviting inn atmosphere for rest and relaxation"
  },
  {
    id: "defiled-temple",
    name: "Defiled Temple",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/236_Defiled_Temple-p4Q6B5PT3BW3VNy0Enip9G6vGukwGe.mp3",
    category: "horror",
    mood: ["corrupted", "unholy", "dread"],
    description: "Corrupted sacred ground for desecrated temples and unholy sites"
  },
  {
    id: "lorekeeper-grove",
    name: "Lorekeeper Grove",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/275_Lorekeeper_Grove-MSBfJLp07udJtsFFGMjj2lyqagZCSq.mp3",
    category: "nature",
    mood: ["ancient", "wisdom", "serene"],
    description: "Ancient grove of knowledge for libraries and wise elders"
  },
  {
    id: "magic-shoppe",
    name: "Magic Shoppe",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/246_Magic_Shoppe-VhT35j9rkOkTdafvsFXuiy7Htg0PQw.mp3",
    category: "ambient",
    mood: ["whimsical", "arcane", "curiosity"],
    description: "Enchanted shop atmosphere for magic item vendors"
  },
  {
    id: "oasis-city",
    name: "Oasis City",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/284_Oasis_City-yvUqxjTvRVqzcCH1HP3sH7DjG5iHy4.mp3",
    category: "ambient",
    mood: ["desert", "exotic", "bustling"],
    description: "Desert oasis marketplace for Middle Eastern-style cities"
  },
  {
    id: "ice-dragon",
    name: "Ice Dragon",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/256_Ice_Dragon-JjP6y0COR1uSaC7ohuldamjoK5HsXg.mp3",
    category: "combat",
    mood: ["frost", "epic", "dragon"],
    description: "Epic frost dragon battle music"
  },
  {
    id: "salt-marsh",
    name: "Salt Marsh",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/223_Salt_Marsh-jeYukagyHP79iGmCbtImagHT55RhMj.mp3",
    category: "nature",
    mood: ["coastal", "murky", "isolation"],
    description: "Coastal marshland atmosphere for seaside swamps"
  },
  {
    id: "sleeping-ogre",
    name: "Sleeping Ogre",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/218_Sleeping_Ogre-uy1M9yQZuNTXyWA56BWJCVqf7dmeca.mp3",
    category: "tension",
    mood: ["stealth", "danger", "suspense"],
    description: "Tense stealth music for sneaking past sleeping monsters"
  },
  {
    id: "forge-of-fury",
    name: "Forge of Fury",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/276_Forge_of_Fury-A6np6hKTXluYuCux58rBerYGsyddrT.mp3",
    category: "dungeon",
    mood: ["fire", "industry", "dwarven"],
    description: "Intense forge sounds for dwarven strongholds and volcanic areas"
  },
  {
    id: "dusk-of-the-dryad",
    name: "Dusk of the Dryad",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/313_Dusk_of_the_Dryad-dKT1F2aADlAKzypLWXQxirX2GybBCY.mp3",
    category: "nature",
    mood: ["twilight", "fey", "melancholy"],
    description: "Twilight forest music for dryad encounters and fey glades"
  },
  {
    id: "farmyard",
    name: "Farmyard",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/278_Farmyard-wIvRzCghV4qHWejM1ErgrEpI4fx9uj.mp3",
    category: "ambient",
    mood: ["rural", "peaceful", "pastoral"],
    description: "Peaceful farmland atmosphere for rural countryside"
  },
  {
    id: "spiders-den",
    name: "Spider's Den",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/242_Spiders_Den-jhj2HhGVWhAxraKZoDDR7uidVZlPlw.mp3",
    category: "dungeon",
    mood: ["creepy", "webs", "lurking"],
    description: "Creepy spider lair for giant spider encounters"
  },
  {
    id: "throne-room",
    name: "Throne Room",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/240_Throne_Room-QteQiWm2uusPr2oktH0d3os5IEF80o.mp3",
    category: "ambient",
    mood: ["royal", "power", "grandeur"],
    description: "Majestic throne room for royal audiences and palace scenes"
  },
  {
    id: "shamans-hollow",
    name: "Shaman's Hollow",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/319_Shamans_Hollow-10aekOjYaSOxowwrlkvgXZia68eWIe.mp3",
    category: "mystery",
    mood: ["tribal", "spiritual", "primal"],
    description: "Tribal spiritual music for shaman encounters and ritual sites"
  },
  {
    id: "wagon-ride",
    name: "Wagon Ride",
    url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/290_Wagon_Ride-2Xi28oloxhT7V5s93gOxE51RrlWv4p.mp3",
    category: "exploration",
    mood: ["travel", "adventure", "journey"],
    description: "Travel music for wagon journeys and overland expeditions"
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
