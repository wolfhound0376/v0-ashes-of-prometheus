"use client"

import { useSyncExternalStore } from "react"
import { getSpeechFloor, onSpeechFloorChange, type SpeechFloor } from "@/lib/speech-queue"

/** Whoever's voice is coming out of the speakers right now (from the shared
 *  speech queue), or null when the table is silent. */
export function useSpeechFloor(): SpeechFloor | null {
  return useSyncExternalStore(onSpeechFloorChange, getSpeechFloor, () => null)
}
