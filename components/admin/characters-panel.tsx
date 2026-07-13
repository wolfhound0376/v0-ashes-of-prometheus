"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, User, Crown, Shield, Dices, Heart, ListOrdered, Sparkles, Wand2 } from "lucide-react"
import type { Character } from "@/lib/types/database"
import { getDefaultAbilityScores } from "@/lib/game-data"
import { BestiaryAutopopulate } from "./bestiary-autopopulate"
import { type BestiaryEntry, matchBestiary, buildStatDiff, buildPatch } from "@/lib/bestiary-match"

const CLASSES = ['Wizard', 'Fighter', 'Rogue', 'Cleric', 'Paladin', 'Ranger', 'Bard', 'Warlock', 'Sorcerer', 'Druid', 'Monk', 'Barbarian']

// D&D 5e Hit Die by class
const HIT_DIE: Record<string, number> = {
  'Wizard': 6, 'Sorcerer': 6,
  'Bard': 8, 'Cleric': 8, 'Druid': 8, 'Monk': 8, 'Rogue': 8, 'Warlock': 8,
  'Fighter': 10, 'Paladin': 10, 'Ranger': 10,
  'Barbarian': 12,
}

// Roll 4d6 drop lowest for ability score
function roll4d6DropLowest(): number {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1)
  rolls.sort((a, b) => b - a)
  return rolls[0] + rolls[1] + rolls[2] // Sum top 3
}

// Roll HP for a given level and class
function rollHP(level: number, hitDie: number, conModifier: number): { current: number; max: number } {
  // Level 1: Max hit die + CON mod
  let hp = hitDie + conModifier
  
  // Level 2+: Roll hit die + CON mod for each level
  for (let i = 2; i <= level; i++) {
    const roll = Math.floor(Math.random() * hitDie) + 1
    hp += Math.max(1, roll + conModifier) // Minimum 1 HP per level
  }
  
  return { current: Math.max(1, hp), max: Math.max(1, hp) }
}

