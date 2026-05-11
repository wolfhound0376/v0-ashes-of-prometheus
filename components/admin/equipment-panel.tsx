"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, Sword } from "lucide-react"
import { EQUIPMENT_SLOTS } from "@/lib/types/database"
import { HoodIcon, NecklaceIcon, RobeIcon as TorsoIcon, PantsIcon, BootsIcon, StaffIcon, OrbIcon, RingIcon } from "@/components/ui/fantasy-icons"
import type { EquipmentItem, Character } from "@/lib/types/database"

const SLOT_ICONS: Record<string, React.FC<{ className?: string }>> = {
  'head': HoodIcon,
  'neck': NecklaceIcon,
  'torso': TorsoIcon,
  'legs': PantsIcon,
  'feet': BootsIcon,
  'main_hand': StaffIcon,
  'off_hand': OrbIcon,
  'ring1': RingIcon,
  'ring2': RingIcon,
}

const SLOT_LABELS: Record<string, string> = {
  'head': 'Head',
  'neck': 'Neck',
  'torso': 'Torso',
  'legs': 'Legs',
  'feet': 'Feet',
  'main_hand': 'Main Hand',
  'off_hand': 'Off Hand',
  'ring1': 'Ring',
  'ring2': 'Ring',
}

export function EquipmentPanel() {
  const [equipment, setEquipment] = useState<EquipmentItem[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<EquipmentItem>>({})
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)

  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    const [equipRes, charsRes] = await Promise.all([
      supabase.from('equipment_items').select('*').order('slot'),
      supabase.from('characters').select('*').order('name')
    ])
    if (equipRes.error) console.error('Error:', equipRes.error)
    else setEquipment(equipRes.data || [])
    if (charsRes.error) console.error('Error:', charsRes.error)
    else { 
      setCharacters(charsRes.data || [])
      if (charsRes.data?.length && !selectedCharacter) setSelectedCharacter(charsRes.data[0].id)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filteredEquipment = selectedCharacter ? equipment.filter(e => e.character_id === selectedCharacter) : equipment
  const equippedSlots = new Set(filteredEquipment.map(e => e.slot))

  const handleCreate = async () => {
    if (!formData.name || !formData.slot || !selectedCharacter) return
    const { error } = await supabase.from('equipment_items').insert({
      character_id: selectedCharacter,
      slot: formData.slot,
      name: formData.name,
      icon_url: formData.icon_url,
      equipped: formData.equipped ?? true,
      description: formData.description,
      stats_bonus: formData.stats_bonus || {},
    })
    if (error) console.error('Error:', error)
    else { setCreating(false); setFormData({}); fetchData() }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from('equipment_items').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('Error:', error)
    else { setEditing(null); setFormData({}); fetchData() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Unequip this item?')) return
    await supabase.from('equipment_items').delete().eq('id', id)
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
          <button onClick={() => { setCreating(true); setFormData({ equipped: true }) }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm ml-auto">
            <Plus className="w-4 h-4" />Equip Item
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">Equip New Item</h3>
          <EquipmentForm formData={formData} setFormData={setFormData} equippedSlots={equippedSlots} onSave={handleCreate} onCancel={() => { setCreating(false); setFormData({}) }} />
        </div>
      )}

      {/* Equipment Grid - Paper Doll Style */}
      <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#3d3428]/60 rounded-lg p-6">
        <div className="grid grid-cols-3 gap-4">
          {/* Left Column: Head, Neck, Torso, Legs, Feet */}
          <div className="space-y-3">
            {(['head', 'neck', 'torso', 'legs', 'feet'] as const).map(slot => {
              const item = filteredEquipment.find(e => e.slot === slot)
              const SlotIcon = SLOT_ICONS[slot]
              return (
                <EquipmentSlot key={slot} slot={slot} label={SLOT_LABELS[slot]} item={item} SlotIcon={SlotIcon}
                  onEdit={(item) => { setEditing(item.id); setFormData(item); setCreating(false) }}
                  onDelete={(id) => handleDelete(id)} />
              )
            })}
          </div>

          {/* Center: Character Preview */}
          <div className="flex items-center justify-center">
            <div className="w-full aspect-[3/4] bg-gradient-to-b from-[#2a2520] to-[#1a1614] rounded-lg border border-[#3d3428]/60 flex items-center justify-center">
              {characters.find(c => c.id === selectedCharacter)?.avatar_image_url ? (
                <img src={characters.find(c => c.id === selectedCharacter)?.avatar_image_url!} alt="Character" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Sword className="w-12 h-12 text-stone-700" />
              )}
            </div>
          </div>

          {/* Right Column: Main Hand, Off Hand, Ring x2 */}
          <div className="space-y-3">
            {(['main_hand', 'off_hand', 'ring1', 'ring2'] as const).map(slot => {
              const item = filteredEquipment.find(e => e.slot === slot)
              const SlotIcon = SLOT_ICONS[slot]
              return (
                <EquipmentSlot key={slot} slot={slot} label={SLOT_LABELS[slot]} item={item} SlotIcon={SlotIcon}
                  onEdit={(item) => { setEditing(item.id); setFormData(item); setCreating(false) }}
                  onDelete={(id) => handleDelete(id)} />
              )
            })}
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">Edit Equipment</h3>
          <EquipmentForm formData={formData} setFormData={setFormData} equippedSlots={equippedSlots} isEditing onSave={() => handleUpdate(editing)} onCancel={() => { setEditing(null); setFormData({}) }} />
        </div>
      )}
    </div>
  )
}

