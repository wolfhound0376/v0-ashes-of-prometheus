"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, Sparkles, Lock } from "lucide-react"
import { ABILITY_PRESET_ICONS } from "@/lib/types/database"
import { MageHandIcon, FireBoltIcon, ShieldSpellIcon, MagicMissileIcon, DetectMagicIcon, LockedAbilityIcon } from "@/components/ui/fantasy-icons"
import type { Ability, Character } from "@/lib/types/database"

const PRESET_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  'mage-hand': MageHandIcon,
  'fire-bolt': FireBoltIcon,
  'shield': ShieldSpellIcon,
  'magic-missile': MagicMissileIcon,
  'detect-magic': DetectMagicIcon,
  'locked': LockedAbilityIcon,
}

export function AbilitiesPanel() {
  const [abilities, setAbilities] = useState<Ability[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<Ability>>({})
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)

  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    const [abilitiesRes, charsRes] = await Promise.all([
      supabase.from('abilities').select('*').order('sort_order'),
      supabase.from('characters').select('*').order('name')
    ])
    if (abilitiesRes.error) console.error('Error:', abilitiesRes.error)
    else setAbilities(abilitiesRes.data || [])
    if (charsRes.error) console.error('Error:', charsRes.error)
    else { 
      setCharacters(charsRes.data || [])
      if (charsRes.data?.length && !selectedCharacter) setSelectedCharacter(charsRes.data[0].id)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filteredAbilities = selectedCharacter ? abilities.filter(a => a.character_id === selectedCharacter) : abilities

  const handleCreate = async () => {
    if (!formData.name || !selectedCharacter) return
    const { error } = await supabase.from('abilities').insert({
      character_id: selectedCharacter,
      name: formData.name,
      icon_url: formData.icon_url,
      icon_type: formData.icon_type || 'preset',
      preset_icon: formData.preset_icon || 'mage-hand',
      unlocked: formData.unlocked ?? true,
      unlock_level: formData.unlock_level,
      description: formData.description,
      spell_level: formData.spell_level || 0,
      sort_order: filteredAbilities.length,
    })
    if (error) console.error('Error:', error)
    else { setCreating(false); setFormData({}); fetchData() }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from('abilities').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('Error:', error)
    else { setEditing(null); setFormData({}); fetchData() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this ability?')) return
    await supabase.from('abilities').delete().eq('id', id)
    fetchData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm text-stone-400">Character:</label>
        <select value={selectedCharacter || ''} onChange={(e) => setSelectedCharacter(e.target.value)}
          className="px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none">
          {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!creating && selectedCharacter && (
          <button onClick={() => { setCreating(true); setFormData({ icon_type: 'preset', preset_icon: 'mage-hand', unlocked: true }) }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm ml-auto">
            <Plus className="w-4 h-4" />Add Ability
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">New Ability</h3>
          <AbilityForm formData={formData} setFormData={setFormData} onSave={handleCreate} onCancel={() => { setCreating(false); setFormData({}) }} />
        </div>
      )}

      {/* Abilities Grid */}
      <div className="grid grid-cols-6 gap-4">
        {filteredAbilities.map((ability) => {
          const IconComponent = ability.icon_type === 'preset' && ability.preset_icon ? PRESET_ICON_MAP[ability.preset_icon] : null
          return (
            <div key={ability.id} 
              className={`relative group bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border rounded-lg p-4 text-center ${ability.unlocked ? 'border-[#3d3428]/60' : 'border-stone-800/40 opacity-60'}`}>
              
              {/* Icon */}
              <div className="w-16 h-16 mx-auto mb-2">
                {IconComponent ? (
                  <IconComponent className="w-16 h-16" />
                ) : ability.icon_url ? (
                  <img src={ability.icon_url} alt={ability.name} className="w-16 h-16 rounded" />
                ) : (
                  <div className="w-16 h-16 bg-[#0f0d0b] rounded flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-stone-600" />
                  </div>
                )}
              </div>

              {/* Name */}
              <p className="text-xs text-[#e8dcc4] truncate">{ability.name}</p>
              
              {/* Lock indicator */}
              {!ability.unlocked && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Lock className="w-6 h-6 text-stone-500 mx-auto mb-1" />
                    <p className="text-[10px] text-stone-500">Lv. {ability.unlock_level}</p>
                  </div>
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/70 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button onClick={() => { setEditing(ability.id); setFormData(ability); setCreating(false) }}
                  className="p-2 bg-[#2a2520] rounded-lg text-[#c4a777] hover:bg-[#3d3428]"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => handleDelete(ability.id)}
                  className="p-2 bg-[#2a2520] rounded-lg text-red-400 hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          )
        })}

        {filteredAbilities.length === 0 && !creating && (
          <div className="col-span-6 text-center py-12 text-stone-500">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No abilities for this character</p>
          </div>
        )}
      </div>

      {editing && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">Edit Ability</h3>
          <AbilityForm formData={formData} setFormData={setFormData} onSave={() => handleUpdate(editing)} onCancel={() => { setEditing(null); setFormData({}) }} />
        </div>
      )}
    </div>
  )
}

function AbilityForm({ formData, setFormData, onSave, onCancel }: { formData: Partial<Ability>; setFormData: (d: Partial<Ability>) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Name</label>
          <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Spell Level</label>
          <input type="number" min={0} max={9} value={formData.spell_level || 0} onChange={(e) => setFormData({ ...formData, spell_level: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Status</label>
          <div className="flex gap-2">
            <button onClick={() => setFormData({ ...formData, unlocked: true, unlock_level: null })}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${formData.unlocked ? 'border-green-700/50 bg-green-900/30 text-green-400' : 'border-[#3d3428]/60 text-stone-500'}`}>
              Unlocked
            </button>
            <button onClick={() => setFormData({ ...formData, unlocked: false })}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${!formData.unlocked ? 'border-stone-700/50 bg-stone-900/30 text-stone-400' : 'border-[#3d3428]/60 text-stone-500'}`}>
              Locked
            </button>
          </div>
        </div>
      </div>

      {!formData.unlocked && (
        <div>
          <label className="block text-sm text-stone-400 mb-2">Unlock at Level</label>
          <input type="number" min={1} max={20} value={formData.unlock_level || ''} onChange={(e) => setFormData({ ...formData, unlock_level: parseInt(e.target.value) || null })}
            className="w-32 px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
      )}

      <div>
        <label className="block text-sm text-stone-400 mb-2">Icon</label>
        <div className="flex gap-4 mb-3">
          <button onClick={() => setFormData({ ...formData, icon_type: 'preset', icon_url: null })}
            className={`px-4 py-2 rounded-lg border text-sm ${formData.icon_type === 'preset' ? 'border-[#c4a777]/50 bg-[#2a2520] text-[#c4a777]' : 'border-[#3d3428]/60 text-stone-500'}`}>
            Preset Icons
          </button>
          <button onClick={() => setFormData({ ...formData, icon_type: 'custom', preset_icon: null })}
            className={`px-4 py-2 rounded-lg border text-sm ${formData.icon_type === 'custom' ? 'border-[#c4a777]/50 bg-[#2a2520] text-[#c4a777]' : 'border-[#3d3428]/60 text-stone-500'}`}>
            Custom Upload
          </button>
        </div>
        {formData.icon_type === 'preset' ? (
          <div className="grid grid-cols-6 gap-2">
            {ABILITY_PRESET_ICONS.map(icon => {
              const IconComponent = PRESET_ICON_MAP[icon]
              return (
                <button key={icon} onClick={() => setFormData({ ...formData, preset_icon: icon })}
                  className={`p-3 rounded-lg border transition-all ${formData.preset_icon === icon ? 'border-[#c4a777]/50 bg-[#2a2520]' : 'border-[#3d3428]/60 hover:border-[#3d3428]'}`}>
                  {IconComponent && <IconComponent className="w-10 h-10 mx-auto" />}
                  <p className="text-[9px] text-stone-500 mt-1 text-center">{icon}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <ImageUploader value={formData.icon_url || null} onChange={(url) => setFormData({ ...formData, icon_url: url })} folder="ability-icons" aspectRatio="square" className="max-w-[120px]" />
        )}
      </div>

      <div>
        <label className="block text-sm text-stone-400 mb-2">Description</label>
        <textarea value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={2} className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none resize-none" />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[#3d3428]/60">
        <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400"><X className="w-4 h-4" />Cancel</button>
        <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777]"><Save className="w-4 h-4" />Save</button>
      </div>
    </div>
  )
}
