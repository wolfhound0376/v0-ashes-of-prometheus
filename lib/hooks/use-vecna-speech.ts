'use client'

import { useState, useRef, useCallback } from 'react'

interface UseVecnaSpeechReturn {
  speak: (text: string) => Promise<void>
  stop: () => void
  isSpeaking: boolean
  isLoading: boolean
  error: string | null
}

export function useVecnaSpeech(): UseVecnaSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  const speak = useCallback(async (text: string) => {
    // Stop any current speech
    stop()
    
    setIsLoading(true)
    setError(null)

    try {
      // Clean up text for speech (remove markdown, etc.)
      const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/`/g, '')
        .trim()

      if (!cleanText) {
        setIsLoading(false)
        return
      }

      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: cleanText }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate speech')
      }

      // Get audio blob
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)
      audioUrlRef.current = audioUrl

      // Create and play audio
      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        setIsSpeaking(false)
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current)
          audioUrlRef.current = null
        }
      }

      audio.onerror = () => {
        setError('Failed to play audio')
        setIsSpeaking(false)
      }

      setIsLoading(false)
      setIsSpeaking(true)
      await audio.play()

    } catch (err) {
      console.error('Speech error:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate speech')
      setIsLoading(false)
      setIsSpeaking(false)
    }
  }, [stop])

  return {
    speak,
    stop,
    isSpeaking,
    isLoading,
    error,
  }
}