function EquipmentSlot({ slot, label, item, SlotIcon, onEdit, onDelete }: { 
  slot: string; label: string; item?: EquipmentItem; SlotIcon: React.FC<{ className?: string }>; 
  onEdit: (item: EquipmentItem) => void; onDelete: (id: string) => void 
}) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${item ? 'border-[#c4a777]/30 bg-[#2a2520]/50' : 'border-[#3d3428]/40 bg-[#0f0d0b]/50'}`}>
      <div className="w-12 h-12 flex-shrink-0 rounded border border-[#3d3428]/60 bg-[#0f0d0b] flex items-center justify-center overflow-hidden">
        {item?.icon_url ? (
          <img src={item.icon_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <SlotIcon className="w-8 h-8 opacity-50" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-500 uppercase tracking-wider">{label}</p>
        <p className={`text-sm truncate ${item ? 'text-[#e8dcc4]' : 'text-stone-600 italic'}`}>
          {item?.name || 'Empty'}
        </p>
      </div>
      {item && (
        <div className="flex gap-1">
          <button onClick={() => onEdit(item)} className="p-1.5 text-stone-500 hover:text-[#c4a777]"><Pencil className="w-3 h-3" /></button>
          <button onClick={() => onDelete(item.id)} className="p-1.5 text-stone-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  )
}

function EquipmentForm({ formData, setFormData, equippedSlots, isEditing, onSave, onCancel }: { 
  formData: Partial<EquipmentItem>; setFormData: (d: Partial<EquipmentItem>) => void; 
  equippedSlots: Set<string>; isEditing?: boolean; onSave: () => void; onCancel: () => void 
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Item Name</label>
          <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Wizard's Hood"
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Equipment Slot</label>
          <select value={formData.slot || ''} onChange={(e) => setFormData({ ...formData, slot: e.target.value as EquipmentItem['slot'] })}
            disabled={isEditing}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none disabled:opacity-50">
            <option value="">Select slot...</option>
            {EQUIPMENT_SLOTS.map(slot => (
              <option key={slot} value={slot} disabled={!isEditing && equippedSlots.has(slot)}>
                {SLOT_LABELS[slot]} {!isEditing && equippedSlots.has(slot) ? '(occupied)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-stone-400 mb-2">Icon Image</label>
        <ImageUploader value={formData.icon_url || null} onChange={(url) => setFormData({ ...formData, icon_url: url })} folder="equipment" aspectRatio="square" className="max-w-[120px]" />
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
