'use client'

import { useEffect, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'

interface Ember {
  x: number
  y: number
  /** upward velocity, px/s */
  vy: number
  /** horizontal sway amplitude and phase */
  sway: number
  phase: number
  size: number
  /** 0..1 life remaining */
  life: number
  /** life drained per second */
  decay: number
}

interface EmberFieldProps {
  /** number of concurrent particles */
  count?: number
  /** 0..1 multiplier on particle brightness */
  intensity?: number
  /** 0..1 horizontal spawn spread: small = clustered center, 1 = full width */
  spread?: number
}

/**
 * Ambient ember particles drifting upward, like sparks off a forge.
 * Very low density, very slow. Pauses when offscreen; renders nothing
 * for reduced-motion users.
 */
export function EmberField({ count = 22, intensity = 1, spread = 0.7 }: EmberFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let visible = false
    let width = 0
    let height = 0
    let last = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const spawn = (initial: boolean): Ember => ({
      // bias spawns toward the horizontal center where the glow sits
      x: width * (0.5 + (Math.random() - 0.5) * spread),
      y: initial ? height * Math.random() : height + 6,
      vy: 12 + Math.random() * 18,
      sway: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      size: 0.8 + Math.random() * 1.4,
      life: initial ? Math.random() : 1,
      decay: 0.06 + Math.random() * 0.05,
    })

    const embers: Ember[] = Array.from({ length: count }, () => spawn(true))

    const draw = (now: number) => {
      if (!visible) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const time = now / 1000

      ctx.clearRect(0, 0, width, height)

      for (let i = 0; i < embers.length; i++) {
        let e = embers[i]
        e.y -= e.vy * dt
        e.life -= e.decay * dt
        if (e.life <= 0 || e.y < -8) {
          embers[i] = e = spawn(false)
        }

        const x = e.x + Math.sin(time * 0.7 + e.phase) * e.sway
        // brightest mid-life, fading at both ends; flicker gently
        const flicker = 0.75 + 0.25 * Math.sin(time * 3 + e.phase * 2)
        const alpha = Math.sin(e.life * Math.PI) * 0.55 * flicker * intensity
        if (alpha < 0.01) continue

        const glow = ctx.createRadialGradient(x, e.y, 0, x, e.y, e.size * 5)
        glow.addColorStop(0, `rgba(253, 186, 116, ${alpha.toFixed(3)})`)
        glow.addColorStop(0.4, `rgba(249, 115, 22, ${(alpha * 0.5).toFixed(3)})`)
        glow.addColorStop(1, 'rgba(249, 115, 22, 0)')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, e.y, e.size * 5, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }

    const io = new IntersectionObserver(([entry]) => {
      const nowVisible = entry.isIntersecting
      if (nowVisible && !visible) {
        visible = true
        last = performance.now()
        raf = requestAnimationFrame(draw)
      } else if (!nowVisible) {
        visible = false
        cancelAnimationFrame(raf)
      }
    })
    io.observe(canvas)

    return () => {
      io.disconnect()
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [reduceMotion, count, intensity, spread])

  if (reduceMotion) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    />
  )
}
