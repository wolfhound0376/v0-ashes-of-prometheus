"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Send, MapPin, BookOpen, Library, MessageSquare, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Sparkles, ChevronRight, X } from "lucide-react"

// Campaign data
const CAMPAIGNS = {
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
      episodes: [
        ['1', '1 — Night of the Raid'],
        ['2', '2 — Dawn, Smouldering'],
        ['3', '3 — Cult Camp'],
        ['4', '4 — Road to Elturel'],
        ['5', '5 — Trail Rain']
      ],
      locations: [
        'Greenest streets (burning)',
        'The Keep',
        'The Mill',
        'Sanctuary of Chauntea',
        'Market Square',
        'Old Tunnel',
        'River Chiontar',
        'Wilderness — Greenfields',
        'Cult Camp'
      ],
      heat: [
        ['1', '1 — Quiet'],
        ['2', '2 — Aware'],
        ['3', '3 — Active'],
        ['4', '4 — Alarmed'],
        ['5', '5 — Full Pursuit']
      ],
      defaults: { episode: '1', location: 'The Keep', heat: '3' }
    },
    quickActions: [
      { label: 'Roll street encounter', roll: { notation: '1d8', name: 'Street Encounter' }, prompt: 'Street encounter on the d8 table. Describe the encounter vividly with sensory detail.' },
      { label: 'Sense the scene', prompt: 'Describe what the players can see, smell and hear at their current location right now.' },
      { label: 'NPC locations', prompt: 'Where is each major NPC right now and what are they doing?' },
      { label: 'Music cue', prompt: 'What music cue should be playing right now? Give the cue name and one sentence why.' },
      { label: 'Survivor rumour', roll: { notation: '1d6', name: 'Survivor Rumour' }, prompt: 'A survivor shares a rumour. Voice it as the survivor in 2-3 sentences.' },
      { label: 'Roll loot', roll: { notation: '1d6', name: 'Raider Loot' }, prompt: 'Players defeated raiders. Describe the loot with sensory detail.' },
      { label: 'Wilderness check', roll: { notation: '1d6', name: 'Wilderness' }, prompt: 'Wilderness encounter for this half-day. Describe what happens.' }
    ],
    maps: [
      {
        id: 'greenest',
        name: 'Greenest — The Burning',
        hotspots: [
          { x: 22, y: 22, name: 'The Keep', text: "Governor Nighthill's stronghold. Wounded arm in sling. Pays 200gp/mission." },
          { x: 73, y: 40, name: 'The Mill', text: 'Cultists trying to burn it — actually a trap to lure defenders.' },
          { x: 51, y: 58, name: 'Market Square', text: "Cyanwrath's challenge site. Half-blue dragon, threat 4/5." },
          { x: 40, y: 86, name: 'Sanctuary of Chauntea', text: '50+ townspeople barricaded inside. Kobolds trying to smoke them out.' },
          { x: 79, y: 72, name: 'River Chiontar', text: 'Shallow crossing east. Escape route.' },
          { x: 29, y: 46, name: 'Old Tunnel exit', text: 'Hidden cellar exit near the river. Escobert knows it.' }
        ]
      },
      {
        id: 'region',
        name: 'Sword Coast — Region',
        hotspots: [
          { x: 19, y: 26, name: "Baldur's Gate", text: '160 miles NW. Major city.' },
          { x: 33, y: 40, name: 'Elturel', text: '90 miles NW. Ontharr Frume (paladin) is here.' },
          { x: 54, y: 60, name: 'Greenest', text: 'Currently burning. Cult raid in progress.' },
          { x: 39, y: 82, name: 'Cult Camp', text: '50 miles SW. Dragon hatchery. Leosin captive.' },
          { x: 69, y: 76, name: 'Greenfields', text: 'Wilderness between. Roll encounters.' }
        ]
      },
      {
        id: 'keep',
        name: 'The Keep — Interior',
        hotspots: [
          { x: 50, y: 20, name: 'Battlements', text: 'Archers post. Lennithon strafes every 10 minutes.' },
          { x: 33, y: 46, name: "Governor's Hall", text: 'Mission briefings. Nighthill here.' },
          { x: 67, y: 52, name: 'Courtyard', text: 'Survivor triage. 30+ wounded.' },
          { x: 50, y: 82, name: 'Cellar / Tunnel', text: 'Old tunnel hidden behind ale casks. Leads outside walls.' }
        ]
      }
    ],
    lore: [
      {
        category: 'The Cult',
        items: [
          { name: 'Cult of the Dragon', text: 'Necromancer cult dedicated to undead dragons. Recently shifted toward bringing Tiamat to the Material Plane via planar rift.' },
          { name: 'Frulam Mondath', text: 'Wearer of Purple. Cold tactician. Threat 3/5. Commands the camp.' },
          { name: 'Langdedrosa Cyanwrath', text: 'Half-blue dragon. Honorable in his way. Threat 4/5. Issues ritual challenges.' }
        ]
      },
      {
        category: 'The Dragon',
        items: [
          { name: 'Lennithon', text: 'Adult blue dragon. Contracted, not a believer. Threat 5/5. Can be convinced to leave if wounded or bored.' },
          { name: 'Strafing pattern', text: 'Every ten minutes a pass. Wingbeats stop seconds before — your warning.' }
        ]
      },
      {
        category: 'Allies',
        items: [
          { name: 'Governor Nighthill', text: 'Wounded arm. Pays 200gp/mission with corroboration. Desperate.' },
          { name: 'Escobert the Red', text: 'Dwarven castellan. Knows the old tunnel. Gruff but loyal.' },
          { name: 'Leosin Erlanthar', text: 'Harper monk. Captive in Episode 3. Has vital intelligence on cult movements.' }
        ]
      },
      {
        category: 'Rules',
        items: [
          { name: 'Heat', text: 'Starts 1. +1 per noisy encounter. 4+ adds 2 enemies to future encounters.' },
          { name: 'Magic items', text: 'Consumables only until Episode 4. Save the good stuff.' },
          { name: 'Dragon timing', text: 'Lennithon strafes every 10 minutes. 2d6 lightning breath, DC 15 Dex save.' }
        ]
      }
    ],
    theme: { primary: '#d4b15a', accent: '#e0651a' }
  }
}

