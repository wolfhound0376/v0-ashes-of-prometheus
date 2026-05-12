"use client"

import { useEffect, useRef } from "react"

export function EmberBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let w = canvas.width = window.innerWidth
    let h = canvas.height = window.innerHeight
    let animationId: number

    interface Ember {
      x: number
      y: number
      vy: number
      vx: number
      r: number
      hue: number
      life: number
      maxLife: number
    }

    const embers: Ember[] = Array.from({ length: 50 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h + h,
      vy: -0.3 - Math.random() * 0.7,
      vx: (Math.random() - 0.5) * 0.2,
      r: 0.5 + Math.random() * 1.6,
      hue: 18 + Math.random() * 22,
      life: 0,
      maxLife: 200 + Math.random() * 400
    }))

    function tick() {
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)

      embers.forEach(e => {
        e.x += e.vx
        e.y += e.vy
        e.life++

        if (e.life > e.maxLife || e.y < -10) {
          e.x = Math.random() * w
          e.y = h + 10
          e.life = 0
          e.vy = -0.3 - Math.random() * 0.7
        }

        const alpha = Math.max(0, 1 - e.life / e.maxLife) * 0.7
        ctx.fillStyle = `hsla(${e.hue}, 90%, 60%, ${alpha})`
        ctx.beginPath()
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2)
        ctx.fill()
      })

      animationId = requestAnimationFrame(tick)
    }

    const handleResize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }

    window.addEventListener("resize", handleResize)
    tick()

    return () => {
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-55"
    />
  )
}
