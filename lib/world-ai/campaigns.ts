// Campaign data for World AI - D&D Campaign Engine
// Supports multiple campaign types with system prompts, maps, lore, and quick actions

export interface CampaignHotspot {
  x: number
  y: number
  name: string
  text: string
}

export interface CampaignMap {
  id: string
  name: string
  svg: string
  hotspots: CampaignHotspot[]
}

export interface LoreItem {
  name: string
  text: string
}

export interface LoreCategory {
  category: string
  items: LoreItem[]
}

export interface QuickAction {
  label: string
  prompt: string
  roll?: {
    notation: string
    name: string
  }
}

export interface CampaignContexts {
  episodes: [string, string][]
  locations: string[]
  heat: [string, string][]
  defaults: {
    episode: string
    heat: string
  }
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
  theme: {
    primary: string
    accent: string
  }
}

// SVG Map generators
function greenestMap(): string {
  return `<svg viewBox="0 0 700 500" class="map-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="parch" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#3a3024"/><stop offset="100%" stop-color="#1f1812"/></radialGradient>
      <radialGradient id="firegrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ff8530" stop-opacity="0.7"/><stop offset="100%" stop-color="#e0651a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="700" height="500" fill="url(#parch)"/>
    <path d="M 580 0 Q 540 150 555 280 Q 570 400 540 500" stroke="#3a5060" stroke-width="22" fill="none" opacity="0.7"/>
    <path d="M 0 230 L 250 230 L 360 290 L 480 350 L 540 380" stroke="#5a4a30" stroke-width="8" fill="none" opacity="0.5" stroke-dasharray="10,6"/>
    <rect x="100" y="80" width="100" height="80" rx="6" fill="#2a2218" stroke="#5a4a38" stroke-width="2"/>
    <text x="150" y="126" text-anchor="middle" fill="#c9b896" font-family="Cinzel, serif" font-size="10">THE KEEP</text>
    <ellipse cx="500" cy="200" rx="55" ry="35" fill="#1a1510"/>
    <circle cx="500" cy="200" r="25" fill="url(#firegrad)" opacity="0.8"/>
    <text x="500" y="240" text-anchor="middle" fill="#ff8530" font-size="9" font-family="Cinzel, serif">THE MILL (BURNING)</text>
    <rect x="320" y="270" width="90" height="50" rx="4" fill="#25201a" stroke="#4a3a28" stroke-width="1"/>
    <text x="365" y="300" text-anchor="middle" fill="#c9b896" font-size="9" font-family="Cinzel, serif">MARKET SQUARE</text>
    <ellipse cx="280" cy="430" rx="60" ry="40" fill="#1f1a14" stroke="#6a5a3a" stroke-width="1"/>
    <text x="280" y="435" text-anchor="middle" fill="#c9b896" font-size="9" font-family="Cinzel, serif">SANCTUARY</text>
    <text x="560" y="370" fill="#4a6a7a" font-size="8" font-family="Share Tech Mono, monospace">River Chiontar</text>
    <text x="200" y="240" fill="#5a4a30" font-size="7" opacity="0.6" font-family="Share Tech Mono, monospace">Old Tunnel</text>
  </svg>`
}

function regionMap(): string {
  return `<svg viewBox="0 0 600 480" class="map-svg" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="480" fill="#1a1510"/>
    <path d="M0 100 Q150 80 300 120 Q450 160 600 100" stroke="#3a3024" stroke-width="40" fill="none" opacity="0.4"/>
    <text x="130" y="140" fill="#c9b896" font-size="12" font-family="Cinzel, serif">Baldur&apos;s Gate</text>
    <text x="230" y="210" fill="#c9b896" font-size="11" font-family="Cinzel, serif">Elturel</text>
    <text x="380" y="310" fill="#e0651a" font-size="13" font-family="Cinzel, serif" font-weight="bold">GREENEST</text>
    <text x="270" y="420" fill="#8a7060" font-size="10" font-family="Cinzel, serif">Cult Camp</text>
    <text x="480" y="390" fill="#5a5040" font-size="9" font-family="Share Tech Mono, monospace">Greenfields</text>
    <path d="M130 150 L230 200 L380 300" stroke="#5a4a30" stroke-width="2" fill="none" stroke-dasharray="8,4" opacity="0.6"/>
    <path d="M380 300 L270 410" stroke="#8a3020" stroke-width="2" fill="none" stroke-dasharray="6,4" opacity="0.8"/>
  </svg>`
}

