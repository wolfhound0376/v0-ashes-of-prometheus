"use client"

import { useState, useRef } from "react"
import { Upload, Music, Check, AlertCircle, Trash2, Play, Pause } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadedTrack {
  url: string
  pathname: string
  filename: string
  category: string
}

const MUSIC_CATEGORIES = [
  { id: "combat", label: "Combat", description: "Battle music, boss fights, intense action" },
  { id: "exploration", label: "Exploration", description: "Traveling, discovering, wandering" },
  { id: "tension", label: "Tension", description: "Suspense, danger approaching, stealth" },
  { id: "mystery", label: "Mystery", description: "Puzzles, secrets, investigation" },
  { id: "tavern", label: "Tavern", description: "Social scenes, inns, celebrations" },
  { id: "dungeon", label: "Dungeon", description: "Dark places, caves, crypts" },
  { id: "nature", label: "Nature", description: "Forests, wilderness, peaceful outdoors" },
  { id: "city", label: "City", description: "Urban environments, markets, crowds" },
  { id: "horror", label: "Horror", description: "Fear, dread, supernatural terror" },
  { id: "victory", label: "Victory", description: "Triumph, celebration, achievement" },
  { id: "sad", label: "Sad/Emotional", description: "Loss, melancholy, dramatic moments" },
  { id: "ambient", label: "Ambient", description: "Background atmosphere, general use" },
]

export default function MusicUploadPage() {
  const [selectedCategory, setSelectedCategory] = useState("ambient")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, 'pending' | 'uploading' | 'done' | 'error'>>({})
  const [uploadedTracks, setUploadedTracks] = useState<UploadedTrack[]>([])
  const [error, setError] = useState<string | null>(null)
  const [playingUrl, setPlayingUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setError(null)

    const fileArray = Array.from(files)
    const initialProgress: Record<string, 'pending' | 'uploading' | 'done' | 'error'> = {}
    fileArray.forEach(f => initialProgress[f.name] = 'pending')
    setUploadProgress(initialProgress)

    for (const file of fileArray) {
      setUploadProgress(prev => ({ ...prev, [file.name]: 'uploading' }))

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('category', selectedCategory)

        const response = await fetch('/api/music/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Upload failed')
        }

        const data = await response.json()
        setUploadedTracks(prev => [...prev, data])
        setUploadProgress(prev => ({ ...prev, [file.name]: 'done' }))
      } catch (err) {
        setUploadProgress(prev => ({ ...prev, [file.name]: 'error' }))
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0 && fileInputRef.current) {
      const dt = new DataTransfer()
      Array.from(files).forEach(f => dt.items.add(f))
      fileInputRef.current.files = dt.files
      handleFileSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>)
    }
  }

  const togglePlay = (url: string) => {
    if (playingUrl === url) {
      audioRef.current?.pause()
      setPlayingUrl(null)
    } else {
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play()
        setPlayingUrl(url)
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0b0a] text-stone-200 p-8">
      <audio ref={audioRef} onEnded={() => setPlayingUrl(null)} />
      
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-[#c9b896] mb-2">Music Library Upload</h1>
        <p className="text-stone-400 mb-8">
          Upload ambient music tracks for the Lich to use during gameplay. 
          Select a category and drag & drop your audio files.
        </p>

        {/* Category Selection */}
        <div className="mb-6">
          <label className="text-sm font-medium text-stone-300 mb-3 block">Select Category</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {MUSIC_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "p-3 rounded-lg border text-left transition-all",
                  selectedCategory === cat.id
                    ? "border-[#d4b15a] bg-[#d4b15a]/10 text-[#d4b15a]"
                    : "border-[#3d3428] hover:border-[#5d5448] text-stone-400 hover:text-stone-300"
                )}
              >
                <div className="font-medium text-sm">{cat.label}</div>
                <div className="text-xs opacity-70 mt-0.5">{cat.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className={cn(
            "border-2 border-dashed rounded-xl p-12 text-center transition-all",
            uploading
              ? "border-[#d4b15a]/50 bg-[#d4b15a]/5"
              : "border-[#3d3428] hover:border-[#5d5448] hover:bg-[#1a1614]/50"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp3,.wav,.ogg,audio/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="music-upload"
          />
          <label htmlFor="music-upload" className="cursor-pointer">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#1a1614] border border-[#3d3428] flex items-center justify-center">
                <Upload className="w-8 h-8 text-[#c9b896]" />
              </div>
              <div>
                <p className="text-lg font-medium text-stone-200">
                  Drop audio files here or click to browse
                </p>
                <p className="text-sm text-stone-500 mt-1">
                  Supports MP3, WAV, OGG (multiple files allowed)
                </p>
              </div>
            </div>
          </label>
        </div>

        {/* Upload Progress */}
        {Object.keys(uploadProgress).length > 0 && (
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-medium text-stone-300 mb-3">Upload Progress</h3>
            {Object.entries(uploadProgress).map(([filename, status]) => (
              <div 
                key={filename}
                className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1614] border border-[#3d3428]"
              >
                <Music className="w-5 h-5 text-stone-500" />
                <span className="flex-1 text-sm truncate">{filename}</span>
                {status === 'pending' && <span className="text-xs text-stone-500">Waiting...</span>}
                {status === 'uploading' && (
                  <span className="text-xs text-[#d4b15a] animate-pulse">Uploading...</span>
                )}
                {status === 'done' && <Check className="w-5 h-5 text-green-500" />}
                {status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Uploaded Tracks */}
        {uploadedTracks.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-medium text-[#c9b896] mb-4">
              Uploaded Tracks ({uploadedTracks.length})
            </h3>
            <div className="space-y-2">
              {uploadedTracks.map((track, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1614] border border-[#3d3428]"
                >
                  <button
                    onClick={() => togglePlay(track.url)}
                    className="w-10 h-10 rounded-full bg-[#2a2420] flex items-center justify-center hover:bg-[#3a3430] transition-colors"
                  >
                    {playingUrl === track.url 
                      ? <Pause className="w-5 h-5 text-[#d4b15a]" />
                      : <Play className="w-5 h-5 text-stone-400" />
                    }
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{track.filename}</div>
                    <div className="text-xs text-stone-500">
                      Category: {MUSIC_CATEGORIES.find(c => c.id === track.category)?.label || track.category}
                    </div>
                  </div>
                  <Check className="w-5 h-5 text-green-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-8 p-6 rounded-lg bg-[#1a1614] border border-[#3d3428]">
          <h3 className="text-lg font-medium text-[#c9b896] mb-3">How it works</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-stone-400">
            <li>Select a category that best describes your music track</li>
            <li>Drag and drop audio files or click to browse</li>
            <li>Files are uploaded to cloud storage and will be available to the Lich</li>
            <li>The Lich will automatically play appropriate music based on the game situation</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
