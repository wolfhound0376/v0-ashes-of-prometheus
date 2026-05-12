"use client"

import { useState, useRef } from "react"
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface ImageUploaderProps {
  value: string | null
  onChange: (url: string | null) => void
  folder?: string
  className?: string
  aspectRatio?: "square" | "portrait" | "landscape" | "wide"
}

export function ImageUploader({ 
  value, 
  onChange, 
  folder = "assets",
  className,
  aspectRatio = "square"
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const aspectClasses = {
    square: "aspect-square",
    portrait: "aspect-[3/4]",
    landscape: "aspect-[4/3]",
    wide: "aspect-[16/9]"
  }

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', folder)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      
      if (!response.ok) {
        console.error('[v0] Upload failed:', data)
        throw new Error(data.details || data.error || 'Upload failed')
      }

      console.log('[v0] Upload success:', data)
      onChange(data.url)
    } catch (error) {
      console.error('[v0] Upload error:', error)
      alert(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemove = async () => {
    if (value) {
      try {
        await fetch('/api/upload/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: value }),
        })
      } catch (error) {
        console.error('Delete error:', error)
      }
      onChange(null)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
  }

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      
      {value ? (
        <div className={cn(
          "relative rounded-lg overflow-hidden border border-[#3d3428]/60 bg-[#1a1614]",
          aspectClasses[aspectRatio]
        )}>
          <img 
            src={value} 
            alt="Uploaded" 
            className="w-full h-full object-cover"
          />
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 p-1.5 bg-black/70 rounded-full text-red-400 hover:text-red-300 hover:bg-black/90 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-all",
            aspectClasses[aspectRatio],
            dragOver 
              ? "border-[#c4a777] bg-[#c4a777]/10" 
              : "border-[#3d3428]/60 bg-[#1a1614]/50 hover:border-[#3d3428] hover:bg-[#1a1614]"
          )}
        >
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" />
          ) : (
            <>
              <div className="p-3 rounded-full bg-[#2a2520] mb-3">
                {dragOver ? (
                  <Upload className="w-6 h-6 text-[#c4a777]" />
                ) : (
                  <ImageIcon className="w-6 h-6 text-stone-500" />
                )}
              </div>
              <p className="text-sm text-stone-400">
                {dragOver ? "Drop image here" : "Click or drag to upload"}
              </p>
              <p className="text-xs text-stone-600 mt-1">PNG, JPG up to 10MB</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
