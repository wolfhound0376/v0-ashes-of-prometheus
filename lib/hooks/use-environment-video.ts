"use client"

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

export type EnvironmentType = 'throne_room' | 'library' | 'dungeon' | 'laboratory' | 'ritual_chamber'

export interface EnvironmentConfig {
  id: EnvironmentType
  name: string
  description: string
  prompt: string
  icon: string
}

export const ENVIRONMENTS: EnvironmentConfig[] = [
  {
    id: 'throne_room',
    name: 'Throne Room',
    description: 'Dark gothic throne room with towering pillars',
    prompt: 'Cinematic slow pan of a dark gothic throne room, massive black stone throne with purple glowing runes, towering pillars with skulls, flickering green torches, dust particles floating in dim light, ancient tapestries, fantasy horror atmosphere, 4K, seamless loop',
    icon: '👑'
  },
  {
    id: 'library',
    name: 'Arcane Library',
    description: 'Ancient library filled with forbidden tomes',
    prompt: 'Cinematic slow pan of a vast ancient library, towering bookshelves reaching into darkness, floating books with glowing pages, purple magical orbs providing dim light, dust motes, cobwebs, ancient scrolls, candles dripping wax, dark academia aesthetic, fantasy horror, 4K, seamless loop',
    icon: '📚'
  },
  {
    id: 'dungeon',
    name: 'Deep Dungeon',
    description: 'Damp stone dungeon with chains and cells',
    prompt: 'Cinematic slow pan of a medieval dungeon, damp stone walls with moss, rusty chains hanging from ceiling, iron cage cells, flickering torches casting dancing shadows, water dripping, rats scurrying, bones scattered, dark fantasy horror atmosphere, 4K, seamless loop',
    icon: '⛓️'
  },
  {
    id: 'laboratory',
    name: 'Alchemical Laboratory',
    description: 'Bubbling potions and arcane experiments',
    prompt: 'Cinematic slow pan of a dark alchemical laboratory, bubbling cauldrons with green liquid, glass vials with glowing substances, arcane apparatus, preserved specimens in jars, magical smoke rising, purple and green lighting, scattered scrolls and ingredients, fantasy horror aesthetic, 4K, seamless loop',
    icon: '⚗️'
  },
  {
    id: 'ritual_chamber',
    name: 'Ritual Chamber',
    description: 'Summoning circles and dark magic',
    prompt: 'Cinematic slow pan of a dark ritual chamber, glowing purple summoning circle on stone floor, floating candles, arcane symbols carved into walls, altar with skull, swirling dark energy, ethereal mist, hooded statues, occult fantasy horror atmosphere, 4K, seamless loop',
    icon: '🔮'
  }
]

interface CachedEnvironment {
  environment: EnvironmentType
  video_url: string
}

interface GenerationTask {
  taskId: string
  environment: EnvironmentType
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

export function useEnvironmentVideo() {
  const [currentEnvironment, setCurrentEnvironment] = useState<EnvironmentType>('throne_room')
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null)
  const [cachedEnvironments, setCachedEnvironments] = useState<Map<EnvironmentType, string>>(new Map())
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  
  const supabase = createClient()

  // Load cached environments on mount
  useEffect(() => {
    const loadCached = async () => {
      const { data } = await supabase
        .from('lich_environments')
        .select('environment, video_url')
      
      if (data) {
        const cached = new Map<EnvironmentType, string>()
        data.forEach((item: CachedEnvironment) => {
          cached.set(item.environment as EnvironmentType, item.video_url)
        })
        setCachedEnvironments(cached)
        
        // Set initial video if available
        const initialVideo = cached.get('throne_room')
        if (initialVideo) {
          setCurrentVideoUrl(initialVideo)
        }
      }
    }
    loadCached()
  }, [])

  // Update video when environment changes
  useEffect(() => {
    const video = cachedEnvironments.get(currentEnvironment)
    setCurrentVideoUrl(video || null)
  }, [currentEnvironment, cachedEnvironments])

  // Poll for generation status
  useEffect(() => {
    if (!currentTask || currentTask.status === 'completed' || currentTask.status === 'failed') {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/runway/status/${currentTask.taskId}`)
        const data = await res.json()

        if (data.status === 'SUCCEEDED' && data.output?.[0]) {
          const videoUrl = data.output[0]
          
          // Save to Supabase
          await supabase
            .from('lich_environments')
            .upsert({
              environment: currentTask.environment,
              video_url: videoUrl,
              prompt: ENVIRONMENTS.find(e => e.id === currentTask.environment)?.prompt
            }, { onConflict: 'environment' })

          // Update cache
          setCachedEnvironments(prev => {
            const newMap = new Map(prev)
            newMap.set(currentTask.environment, videoUrl)
            return newMap
          })

          // If this is the current environment, update the video
          if (currentTask.environment === currentEnvironment) {
            setCurrentVideoUrl(videoUrl)
          }

          setCurrentTask({ ...currentTask, status: 'completed' })
          setIsGenerating(false)
        } else if (data.status === 'FAILED') {
          setCurrentTask({ ...currentTask, status: 'failed' })
          setIsGenerating(false)
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 3000)

    return () => clearInterval(pollInterval)
  }, [currentTask, currentEnvironment])

  // Generate environment video
  const generateEnvironment = useCallback(async (environment: EnvironmentType) => {
    const config = ENVIRONMENTS.find(e => e.id === environment)
    if (!config) return

    setIsGenerating(true)
    setCurrentTask({
      taskId: '',
      environment,
      status: 'pending'
    })

    try {
      const res = await fetch('/api/runway/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: config.prompt,
          duration: 5
        })
      })

      const data = await res.json()
      
      if (data.taskId) {
        setCurrentTask({
          taskId: data.taskId,
          environment,
          status: 'processing'
        })
      } else {
        throw new Error(data.error || 'Failed to start generation')
      }
    } catch (error) {
      console.error('Generation error:', error)
      setCurrentTask(prev => prev ? { ...prev, status: 'failed' } : null)
      setIsGenerating(false)
    }
  }, [])

  // Switch environment
  const switchEnvironment = useCallback((environment: EnvironmentType) => {
    setCurrentEnvironment(environment)
  }, [])

  return {
    currentEnvironment,
    currentVideoUrl,
    cachedEnvironments,
    currentTask,
    isGenerating,
    generateEnvironment,
    switchEnvironment,
    environments: ENVIRONMENTS
  }
}
