"use client"

import { useState, useRef } from "react"
import { upload } from "@vercel/blob/client"
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

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB limit

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      alert(`File is too large. Maximum size is 10MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB`)
      return
    }

    setIsUploading(true)
    
    try {
      // Use client-side upload - uploads directly to Blob storage
      // bypassing the serverless function size limit
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const pathname = `${folder}/${timestamp}-${safeName}`

      const blob = await upload(pathname, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      })

      onChange(blob.url)
    } catch (error) {
      console.error('Upload error:', error)
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
            <div className="flex flex-col items-center">
              <Loader2 className="w-8 h-8 text-[#c4a777] animate-spin" />
              <p className="text-xs text-stone-500 mt-2">Uploading...</p>
            </div>
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
              <p className="text-xs text-stone-600 mt-1">PNG, JPG, GIF, WebP up to 10MB</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
