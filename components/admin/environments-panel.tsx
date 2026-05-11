"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, MapPin, Sun, Sunset, Moon, CloudSun } from "lucide-react"
import type { Environment } from "@/lib/types/database"

const TIME_OPTIONS = [
  { value: 'Morning', icon: Sun, color: 'text-yellow-400' },
  { value: 'Afternoon', icon: CloudSun, color: 'text-amber-400' },
  { value: 'Evening', icon: Sunset, color: 'text-orange-400' },
  { value: 'Night', icon: Moon, color: 'text-indigo-400' },
]

export function EnvironmentsPanel() {
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<Environment>>({})

  const supabase = createClient()

  const fetchEnvironments = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('environments')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching environments:', error)
    } else {
      setEnvironments(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchEnvironments()
  }, [])

  const handleCreate = async () => {
    if (!formData.name) return

    const { error } = await supabase
      .from('environments')
      .insert({
        name: formData.name,
        time_of_day: formData.time_of_day || 'Afternoon',
        background_image_url: formData.background_image_url,
        fog_overlay_url: formData.fog_overlay_url,
        ambient_animation: formData.ambient_animation,
        description: formData.description,
      })

    if (error) {
      console.error('Error creating environment:', error)
    } else {
      setCreating(false)
      setFormData({})
      fetchEnvironments()
    }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase
      .from('environments')
      .update({
        name: formData.name,
        time_of_day: formData.time_of_day,
        background_image_url: formData.background_image_url,
        fog_overlay_url: formData.fog_overlay_url,
        ambient_animation: formData.ambient_animation,
        description: formData.description,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      console.error('Error updating environment:', error)
    } else {
      setEditing(null)
      setFormData({})
      fetchEnvironments()
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this environment?')) return

    const { error } = await supabase
      .from('environments')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting environment:', error)
    } else {
      fetchEnvironments()
    }
  }

  const startEdit = (env: Environment) => {
    setEditing(env.id)
    setFormData(env)
    setCreating(false)
  }

  const startCreate = () => {
    setCreating(true)
    setEditing(null)
    setFormData({ time_of_day: 'Afternoon' })
  }

  const cancelEdit = () => {
    setEditing(null)
    setCreating(false)
    setFormData({})
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Create New Button */}
      {!creating && (
        <button
          onClick={startCreate}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm hover:border-[#c4a777]/50 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Environment
        </button>
      )}

      {/* Create Form */}
      {creating && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">New Environment</h3>
          <EnvironmentForm 
            formData={formData} 
            setFormData={setFormData} 
            onSave={handleCreate}
            onCancel={cancelEdit}
          />
        </div>
      )}

      {/* Environment List */}
      <div className="grid gap-4">
        {environments.map((env) => (
          <div 
            key={env.id}
            className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#3d3428]/60 rounded-lg overflow-hidden"
          >
            {editing === env.id ? (
              <div className="p-6">
                <h3 className="font-serif text-lg text-[#c4a777] mb-4">Edit Environment</h3>
                <EnvironmentForm 
                  formData={formData} 
                  setFormData={setFormData} 
                  onSave={() => handleUpdate(env.id)}
                  onCancel={cancelEdit}
                />
              </div>
            ) : (
              <div className="flex">
                {/* Preview Image */}
                <div className="w-48 h-32 bg-[#0f0d0b] flex-shrink-0">
                  {env.background_image_url ? (
                    <img 
                      src={env.background_image_url} 
                      alt={env.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <MapPin className="w-8 h-8 text-stone-700" />
                    </div>
                  )}
                </div>
                
                {/* Info */}
                <div className="flex-1 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-serif text-[#e8dcc4]">{env.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        {TIME_OPTIONS.find(t => t.value === env.time_of_day)?.icon && (
                          <span className={TIME_OPTIONS.find(t => t.value === env.time_of_day)?.color}>
                            {(() => {
                              const TimeIcon = TIME_OPTIONS.find(t => t.value === env.time_of_day)?.icon
                              return TimeIcon ? <TimeIcon className="w-4 h-4" /> : null
                            })()}
                          </span>
                        )}
                        <span className="text-sm text-stone-500">{env.time_of_day}</span>
                      </div>
                      {env.description && (
                        <p className="text-xs text-stone-600 mt-2 line-clamp-2">{env.description}</p>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(env)}
                        className="p-2 text-stone-500 hover:text-[#c4a777] transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(env.id)}
                        className="p-2 text-stone-500 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {environments.length === 0 && !creating && (
          <div className="text-center py-12 text-stone-500">
            <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No environments yet</p>
            <p className="text-sm">Create your first environment to get started</p>
          </div>
        )}
      </div>
    </div>
  )
}

function EnvironmentForm({ 
  formData, 
  setFormData, 
  onSave, 
  onCancel 
}: { 
  formData: Partial<Environment>
  setFormData: (data: Partial<Environment>) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-6">
        {/* Background Image */}
        <div>
          <label className="block text-sm text-stone-400 mb-2">Background Image</label>
          <ImageUploader
            value={formData.background_image_url || null}
            onChange={(url) => setFormData({ ...formData, background_image_url: url })}
            folder="environments"
            aspectRatio="wide"
          />
        </div>

        {/* Fog Overlay */}
        <div>
          <label className="block text-sm text-stone-400 mb-2">Fog Overlay (Optional)</label>
          <ImageUploader
            value={formData.fog_overlay_url || null}
            onChange={(url) => setFormData({ ...formData, fog_overlay_url: url })}
            folder="overlays"
            aspectRatio="wide"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-sm text-stone-400 mb-2">Location Name</label>
          <input
            type="text"
            value={formData.name || ''}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Greenmere Village"
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] placeholder-stone-600 focus:outline-none focus:border-[#c4a777]/50"
          />
        </div>

        {/* Time of Day */}
        <div>
          <label className="block text-sm text-stone-400 mb-2">Time of Day</label>
          <div className="flex gap-2">
            {TIME_OPTIONS.map((time) => {
              const Icon = time.icon
              const isSelected = formData.time_of_day === time.value
              return (
                <button
                  key={time.value}
                  onClick={() => setFormData({ ...formData, time_of_day: time.value })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    isSelected 
                      ? 'border-[#c4a777]/50 bg-[#2a2520]' 
                      : 'border-[#3d3428]/60 bg-[#0f0d0b] hover:border-[#3d3428]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? time.color : 'text-stone-500'}`} />
                  <span className={`text-xs ${isSelected ? 'text-[#e8dcc4]' : 'text-stone-500'}`}>
                    {time.value}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm text-stone-400 mb-2">Description</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="A brief description of this location..."
          rows={3}
          className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] placeholder-stone-600 focus:outline-none focus:border-[#c4a777]/50 resize-none"
        />
      </div>

      {/* Animation CSS */}
      <div>
        <label className="block text-sm text-stone-400 mb-2">Ambient Animation (CSS)</label>
        <input
          type="text"
          value={formData.ambient_animation || ''}
          onChange={(e) => setFormData({ ...formData, ambient_animation: e.target.value })}
          placeholder="e.g., animate-pulse, custom-fog-drift"
          className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] placeholder-stone-600 focus:outline-none focus:border-[#c4a777]/50"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-[#3d3428]/60">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400 hover:text-stone-300 transition-colors"
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] hover:border-[#c4a777]/50 transition-colors"
        >
          <Save className="w-4 h-4" />
          Save
        </button>
      </div>
    </div>
  )
}