type Campaign = typeof CAMPAIGNS.tyranny
type ViewTab = 'chat' | 'maps' | 'lore' | 'library'

interface Message {
  id: string
  role: 'user' | 'world' | 'error' | 'thinking'
  content: string
  timestamp: Date
}

interface WorldAIProps {
  isOpen: boolean
  onClose: () => void
}

export function WorldAI({ isOpen, onClose }: WorldAIProps) {
  const [campaign, setCampaign] = useState<Campaign>(CAMPAIGNS.tyranny)
  const [view, setView] = useState<ViewTab>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [currentEpisode, setCurrentEpisode] = useState(campaign.contexts.defaults.episode)
  const [currentLocation, setCurrentLocation] = useState(campaign.contexts.defaults.location)
  const [currentHeat, setCurrentHeat] = useState(campaign.contexts.defaults.heat)
  const [currentMapIdx, setCurrentMapIdx] = useState(0)
  const [hoveredHotspot, setHoveredHotspot] = useState<{ name: string; text: string } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [messages])

  // Roll dice
  const rollDice = (notation: string): number => {
    const match = notation.match(/(\d+)d(\d+)([+-]\d+)?/)
    if (!match) return 0
    const [, count, sides, mod] = match
    let total = 0
    for (let i = 0; i < parseInt(count); i++) {
      total += Math.floor(Math.random() * parseInt(sides)) + 1
    }
    if (mod) total += parseInt(mod)
    return total
  }

  // Send message to World AI
  const sendMessage = async (content: string) => {
    if (!content.trim() || isThinking) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsThinking(true)

    // Add thinking indicator
    const thinkingMsg: Message = {
      id: 'thinking',
      role: 'thinking',
      content: 'Consulting the world...',
      timestamp: new Date()
    }
    setMessages(prev => [...prev, thinkingMsg])

    try {
      const response = await fetch('/api/world-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          systemPrompt: campaign.systemPrompt,
          context: {
            episode: currentEpisode,
            location: currentLocation,
            heat: currentHeat
          }
        })
      })

      if (!response.ok) throw new Error('Failed to get response')

      const data = await response.json()

      // Remove thinking, add response
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'thinking'),
        {
          id: crypto.randomUUID(),
          role: 'world',
          content: data.response,
          timestamp: new Date()
        }
      ])
    } catch (error) {
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'thinking'),
        {
          id: crypto.randomUUID(),
          role: 'error',
          content: 'Failed to consult the world. Check your connection.',
          timestamp: new Date()
        }
      ])
    } finally {
      setIsThinking(false)
    }
  }

  // Handle quick action
  const handleQuickAction = (action: { label: string; roll?: { notation: string; name: string }; prompt: string }) => {
    let prompt = action.prompt
    if (action.roll) {
      const result = rollDice(action.roll.notation)
      prompt = `[Rolled ${action.roll.notation}: ${result}] ${prompt}`
    }
    sendMessage(prompt)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl h-[85vh] bg-[#0a0908] border border-[#3a3328] rounded-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3a3328] bg-[#15130f]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#e0651a] rounded-full animate-pulse shadow-[0_0_8px_#e0651a]" />
              <span className="font-cinzel text-[#d4b15a] text-sm tracking-widest">WORLD AI</span>
            </div>
            <span className="px-3 py-1 bg-[#1f1c16] border border-[#3a3328] rounded-full text-xs text-[#d4b15a]">
              {campaign.subtitle}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* View Tabs */}
            {(['chat', 'maps', 'lore', 'library'] as ViewTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={cn(
                  "px-3 py-1.5 text-xs uppercase tracking-wider transition-all border-b-2",
                  view === tab
                    ? "text-[#d4b15a] border-[#e0651a]"
                    : "text-[#8a8070] border-transparent hover:text-[#e0d8c8]"
                )}
              >
                {tab}
              </button>
            ))}
            <button onClick={onClose} className="ml-4 p-1 text-[#8a8070] hover:text-[#e0d8c8]">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Context Bar */}
        <div className="flex items-center gap-4 px-4 py-2 border-b border-[#3a3328] bg-[#15130f]/50 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#8a8070] uppercase tracking-wider">Episode</span>
            <select
              value={currentEpisode}
              onChange={e => setCurrentEpisode(e.target.value)}
              className="bg-[#1f1c16] border border-[#3a3328] rounded px-2 py-1 text-xs text-[#e0d8c8] outline-none"
            >
              {campaign.contexts.episodes.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#8a8070] uppercase tracking-wider">Location</span>
            <select
              value={currentLocation}
              onChange={e => setCurrentLocation(e.target.value)}
              className="bg-[#1f1c16] border border-[#3a3328] rounded px-2 py-1 text-xs text-[#e0d8c8] outline-none"
            >
              {campaign.contexts.locations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-[#8a8070] uppercase tracking-wider">Heat</span>
            <select
              value={currentHeat}
              onChange={e => setCurrentHeat(e.target.value)}
              className="bg-[#1f1c16] border border-[#3a3328] rounded px-2 py-1 text-xs text-[#e0d8c8] outline-none"
            >
              {campaign.contexts.heat.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          {/* Dice Bench */}
          <div className="flex items-center gap-1 ml-auto">
            {['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map(die => (
              <button
                key={die}
                onClick={() => {
                  const result = rollDice(`1${die}`)
                  setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    role: 'world',
                    content: `**${die.toUpperCase()}**: ${result}`,
                    timestamp: new Date()
                  }])
                }}
                className="px-2 py-1 text-[10px] font-cinzel bg-[#1f1c16] border border-[#3a3328] rounded text-[#e0d8c8] hover:border-[#e0651a] hover:text-[#ffd97a] transition-all"
              >
                {die}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {/* Chat View */}
          {view === 'chat' && (
            <div className="h-full flex flex-col">
              {/* Messages */}
              <div ref={logRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center text-[#8a8070] py-8">
                    <Sparkles className="w-8 h-8 mx-auto mb-3 text-[#d4b15a] opacity-50" />
                    <p className="text-sm">Ask the World AI anything about the campaign.</p>
                    <p className="text-xs mt-2">Use quick actions below or type your question.</p>
                  </div>
                )}
                {messages.map(msg => (
                  <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                    <div className={cn(
                      "text-[9px] uppercase tracking-wider mb-1",
                      msg.role === 'user' && "text-[#8a8070]",
                      msg.role === 'world' && "text-[#d4b15a]",
                      msg.role === 'error' && "text-[#e0651a]",
                      msg.role === 'thinking' && "text-[#8a8070]"
                    )}>
                      {msg.role === 'user' ? 'YOU' : msg.role === 'world' ? 'WORLD AI' : msg.role === 'error' ? 'ERROR' : 'THINKING'}
                    </div>
                    <div className={cn(
                      "bg-[#1f1c16]/70 backdrop-blur-sm rounded px-3 py-2 text-sm leading-relaxed border-l-2 whitespace-pre-wrap",
                      msg.role === 'user' && "border-[#3a3328]",
                      msg.role === 'world' && "border-[#d4b15a]",
                      msg.role === 'error' && "border-[#e0651a] text-[#e0907a]",
                      msg.role === 'thinking' && "border-[#3a3328] text-[#8a8070] italic"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="flex gap-2 px-4 py-2 border-t border-[#3a3328] overflow-x-auto">
                {campaign.quickActions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickAction(action)}
                    disabled={isThinking}
                    className="px-3 py-1.5 text-xs bg-[#1f1c16] border border-[#3a3328] rounded text-[#8a8070] hover:border-[#d4b15a] hover:text-[#d4b15a] transition-all whitespace-nowrap disabled:opacity-50"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2 p-4 border-t border-[#3a3328]">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage(input)
                    }
                  }}
                  placeholder="Ask the world anything..."
                  className="flex-1 bg-[#1f1c16] border border-[#3a3328] rounded px-3 py-2 text-sm text-[#e0d8c8] placeholder-[#403c30] outline-none resize-none focus:border-[#d4b15a]"
                  rows={1}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={isThinking || !input.trim()}
                  className="px-4 py-2 border border-[#e0651a] rounded text-[#e0651a] font-cinzel text-xs tracking-wider hover:bg-[#e0651a] hover:text-[#0a0908] transition-all disabled:opacity-50"
                >
                  SEND
                </button>
              </div>
            </div>
          )}

          {/* Maps View */}
          {view === 'maps' && (
            <div className="h-full flex flex-col p-4">
              {/* Map Tabs */}
              <div className="flex gap-2 mb-4">
                {campaign.maps.map((map, i) => (
                  <button
                    key={map.id}
                    onClick={() => setCurrentMapIdx(i)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-cinzel border rounded transition-all",
                      currentMapIdx === i
                        ? "bg-[#d4b15a]/15 border-[#d4b15a] text-[#ffd97a]"
                        : "bg-[#1f1c16] border-[#3a3328] text-[#8a8070] hover:text-[#d4b15a] hover:border-[#d4b15a]"
                    )}
                  >
                    {map.name}
                  </button>
                ))}
              </div>

              {/* Map Stage */}
              <div className="flex-1 relative bg-[#15130f] border border-[#3a3328] rounded-lg overflow-hidden">
                {/* Placeholder map background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#3a3024] to-[#1f1812]" />
                
                {/* Hotspots */}
                {campaign.maps[currentMapIdx]?.hotspots.map((hs, i) => (
                  <button
                    key={i}
                    className="absolute w-4 h-4 -translate-x-1/2 -translate-y-1/2 group"
                    style={{ left: `${hs.x}%`, top: `${hs.y}%` }}
                    onMouseEnter={() => setHoveredHotspot(hs)}
                    onMouseLeave={() => setHoveredHotspot(null)}
                  >
                    <span className="absolute inset-0 bg-[#e0651a] rounded-full animate-ping opacity-50" />
                    <span className="relative block w-full h-full bg-[#e0651a] rounded-full group-hover:bg-[#ffd97a] group-hover:scale-125 transition-all shadow-[0_0_8px_#e0651a]" />
                  </button>
                ))}

                {/* Hotspot Info */}
                {hoveredHotspot && (
                  <div className="absolute bottom-4 left-4 bg-[#0a0908]/95 border border-[#d4b15a] rounded p-3 max-w-xs backdrop-blur-sm">
                    <h4 className="font-cinzel text-[#d4b15a] text-sm mb-1">{hoveredHotspot.name}</h4>
                    <p className="text-xs text-[#e0d8c8] leading-relaxed">{hoveredHotspot.text}</p>
                  </div>
                )}

                {/* Map Title */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 font-cinzel text-[#d4b15a] text-lg tracking-widest">
                  {campaign.maps[currentMapIdx]?.name}
                </div>
              </div>
            </div>
          )}

          {/* Lore View */}
          {view === 'lore' && (
            <div className="h-full overflow-y-auto p-4 space-y-6">
              {campaign.lore.map((section, i) => (
                <div key={i}>
                  <h3 className="font-cinzel text-[#d4b15a] text-sm tracking-widest pb-2 border-b border-[#3a3328] mb-3">
                    {section.category}
                  </h3>
                  <div className="space-y-2">
                    {section.items.map((item, j) => (
                      <div key={j} className="bg-[#1f1c16] border-l-2 border-[#d4b15a] rounded-r px-3 py-2">
                        <h4 className="font-cinzel text-[#ffd97a] text-xs mb-1">{item.name}</h4>
                        <p className="text-xs text-[#e0d8c8] leading-relaxed">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Library View */}
          {view === 'library' && (
            <div className="h-full overflow-y-auto p-4">
              <h2 className="font-cinzel text-[#d4b15a] text-lg tracking-widest mb-4">CAMPAIGN LIBRARY</h2>
              <div className="space-y-3">
                {Object.values(CAMPAIGNS).map(c => (
                  <div
                    key={c.id}
                    onClick={() => setCampaign(c)}
                    className={cn(
                      "bg-[#1f1c16] border rounded p-4 cursor-pointer transition-all hover:translate-x-1",
                      campaign.id === c.id
                        ? "border-[#e0651a] bg-[#e0651a]/10"
                        : "border-[#3a3328] hover:border-[#d4b15a]"
                    )}
                  >
                    <h3 className="font-cinzel text-[#ffd97a] text-sm mb-1">{c.name}</h3>
                    <p className="text-[11px] text-[#8a8070] mb-2">{c.subtitle}</p>
                    <p className="text-xs text-[#e0d8c8] leading-relaxed">{c.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