function keepMap(): string {
  return `<svg viewBox="0 0 600 480" class="map-svg" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="480" fill="#1f1a14"/>
    <rect x="100" y="50" width="400" height="380" rx="8" fill="#2a2218" stroke="#5a4a38" stroke-width="3"/>
    <rect x="250" y="60" width="100" height="60" fill="#1a1510" stroke="#4a3a28"/>
    <text x="300" y="95" text-anchor="middle" fill="#c9b896" font-size="10" font-family="Cinzel, serif">BATTLEMENTS</text>
    <rect x="140" y="180" width="120" height="100" rx="4" fill="#25201a" stroke="#6a5a3a"/>
    <text x="200" y="235" text-anchor="middle" fill="#c9b896" font-size="9" font-family="Cinzel, serif">Governor&apos;s Hall</text>
    <rect x="340" y="200" width="120" height="120" rx="4" fill="#1a1510"/>
    <text x="400" y="265" text-anchor="middle" fill="#7a9878" font-size="9" font-family="Cinzel, serif">COURTYARD</text>
    <ellipse cx="300" cy="400" rx="80" ry="30" fill="#15120e" stroke="#4a3a28"/>
    <text x="300" y="405" text-anchor="middle" fill="#8a7060" font-size="9" font-family="Cinzel, serif">Cellar / Tunnel</text>
  </svg>`
}

function velkynvelveMap(): string {
  return `<svg viewBox="0 0 700 500" class="map-svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="cavern" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#1a1520"/><stop offset="100%" stop-color="#0a0810"/></radialGradient>
      <radialGradient id="webglow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#4a3a5a" stop-opacity="0.3"/><stop offset="100%" stop-color="#2a1a3a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="700" height="500" fill="url(#cavern)"/>
    <path d="M100 200 Q200 150 350 100 Q500 50 600 120" stroke="#3a2a4a" stroke-width="1" fill="none" opacity="0.4"/>
    <path d="M50 350 Q150 320 200 340 Q300 380 400 350 Q550 300 650 380" stroke="#3a2a4a" stroke-width="1" fill="none" opacity="0.3"/>
    <ellipse cx="350" cy="100" rx="80" ry="40" fill="#2a1a35" stroke="#5a3a6a" stroke-width="2"/>
    <text x="350" y="105" text-anchor="middle" fill="#9a7ab8" font-size="10" font-family="Cinzel, serif">SLAVE PEN</text>
    <rect x="140" y="160" width="120" height="80" rx="4" fill="#1a1520" stroke="#4a3a5a" stroke-width="1"/>
    <text x="200" y="205" text-anchor="middle" fill="#8a6a9a" font-size="9" font-family="Cinzel, serif">Guard Barracks</text>
    <ellipse cx="500" cy="200" rx="70" ry="50" fill="#25152a" stroke="#6a4a7a" stroke-width="2"/>
    <text x="500" y="205" text-anchor="middle" fill="#b87ac8" font-size="9" font-family="Cinzel, serif">Ilvara&apos;s Chamber</text>
    <path d="M100 340 L200 340 Q250 340 280 370" stroke="#5a3a6a" stroke-width="3" fill="none"/>
    <text x="150" y="355" fill="#7a5a8a" font-size="9" font-family="Cinzel, serif">Webbed Bridge</text>
    <rect x="280" y="350" width="140" height="60" fill="#0a0510" stroke="#3a1a4a"/>
    <text x="350" y="385" text-anchor="middle" fill="#5a3a6a" font-size="9" font-family="Share Tech Mono, monospace">THE CHASM</text>
    <ellipse cx="540" cy="360" rx="60" ry="40" fill="#1a1015" stroke="#4a3a4a"/>
    <text x="540" y="365" text-anchor="middle" fill="#8a7080" font-size="8" font-family="Cinzel, serif">Quaggoth Pens</text>
  </svg>`
}

