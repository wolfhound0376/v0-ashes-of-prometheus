"use client"

/**
 * Dictation into a text input via the Web Speech API. (PR-3 follow-up)
 *
 * Browser-native speech-to-text — no server round trip, no API cost. Chrome
 * and Edge support it; the hook reports `supported: false` elsewhere (notably
 * Firefox) so the mic button can explain itself instead of silently breaking.
 *
 * The transcript streams through `onTranscript` as it firms up; the caller
 * decides where it lands. The dashboard appends it to the input box so the
 * player can read it over before hitting Enter — dictation never auto-sends.
 */

import { useCallback, useEffect, useRef, useState } from "react"

type SpeechRecognitionInstance = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function getRecognitionCtor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionInstance) | null
}

export function useSpeechInput(onTranscript: (transcript: string) => void) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  // The recognition instance outlives renders — always call the latest callback.
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  useEffect(() => {
    if (!getRecognitionCtor()) setSupported(false)
    return () => recognitionRef.current?.stop()
  }, [])

  const toggle = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setSupported(false)
      return
    }
    const recognition = new Ctor()
    recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US"
    recognition.interimResults = true
    recognition.continuous = true
    recognition.onresult = (event) => {
      let transcript = ""
      for (let i = 0; i < event.results.length; i++) transcript += event.results[i][0]?.transcript ?? ""
      onTranscriptRef.current(transcript.trim())
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }, [listening])

  return { listening, supported, toggle }
}
