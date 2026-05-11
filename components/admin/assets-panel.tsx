"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ImageUploader } from "./image-uploader"
import { Plus, Pencil, Trash2, Save, X, Loader2, Image, Layers, Sparkles, Frame, Minus } from "lucide-react"
import type { DashboardAsset } from "@/lib/types/database"

const ASSET_TYPES = [
  { value: 'background', label: 'Background', icon: Image },
  { value: 'overlay', label: 'Overlay', icon: Layers },
  { value: 'icon', label: 'Icon', icon: Sparkles },
  { value: 'animation', label: 'Animation', icon: Sparkles },
  { value: 'border', label: 'Border', icon: Frame },
  { value: 'divider', label: 'Divider', icon: Minus },
]

const PANEL_TYPES = [
  'left_column',
  'center_column', 
  'right_column',
  'avatar',
  'dialogue',
  'interaction',
  'actions',
  'resources',
  'abilities',
  'character_info',
  'inventory',
  'equipment',
]

export function AssetsPanel() {
  const [assets, setAssets] = useState<DashboardAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [formData, setFormData] = useState<Partial<DashboardAsset>>({})
  const [filterType, setFilterType] = useState<string | null>(null)

  const supabase = createClient()

  const fetchAssets = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('dashboard_assets').select('*').order('asset_type').order('name')
    if (error) console.error('Error:', error)
    else setAssets(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchAssets() }, [])

  const filteredAssets = filterType ? assets.filter(a => a.asset_type === filterType) : assets

  const handleCreate = async () => {
    if (!formData.name || !formData.asset_type) return
    const { error } = await supabase.from('dashboard_assets').insert({
      name: formData.name,
      asset_type: formData.asset_type,
      panel_type: formData.panel_type,
      file_url: formData.file_url,
      thumbnail_url: formData.thumbnail_url,
      animation_css: formData.animation_css,
      metadata: formData.metadata || {},
    })
    if (error) console.error('Error:', error)
    else { setCreating(false); setFormData({}); fetchAssets() }
  }

  const handleUpdate = async (id: string) => {
    const { error } = await supabase.from('dashboard_assets').update({ ...formData, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) console.error('Error:', error)
    else { setEditing(null); setFormData({}); fetchAssets() }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this asset?')) return
    await supabase.from('dashboard_assets').delete().eq('id', id)
    fetchAssets()
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Filter & Add */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <button onClick={() => setFilterType(null)}
            className={`px-3 py-1.5 rounded-lg text-xs border ${!filterType ? 'border-[#c4a777]/50 bg-[#2a2520] text-[#c4a777]' : 'border-[#3d3428]/60 text-stone-500'}`}>
            All
          </button>
          {ASSET_TYPES.map(type => (
            <button key={type.value} onClick={() => setFilterType(type.value)}
              className={`px-3 py-1.5 rounded-lg text-xs border ${filterType === type.value ? 'border-[#c4a777]/50 bg-[#2a2520] text-[#c4a777]' : 'border-[#3d3428]/60 text-stone-500'}`}>
              {type.label}
            </button>
          ))}
        </div>
        {!creating && (
          <button onClick={() => { setCreating(true); setFormData({ asset_type: 'background' }) }}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777] text-sm ml-auto">
            <Plus className="w-4 h-4" />Add Asset
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#c4a777]/30 rounded-lg p-6">
          <h3 className="font-serif text-lg text-[#c4a777] mb-4">New Asset</h3>
          <AssetForm formData={formData} setFormData={setFormData} onSave={handleCreate} onCancel={() => { setCreating(false); setFormData({}) }} />
        </div>
      )}

      {/* Assets Grid */}
      <div className="grid grid-cols-4 gap-4">
        {filteredAssets.map((asset) => {
          const TypeIcon = ASSET_TYPES.find(t => t.value === asset.asset_type)?.icon || Image
          return (
            <div key={asset.id} className="bg-gradient-to-br from-[#1a1614] to-[#0f0d0b] border border-[#3d3428]/60 rounded-lg overflow-hidden group">
              {editing === asset.id ? (
                <div className="p-4">
                  <AssetForm formData={formData} setFormData={setFormData} onSave={() => handleUpdate(asset.id)} onCancel={() => { setEditing(null); setFormData({}) }} />
                </div>
              ) : (
                <>
                  {/* Preview */}
                  <div className="aspect-video bg-[#0f0d0b] relative overflow-hidden">
                    {asset.file_url ? (
                      <img src={asset.file_url} alt={asset.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <TypeIcon className="w-12 h-12 text-stone-700" />
                      </div>
                    )}
                    
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button onClick={() => { setEditing(asset.id); setFormData(asset); setCreating(false) }}
                        className="p-2 bg-[#2a2520] rounded-lg text-[#c4a777] hover:bg-[#3d3428]"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(asset.id)}
                        className="p-2 bg-[#2a2520] rounded-lg text-red-400 hover:bg-red-900/30"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-sm text-[#e8dcc4] truncate">{asset.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[#2a2520] text-stone-500 capitalize">{asset.asset_type}</span>
                      {asset.panel_type && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a2a3a] text-[#7aa8c8] capitalize">{asset.panel_type.replace('_', ' ')}</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })}

        {filteredAssets.length === 0 && !creating && (
          <div className="col-span-4 text-center py-12 text-stone-500">
            <Image className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>No assets found</p>
          </div>
        )}
      </div>
    </div>
  )
}

function AssetForm({ formData, setFormData, onSave, onCancel }: { formData: Partial<DashboardAsset>; setFormData: (d: Partial<DashboardAsset>) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Name</label>
          <input type="text" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Forest Background"
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Asset Type</label>
          <select value={formData.asset_type || 'background'} onChange={(e) => setFormData({ ...formData, asset_type: e.target.value as DashboardAsset['asset_type'] })}
            className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none">
            {ASSET_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm text-stone-400 mb-2">Target Panel (Optional)</label>
        <select value={formData.panel_type || ''} onChange={(e) => setFormData({ ...formData, panel_type: e.target.value || null })}
          className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none">
          <option value="">No specific panel</option>
          {PANEL_TYPES.map(p => <option key={p} value={p} className="capitalize">{p.replace('_', ' ')}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-stone-400 mb-2">Asset File</label>
          <ImageUploader value={formData.file_url || null} onChange={(url) => setFormData({ ...formData, file_url: url })} folder="assets" aspectRatio="wide" />
        </div>
        <div>
          <label className="block text-sm text-stone-400 mb-2">Thumbnail (Optional)</label>
          <ImageUploader value={formData.thumbnail_url || null} onChange={(url) => setFormData({ ...formData, thumbnail_url: url })} folder="thumbnails" aspectRatio="wide" />
        </div>
      </div>

      <div>
        <label className="block text-sm text-stone-400 mb-2">Animation CSS Class (Optional)</label>
        <input type="text" value={formData.animation_css || ''} onChange={(e) => setFormData({ ...formData, animation_css: e.target.value })}
          placeholder="e.g., animate-pulse, animate-fog-drift"
          className="w-full px-4 py-2 bg-[#0f0d0b] border border-[#3d3428]/60 rounded-lg text-[#e8dcc4] focus:outline-none" />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[#3d3428]/60">
        <button onClick={onCancel} className="flex items-center gap-2 px-4 py-2 border border-[#3d3428]/60 rounded-lg text-stone-400"><X className="w-4 h-4" />Cancel</button>
        <button onClick={onSave} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#3d3428] to-[#2a2520] border border-[#c4a777]/30 rounded-lg text-[#c4a777]"><Save className="w-4 h-4" />Save</button>
      </div>
    </div>
  )
}