export function CharactersPanel() {
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<Character>>({})
  const [bestiary, setBestiary] = useState<BestiaryEntry[]>([])
  const [bulkRunning, setBulkRunning] = useState(false)

  const supabase = createClient()

  const fetchCharacters = async () => {
    setLoading(true)
    console.log('[v0] Fetching characters from Supabase...')
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .order('character_type', { ascending: false })
      .order('name')
    
    if (error) {
      console.error('[v0] Error fetching characters:', error)
    } else {
      console.log('[v0] Fetched characters:', data?.length || 0)
      setCharacters(data || [])
    }
    setLoading(false)
  }

  // Bestiary is the stat-block reference used by Autopopulate. Select('*') so we
  // pick up whatever columns the live table has (slug/role/source may exist
  // beyond the seed) without assuming a rigid shape.
  const fetchBestiary = async () => {
    const { data, error } = await supabase.from('bestiary').select('*').order('name')
    if (error) {
      console.error('[v0] Error fetching bestiary:', error)
    } else {
      console.log('[v0] Fetched bestiary entries:', data?.length || 0)
      setBestiary((data as BestiaryEntry[]) || [])
    }
  }

  useEffect(() => { fetchCharacters(); fetchBestiary() }, [])

  // Bulk: fill every NPC/monster whose stats are still at defaults, using only
  // confident matches, and only writing default/empty fields (canon-safe).
  const handleBulkPopulate = async () => {
    if (bestiary.length === 0) {
      alert('No bestiary entries loaded to populate from.')
      return
    }
    const targets = characters.filter((c) => {
      const type = c.character_type ?? (c.is_player ? 'player' : 'npc')
      if (type !== 'npc' && type !== 'monster') return false
      // "Unstatted" = AC, HP and all six scores still at defaults.
      const scoresDefault = ['str', 'dex', 'con', 'int', 'wis', 'cha'].every(
        (s) => ((c as any)[`${s}_score`] ?? 10) === 10,
      )
      return (c.ac ?? 10) === 10 && (c.hp_max ?? 10) <= 10 && scoresDefault
    })

    if (targets.length === 0) {
      alert('No unstatted NPCs or monsters found. (Characters with any manual stats are skipped.)')
      return
    }

    const planned = targets
      .map((c) => ({ c, match: matchBestiary(c.name, bestiary).best }))
      .filter((p) => p.match)

    if (planned.length === 0) {
      alert(`Found ${targets.length} unstatted NPC(s)/monster(s) but no confident bestiary match for any of them.`)
      return
    }

    const summary = planned.map((p) => `• ${p.c.name} → ${p.match!.entry.name}`).join('\n')
    if (!confirm(`Populate ${planned.length} of ${targets.length} unstatted entries from the bestiary?\n\n${summary}`)) {
      return
    }

    setBulkRunning(true)
    let ok = 0
    for (const { c, match } of planned) {
      const { writable } = buildStatDiff(c as unknown as Record<string, unknown>, match!.entry)
      // Only fill fields that are not already manually set.
      const patch = buildPatch(writable.filter((f) => f.proposed !== null && !f.isManuallySet))
      if (Object.keys(patch).length === 0) continue
      const { error } = await supabase
        .from('characters')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', c.id)
      if (error) console.error('[v0] Bulk populate error for', c.name, error.message)
      else ok++
    }
    setBulkRunning(false)
    alert(`Populated ${ok} character(s) from the bestiary.`)
    fetchCharacters()
  }

  const handleCreate = async () => {
    if (!formData.name) return
    console.log('[v0] Creating character:', formData.name)
    const createType = formData.character_type || 'npc'
    // Class is meaningless for monsters (stored empty) and optional for NPCs.
    const createClass = createType === 'monster' ? '' : createType === 'player' ? (formData.class || 'Wizard') : (formData.class || '')
    const { data, error } = await supabase.from('characters').insert({
      name: formData.name,
      level: formData.level || 1,
      class: createClass,
      xp: formData.xp || 0,
      xp_to_next: formData.xp_to_next || 300,
      avatar_image_url: formData.avatar_image_url,
      portrait_image_url: formData.portrait_image_url,
      hp_current: formData.hp_current || 10,
      hp_max: formData.hp_max || 10,
      ac: formData.ac || 10,
      initiative: formData.initiative || 0,
      proficiency_bonus: formData.proficiency_bonus || 2,
      passive_perception: formData.passive_perception || 10,
      str_score: formData.str_score || 10,
      str_modifier: Math.floor(((formData.str_score || 10) - 10) / 2),
      dex_score: formData.dex_score || 10,
      dex_modifier: Math.floor(((formData.dex_score || 10) - 10) / 2),
      con_score: formData.con_score || 10,
      con_modifier: Math.floor(((formData.con_score || 10) - 10) / 2),
      int_score: formData.int_score || 10,
      int_modifier: Math.floor(((formData.int_score || 10) - 10) / 2),
      wis_score: formData.wis_score || 10,
      wis_modifier: Math.floor(((formData.wis_score || 10) - 10) / 2),
      cha_score: formData.cha_score || 10,
      cha_modifier: Math.floor(((formData.cha_score || 10) - 10) / 2),
      weight_current: formData.weight_current || 0,
      weight_max: formData.weight_max || 150,
      character_type: formData.character_type || 'npc',
      is_player: (formData.character_type || 'npc') === 'player',
    })
    if (error) {
      console.error('[v0] Error creating character:', error)
      alert(`Failed to create character: ${error.message}`)
    } else {
      console.log('[v0] Character created successfully')
      setCreating(false)
      setFormData({})
      fetchCharacters()
    }
  }

  const handleUpdate = async (id: string) => {
    // Force monster class empty even if a stale value is in formData.
    const updateType = formData.character_type || 'npc'
    const { error } = await supabase.from('characters').update({
      ...formData,
      class: updateType === 'monster' ? '' : (formData.class ?? ''),
      str_modifier: Math.floor(((formData.str_score || 10) - 10) / 2),
      dex_modifier: Math.floor(((formData.dex_score || 10) - 10) / 2),
      con_modifier: Math.floor(((formData.con_score || 10) - 10) / 2),
      int_modifier: Math.floor(((formData.int_score || 10) - 10) / 2),
      wis_modifier: Math.floor(((formData.wis_score || 10) - 10) / 2),
      cha_modifier: Math.floor(((formData.cha_score || 10) - 10) / 2),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) console.error('Error:', error)
    else { setEditing(null); setFormData({}); fetchCharacters() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this character?')) return
    const { error } = await supabase.from('characters').delete().eq('id', id)
    if (error) console.error('Error:', error)
    else fetchCharacters()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      {!creating && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => { setCreating(true); setEditing(null); setFormData({ level: 1, class: 'Wizard', character_type: 'npc' }) }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm hover:border-[#c4a777]/50">
            <Plus className="w-4 h-4" />Add Character
          </button>
          <button onClick={handleBulkPopulate} disabled={bulkRunning}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#2a3320] to-[#20281a] border border-green-600/30 rounded-lg text-green-300 text-sm hover:border-green-600/50 disabled:opacity-50">
            {bulkRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Populate all unstatted NPCs &amp; Monsters
          </button>
        </div>
      )}

      {creating && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">New Character</h3>
          <CharacterForm formData={formData} setFormData={setFormData} onSave={handleCreate} onCancel={() => { setCreating(false); setFormData({}) }} bestiary={bestiary} />
        </div>
      )}

      <div className="space-y-6">
        {(["player", "npc", "monster"] as const).map((type) => {
          const group = characters.filter((c) => (c.character_type ?? (c.is_player ? "player" : "npc")) === type)
          if (group.length === 0) return null
          const label = type === "player" ? "Players" : type === "npc" ? "NPCs" : "Monsters"
          return (
            <div key={type} className="space-y-3">
              <h3 className="font-serif text-lg text-[#c4a777] uppercase tracking-wide">{label}</h3>
              <div className="grid gap-4">
                {group.map((char) => (
                  <div key={char.id} className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#3d3428]/60 rounded-lg overflow-hidden">
                    {editing === char.id ? (
                      <div className="p-6">
                        <h3 className="font-serif text-lg text-[#c4a777] mb-4">Edit Character</h3>
                        <CharacterForm formData={formData} setFormData={setFormData} onSave={() => handleUpdate(char.id)} onCancel={() => { setEditing(null); setFormData({}) }} bestiary={bestiary} />
                      </div>
                    ) : (
                      <div className="flex">
                        <div className="w-24 h-32 bg-[#0f0d0b] flex-shrink-0 flex items-center justify-center overflow-hidden">
                          {char.avatar_image_url ? (
                            <img src={char.avatar_image_url} alt={char.name} className="max-w-full max-h-full object-contain" />
                          ) : (
                            <User className="w-8 h-8 text-stone-700" />
                          )}
                        </div>
                        <div className="flex-1 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-serif text-[#e8dcc4]">{char.name}</h4>
                                {char.is_player && <Crown className="w-4 h-4 text-[#c4a777]" />}
                              </div>
                              <p className="text-sm text-stone-500">Level {char.level}{char.class ? ` ${char.class}` : ''}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-stone-600">
                                <span>HP: {char.hp_current}/{char.hp_max}</span>
                                <span>AC: {char.ac}</span>
                                <span>XP: {char.xp?.toLocaleString()}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setEditing(char.id); setFormData(char); setCreating(false) }}
                                className="p-2 text-stone-500 hover:text-[#c4a777]"><Pencil className="w-4 h-4" /></button>
                              <button onClick={() => handleDelete(char.id)}
                                className="p-2 text-stone-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {characters.length === 0 && !creating && (
          <div className="text-center py-12 text-stone-500">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No characters yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function CharacterForm({ formData, setFormData, onSave, onCancel, bestiary }: { formData: Partial<Character>; setFormData: (d: Partial<Character>) => void; onSave: () => void; onCancel: () => void; bestiary: BestiaryEntry[] }) {
  const [isRolling, setIsRolling] = useState(false)
  const [showAutopopulate, setShowAutopopulate] = useState(false)
  const charType = formData.character_type || 'npc'
  const isMonster = charType === 'monster'
  
  const updateScore = (stat: string, value: number) => {
    setFormData({ ...formData, [`${stat}_score`]: value, [`${stat}_modifier`]: Math.floor((value - 10) / 2) })
  }

  // Roll all ability scores using 4d6 drop lowest
  const rollAllStats = () => {
    setIsRolling(true)
    
    // Animate the rolling
    setTimeout(() => {
      const newScores: Partial<Character> = {}
      const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha']
      
      stats.forEach(stat => {
        const score = roll4d6DropLowest()
        ;(newScores as any)[`${stat}_score`] = score
        ;(newScores as any)[`${stat}_modifier`] = Math.floor((score - 10) / 2)
      })
      
      setFormData({ ...formData, ...newScores })
      setIsRolling(false)
    }, 500)
  }

  // Apply Standard Array optimized for the selected class (D&D 5E PHB p.13)
  // Standard Array: 15, 14, 13, 12, 10, 8 - assigned based on class priorities
  const applyStandardArray = () => {
    const charClass = formData.class || 'Wizard'
    const optimizedScores = getDefaultAbilityScores(charClass)
    
    const newScores: Partial<Character> = {}
    Object.entries(optimizedScores).forEach(([stat, { score, modifier }]) => {
      ;(newScores as any)[`${stat}_score`] = score
      ;(newScores as any)[`${stat}_modifier`] = modifier
    })
    
    setFormData({ ...formData, ...newScores })
  }

  // Roll HP based on class, level, and CON modifier
  const rollHitPoints = () => {
    const charClass = formData.class || 'Wizard'
    const level = formData.level || 1
    const conScore = formData.con_score || 10
    const conMod = Math.floor((conScore - 10) / 2)
    const hitDie = HIT_DIE[charClass] || 6
    
    const { current, max } = rollHP(level, hitDie, conMod)
    setFormData({ ...formData, hp_current: current, hp_max: max })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-6">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Avatar</label>
          <ImageUploader value={formData.avatar_image_url || null} onChange={(url) => setFormData({ ...formData, avatar_image_url: url })} folder="characters" aspectRatio="portrait" />
        </div>
        <div className="col-span-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-stone-400 mb-2">Name</label>
              <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-sm text-stone-400 mb-2">Level</label>
                <input type="number" min={1} max={20} value={formData.level || 1} onChange={(e) => setFormData({ ...formData, level: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50" />
              </div>
              {/* Class is hidden for monsters (meaningless) and optional for NPCs. */}
              {!isMonster && (
                <div className="flex-1">
                  <label className="block text-sm text-stone-400 mb-2">
                    Class{charType === 'npc' ? ' (optional)' : ''}
                  </label>
                  <select value={formData.class || ''} onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                    className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50">
                    {charType === 'npc' && <option value="">— None —</option>}
                    {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-sm text-stone-400 mb-2">Type</label>
              <select value={formData.character_type || 'npc'} onChange={(e) => setFormData({ ...formData, character_type: e.target.value as 'player' | 'npc' | 'monster' })}
                className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50">
                <option value="player">Player</option>
                <option value="npc">NPC</option>
                <option value="monster">Monster</option>
              </select>
            </div>
            {(charType === 'npc' || charType === 'monster') && (
              <button
                type="button"
                onClick={() => setShowAutopopulate(true)}
                title="Match this character to a bestiary stat block"
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm hover:border-[#c4a777]/50 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                Autopopulate from Bestiary
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-stone-400">Hit Points & Combat Stats</label>
          <button
            type="button"
            onClick={rollHitPoints}
            className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gradient-to-r from-[#5a3a3a] to-[#4a2a2a] border border-red-500/30 rounded-lg text-red-300 hover:border-red-500/50 transition-all"
          >
            <Heart className="w-3.5 h-3.5" />
            Roll HP (d{HIT_DIE[formData.class || 'Wizard']} + CON)
          </button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">HP Current</label>
          <input type="number" value={formData.hp_current || 0} onChange={(e) => setFormData({ ...formData, hp_current: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">HP Max</label>
          <input type="number" value={formData.hp_max || 0} onChange={(e) => setFormData({ ...formData, hp_max: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">AC</label>
          <input type="number" value={formData.ac || 10} onChange={(e) => setFormData({ ...formData, ac: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Initiative</label>
          <input type="number" value={formData.initiative || 0} onChange={(e) => setFormData({ ...formData, initiative: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
      </div>

      {/* Ability Scores */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-stone-400">Ability Scores</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyStandardArray}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gradient-to-r from-[#3a4a3a] to-[#2a3a2a] border border-green-500/30 rounded-lg text-green-300 hover:border-green-500/50 transition-all"
              title="Standard Array: 15, 14, 13, 12, 10, 8 optimized for class"
            >
              <ListOrdered className="w-3.5 h-3.5" />
              Standard Array
            </button>
            <button
              type="button"
              onClick={rollAllStats}
              disabled={isRolling}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-gradient-to-r from-[#4a3a5a] to-[#3a2a4a] border border-purple-500/30 rounded-lg text-purple-300 hover:border-purple-500/50 disabled:opacity-50 transition-all"
            >
              <Dices className={`w-3.5 h-3.5 ${isRolling ? 'animate-spin' : ''}`} />
              {isRolling ? 'Rolling...' : 'Roll 4d6 Drop Lowest'}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {['str', 'dex', 'con', 'int', 'wis', 'cha'].map(stat => (
            <div key={stat} className="text-center">
              <p className="text-xs text-stone-500 uppercase mb-1">{stat}</p>
              <input type="number" min={1} max={30} value={(formData as any)[`${stat}_score`] || 10}
                onChange={(e) => updateScore(stat, parseInt(e.target.value))}
                className="w-full px-2 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] text-center focus:outline-none focus:border-[#c4a777]/50" />
              <p className="text-xs text-[#c4a777] mt-1">
                {Math.floor((((formData as any)[`${stat}_score`] || 10) - 10) / 2) >= 0 ? '+' : ''}
                {Math.floor((((formData as any)[`${stat}_score`] || 10) - 10) / 2)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[#3d3428]/60">
        <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400"><X className="w-4 h-4" />Cancel</button>
        <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777]"><Save className="w-4 h-4" />Save</button>
      </div>

      {showAutopopulate && (
        <BestiaryAutopopulate
          characterName={formData.name || ''}
          currentStats={formData as Record<string, unknown>}
          entries={bestiary}
          onApply={(patch) => setFormData({ ...formData, ...patch })}
          onClose={() => setShowAutopopulate(false)}
        />
      )}
    </div>
  )
}
