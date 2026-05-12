'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export type AnimationState = 'idle' | 'speaking' | 'thinking' | 'casting' | 'laughing'

interface GenerationTask {
  taskId: string
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  progress?: number
  output?: string[]
  error?: string
}

interface CachedAnimation {
  id: string
  state: AnimationState
  video_url: string
  created_at: string
}

export function useRunwayAnimation() {
  const [currentTask, setCurrentTask] = useState<GenerationTask | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [cachedAnimations, setCachedAnimations] = useState<Record<AnimationState, string | null>>({
    idle: null,
    speaking: null,
    thinking: null,
    casting: null,
    laughing: null,
  })
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null)
  
  const supabase = createClient()

  // Load cached animations from Supabase on mount
  useEffect(() => {
    loadCachedAnimations()
  }, [])

  const loadCachedAnimations = async () => {
    try {
      const { data, error } = await supabase
        .from('lich_animations')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[v0] Error loading cached animations:', error)
        return
      }

      if (data) {
        const cache: Record<AnimationState, string | null> = {
          idle: null,
          speaking: null,
          thinking: null,
          casting: null,
          laughing: null,
        }
        
        // Use most recent animation for each state
        data.forEach((anim: CachedAnimation) => {
          if (!cache[anim.state as AnimationState]) {
            cache[anim.state as AnimationState] = anim.video_url
          }
        })
        
        setCachedAnimations(cache)
        
        // Set idle as default if available
        if (cache.idle) {
          setCurrentVideoUrl(cache.idle)
        }
      }
    } catch (err) {
      console.error('[v0] Failed to load cached animations:', err)
    }
  }

  // Generate a new animation
  const generateAnimation = useCallback(async (
    state: AnimationState, 
    customPrompt?: string,
    referenceImage?: string
  ) => {
    setIsGenerating(true)
    
    try {
      const response = await fetch('/api/runway/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          animationState: state,
          prompt: customPrompt,
          referenceImage,
        }),
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Generation failed')
      }

      setCurrentTask({
        taskId: data.taskId,
        status: 'PENDING',
      })

      // Start polling for status
      pollTaskStatus(data.taskId, state)
      
      return data.taskId
    } catch (error) {
      console.error('[v0] Generation error:', error)
      setIsGenerating(false)
      throw error
    }
  }, [])

  // Poll for task completion
  const pollTaskStatus = async (taskId: string, state: AnimationState) => {
    const maxAttempts = 120 // 10 minutes max
    let attempts = 0

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setCurrentTask(prev => prev ? { ...prev, status: 'FAILED', error: 'Timeout' } : null)
        setIsGenerating(false)
        return
      }

      try {
        const response = await fetch(`/api/runway/status/${taskId}`)
        const data = await response.json()

        setCurrentTask({
          taskId,
          status: data.status,
          progress: data.progress,
          output: data.output,
          error: data.failure,
        })

        if (data.status === 'SUCCEEDED' && data.output?.[0]) {
          // Save to Supabase cache
          await saveAnimation(state, data.output[0])
          
          setCachedAnimations(prev => ({
            ...prev,
            [state]: data.output[0],
          }))
          
          setCurrentVideoUrl(data.output[0])
          setIsGenerating(false)
          return
        }

        if (data.status === 'FAILED') {
          setIsGenerating(false)
          return
        }

        // Continue polling
        attempts++
        setTimeout(poll, 5000) // Poll every 5 seconds
      } catch (error) {
        console.error('[v0] Poll error:', error)
        attempts++
        setTimeout(poll, 5000)
      }
    }

    poll()
  }

  // Save animation to Supabase for caching
  const saveAnimation = async (state: AnimationState, videoUrl: string) => {
    try {
      await supabase.from('lich_animations').insert({
        state,
        video_url: videoUrl,
      })
    } catch (error) {
      console.error('[v0] Failed to cache animation:', error)
    }
  }

  // Switch to a cached animation
  const playAnimation = useCallback((state: AnimationState) => {
    const cachedUrl = cachedAnimations[state]
    if (cachedUrl) {
      setCurrentVideoUrl(cachedUrl)
      return true
    }
    return false
  }, [cachedAnimations])

  return {
    currentVideoUrl,
    currentTask,
    isGenerating,
    cachedAnimations,
    generateAnimation,
    playAnimation,
    loadCachedAnimations,
  }
}