function underdarkRouteMap(): string {
  return `<svg viewBox="0 0 600 500" class="map-svg" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="500" fill="#0a0810"/>
    <path d="M100 80 Q180 120 220 170 Q280 220 350 230 Q420 240 460 150" stroke="#3a2a4a" stroke-width="2" fill="none" stroke-dasharray="6,4" opacity="0.6"/>
    <path d="M350 230 Q320 290 300 340 Q280 400 380 430" stroke="#3a2a4a" stroke-width="2" fill="none" stroke-dasharray="6,4" opacity="0.6"/>
    <path d="M350 230 L150 300" stroke="#2a4a3a" stroke-width="2" fill="none" stroke-dasharray="4,4" opacity="0.5"/>
    <circle cx="100" cy="80" r="8" fill="#5a3a6a"/>
    <text x="100" y="60" text-anchor="middle" fill="#9a7ab8" font-size="9" font-family="Cinzel, serif">Velkynvelve</text>
    <circle cx="220" cy="170" r="6" fill="#3a5a6a"/>
    <text x="220" y="155" text-anchor="middle" fill="#7aa8c8" font-size="8" font-family="Cinzel, serif">Sloobludop</text>
    <ellipse cx="350" cy="230" rx="40" ry="20" fill="#1a2a3a" opacity="0.6"/>
    <text x="350" y="235" text-anchor="middle" fill="#5a8aaa" font-size="9" font-family="Cinzel, serif">Darklake</text>
    <circle cx="460" cy="150" r="8" fill="#5a3a2a"/>
    <text x="460" y="135" text-anchor="middle" fill="#c8865a" font-size="8" font-family="Cinzel, serif">Gracklstugh</text>
    <circle cx="300" cy="340" r="7" fill="#3a5a3a"/>
    <text x="300" y="325" text-anchor="middle" fill="#7ac87a" font-size="8" font-family="Cinzel, serif">Neverlight Grove</text>
    <circle cx="150" cy="300" r="6" fill="#5a5a6a"/>
    <text x="150" y="285" text-anchor="middle" fill="#9a9ac8" font-size="8" font-family="Cinzel, serif">Blingdenstone</text>
    <circle cx="500" cy="380" r="6" fill="#6a5a4a"/>
    <text x="500" y="365" text-anchor="middle" fill="#c9b896" font-size="8" font-family="Cinzel, serif">Gravenhollow</text>
    <circle cx="380" cy="430" r="7" fill="#5a2a2a"/>
    <text x="380" y="455" text-anchor="middle" fill="#c87a7a" font-size="8" font-family="Cinzel, serif">The Labyrinth</text>
  </svg>`
}

