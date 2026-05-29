"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, Package } from "lucide-react"
import { INVENTORY_PRESET_ICONS, EQUIPMENT_SLOTS } from "@/lib/types/database"
import { BackpackIcon, RobeIcon, PotionIcon, ScrollIcon, PearlIcon, RopeIcon, TorchIcon, GoldIcon } from "@/components/ui/fantasy-icons"
import type { InventoryItem, Character } from "@/lib/types/database"

const PRESET_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  'backpack': BackpackIcon,
  'robe': RobeIcon,
  'potion': PotionIcon,
  'scroll': ScrollIcon,
  'pearl': PearlIcon,
  'rope': RopeIcon,
  'torch': TorchIcon,
  'gold': GoldIcon,
}

const ITEM_TYPES = ['weapon', 'armor', 'consumable', 'misc', 'currency']

export function InventoryPanel() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<InventoryItem>>({})
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)

  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    const [itemsRes, charsRes] = await Promise.all([
      supabase.from('inventory_items').select('*').order('name'),
      supabase.from('characters').select('*').order('name')
    ])
    if (itemsRes.error) console.error('Error:', itemsRes.error)
    else setItems(itemsRes.data || [])
    if (charsRes.error) console.error('Error:', charsRes.error)
    else { 
      setCharacters(charsRes.data || [])
      if (charsRes.data?.length && !selectedCharacter) {
        setSelectedCharacter(charsRes.data[0].id)
      }
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filteredItems = selectedCharacter ? items.filter(i => i.character_id === selectedCharacter) : items

  const handleCreate = async () => {
    if (!formData.name || !selectedCharacter) return
    const { error } = await supabase.from('inventory_items').insert({
      character_id: selectedCharacter,
      name: formData.name,
      quantity: formData.quantity || 1,
      icon_url: formData.icon_url,
      icon_type: formData.icon_type || 'preset',
      preset_icon: formData.preset_icon || 'backpack',
      description: formData.description,
      weight: formData.weight || 0,
      value: formData.value || 0,
      item_type: formData.item_type || 'misc',
      equippable_slot: formData.equippable_slot || null,
    })
    if (error) console.error('Error:', error)
    else { setCreating(false); setFormData({}); fetchData() }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from('inventory_items').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('Error:', error)
    else { setEditing(null); setFormData({}); fetchData() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await supabase.from('inventory_items').delete().eq('id', id)
    fetchData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Character Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-stone-400">Character:</label>
        <select value={selectedCharacter || ''} onChange={(e) => setSelectedCharacter(e.target.value)}
          className="px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50">
          {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!creating && selectedCharacter && (
          <button onClick={() => { setCreating(true); setFormData({ icon_type: 'preset', preset_icon: 'backpack', item_type: 'misc', quantity: 1 }) }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm hover:border-[#c4a777]/50 ml-auto">
            <Plus className="w-4 h-4" />Add Item
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">New Item</h3>
          <ItemForm formData={formData} setFormData={setFormData} onSave={handleCreate} onCancel={() => { setCreating(false); setFormData({}) }} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {filteredItems.map((item) => (
          <div key={item.id} className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#3d3428]/60 rounded-lg overflow-hidden">
            {editing === item.id ? (
              <div className="p-6">
                <ItemForm formData={formData} setFormData={setFormData} onSave={() => handleUpdate(item.id)} onCancel={() => { setEditing(null); setFormData({}) }} />
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4">
                <div className="w-12 h-12 flex-shrink-0">
                  {item.icon_type === 'preset' && item.preset_icon && PRESET_ICON_MAP[item.preset_icon] ? (
                    (() => { const Icon = PRESET_ICON_MAP[item.preset_icon!]; return <Icon className="w-12 h-12" /> })()
                  ) : item.icon_url ? (
                    <img src={item.icon_url} alt={item.name} className="w-12 h-12 rounded" />
                  ) : (
                    <div className="w-12 h-12 bg-[#0f0d0b] rounded flex items-center justify-center">
                      <Package className="w-6 h-6 text-stone-600" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-serif text-[#e8dcc4]">{item.name}</h4>
                  <div className="flex items-center gap-3 text-xs text-stone-500">
                    <span>x{item.quantity}</span>
                    <span>{item.weight} lbs</span>
                    <span className="capitalize">{item.item_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditing(item.id); setFormData(item); setCreating(false) }}
                    className="p-2 text-stone-500 hover:text-[#c4a777]"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(item.id)}
                    className="p-2 text-stone-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredItems.length === 0 && !creating && (
        <div className="text-center py-12 text-stone-500">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No items for this character</p>
        </div>
      )}
    </div>
  )
}

function ItemForm({ formData, setFormData, onSave, onCancel }: { formData: Partial<InventoryItem>; setFormData: (d: Partial<InventoryItem>) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Name</label>
          <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Quantity</label>
          <input type="number" min={1} value={formData.quantity || 1} onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Type</label>
          <select value={formData.item_type || 'misc'} onChange={(e) => setFormData({ ...formData, item_type: e.target.value as InventoryItem['item_type'] })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none">
            {ITEM_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Weight (lbs)</label>
          <input type="number" min={0} step={0.1} value={formData.weight || 0} onChange={(e) => setFormData({ ...formData, weight: parseFloat(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Value (Gold)</label>
          <input type="number" min={0} value={formData.value || 0} onChange={(e) => setFormData({ ...formData, value: parseInt(e.target.value) })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Equippable in slot</label>
          <select value={formData.equippable_slot || ''} onChange={(e) => setFormData({ ...formData, equippable_slot: (e.target.value || null) as InventoryItem['equippable_slot'] })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none">
            <option value="">— not equippable —</option>
            {EQUIPMENT_SLOTS.map(s => <option key={s} value={s} className="capitalize">{s.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>

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
          <div className="grid grid-cols-8 gap-2">
            {INVENTORY_PRESET_ICONS.map(icon => {
              const IconComponent = PRESET_ICON_MAP[icon]
              return (
                <button key={icon} onClick={() => setFormData({ ...formData, preset_icon: icon })}
                  className={`p-2 rounded-lg border transition-all ${formData.preset_icon === icon ? 'border-[#c4a777]/50 bg-[#2a2520]' : 'border-[#3d3428]/60 hover:border-[#3d3428]'}`}>
                  {IconComponent && <IconComponent className="w-8 h-8 mx-auto" />}
                  <p className="text-[9px] text-stone-500 mt-1 text-center">{icon}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <ImageUploader value={formData.icon_url || null} onChange={(url) => setFormData({ ...formData, icon_url: url })} folder="item-icons" aspectRatio="square" className="max-w-[120px]" />
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[#3d3428]/60">
        <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400"><X className="w-4 h-4" />Cancel</button>
        <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777]"><Save className="w-4 h-4" />Save</button>
      </div>
    </div>
  )
}
