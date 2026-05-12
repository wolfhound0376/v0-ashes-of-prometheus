"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, MessageSquare, User, Users } from "lucide-react"
import type { Dialogue, Environment } from "@/lib/types/database"

export function DialoguePanel() {
  const [dialogues, setDialogues] = useState<Dialogue[]>([])
  const [environments, setEnvironments] = useState<Environment[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<Dialogue>>({})
  const [selectedEnvironment, setSelectedEnvironment] = useState<string | null>(null)

  const supabase = createClient()

  const fetchData = async () => {
    setLoading(true)
    const [dialoguesRes, envsRes] = await Promise.all([
      supabase.from('dialogues').select('*').order('sort_order'),
      supabase.from('environments').select('*').order('name')
    ])
    if (dialoguesRes.error) console.error('Error:', dialoguesRes.error)
    else setDialogues(dialoguesRes.data || [])
    if (envsRes.error) console.error('Error:', envsRes.error)
    else { 
      setEnvironments(envsRes.data || [])
      if (envsRes.data?.length && !selectedEnvironment) setSelectedEnvironment(envsRes.data[0].id)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const filteredDialogues = selectedEnvironment ? dialogues.filter(d => d.environment_id === selectedEnvironment) : dialogues

  const handleCreate = async () => {
    if (!formData.speaker || !formData.text || !selectedEnvironment) return
    const { error } = await supabase.from('dialogues').insert({
      environment_id: selectedEnvironment,
      speaker: formData.speaker,
      speaker_type: formData.speaker_type || 'npc',
      text: formData.text,
      portrait_url: formData.portrait_url,
      sort_order: filteredDialogues.length,
    })
    if (error) console.error('Error:', error)
    else { setCreating(false); setFormData({}); fetchData() }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from('dialogues').update(formData).eq('id', id)
    if (error) console.error('Error:', error)
    else { setEditing(null); setFormData({}); fetchData() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this dialogue?')) return
    await supabase.from('dialogues').delete().eq('id', id)
    fetchData()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm text-stone-400">Environment:</label>
        <select value={selectedEnvironment || ''} onChange={(e) => setSelectedEnvironment(e.target.value)}
          className="px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none">
          {environments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {!creating && selectedEnvironment && (
          <button onClick={() => { setCreating(true); setFormData({ speaker_type: 'npc' }) }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm ml-auto">
            <Plus className="w-4 h-4" />Add Dialogue
          </button>
        )}
      </div>

      {environments.length === 0 && (
        <div className="text-center py-12 text-stone-500 border border-dashed border-[#3d3428]/60 rounded-lg">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Create an environment first to add dialogues</p>
        </div>
      )}

      {creating && selectedEnvironment && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">New Dialogue Entry</h3>
          <DialogueForm formData={formData} setFormData={setFormData} onSave={handleCreate} onCancel={() => { setCreating(false); setFormData({}) }} />
        </div>
      )}

      {/* Dialogue List */}
      <div className="space-y-3">
        {filteredDialogues.map((dialogue, index) => (
          <div key={dialogue.id} className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#3d3428]/60 rounded-lg overflow-hidden">
            {editing === dialogue.id ? (
              <div className="p-6">
                <DialogueForm formData={formData} setFormData={setFormData} onSave={() => handleUpdate(dialogue.id)} onCancel={() => { setEditing(null); setFormData({}) }} />
              </div>
            ) : (
              <div className="flex items-start gap-4 p-4">
                {/* Order number */}
                <div className="w-8 h-8 rounded-full bg-[#2a2520] flex items-center justify-center text-xs text-stone-500 flex-shrink-0">
                  {index + 1}
                </div>

                {/* Portrait */}
                <div className="w-12 h-12 rounded-full bg-[#0f0d0b] flex-shrink-0 overflow-hidden border border-[#3d3428]/60">
                  {dialogue.portrait_url ? (
                    <img src={dialogue.portrait_url} alt={dialogue.speaker} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {dialogue.speaker_type === 'player' ? (
                        <User className="w-6 h-6 text-[#7aa8c8]" />
                      ) : (
                        <Users className="w-6 h-6 text-[#c4a777]" />
                      )}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <p className={`text-sm font-medium ${dialogue.speaker_type === 'player' ? 'text-[#7aa8c8]' : 'text-[#c4a777]'}`}>
                    {dialogue.speaker}:
                  </p>
                  <p className="text-sm text-[#e8dcc4] mt-1">{dialogue.text}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditing(dialogue.id); setFormData(dialogue); setCreating(false) }}
                    className="p-2 text-stone-500 hover:text-[#c4a777]"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(dialogue.id)}
                    className="p-2 text-stone-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filteredDialogues.length === 0 && !creating && selectedEnvironment && (
          <div className="text-center py-12 text-stone-500">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No dialogue for this environment</p>
          </div>
        )}
      </div>
    </div>
  )
}

function DialogueForm({ formData, setFormData, onSave, onCancel }: { formData: Partial<Dialogue>; setFormData: (d: Partial<Dialogue>) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Speaker Name</label>
          <input type="text" value={formData.speaker || ''} onChange={(e) => setFormData({ ...formData, speaker: e.target.value })}
            placeholder="e.g., Gareth"
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Speaker Type</label>
          <div className="flex gap-2">
            <button onClick={() => setFormData({ ...formData, speaker_type: 'npc' })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border ${formData.speaker_type === 'npc' ? 'border-[#c4a777]/50 bg-[#2a2520] text-[#c4a777]' : 'border-[#3d3428]/60 text-stone-500'}`}>
              <Users className="w-4 h-4" />NPC
            </button>
            <button onClick={() => setFormData({ ...formData, speaker_type: 'player' })}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border ${formData.speaker_type === 'player' ? 'border-[#7aa8c8]/50 bg-[#1a2a3a] text-[#7aa8c8]' : 'border-[#3d3428]/60 text-stone-500'}`}>
              <User className="w-4 h-4" />Player
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Portrait</label>
          <ImageUploader value={formData.portrait_url || null} onChange={(url) => setFormData({ ...formData, portrait_url: url })} folder="portraits" aspectRatio="square" className="max-w-[80px]" />
        </div>
      </div>

      <div>
        <label className="block text-sm text-stone-400 mb-2">Dialogue Text</label>
        <textarea value={formData.text || ''} onChange={(e) => setFormData({ ...formData, text: e.target.value })}
          placeholder="What does this character say?"
          rows={3} className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none resize-none" />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[#3d3428]/60">
        <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400"><X className="w-4 h-4" />Cancel</button>
        <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777]"><Save className="w-4 h-4" />Save</button>
      </div>
    </div>
  )
}