// Campaign definitions
export const CAMPAIGNS: Record<string, Campaign> = {
  tyranny: {
    id: 'tyranny',
    name: 'Ashes of Prometheus',
    subtitle: 'Tyranny of Dragons - D&D 5E',
    description: 'Greenest is sacked by the Cult of the Dragon. The party must defend the keep, rescue survivors, and follow the trail to a hidden hatchery serving Tiamat.',
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
      episodes: [['1', '1 — Night of the Raid'], ['2', '2 — Dawn, Smouldering'], ['3', '3 — Cult Camp'], ['4', '4 — Road to Elturel'], ['5', '5 — Trail Rain']],
      locations: ['Greenest streets (burning)', 'The Keep', 'The Mill', 'Sanctuary of Chauntea', 'Market Square', 'Old Tunnel', 'River Chiontar', 'Wilderness — Greenfields', 'Cult Camp'],
      heat: [['1', '1 — Quiet'], ['2', '2 — Aware'], ['3', '3 — Active'], ['4', '4 — Alarmed'], ['5', '5 — Full Pursuit']],
      defaults: { episode: '1', heat: '3' }
    },
    quickActions: [
      { label: 'Roll street encounter', roll: { notation: '1d8', name: 'Street Encounter' }, prompt: 'Street encounter #{roll} on the d8 table. Describe encounter #{roll} vividly with sensory detail. Do NOT include dice notation.' },
      { label: 'Sense the scene', prompt: 'Describe what the players can see, smell and hear at their current location right now.' },
      { label: 'NPC locations', prompt: 'Where is each major NPC right now and what are they doing?' },
      { label: 'Music cue', prompt: 'What music cue should be playing right now? Give the cue name and one sentence why.' },
      { label: 'Survivor rumour', roll: { notation: '1d6', name: 'Survivor Rumour' }, prompt: 'Rumour #{roll} from the d6 table. Voice it as the survivor in 2-3 sentences. Do NOT include dice notation.' },
      { label: 'Roll loot', roll: { notation: '1d6', name: 'Raider Loot' }, prompt: 'Players defeated raiders. Loot #{roll}. Describe entry #{roll} with sensory detail. Do NOT include dice notation.' },
      { label: 'Wilderness check', roll: { notation: '1d6', name: 'Wilderness' }, prompt: 'Wilderness encounter #{roll} for this half-day. Describe encounter #{roll}. Do NOT include dice notation.' }
    ],
    maps: [
      {
        id: 'greenest', name: 'Greenest — The Burning', svg: greenestMap(),
        hotspots: [
          { x: 130, y: 110, name: 'The Keep', text: "Governor Nighthill's stronghold." },
          { x: 510, y: 200, name: 'The Mill', text: 'Cultists trying to burn it.' },
          { x: 360, y: 290, name: 'Market Square', text: "Cyanwrath's challenge site." },
          { x: 280, y: 430, name: 'Sanctuary of Chauntea', text: '50+ townspeople barricaded inside.' },
          { x: 555, y: 360, name: 'River Chiontar', text: 'Shallow crossing east.' },
          { x: 200, y: 230, name: 'Old Tunnel exit', text: 'Hidden cellar exit near the river.' }
        ]
      },
      {
        id: 'region', name: 'Sword Coast — Region', svg: regionMap(),
        hotspots: [
          { x: 130, y: 130, name: "Baldur's Gate", text: '160 miles NW.' },
          { x: 230, y: 200, name: 'Elturel', text: '90 miles NW.' },
          { x: 380, y: 300, name: 'Greenest', text: 'Currently burning.' },
          { x: 270, y: 410, name: 'Cult Camp', text: '50 miles SW. Hatchery.' },
          { x: 480, y: 380, name: 'Greenfields', text: 'Wilderness between.' }
        ]
      },
      {
        id: 'keep', name: 'The Keep — Interior', svg: keepMap(),
        hotspots: [
          { x: 300, y: 100, name: 'Battlements', text: 'Archers post.' },
          { x: 200, y: 230, name: "Governor's Hall", text: 'Mission briefings.' },
          { x: 400, y: 260, name: 'Courtyard', text: 'Survivor triage.' },
          { x: 300, y: 410, name: 'Cellar / Tunnel', text: 'Old tunnel hidden behind ale casks.' }
        ]
      }
    ],
    lore: [
      {
        category: 'The Cult', items: [
          { name: 'Cult of the Dragon', text: 'Necromancer cult dedicated to undead dragons. Recently shifted toward bringing Tiamat to the Material Plane via planar rift.' },
          { name: 'Frulam Mondath', text: 'Wearer of Purple. Cold tactician. Threat 3/5.' },
          { name: 'Langdedrosa Cyanwrath', text: 'Half-blue dragon. Honourable in his way. Threat 4/5.' }
        ]
      },
      {
        category: 'The Dragon', items: [
          { name: 'Lennithon', text: 'Adult blue dragon. Contracted, not believer. Threat 5/5.' },
          { name: 'Strafing pattern', text: 'Every ten minutes a pass. Wingbeats stop seconds before — your warning.' }
        ]
      },
      {
        category: 'Allies', items: [
          { name: 'Governor Nighthill', text: 'Wounded. Pays 200gp/mission with corroboration.' },
          { name: 'Escobert the Red', text: 'Dwarven castellan. Knows the old tunnel.' }
        ]
      },
      {
        category: 'Rules', items: [
          { name: 'Heat', text: 'Starts 1. +1 per noisy encounter. 4+ adds 2 enemies.' },
          { name: 'Magic items', text: 'Consumables only until Episode 4.' }
        ]
      }
    ],
    theme: { primary: '#d4b15a', accent: '#e0651a' }
  },

  abyss: {
    id: 'abyss',
    name: 'Out of the Abyss',
    subtitle: 'Underdark survival horror - D&D 5E',
    description: 'The party wakes as drow prisoners in Velkynvelve, deep in the Underdark. Demon lords have been summoned. Reality is fraying. Escape is just the beginning.',
    systemPrompt: `You are the World AI for "Out of the Abyss", running the D&D 5E Underdark campaign. Be a fast, precise mid-session reference. Default to ONE paragraph. Never preamble.

DICE RULES — CRITICAL: NEVER fabricate roll results. If the user gives you a result, use exactly that number. To ask for a new roll, write [[XdY+Z]].

WORLD: The Underdark, Faerûn. Drow priestesses' reckless summonings have torn the Abyss open — 8 demon lords are loose.

CHAPTER 1 — PRISONERS OF THE DROW (Starting Rules):
STARTING CONDITIONS: PCs wake in Velkynvelve slave pen. NO gear, NO spell components. Manacles (restrained, normal speed). Collared. Been here 1d10 days. Magical wards block spells cast inside pen (but not from outside).
SCAVENGED ITEMS (d100, roll ONCE per PC at start): 01-10 Gold coin, 11-16 Carnelian gem (10gp), 17-22 Obsidian flake dagger (1d4 slashing), 23-28 Crossbow bolt, 29-34 1d4 mushrooms (edible), 35-40 Coil of silk rope (50ft), 41-46 Belt pouch with 1d4 cp, 47-52 Drow poison (unconscious 1hr on fail DC 13 CON), 53-58 Flask of lamp oil, 59-64 Waterskin, 65-70 Hand crossbow, 71-76 Shattered spellbook pages (contains 1 random cantrip), 77-82 Iron key (fits manacles), 83-88 Bag of caltrops, 89-94 Tin mess kit, 95-100 Nothing. NOTE: Rogues may have concealed lockpick (DM discretion). Wizards may have 1 spell component.
ESCAPE OPTIONS: (1) Jorlan unlocks door (he hates Ilvara for dumping him), (2) Demon attack chaos, (3) Steal during slave work.
SLAVE DUTIES: Fill water barrels, operate lift, clean barracks, empty chamber pots (grey ooze in pool!), food prep (knives available), laundry. Stealing requires DEX (Sleight of Hand) vs guard passive Perception.
PLAYER GEAR: Locked in Ilvara's chest (area 7). Getting it is near-suicide without a plan.
MANACLES: Slip DC 20 DEX, Break DC 20 STR, Pick DC 20 DEX (disadvantage without tools).

ACTS: 1 Escape Velkynvelve · 2 Discovery (settlements + demon signs) · 3 Madness Rising (Labyrinth, Vizeran) · 4 Surface coordination + banishment ritual.
LOCATIONS: VELKYNVELVE (drow slave outpost, start), SLOOBLUDOP (kuo-toa, Demogorgon corruption), DARKLAKE (vast subterranean sea), GRACKLSTUGH (duergar city, Themberchaud the trapped red dragon), NEVERLIGHT GROVE (Zuggtmoy myconid colony), BLINGDENSTONE (deep gnomes, friendly), GRAVENHOLLOW (stone giant library), THE LABYRINTH (Yeenoghu/Baphomet), MANTOL-DERITH (neutral trade), MENZOBERRANZAN (drow city, optional).
PRISONERS (Act 1 companions): Eldeth (dwarf scout, loyal, AC12 HP16), Stool (myconid sprout, telepathic rapport spores 3/day), Sarith (drow, infected by Zuggtmoy spores - will betray at Neverlight), Buppido (derro, secretly insane serial killer god-complex), Prince Derendil (quaggoth AC13 HP45, believes he's cursed elf prince), Topsy & Turvy (gnome twins, secretly wererats), Jimjar (gambler gnome, possibly a god in disguise), Ront (cowardly orc bully, picks on Stool), Shuushar (pacifist kuo-toa, will not fight).
DROW PURSUERS: Ilvara Mizzrym (5/5, vain priestess AC16 HP71, WAY too powerful to fight), Shoor Vandree (4/5, arrogant lieutenant/lover, has wand of viscid globs), Jorlan Duskryn (3/5, scarred and bitter, secret ally - will help escape to spite Ilvara), Asha Vandree (apprentice, secretly antagonizing Jorlan).
DEMON LORDS LOOSE: Demogorgon (madness, Darklake), Zuggtmoy (fungus, Neverlight), Juiblex (slime, Gracklstugh), Yeenoghu (slaughter, Labyrinth), Baphomet (mazes), Fraz-Urb'luu (illusion), Orcus (undeath), Graz'zt (cruelty).
TRAVEL d12: 1 drow patrol, 2 giant centipede, 3 hook horrors, 4 duergar scouts, 5 carrion crawler, 6 quaggoth hunters, 7 fire beetle swarm, 8 stirges, 9 lost miner ghosts, 10 friendly merchant, 11 demon-lord madness manifestation, 12 unnatural silence.
MADNESS: Witnessing a demon lord triggers a save. Short-term (1d10 min), Long-term (1d10×10 hours), Indefinite (until cured). Lean into the roleplay.
HEAT (Act 1 pursuit): 1-2 far behind, 3-4 closing, 5 caught. -1 with hidden travel/water crossings, +1 with combat/bodies/obvious route.
ESCAPE ROUTES: North (Menzoberranzan, 26 days - BAD), West (Darklake), South (Gracklstugh, 28 days).`,
    contexts: {
      episodes: [['1', 'Act 1 — Escape Velkynvelve'], ['2', 'Act 2 — Discovery'], ['3', 'Act 3 — Madness Rising'], ['4', 'Act 4 — The Ritual']],
      locations: ['Velkynvelve (slave pen)', 'Velkynvelve (outpost)', 'Underdark tunnels', 'Sloobludop', 'The Darklake', 'Gracklstugh', 'Neverlight Grove', 'Blingdenstone', 'Gravenhollow', 'The Labyrinth', 'Mantol-Derith', 'Surface — Gauntlgrym'],
      heat: [['1', '1 — Lost their trail'], ['2', '2 — Pursuit far'], ['3', '3 — Pursuit closing'], ['4', '4 — Patrol close'], ['5', '5 — Caught']],
      defaults: { episode: '1', heat: '3' }
    },
    quickActions: [
      { label: 'Roll travel encounter', roll: { notation: '1d12', name: 'Underdark Travel' }, prompt: 'Travel encounter #{roll} on the d12 table. Describe encounter #{roll} cinematically — focus on dread, distance, the dark. Do NOT include dice notation.' },
      { label: 'Sense the dark', prompt: 'Describe what the players see, hear, smell and feel at their current Underdark location right now. Lean into oppressive sensory detail.' },
      { label: 'Prisoner status', prompt: 'Where is each surviving prisoner-NPC right now and what are they doing? Reveal hidden agendas only if context suggests now.' },
      { label: 'Music cue', prompt: 'What music cue should be playing right now? Give the cue name and one sentence why.' },
      { label: 'Underdark rumour', roll: { notation: '1d8', name: 'Underdark Rumour' }, prompt: 'Rumour #{roll} from the d8 table. Voice it as the traveller speaking it in 2-3 sentences. Do NOT include dice notation.' },
      { label: 'Roll loot', roll: { notation: '1d8', name: 'Underdark Loot' }, prompt: 'Players defeated a foe. Loot #{roll}. Describe entry #{roll} with sensory detail — the Underdark hoards strangely. Do NOT include dice notation.' },
      { label: 'Madness check', roll: { notation: '1d10', name: 'Madness Roll' }, prompt: 'A character witnessed something unspeakable. Madness #{roll}. Pick the affliction and narrate the moment it takes hold. Do NOT include dice notation.' },
      { label: 'Escape encounter', roll: { notation: '1d6', name: 'Velkynvelve Escape' }, prompt: 'Velkynvelve escape encounter #{roll} on the d6 table. Describe it. Do NOT include dice notation.' }
    ],
    maps: [
      {
        id: 'velkynvelve', name: 'Velkynvelve — The Outpost', svg: velkynvelveMap(),
        hotspots: [
          { x: 350, y: 100, name: 'The Slave Pen', text: 'Bamboo cage on a high ledge. Where the campaign begins.' },
          { x: 200, y: 200, name: 'Guard Barracks', text: 'Drow quarters. Confiscated gear is locked here.' },
          { x: 500, y: 200, name: "Ilvara's Chamber", text: 'Priestess of Lolth. Cruel, vain.' },
          { x: 150, y: 340, name: 'Webbed Bridge', text: 'The only way out. Final beat of the escape.' },
          { x: 350, y: 380, name: 'The Chasm', text: 'A drop into nothing. Fall = death.' },
          { x: 540, y: 360, name: 'Quaggoth Pens', text: 'White-furred bear-things. Drow shock troops.' }
        ]
      },
      {
        id: 'underdark-route', name: 'Underdark — The Route', svg: underdarkRouteMap(),
        hotspots: [
          { x: 100, y: 80, name: 'Velkynvelve', text: 'Where it began. The drow outpost.' },
          { x: 220, y: 170, name: 'Sloobludop', text: 'Kuo-toa fishing village. Demogorgon prophecy.' },
          { x: 350, y: 230, name: 'The Darklake', text: 'Vast underground sea. Aboleths below.' },
          { x: 460, y: 150, name: 'Gracklstugh', text: 'Duergar forge city. Themberchaud beneath.' },
          { x: 300, y: 340, name: 'Neverlight Grove', text: 'Myconid colony. Zuggtmoy. Beautiful then wrong.' },
          { x: 150, y: 300, name: 'Blingdenstone', text: 'Deep gnomes. The only welcome you will find.' },
          { x: 500, y: 380, name: 'Gravenhollow', text: 'Stone giant library. Past, present, future.' },
          { x: 380, y: 430, name: 'The Labyrinth', text: 'Yeenoghu hunts here. Geometry breaks.' }
        ]
      }
    ],
    lore: [
      {
        category: 'The Demon Lords', items: [
          { name: 'Demogorgon', text: 'Two-headed prince of demons. Madness. Worshipped at Sloobludop. Witnesses suffer permanent insanity.' },
          { name: 'Zuggtmoy', text: 'Fungus, decay, infection. Corrupts myconid colonies. Spreads through spores. Stronghold: Neverlight Grove.' },
          { name: 'Juiblex', text: 'Slime, dissolution. Hunts near Gracklstugh — the forge draws it.' },
          { name: 'Yeenoghu', text: 'Slaughter, the hunt. The Labyrinth runs with his gnoll-spawn.' },
          { name: 'Baphomet', text: 'The Labyrinth itself is his manifestation. Travellers lose their way and themselves.' }
        ]
      },
      {
        category: 'The Drow', items: [
          { name: 'Ilvara Mizzrym', text: 'Priestess of Lolth. Vain, cruel, takes the escape personally. Recurring villain. Threat 4/5.' },
          { name: 'Vizeran DeVir', text: 'Exiled drow archmage. Knows the banishment ritual. Not to be trusted.' }
        ]
      },
      {
        category: 'Allies', items: [
          { name: 'Eldeth Feldrun', text: 'Shield dwarf fighter, fellow prisoner. Wants Gauntlgrym. Honest.' },
          { name: 'Stool', text: 'Myconid sprout, telepathic via spores. Bonds with players.' },
          { name: 'Themberchaud', text: 'Red dragon trapped in Gracklstugh forge. Ally, hostage, or threat.' },
          { name: 'King Bruenor', text: 'Coordinates surface response from Gauntlgrym. Act 4 ally.' }
        ]
      },
      {
        category: 'Hidden Threats', items: [
          { name: 'Sarith Kzekarit', text: 'Fellow prisoner. Infected by Zuggtmoy. Will betray the party at Neverlight Grove.' },
          { name: 'Buppido', text: 'Derro prisoner. Serial killer. Believes himself a god. Murders quietly on the road.' }
        ]
      },
      {
        category: 'Rules', items: [
          { name: 'Faerzress', text: 'Underdark magical radiation. Blocks teleport/scry. Binds demons. The ritual exploits it.' },
          { name: 'Madness', text: 'Witnessing a demon lord = madness save. Short-term, Long-term, or Indefinite. Lean into roleplay.' },
          { name: 'Travel', text: 'DC 15 Survival/day for nav. Light = noise. Long rest only in safe holds.' },
          { name: 'Heat (pursuit)', text: 'Act 1: drow chase. 1-2 far, 3-4 closing, 5 caught. Hidden travel reduces. Combat increases.' }
        ]
      }
    ],
    theme: { primary: '#9a7ab8', accent: '#5a8a4a' }
  }
}

export function getCampaign(id: string): Campaign | undefined {
  return CAMPAIGNS[id]
}

export function getAllCampaigns(): Campaign[] {
  return Object.values(CAMPAIGNS)
}
