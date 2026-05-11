"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, Zap, GripVertical } from "lucide-react"
import { ACTION_PRESET_ICONS } from "@/lib/types/database"
import { SpellbookIcon, AbilityIcon, DashIcon, DisengageIcon, HelpIcon, ReadyIcon, SearchIcon, RitualIcon } from "@/components/ui/fantasy-icons"
import type { Action } from "@/lib/types/database"

const PRESET_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  'cast-spell': SpellbookIcon,
  'use-ability': AbilityIcon,
  'dash': DashIcon,
  'disengage': DisengageIcon,
  'help': HelpIcon,
  'ready': ReadyIcon,
  'search': SearchIcon,
  'cast-ritual': RitualIcon,
}

const ACTION_TYPES = [
  { value: 'action', label: 'Action', color: 'bg-green-900/50 border-green-700/50 text-green-400' },
  { value: 'bonus_action', label: 'Bonus Action', color: 'bg-orange-900/50 border-orange-700/50 text-orange-400' },
  { value: 'reaction', label: 'Reaction', color: 'bg-purple-900/50 border-purple-700/50 text-purple-400' },
]

export function ActionsPanel() {
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<Action>>({})

  const supabase = createClient()

  const fetchActions = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('actions').select('*').order('sort_order')
    if (error) console.error('Error:', error)
    else setActions(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchActions() }, [])

  const handleCreate = async () => {
    if (!formData.name) return
    const { error } = await supabase.from('actions').insert({
      name: formData.name,
      description: formData.description,
      icon_url: formData.icon_url,
      icon_type: formData.icon_type || 'preset',
      preset_icon: formData.preset_icon || 'cast-spell',
      action_type: formData.action_type || 'action',
      color_scheme: formData.color_scheme || 'green',
      sort_order: actions.length,
    })
    if (error) console.error('Error:', error)
    else { setCreating(false); setFormData({}); fetchActions() }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from('actions').update({
      ...formData,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) console.error('Error:', error)
    else { setEditing(null); setFormData({}); fetchActions() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this action?')) return
    const { error } = await supabase.from('actions').delete().eq('id', id)
    if (error) console.error('Error:', error)
    else fetchActions()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      {!creating && (
        <button onClick={() => { setCreating(true); setEditing(null); setFormData({ icon_type: 'preset', preset_icon: 'cast-spell', action_type: 'action' }) }}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm hover:border-[#c4a777]/50">
          <Plus className="w-4 h-4" />Add Action
        </button>
      )}

      {creating && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">New Action</h3>
          <ActionForm formData={formData} setFormData={setFormData} onSave={handleCreate} onCancel={() => { setCreating(false); setFormData({}) }} />
        </div>
      )}

      <div className="space-y-2">
        {actions.map((action) => (
          <div key={action.id} className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#3d3428]/60 rounded-lg overflow-hidden">
            {editing === action.id ? (
              <div className="p-6">
                <h3 className="font-serif text-lg text-[#c4a777] mb-4">Edit Action</h3>
                <ActionForm formData={formData} setFormData={setFormData} onSave={() => handleUpdate(action.id)} onCancel={() => { setEditing(null); setFormData({}) }} />
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4">
                <GripVertical className="w-4 h-4 text-stone-600 cursor-move" />
                
                {/* Icon Preview */}
                <div className="w-10 h-10 flex-shrink-0">
                  {action.icon_type === 'preset' && action.preset_icon && PRESET_ICON_MAP[action.preset_icon] ? (
                    (() => { const Icon = PRESET_ICON_MAP[action.preset_icon!]; return <Icon className="w-10 h-10" /> })()
                  ) : action.icon_url ? (
                    <img src={action.icon_url} alt={action.name} className="w-10 h-10 rounded" />
                  ) : (
                    <div className="w-10 h-10 bg-[#0f0d0b] rounded flex items-center justify-center">
                      <Zap className="w-5 h-5 text-stone-600" />
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <h4 className="font-serif text-[#e8dcc4]">{action.name}</h4>
                  <p className="text-xs text-stone-500">{action.description}</p>
                </div>

                {/* Action Type Badge */}
                <span className={`px-2 py-1 text-xs rounded border ${ACTION_TYPES.find(t => t.value === action.action_type)?.color}`}>
                  {ACTION_TYPES.find(t => t.value === action.action_type)?.label}
                </span>

                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditing(action.id); setFormData(action); setCreating(false) }}
                    className="p-2 text-stone-500 hover:text-[#c4a777]"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(action.id)}
                    className="p-2 text-stone-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
        {actions.length === 0 && !creating && (
          <div className="text-center py-12 text-stone-500">
            <Zap className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No actions yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function ActionForm({ formData, setFormData, onSave, onCancel }: { formData: Partial<Action>; setFormData: (d: Partial<Action>) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Name</label>
          <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Cast a Spell"
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Action Type</label>
          <div className="flex gap-2">
            {ACTION_TYPES.map(type => (
              <button key={type.value} onClick={() => setFormData({ ...formData, action_type: type.value as Action['action_type'] })}
                className={`flex-1 px-3 py-2 rounded-lg border text-xs transition-all ${formData.action_type === type.value ? type.color : 'border-[#3d3428]/60 text-stone-500 bg-[#0f0d0b]'}`}>
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm text-stone-400 mb-2">Description</label>
        <input type="text" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="e.g., Use a spell from your spellbook."
          className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none focus:border-[#c4a777]/50" />
      </div>

      {/* Icon Selection */}
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
            {ACTION_PRESET_ICONS.map(icon => {
              const IconComponent = PRESET_ICON_MAP[icon]
              const isSelected = formData.preset_icon === icon
              return (
                <button key={icon} onClick={() => setFormData({ ...formData, preset_icon: icon })}
                  className={`p-2 rounded-lg border transition-all ${isSelected ? 'border-[#c4a777]/50 bg-[#2a2520]' : 'border-[#3d3428]/60 hover:border-[#3d3428]'}`}>
                  {IconComponent && <IconComponent className="w-8 h-8 mx-auto" />}
                  <p className="text-[9px] text-stone-500 mt-1 text-center truncate">{icon}</p>
                </button>
              )
            })}
          </div>
        ) : (
          <ImageUploader value={formData.icon_url || null} onChange={(url) => setFormData({ ...formData, icon_url: url })} folder="action-icons" aspectRatio="square" className="max-w-[120px]" />
        )}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[#3d3428]/60">
        <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400"><X className="w-4 h-4" />Cancel</button>
        <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777]"><Save className="w-4 h-4" />Save</button>
      </div>
    </div>
  )
}
