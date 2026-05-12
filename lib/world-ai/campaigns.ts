export interface QuickAction {
  label: string
  prompt: string
  roll?: { notation: string; name: string }
}

export interface MapHotspot {
  x: number
  y: number
  name: string
  text: string
}

export interface CampaignMap {
  id: string
  name: string
  hotspots: MapHotspot[]
}

export interface LoreItem {
  name: string
  text: string
}

export interface LoreCategory {
  category: string
  items: LoreItem[]
}

export interface CampaignContexts {
  episodes: [string, string][]
  locations: string[]
  heat: [string, string][]
  defaults?: { episode?: string; heat?: string }
}

export interface Campaign {
  id: string
  name: string
  subtitle: string
  description: string
  systemPrompt: string
  contexts: CampaignContexts
  quickActions: QuickAction[]
  maps: CampaignMap[]
  lore: LoreCategory[]
  theme: { primary: string; accent: string }
}

export const CAMPAIGNS: Record<string, Campaign> = {
  tyranny: {
    id: "tyranny",
    name: "Ashes of Prometheus",
    subtitle: "Tyranny of Dragons - D&D 5E",
    description: "Greenest is sacked by the Cult of the Dragon. The party must defend the keep, rescue survivors, and follow the trail to a hidden hatchery serving Tiamat.",
    systemPrompt: `You are the World AI for "Ashes of Prometheus", running Tyranny of Dragons (D&D 5E). Be a fast, precise mid-session reference. Default to ONE paragraph. Never preamble.

DICE RULES — CRITICAL: NEVER fabricate roll results. If the user gives you a result, use exactly that number. To ask for a new roll, write [[XdY+Z]].

WORLD: Faerûn, Sword Coast. Greenest sacked by Cult of the Dragon under Lennithon (blue dragon).
LOCATIONS: KEEP (NW, Nighthill base), MILL (E river, burning), OLD TUNNEL (under keep), SANCTUARY (S, 50 townspeople), MARKET SQUARE (Cyanwrath challenge), RIVER CHIONTAR (E).
NPCs ALLY: Nighthill (200gp/mission), Escobert (dwarf, knows tunnel), Leosin (captive ep3, Harper), Ontharr (Elturel ep4+).
NPCs ENEMY: Lennithon (5/5, contracted), Cyanwrath (4/5, half-blue, ritual challenge), Frulam Mondath (3/5), Cult Raiders (2/5), Kobolds (1/5, can be turned).
STREET d8: 1 kobold rooftop, 2 family pinned, 3 burning building, 4 cultist with hostage, 5 patrol, 6 kobold trap, 7 dragon shadow, 8 false ally.
WILDERNESS d6: 1 outriders, 2 predator, 3 refugees, 4 storm, 5 prisoner, 6 empty.
RUMOURS d6: 1 woman in purple TRUE, 2 dragon answers no one HALF, 3 vault under temple TRUE, 4 half-blue won challenge TRUE, 5 prisoners east TRUE, 6 spy in keep FALSE.
LOOT d6: 1-2 cult token, 3 silverware, 4 coin pouch, 5 serpent dagger, 6 Draconic orders.
LORE: Cult target 7/12 Sword Coast. Camp has dragon hatchery for Tiamat. Lennithon contracted. Heat: 1 base, +1 noisy, 4+ adds enemies.`,
    contexts: {
      episodes: [
        ["1", "1 — Night of the Raid"],
        ["2", "2 — Dawn, Smouldering"],
        ["3", "3 — Cult Camp"],
        ["4", "4 — Road to Elturel"],
        ["5", "5 — Trail Rain"]
      ],
      locations: [
        "Greenest streets (burning)",
        "The Keep",
        "The Mill",
        "Sanctuary of Chauntea",
        "Market Square",
        "Old Tunnel",
        "River Chiontar",
        "Wilderness — Greenfields",
        "Cult Camp"
      ],
      heat: [
        ["1", "1 — Quiet"],
        ["2", "2 — Aware"],
        ["3", "3 — Active"],
        ["4", "4 — Alarmed"],
        ["5", "5 — Full Pursuit"]
      ],
      defaults: { episode: "1", heat: "3" }
    },
    quickActions: [
      { label: "Roll street encounter", roll: { notation: "1d8", name: "Street Encounter" }, prompt: "Street encounter #{roll} on the d8 table. Describe encounter #{roll} vividly with sensory detail. Do NOT include dice notation." },
      { label: "Sense the scene", prompt: "Describe what the players can see, smell and hear at their current location right now." },
      { label: "NPC locations", prompt: "Where is each major NPC right now and what are they doing?" },
      { label: "Music cue", prompt: "What music cue should be playing right now? Give the cue name and one sentence why." },
      { label: "Survivor rumour", roll: { notation: "1d6", name: "Survivor Rumour" }, prompt: "Rumour #{roll} from the d6 table. Voice it as the survivor in 2-3 sentences. Do NOT include dice notation." },
      { label: "Roll loot", roll: { notation: "1d6", name: "Raider Loot" }, prompt: "Players defeated raiders. Loot #{roll}. Describe entry #{roll} with sensory detail. Do NOT include dice notation." },
      { label: "Wilderness check", roll: { notation: "1d6", name: "Wilderness" }, prompt: "Wilderness encounter #{roll} for this half-day. Describe encounter #{roll}. Do NOT include dice notation." }
    ],
    maps: [
      {
        id: "greenest",
        name: "Greenest — The Burning",
        hotspots: [
          { x: 130, y: 110, name: "The Keep", text: "Governor Nighthill's stronghold." },
          { x: 510, y: 200, name: "The Mill", text: "Cultists trying to burn it." },
          { x: 360, y: 290, name: "Market Square", text: "Cyanwrath's challenge site." },
          { x: 280, y: 430, name: "Sanctuary of Chauntea", text: "50+ townspeople barricaded inside." },
          { x: 555, y: 360, name: "River Chiontar", text: "Shallow crossing east." },
          { x: 200, y: 230, name: "Old Tunnel exit", text: "Hidden cellar exit near the river." }
        ]
      },
      {
        id: "region",
        name: "Sword Coast — Region",
        hotspots: [
          { x: 130, y: 130, name: "Baldur's Gate", text: "160 miles NW." },
          { x: 230, y: 200, name: "Elturel", text: "90 miles NW." },
          { x: 380, y: 300, name: "Greenest", text: "Currently burning." },
          { x: 270, y: 410, name: "Cult Camp", text: "50 miles SW. Hatchery." },
          { x: 480, y: 380, name: "Greenfields", text: "Wilderness between." }
        ]
      },
      {
        id: "keep",
        name: "The Keep — Interior",
        hotspots: [
          { x: 300, y: 100, name: "Battlements", text: "Archers post." },
          { x: 200, y: 230, name: "Governor's Hall", text: "Mission briefings." },
          { x: 400, y: 260, name: "Courtyard", text: "Survivor triage." },
          { x: 300, y: 410, name: "Cellar / Tunnel", text: "Old tunnel hidden behind ale casks." }
        ]
      }
    ],
    lore: [
      {
        category: "The Cult",
        items: [
          { name: "Cult of the Dragon", text: "Necromancer cult dedicated to undead dragons. Recently shifted toward bringing Tiamat to the Material Plane via planar rift." },
          { name: "Frulam Mondath", text: "Wearer of Purple. Cold tactician. Threat 3/5." },
          { name: "Langdedrosa Cyanwrath", text: "Half-blue dragon. Honourable in his way. Threat 4/5." }
        ]
      },
      {
        category: "The Dragon",
        items: [
          { name: "Lennithon", text: "Adult blue dragon. Contracted, not believer. Threat 5/5." },
          { name: "Strafing pattern", text: "Every ten minutes a pass. Wingbeats stop seconds before — your warning." }
        ]
      },
      {
        category: "Allies",
        items: [
          { name: "Governor Nighthill", text: "Wounded. Pays 200gp/mission with corroboration." },
          { name: "Escobert the Red", text: "Dwarven castellan. Knows the old tunnel." }
        ]
      },
      {
        category: "Rules",
        items: [
          { name: "Heat", text: "Starts 1. +1 per noisy encounter. 4+ adds 2 enemies." },
          { name: "Magic items", text: "Consumables only until Episode 4." }
        ]
      }
    ],
    theme: { primary: "#d4b15a", accent: "#e0651a" }
  },

  blackhull: {
    id: "blackhull",
    name: "The Black Hull",
    subtitle: "Sci-fi salvage horror - Mothership-style",
    description: "A derelict colony ship has drifted out of the dust. The salvage crew docks. The lights are still on. The cargo manifest does not match what they find.",
    systemPrompt: `You are the World AI for "The Black Hull", a sci-fi salvage horror campaign. Default to ONE paragraph. Never preamble.

DICE RULES: NEVER fabricate roll results. If user gives you a result, use exactly that number. To ask for a roll, write [[XdY]].

WORLD: Colony ship "Praxis-9" left Sol 47 years ago, lost contact 31 years ago. Found in Kuiper belt, intact, lights on, no life signs.
LOCATIONS: DOCKING SPINE, COMMAND DECK, HABITATION RING, HYDROPONICS (plants in bulkheads), CRYO BAY (240 pods), ENGINEERING (drive offline), CARGO HOLD 7 (sealed FROM INSIDE).
ENCOUNTERS d6: 1 lights die 30s, 2 empty pod with frost from inside, 3 looped recording, 4 bulkhead seals behind, 5 thermal shape not visually there, 6 comms cut.
LOOT d6: 1 personal effects, 2 sidearm, 3 datapad, 4 medical stim, 5 sealed sample case, 6 captain keycard.`,
    contexts: {
      episodes: [
        ["1", "Act 1 — First Walk"],
        ["2", "Act 2 — Discovery"],
        ["3", "Act 3 — Contact"]
      ],
      locations: [
        "Docking Spine",
        "Command Deck",
        "Habitation Ring",
        "Hydroponics",
        "Cryo Bay",
        "Engineering",
        "Cargo Hold 7",
        "Shuttle (returning)"
      ],
      heat: [
        ["1", "1 — Calm"],
        ["2", "2 — Watched"],
        ["3", "3 — Active"],
        ["4", "4 — Hostile"],
        ["5", "5 — Containment Lost"]
      ],
      defaults: { episode: "1", heat: "1" }
    },
    quickActions: [
      { label: "Roll encounter", roll: { notation: "1d6", name: "Ship Encounter" }, prompt: "Ship encounter #{roll} on the d6 table. Describe encounter #{roll} cinematically — focus on dread. Do NOT include dice notation." },
      { label: "Ship ambient", prompt: "Describe the sensory ambient at the current location." },
      { label: "Recover a log", prompt: "The party finds a partial audio log. Voice the dead crew member." },
      { label: "Sanity check", roll: { notation: "1d10", name: "Sanity Damage" }, prompt: "Sanity check failed. Cost: {roll}. Describe what triggered it. Do NOT include dice notation." },
      { label: "Panic roll", roll: { notation: "1d100", name: "Panic Roll" }, prompt: "Panic trigger. Rolled {roll} on d100. Under 50: held it. 50-79: minor panic. 80+: severe. Narrate. Do NOT include dice notation." },
      { label: "Pod loot", roll: { notation: "1d6", name: "Pod Loot" }, prompt: "Cracked a cryo pod. Loot #{roll}. Describe entry #{roll} AND the body. Do NOT include dice notation." }
    ],
    maps: [
      {
        id: "praxis",
        name: "Praxis-9 — Cross-section",
        hotspots: [
          { x: 80, y: 220, name: "Docking Spine", text: "Salvage shuttle clamped here." },
          { x: 200, y: 180, name: "Command Deck", text: "Captain's harness still buckled." },
          { x: 330, y: 220, name: "Habitation Ring", text: "Personal effects untouched." },
          { x: 440, y: 280, name: "Hydroponics", text: "Plants grown INTO the bulkheads." },
          { x: 350, y: 360, name: "Cryo Bay", text: "240 pods. None open. Yet." },
          { x: 220, y: 380, name: "Engineering", text: "Drive offline. Something hums." },
          { x: 510, y: 400, name: "Cargo Hold 7", text: "Sealed FROM INSIDE." }
        ]
      }
    ],
    lore: [
      {
        category: "The Ship",
        items: [
          { name: "Praxis-9", text: "Generation colony ship. 240 cryo passengers, 12-person waking crew. Lost contact 31 years ago." },
          { name: "The Find", text: "Drifting in Kuiper belt. Lights on. Atmosphere breathable. No life signs." }
        ]
      },
      {
        category: "Rules",
        items: [
          { name: "Sanity", text: "Damage on traumatic stimuli. Zero = permanent disorder." },
          { name: "Panic", text: "Triggered by Stress. Roll under Sanity to hold." }
        ]
      }
    ],
    theme: { primary: "#5acdd4", accent: "#e0651a" }
  }
}
